import { z } from 'zod';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { WorldRepository } from '../../core/worldview/index.js';
import { type ConfirmationRecord } from '../../core/schema/confirm.js';
import { entityIdSchema } from '../../core/schema/base.js';
import { worldEntrySchema, type WorldEntry, type WorldEntryInput } from '../../core/schema/worldview.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

const confidenceSchema = z.enum(['low', 'medium', 'high']);
const b2ReplacementSchema = worldEntrySchema.omit({ version: true, status: true, supersededBy: true });

/** A B2 replacement is always a new active entry; version and supersede links remain repository-owned. */
export type B2WorldviewReplacement = z.infer<typeof b2ReplacementSchema>;

/** Exact I29 operation: replace one mutable active B2 entry without an in-place model update. */
export const b2WorldviewSupersedeOperationSchema = z.object({
  op: z.literal('supersede'),
  targetId: entityIdSchema,
  replacement: b2ReplacementSchema,
  confidence: confidenceSchema,
}).strict();
export type B2WorldviewSupersedeOperation = z.infer<typeof b2WorldviewSupersedeOperationSchema>;

/** JSON-only B2 parser envelope; I29 accepts no direct create/update/delete operation. */
export const b2WorldviewParserOutputSchema = z.object({
  ops: z.array(b2WorldviewSupersedeOperationSchema),
}).strict();
export type B2WorldviewParserOutput = z.infer<typeof b2WorldviewParserOutputSchema>;

/** The parser sees accepted prose and only current B2 entries it may propose to supersede. */
export const b2WorldviewParserInputSchema = z.object({
  prose: z.string().trim().min(1),
  current: worldEntrySchema.array(),
}).strict();
export type B2WorldviewParserInput = z.infer<typeof b2WorldviewParserInputSchema>;

/** Parse a JSON-only B2 response and reject malformed or extra model output. */
export function parseB2WorldviewParserOutput(text: unknown): B2WorldviewParserOutput {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error('B2 worldview parser output must be valid JSON', { cause });
  }
  return b2WorldviewParserOutputSchema.parse(json);
}

/**
 * Invoke the Host-routed LLM for one B2-only recognition pass. The response is
 * a proposal only: I11 and WorldRepository retain confirmation and write authority
 * (design §5.4, §6.6; plan I29).
 */
export async function parseB2WorldviewFromNarrative(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<B2WorldviewParserOutput> {
  const source = b2WorldviewParserInputSchema.parse(input);
  const candidate = await collectCandidate(backend, {
    prompt: buildB2WorldviewParserPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseB2WorldviewParserOutput(candidate.text);
  assertB2WorldviewSupersedeOperations(source.current, output.ops);
  return { ops: output.ops.map((operation) => structuredClone(operation)) };
}

/** Build the minimum B2-only prompt; no C-layer or other setting-layer projection is disclosed. */
export function buildB2WorldviewParserPrompt(input: B2WorldviewParserInput): string {
  return [
    '你是小说 B2 世界观改写解析器。比较已接受正文与给定当前 B2 世界观，只识别已经发生且需要改写的可变世界观条目。',
    '不得输出状态、关系、知情、正史、大纲、角色、风格或正文改写；不得原地更新、删除或直接创建条目；不得解释、不得使用 Markdown。',
    '仅输出一个 JSON 对象，必须完全符合：',
    '{"ops":[{"op":"supersede","targetId":"existing mutable active B2 id","replacement":{"id":"new id","kind":"geography|history|faction|culture|race|concept|artifact","title":"string","content":"string","keywords":["string"],"triggerMode":"keyword|regex|constant","weight":"integer","parent":"same parent id or null","mutable":"boolean"},"confidence":"low|medium|high"}]}',
    'supersede 只可指向给出的 mutable:true 且 status:active 条目；replacement 必须使用未出现的新 id，与目标保持相同 parent。新条目的 version/status/supersededBy 由存储层决定。所有 B2 改写无论置信度都必须等待用户确认；没有改写输出 {"ops":[]}。',
    `当前 B2 世界观：${JSON.stringify(input.current)}`,
    `已接受正文：${input.prose}`,
  ].join('\n');
}

/** Assert that every operation can supersede exactly one currently mutable, active B2 entry. */
export function assertB2WorldviewSupersedeOperations(
  current: readonly WorldEntry[],
  operations: readonly B2WorldviewSupersedeOperation[],
): void {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const targetIds = new Set<string>();
  const replacementIds = new Set<string>();
  for (const operation of operations) {
    const target = byId.get(operation.targetId);
    if (!target || target.status !== 'active') throw new Error(`Unknown or non-active B2 worldview target: ${operation.targetId}`);
    if (!target.mutable) throw new Error(`Immutable B2 worldview target cannot be superseded: ${operation.targetId}`);
    if (!targetIds.add(operation.targetId)) throw new Error(`Duplicate B2 worldview supersede target: ${operation.targetId}`);
    if (operation.replacement.id === operation.targetId || byId.has(operation.replacement.id) || !replacementIds.add(operation.replacement.id)) {
      throw new Error(`Duplicate or invalid B2 worldview replacement id: ${operation.replacement.id}`);
    }
    if (operation.replacement.parent !== target.parent) {
      throw new Error(`B2 worldview replacement must retain parent: ${operation.targetId}`);
    }
  }
}

/** Every B2 rewrite remains confirmation-first, including high-confidence proposals. */
export function requiresB2WorldviewConfirmation(): true {
  return true;
}

/** Propose, but never write, B2 supersedes through the sole I11 ConfirmationGate. */
export async function proposeB2WorldviewSupersedeOperations(
  gate: ConfirmationGate,
  proposalId: string,
  current: readonly WorldEntry[],
  output: B2WorldviewParserOutput,
): Promise<ConfirmationRecord> {
  assertB2WorldviewSupersedeOperations(current, output.ops);
  return gate.propose({ id: proposalId, kind: 'b2-worldview-parser-supersedes', payload: { ops: output.ops } });
}

/**
 * Apply an accepted I11 proposal through the canonical B2 repository. Replays
 * return the prior repository result only when it exactly matches the proposal,
 * preserving the I11 accept/apply idempotency boundary.
 */
export async function applyAcceptedB2WorldviewSupersedeOperations(
  gate: ConfirmationGate,
  proposalId: string,
  repository: WorldRepository,
): Promise<Array<{ superseded: WorldEntry; replacement: WorldEntry }>> {
  const record = gate.get(proposalId);
  if (record.kind !== 'b2-worldview-parser-supersedes') throw new Error(`Unexpected B2 worldview proposal kind: ${record.kind}`);
  if (record.status !== 'accepted') throw new Error('B2 worldview supersede proposal requires accepted ConfirmationGate decision');
  const output = b2WorldviewParserOutputSchema.parse(record.payload);
  const current = await repository.list();
  const replay = readExactB2WorldviewReplay(current, output.ops);
  if (replay !== undefined) return replay;
  assertB2WorldviewSupersedeOperations(current, output.ops);
  const applied: Array<{ superseded: WorldEntry; replacement: WorldEntry }> = [];
  for (const operation of output.ops) {
    applied.push(await repository.rewrite(operation.targetId, asWorldEntryInput(operation.replacement)));
  }
  return applied;
}

function asWorldEntryInput(replacement: B2WorldviewReplacement): WorldEntryInput {
  return { ...replacement, status: 'active', supersededBy: null };
}

function readExactB2WorldviewReplay(
  current: readonly WorldEntry[],
  operations: readonly B2WorldviewSupersedeOperation[],
): Array<{ superseded: WorldEntry; replacement: WorldEntry }> | undefined {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const replay: Array<{ superseded: WorldEntry; replacement: WorldEntry }> = [];
  for (const operation of operations) {
    const superseded = byId.get(operation.targetId);
    const replacement = byId.get(operation.replacement.id);
    if (!superseded || !replacement || superseded.status !== 'rewritten' || superseded.supersededBy !== replacement.id) return undefined;
    const expected = worldEntrySchema.parse({ ...asWorldEntryInput(operation.replacement), version: 1 });
    if (JSON.stringify(replacement) !== JSON.stringify(expected)) {
      throw new Error(`B2 worldview replay replacement differs from accepted proposal: ${replacement.id}`);
    }
    replay.push({ superseded, replacement });
  }
  return replay;
}
