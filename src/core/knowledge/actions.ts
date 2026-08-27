import { z } from 'zod';
import {
  assertKnowledgeOnlyAdvances,
  assertKnowledgeStructure,
  knowledgeStatusRank,
  type KnowledgeDocument,
  type KnowledgeEntry,
  type KnowledgeState,
  type KnowledgeStatus,
} from '../schema/knowledge.js';

/**
 * I66 C3 手动揭示 / holder 变更动作（design §14.10「C3 知情与揭示」/ R14-1）。
 *
 * 纯确定性模块：不触碰文件、不依赖 node:fs/node:crypto，可被 Host 服务与单元
 * 测试直接消费（Client bundle 不得导入本模块 —— 见 host/remote/knowledge）。
 *
 * 产品语义：
 * - 知情只增不退：holder 只能增加（不得删除），status 只能沿
 *   hidden → partially-revealed → revealed 前进；所有写入前再经
 *   `assertKnowledgeOnlyAdvances` 兜底（与 I18/I28 同一不变量，§5.10）。
 * - `reveal`（揭示）：为事实新增 holder + 至少推进到 partially-revealed
 *   （可选显式更高 status 与新的 revealAt）；已完成的揭示对象从 revealTo 移出。
 * - `holder-add`（holder 变更）：只新增 holder，不改 status/revealPlan。
 * - 提案 id 确定性可重放：`knowledgeProposalId(entryId, stamp)` 由服务传入
 *   时间戳生成唯一 Gate 提案 id；重复 propose 由 Gate 的 replay 拒绝兜底。
 * - 幂等：`isKnowledgeChangeSatisfied` 判定变更是否已生效（重复 accept 为
 *   no-op，不重复写 C3）。
 */
export const knowledgeChangeKindSchema = z.enum(['reveal', 'holder-add']);
export type KnowledgeChangeKind = z.infer<typeof knowledgeChangeKindSchema>;

export const knowledgeChangeInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reveal'),
    entryId: z.string().min(1).max(64),
    holders: z.array(z.string().min(1).max(64)).min(1),
    status: z.enum(['partially-revealed', 'revealed']).optional(),
    revealAt: z.string().trim().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal('holder-add'),
    entryId: z.string().min(1).max(64),
    holders: z.array(z.string().min(1).max(64)).min(1),
  }).strict(),
]);
export type KnowledgeChangeInput = z.infer<typeof knowledgeChangeInputSchema>;

/** 提案 id 前缀 + 稳定部分：不超过 entityIdSchema 的 64 字符上限。 */
const PROPOSAL_PREFIX = 'kprop';

/** 生成唯一且合法的 Gate 提案 id（stamp 通常为 Date.now()；重复由 Gate replay 拒绝）。 */
export function knowledgeProposalId(entryId: string, stamp: number): string {
  return `${PROPOSAL_PREFIX}-${stamp.toString(36)}-${entryId.slice(0, 20)}`;
}

/** 事实 → POV 边界提示文案（作者视角的知情边界速览；名称缺失时回退 id）。 */
export function knowledgePovHint(entry: KnowledgeEntry, nameOf: ReadonlyMap<string, string>): string {
  const holderNames = entry.holders.map((id) => nameOf.get(id) ?? id);
  const planNames = entry.revealPlan.revealTo.map((id) => nameOf.get(id) ?? id);
  if (entry.holders.length === 0) {
    return planNames.length === 0
      ? 'POV 边界：尚无角色知晓该事实，也未规划揭示。'
      : `POV 边界：尚无角色知晓；计划揭示 ${planNames.join('、')}（${entry.revealPlan.revealAt}）。`;
  }
  const base = `POV 边界：当前 ${holderNames.join('、')} 知晓；生成注入只按角色 POV 过滤（未知情角色不会看到该事实）。`;
  return planNames.length === 0 ? base : `${base} 计划揭示 ${planNames.join('、')}（${entry.revealPlan.revealAt}）。`;
}

/**
 * 变更前置校验（fail fast，零写）：entry 存在、holder 非空且唯一、holder 是
 * 作品既有角色、holder 尚未知情；reveal 的 status 不得倒退；holder-add 不得
 * 携带 status/revealAt（schema 已拒，这里再兜底）。
 */
export function validateKnowledgeChange(
  document: KnowledgeDocument,
  input: KnowledgeChangeInput,
  validCharacterIds: ReadonlySet<string>,
): void {
  const entry = document.entries.find((item) => item.id === input.entryId);
  if (!entry) throw new Error(`Unknown knowledge entry: ${input.entryId}`);
  if (input.holders.length === 0) throw new Error('Knowledge change requires at least one holder');
  const unique = new Set(input.holders);
  if (unique.size !== input.holders.length) {
    throw new Error(`Duplicate holder targets: ${input.holders.join(', ')}`);
  }
  for (const holder of unique) {
    if (!validCharacterIds.has(holder)) throw new Error(`Unknown character holder target: ${holder}`);
    if (entry.holders.includes(holder)) throw new Error(`Character already knows the fact: ${holder}`);
  }
  if (input.kind === 'reveal') {
    if (input.status !== undefined && knowledgeStatusRank[input.status] < knowledgeStatusRank[entry.status]) {
      throw new Error(`Knowledge status cannot regress: ${entry.id}`);
    }
  }
}

/**
 * 应用变更后的下一份 C3 文档：新增 holder（自动补齐 KnowledgeState，保持
 * holders/knows 双向镜像）、reveal 推进 status 并更新 revealAt、已揭示对象
 * 从 revealTo 移出。写入前经 assertKnowledgeOnlyAdvances + assertKnowledgeStructure
 * 双重兜底；返回深拷贝，绝不返回 live object。
 */
export function nextKnowledgeDocument(document: KnowledgeDocument, input: KnowledgeChangeInput): KnowledgeDocument {
  const entry = document.entries.find((item) => item.id === input.entryId);
  if (!entry) throw new Error(`Unknown knowledge entry: ${input.entryId}`);
  const added = [...new Set(input.holders)];
  let status = entry.status;
  let revealAt = entry.revealPlan.revealAt;
  if (input.kind === 'reveal') {
    const requested: KnowledgeStatus = input.status ?? 'partially-revealed';
    if (knowledgeStatusRank[requested] > knowledgeStatusRank[status]) status = requested;
    if (input.revealAt !== undefined) revealAt = input.revealAt;
  }
  const nextEntry: KnowledgeEntry = {
    ...entry,
    holders: [...entry.holders, ...added],
    revealPlan: { revealTo: entry.revealPlan.revealTo.filter((id) => !added.includes(id)), revealAt },
    status,
  };
  const states: KnowledgeState[] = document.states.map((state) => ({ ...state, knows: [...state.knows] }));
  for (const characterId of added) {
    const index = states.findIndex((state) => state.characterId === characterId);
    if (index === -1) states.push({ characterId, knows: [entry.id] });
    else states[index] = { ...states[index], knows: [...states[index].knows, entry.id] };
  }
  const next: KnowledgeDocument = {
    entries: document.entries.map((item) => (item.id === entry.id ? nextEntry : item)),
    states,
  };
  assertKnowledgeOnlyAdvances(document, next);
  assertKnowledgeStructure(next.entries, next.states);
  return structuredClone(next);
}

/**
 * 幂等判定：变更是否已对当前文档生效（accept 重复调用时 no-op，不重复写 C3）。
 * 与 nextKnowledgeDocument 的语义一致但不抛错 —— 已生效（如已含全部 holder、
 * status 已达标）即为 satisfied。
 */
export function isKnowledgeChangeSatisfied(document: KnowledgeDocument, input: KnowledgeChangeInput): boolean {
  const entry = document.entries.find((item) => item.id === input.entryId);
  if (!entry) return false;
  if (input.holders.some((id) => !entry.holders.includes(id))) return false;
  if (input.kind === 'reveal') {
    const requested: KnowledgeStatus = input.status ?? 'partially-revealed';
    if (knowledgeStatusRank[requested] > knowledgeStatusRank[entry.status]) return false;
    if (input.revealAt !== undefined && entry.revealPlan.revealAt !== input.revealAt) return false;
  }
  return true;
}

export type { KnowledgeDocument, KnowledgeEntry, KnowledgeStatus } from '../schema/knowledge.js';
