import { z } from 'zod';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { OutlineRepository } from '../../core/outline/index.js';
import { WorldRepository } from '../../core/worldview/index.js';
import type { ConfirmationRecord } from '../../core/schema/confirm.js';
import { detailBeatSchema, outlineSchema, type DetailBeat, type Outline, type OutlineInput } from '../../core/schema/outline.js';
import { worldEntrySchema, type WorldEntry, type WorldEntryInput } from '../../core/schema/worldview.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import { confidenceSchema, parseJsonObject } from './shared.js';

const sourceChunkSchema = z.number().int().nonnegative();

/** A B5 outline candidate is complete enough for the existing outline store. */
/**
 * I102 prompt 示例单点化（计划 §18 I102，review v2.0 §6）：本常量是 prompt 中的
 * schema 描述示例，与下方 zod schema 双写；字段名/枚举随 schema 修改时必须同步
 * 本常量（smoke-i102 做骨架键一致性断言）。
 */
export const SPLIT_PROMPT_EXAMPLE =
    '{"candidates":[{"id":"...","kind":"outline|worldview|detail-beat","sourceChunkIndex":0,"confidence":"low|medium|high","value":{}}]}';

export const splitOutlineValueSchema = outlineSchema.omit({ version: true });
export type SplitOutlineValue = z.infer<typeof splitOutlineValueSchema>;

/** A B2 worldview candidate is a new entry; persistence owns version/status links. */
export const splitWorldviewValueSchema = worldEntrySchema.omit({ version: true, status: true, supersededBy: true });
export type SplitWorldviewValue = z.infer<typeof splitWorldviewValueSchema>;

/** A detail-beat candidate points at an existing B5 beat and never creates C-layer data. */
export const splitDetailBeatValueSchema = z.object({
  actId: z.string().min(1),
  beatId: z.string().min(1),
  detailBeat: detailBeatSchema,
}).strict();
export type SplitDetailBeatValue = z.infer<typeof splitDetailBeatValueSchema>;

const splitCandidateBaseSchema = z.object({
  id: z.string().min(1),
  sourceChunkIndex: sourceChunkSchema,
  confidence: confidenceSchema,
}).strict();

export const splitOutlineCandidateSchema = splitCandidateBaseSchema.extend({
  kind: z.literal('outline'),
  value: splitOutlineValueSchema,
}).strict();
export type SplitOutlineCandidate = z.infer<typeof splitOutlineCandidateSchema>;

export const splitWorldviewCandidateSchema = splitCandidateBaseSchema.extend({
  kind: z.literal('worldview'),
  value: splitWorldviewValueSchema,
}).strict();
export type SplitWorldviewCandidate = z.infer<typeof splitWorldviewCandidateSchema>;

export const splitDetailBeatCandidateSchema = splitCandidateBaseSchema.extend({
  kind: z.literal('detail-beat'),
  value: splitDetailBeatValueSchema,
}).strict();
export type SplitDetailBeatCandidate = z.infer<typeof splitDetailBeatCandidateSchema>;

export const splitCandidateSchema = z.discriminatedUnion('kind', [
  splitOutlineCandidateSchema,
  splitWorldviewCandidateSchema,
  splitDetailBeatCandidateSchema,
]);
export type SplitCandidate = z.infer<typeof splitCandidateSchema>;

/** Strict I38 model envelope. It intentionally has no C1/C2/C3/C4 fields. */
export const splitAgentOutputSchema = z.object({ candidates: z.array(splitCandidateSchema) }).strict();
export type SplitAgentOutput = z.infer<typeof splitAgentOutputSchema>;

export const splitAgentInputSchema = z.object({
  chunks: z.array(z.object({ index: sourceChunkSchema, text: z.string().trim().min(1) }).strict()).min(1),
}).strict();
export type SplitAgentInput = z.infer<typeof splitAgentInputSchema>;

/** Parse one JSON-only I38 response and reject markdown, unknown fields, and C-layer leakage. */
export function parseSplitAgentOutput(text: unknown): SplitAgentOutput {
  return parseJsonObject(text, splitAgentOutputSchema, 'Split agent output');
}

/** Validate source references and candidate identity before any Gate proposal. */
export function assertSplitCandidates(input: SplitAgentInput, output: SplitAgentOutput): void {
  const chunks = new Set(input.chunks.map((chunk) => chunk.index));
  const ids = new Set<string>();
  let outlineCount = 0;
  for (const candidate of output.candidates) {
    if (!chunks.has(candidate.sourceChunkIndex)) throw new Error(`Unknown import chunk: ${candidate.sourceChunkIndex}`);
    if (!ids.add(candidate.id)) throw new Error(`Duplicate split candidate id: ${candidate.id}`);
    if (candidate.kind === 'outline') outlineCount += 1;
  }
  if (outlineCount > 1) throw new Error('Split agent may produce at most one outline candidate');
}

/** Invoke the Host-routed LLM for B5/B2/detail-beat splitting only. */
export async function splitImportedText(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<SplitAgentOutput> {
  const source = splitAgentInputSchema.parse(input);
  const candidate = await collectCandidate(backend, {
    prompt: buildSplitAgentPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseSplitAgentOutput(candidate.text);
  assertSplitCandidates(source, output);
  return structuredClone(output);
}

/** Prompt boundary for I38: no inference or writeback for C1/C2/C3/C4. */
export function buildSplitAgentPrompt(input: SplitAgentInput): string {
  return [
    '你是小说导入拆分 agent。把输入文本拆成大纲、世界观和细纲 detailBeats 候选。',
    '只输出一个 JSON 对象，完全符合 candidates schema；每条候选必须标注 sourceChunkIndex 和 confidence。',
    'outline 是完整 B5 大纲候选；worldview 是新的 B2 世界观条目；detail-beat 必须引用现有 actId/beatId。',
    '禁止输出或推断 C1 关系、C2 状态、C3 知情、C4 正史，也禁止自动接受、写入、解释或 Markdown。低置信内容仍输出为候选并标 confidence: low。',
    SPLIT_PROMPT_EXAMPLE,
    `输入文本块：${JSON.stringify(input.chunks)}`,
  ].join('\n');
}

/** Put every parsed candidate behind the shared I11 Gate, regardless of confidence. */
export async function proposeSplitCandidates(
  gate: ConfirmationGate,
  proposalId: string,
  input: SplitAgentInput,
  output: SplitAgentOutput,
): Promise<ConfirmationRecord> {
  assertSplitCandidates(input, output);
  return gate.propose({ id: proposalId, kind: 'i38-import-split-candidates', payload: output });
}

/**
 * Apply only an accepted split proposal through the canonical B5/B2 stores.
 *
 * I93 UoW（review v2.0 §8#6 / 计划 §18 I93）：
 * - 准备阶段零写：outline/worldview/detail-beat 全部先对当前状态 + 批内
 *   相互影响校验（含 detail-beat 针对「拟写入 outline」而非旧 outline），
 *   任一失败即整体拒绝，不部分落库；
 * - 幂等重试：重试时已精确落库的项按 replay 跳过（outline 已存在且与提案
 *   一致不再报错），部分失败的提案可安全重试；
 * - 提交阶段失败补偿：覆盖既有 outline 时用准备阶段捕获的原文档还原。
 */
export async function applyAcceptedSplitCandidates(
  gate: ConfirmationGate,
  proposalId: string,
  outlineRepository: OutlineRepository,
  worldRepository: WorldRepository,
): Promise<{ outline?: Outline; worldview: WorldEntry[]; detailBeats: DetailBeat[] }> {
  const record = gate.get(proposalId);
  if (record.kind !== 'i38-import-split-candidates') throw new Error(`Unexpected split proposal kind: ${record.kind}`);
  if (record.status !== 'accepted') throw new Error('Split proposal requires accepted ConfirmationGate decision');
  const output = splitAgentOutputSchema.parse(record.payload);

  const existingOutline = await readOptionalOutline(outlineRepository);
  const existingWorld = await worldRepository.list();
  const planned = planSplitApply(existingOutline, existingWorld, output);

  const outline = await commitSplitApply(outlineRepository, worldRepository, planned, existingOutline);
  return {
    outline,
    worldview: planned.worldview.map((item) => item.entry),
    detailBeats: planned.detailBeats,
  };
}

interface SplitPlanItem { readonly entry: WorldEntry; readonly create: boolean; }

interface SplitPlan {
  readonly outline?: Outline;
  readonly saveOutline: boolean;
  readonly worldview: SplitPlanItem[];
  readonly detailBeats: DetailBeat[];
}

/**
 * Pure preparation: classify every candidate as create/replay against current +
 * batch state, zero writes（I93 UoW）。
 *
 * 预期 outline = 提案 outline 候选（若有）叠加全部 detail-beat 候选；与磁盘上
 * 既有 outline 比对时按此整体比对，因此「outline 已由上次部分提交落库」的
 * 重试被识别为 replay，不再误报冲突。
 */
function planSplitApply(
  existingOutline: Outline | undefined,
  existingWorld: readonly WorldEntry[],
  output: SplitAgentOutput,
): SplitPlan {
  let outlineProposal: SplitOutlineValue | undefined;
  for (const candidate of output.candidates) {
    if (candidate.kind === 'outline') {
      if (outlineProposal !== undefined) throw new Error('Split proposal has more than one outline candidate');
      outlineProposal = candidate.value;
    }
  }

  const expectedOutline = outlineProposal !== undefined
    ? structuredClone(outlineProposal) as Outline
    : existingOutline === undefined ? undefined : structuredClone(existingOutline);

  const detailBeats: DetailBeat[] = [];
  let detailAppended = false;
  for (const candidate of output.candidates) {
    if (candidate.kind !== 'detail-beat') continue;
    if (expectedOutline === undefined) throw new Error(`Detail beat requires an outline: ${candidate.id}`);
    const act = expectedOutline.acts.find((item) => item.id === candidate.value.actId);
    if (!act) throw new Error(`Unknown outline act for detail beat: ${candidate.value.actId}`);
    const beat = act.beats.find((item) => item.id === candidate.value.beatId);
    if (!beat) throw new Error(`Unknown outline beat for detail beat: ${candidate.value.beatId}`);
    const existingBeat = beat.detailBeats.find((item) => item.id === candidate.value.detailBeat.id);
    if (existingBeat !== undefined) {
      if (JSON.stringify(existingBeat) !== JSON.stringify(candidate.value.detailBeat)) {
        throw new Error(`Duplicate detail beat id with different content: ${candidate.value.detailBeat.id}`);
      }
      detailBeats.push(candidate.value.detailBeat); // 重放：已落库
      continue;
    }
    beat.detailBeats.push(candidate.value.detailBeat as DetailBeat);
    detailBeats.push(candidate.value.detailBeat);
    detailAppended = true;
  }

  const worldview: SplitPlanItem[] = [];
  const worldById = new Map(existingWorld.map((entry) => [entry.id, entry]));
  for (const candidate of output.candidates) {
    if (candidate.kind !== 'worldview') continue;
    const existing = worldById.get(candidate.value.id);
    if (existing !== undefined) {
      if (equalsSplitWorldview(existing, candidate.value)) {
        worldview.push({ entry: existing, create: false }); // 重放：已落库
        continue;
      }
      throw new Error(`World entry already exists with different content: ${candidate.value.id}`);
    }
    const entry = worldEntrySchema.parse({ ...candidate.value, version: 1, status: 'active', supersededBy: null });
    worldview.push({ entry, create: true });
  }

  let outline = existingOutline;
  let saveOutline = false;
  if (outlineProposal !== undefined) {
    if (expectedOutline === undefined) throw new Error('Split proposal outline candidate is empty');
    if (existingOutline !== undefined) {
      if (!equalsSplitOutline(existingOutline, expectedOutline)) {
        throw new Error('An outline already exists for accepted split proposal');
      }
      // 重放：既有 outline 已含提案 outline + 全部 detail-beat
    } else {
      outline = expectedOutline;
      saveOutline = true;
    }
  } else if (detailAppended) {
    outline = expectedOutline;
    saveOutline = true;
  }
  return { outline, saveOutline, worldview, detailBeats };
}

function equalsSplitOutline(stored: Outline, expected: Outline): boolean {
  return JSON.stringify({ ...stored, version: undefined }) === JSON.stringify({ ...expected, version: undefined });
}

function equalsSplitWorldview(stored: WorldEntry, proposal: SplitWorldviewValue): boolean {
  return JSON.stringify({ ...stored, version: undefined, status: undefined, supersededBy: undefined }) === JSON.stringify(proposal);
}

/** Commit planned writes; restore the previous outline document on failure (I93 compensation). */
async function commitSplitApply(
  outlineRepository: OutlineRepository,
  worldRepository: WorldRepository,
  plan: SplitPlan,
  existingOutline: Outline | undefined,
): Promise<Outline | undefined> {
  const wroteNewOutline = plan.saveOutline && existingOutline === undefined;
  try {
    let outline = existingOutline === undefined ? undefined : existingOutline;
    if (plan.saveOutline && plan.outline !== undefined) {
      outline = await outlineRepository.save(asOutlineInput(plan.outline));
    }
    for (const item of plan.worldview) {
      if (!item.create) continue;
      await worldRepository.create(asWorldEntryInput(item.entry));
    }
    return outline;
  } catch (error) {
    if (existingOutline !== undefined) {
      await outlineRepository.save(existingOutline).catch(() => undefined);
    }
    if (wroteNewOutline) {
      throw new Error(`Split apply failed mid-commit with new outline persisted (${(error as Error).message}); retry is idempotent`);
    }
    throw error;
  }
}

async function readOptionalOutline(repository: OutlineRepository): Promise<Outline | undefined> {
  try { return await repository.read(); } catch { return undefined; }
}

function asOutlineInput(value: SplitOutlineValue): OutlineInput {
  return { ...value, version: 1 };
}

function asWorldEntryInput(value: SplitWorldviewValue): WorldEntryInput {
  return { ...value, version: 1, status: 'active', supersededBy: null };
}
