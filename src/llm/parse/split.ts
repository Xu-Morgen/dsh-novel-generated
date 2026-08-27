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
    '{"candidates":[{"id":"...","kind":"outline|worldview|detail-beat","sourceChunkIndex":0,"confidence":"low|medium|high","value":{}}]}',
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

/** Apply only an accepted split proposal through the canonical B5/B2 stores. */
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
  let outline = await readOptionalOutline(outlineRepository);
  const worldview: WorldEntry[] = [];
  const detailBeats: DetailBeat[] = [];
  for (const candidate of output.candidates) {
    if (candidate.kind === 'outline') {
      if (outline !== undefined) throw new Error('An outline already exists for accepted split proposal');
      outline = await outlineRepository.save(asOutlineInput(candidate.value));
    } else if (candidate.kind === 'worldview') {
      worldview.push(await worldRepository.create(asWorldEntryInput(candidate.value)));
    } else {
      if (!outline) throw new Error(`Detail beat requires an outline: ${candidate.id}`);
      outline = await appendDetailBeat(outlineRepository, outline, candidate.value);
      detailBeats.push(candidate.value.detailBeat);
    }
  }
  return { outline, worldview, detailBeats };
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

async function appendDetailBeat(repository: OutlineRepository, outline: Outline, value: SplitDetailBeatValue): Promise<Outline> {
  const act = outline.acts.find((item) => item.id === value.actId);
  if (!act) throw new Error(`Unknown outline act for detail beat: ${value.actId}`);
  const beat = act.beats.find((item) => item.id === value.beatId);
  if (!beat) throw new Error(`Unknown outline beat for detail beat: ${value.beatId}`);
  if (beat.detailBeats.some((item) => item.id === value.detailBeat.id)) throw new Error(`Duplicate detail beat id: ${value.detailBeat.id}`);
  const next = structuredClone(outline);
  const nextAct = next.acts.find((item) => item.id === value.actId)!;
  const nextBeat = nextAct.beats.find((item) => item.id === value.beatId)!;
  nextBeat.detailBeats.push(value.detailBeat as DetailBeat);
  return repository.save(next);
}
