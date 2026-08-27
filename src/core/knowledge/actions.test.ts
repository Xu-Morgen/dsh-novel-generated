import { describe, expect, it } from 'vitest';
import {
  isKnowledgeChangeSatisfied,
  knowledgeChangeInputSchema,
  knowledgePovHint,
  knowledgeProposalId,
  nextKnowledgeDocument,
  validateKnowledgeChange,
} from './actions.js';
import type { KnowledgeDocument, KnowledgeEntry } from '../schema/knowledge.js';

/**
 * I66 C3 手动揭示 / holder 变更核心动作（design §14.10 / R14-1）。
 *
 * 确定性断言：
 * - 正向：reveal 新增 holder + 推进 status + 更新 revealAt + 移出 revealTo +
 *   自动补齐 KnowledgeState（holders/knows 镜像）；holder-add 只加 holder。
 * - 负向：逆向 status 失败、未知 entry / 未知角色 / 已知情 holder / 空 holder /
 *   重复 holder 全部 fail-fast 零写。
 * - 幂等：isKnowledgeChangeSatisfied 对已生效变更返回 true（重复 accept no-op）。
 */

const MIRA = 'mira';
const LIN = 'lin';
const KAI = 'kai';

function entry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'k-1', fact: '灯塔守夜人失踪真相', kind: 'secret', holders: [],
    revealPlan: { revealTo: [LIN], revealAt: '第三幕' }, status: 'hidden', version: 1,
    ...overrides,
  };
}

function document(
  entries: KnowledgeEntry[] = [entry()],
  states: Array<{ characterId: string; knows: string[] }> = [{ characterId: MIRA, knows: [] }, { characterId: LIN, knows: [] }],
): KnowledgeDocument {
  // 保持 fixtures 内部一致：entry.holders 与对应角色的 knows 必须镜像（C3 双向不变量）。
  for (const item of entries) {
    for (const holder of item.holders) {
      const state = states.find((candidate) => candidate.characterId === holder);
      if (state !== undefined) {
        if (!state.knows.includes(item.id)) state.knows = [...state.knows, item.id];
      } else {
        states.push({ characterId: holder, knows: [item.id] });
      }
    }
  }
  return { entries, states };
}

const VALID = new Set([MIRA, LIN, KAI]);

describe('I66 knowledge actions (R14-1)', () => {
  it('reveal 新增 holder、推进 status、更新 revealAt、移出 revealTo 并补齐 KnowledgeState', () => {
    const doc = document();
    const next = nextKnowledgeDocument(doc, {
      kind: 'reveal', entryId: 'k-1', holders: [MIRA, LIN, KAI], status: 'revealed', revealAt: '第二幕',
    });
    const updated = next.entries[0];
    expect(updated.holders).toEqual([MIRA, LIN, KAI]);
    expect(updated.status).toBe('revealed');
    expect(updated.revealPlan.revealTo).toEqual([]);
    expect(updated.revealPlan.revealAt).toBe('第二幕');
    // holders/knows 双向镜像：MIRA/LIN 既有 state 追加，KAI 自动新建 state。
    expect(next.states.find((state) => state.characterId === MIRA)?.knows).toEqual(['k-1']);
    expect(next.states.find((state) => state.characterId === LIN)?.knows).toEqual(['k-1']);
    expect(next.states.find((state) => state.characterId === KAI)?.knows).toEqual(['k-1']);
  });

  it('reveal 缺省 status 时至少推进到 partially-revealed，不高于现状则保持', () => {
    const doc = document([entry({ status: 'partially-revealed', holders: [MIRA], revealPlan: { revealTo: [LIN], revealAt: '第三幕' } })]);
    const next = nextKnowledgeDocument(doc, { kind: 'reveal', entryId: 'k-1', holders: [LIN] });
    expect(next.entries[0].status).toBe('partially-revealed');
    expect(next.entries[0].holders).toEqual([MIRA, LIN]);
  });

  it('holder-add 只新增 holder：status 与 revealPlan 原样保留', () => {
    const doc = document([entry({ status: 'hidden', holders: [MIRA], revealPlan: { revealTo: [LIN], revealAt: '第三幕' } })]);
    const next = nextKnowledgeDocument(doc, { kind: 'holder-add', entryId: 'k-1', holders: [LIN] });
    expect(next.entries[0].holders).toEqual([MIRA, LIN]);
    expect(next.entries[0].status).toBe('hidden');
    expect(next.entries[0].revealPlan.revealTo).toEqual([]);
    expect(next.entries[0].revealPlan.revealAt).toBe('第三幕');
  });

  it('逆向 status 提案失败（fail-fast 零写）：已揭示 → 部分揭示 / 隐藏 均拒绝', () => {
    const doc = document([entry({ status: 'revealed', holders: [MIRA] })]);
    // schema 层已禁止 status='hidden'（reveal 只允许 partially-revealed/revealed），
    // 这里验证已揭示事实不可再请求更低 status（rank 倒退被 validate 拒绝）。
    expect(() => validateKnowledgeChange(doc, { kind: 'reveal', entryId: 'k-1', holders: [LIN], status: 'partially-revealed' }, VALID))
      .toThrow(/cannot regress/);
    // 以原始负载直接命中 validate（绕过 schema）：hidden 同样被 rank 校验拒绝。
    const forged = { kind: 'reveal' as const, entryId: 'k-1', holders: [LIN], status: 'hidden' as const };
    expect(() => validateKnowledgeChange(doc, forged as unknown as Parameters<typeof validateKnowledgeChange>[1], VALID))
      .toThrow(/cannot regress/);
  });

  it('未知 entry / 未知角色 / 已知情 holder / 空 holder / 重复 holder 全部拒绝', () => {
    const doc = document();
    expect(() => validateKnowledgeChange(doc, { kind: 'reveal', entryId: 'nope', holders: [MIRA] }, VALID)).toThrow(/Unknown knowledge entry/);
    expect(() => validateKnowledgeChange(doc, { kind: 'reveal', entryId: 'k-1', holders: ['ghost'] }, VALID)).toThrow(/Unknown character/);
    const known = document([entry({ holders: [MIRA] })]);
    expect(() => validateKnowledgeChange(known, { kind: 'holder-add', entryId: 'k-1', holders: [MIRA] }, VALID)).toThrow(/already knows/);
    expect(() => validateKnowledgeChange(doc, { kind: 'reveal', entryId: 'k-1', holders: [] }, VALID)).toThrow(/at least one holder/);
    expect(() => validateKnowledgeChange(doc, { kind: 'reveal', entryId: 'k-1', holders: [MIRA, MIRA] }, VALID)).toThrow(/Duplicate holder/);
  });

  it('schema 拒绝 holder-add 携带 status / revealAt（严格合同）', () => {
    expect(() => knowledgeChangeInputSchema.parse({ kind: 'holder-add', entryId: 'k-1', holders: ['mira'], status: 'revealed' })).toThrow();
    expect(() => knowledgeChangeInputSchema.parse({ kind: 'holder-add', entryId: 'k-1', holders: ['mira'], revealAt: '第二幕' })).toThrow();
    expect(() => knowledgeChangeInputSchema.parse({ kind: 'reveal', entryId: 'k-1', holders: [] })).toThrow();
    expect(knowledgeChangeInputSchema.parse({ kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed', revealAt: '第二幕' }).kind).toBe('reveal');
  });

  it('幂等判定：已生效变更 satisfied，未生效不 satisfied', () => {
    const applied = document([entry({ holders: [MIRA], status: 'revealed', revealPlan: { revealTo: [], revealAt: '第二幕' } })]);
    expect(isKnowledgeChangeSatisfied(applied, { kind: 'reveal', entryId: 'k-1', holders: [MIRA], status: 'revealed', revealAt: '第二幕' })).toBe(true);
    expect(isKnowledgeChangeSatisfied(applied, { kind: 'reveal', entryId: 'k-1', holders: [MIRA, LIN], status: 'revealed' })).toBe(false);
    expect(isKnowledgeChangeSatisfied(applied, { kind: 'holder-add', entryId: 'k-1', holders: [MIRA] })).toBe(true);
    expect(isKnowledgeChangeSatisfied(applied, { kind: 'holder-add', entryId: 'k-1', holders: [LIN] })).toBe(false);
    expect(isKnowledgeChangeSatisfied(applied, { kind: 'reveal', entryId: 'nope', holders: [MIRA] })).toBe(false);
  });

  it('POV 边界提示按 holder/revealTo 生成且名称缺失回退 id', () => {
    const names = new Map([[MIRA, '米拉'], [LIN, '林']]);
    expect(knowledgePovHint(entry(), names)).toContain('尚无角色知晓');
    expect(knowledgePovHint(entry(), names)).toContain('计划揭示 林（第三幕）');
    expect(knowledgePovHint(entry({ holders: [MIRA], revealPlan: { revealTo: [LIN], revealAt: '第三幕' } }), names)).toContain('当前 米拉 知晓');
    expect(knowledgePovHint(entry({ holders: [KAI] }), names)).toContain('kai');
  });

  it('提案 id 合法且唯一（entityId 形状、前缀稳定）', () => {
    const first = knowledgeProposalId('k-1', 1_700_000_000_000);
    const second = knowledgeProposalId('k-1', 1_700_000_000_001);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^kprop-[a-z0-9]+-k-1$/);
    expect(first.length).toBeLessThanOrEqual(64);
  });
});
