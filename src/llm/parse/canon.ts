import { z } from 'zod';
import { CanonLedger, type CanonEventView } from '../../core/canon/index.js';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { entityIdSchema } from '../../core/schema/base.js';
import { canonKindSchema } from '../../core/schema/canon.js';
import { type ConfirmationRecord } from '../../core/schema/confirm.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

const confidenceSchema = z.enum(['low', 'medium', 'high']);
const appendKindSchema = canonKindSchema.exclude(['correction']);

/** I26 model-supplied content for a new C4 fact; sequence and immutability remain ledger-owned. */
export const c4CanonEventInputSchema = z.object({
  id: entityIdSchema,
  storyTime: z.string(),
  kind: appendKindSchema,
  summary: z.string().min(1),
  detail: z.string(),
  participants: z.array(entityIdSchema),
  location: z.string(),
  consequences: z.array(entityIdSchema),
  affectedLayers: z.array(z.string()),
}).strict();
export type C4CanonEventInput = z.infer<typeof c4CanonEventInputSchema>;

/** I26 model-supplied correction content; only CanonLedger may add its correction kind and supersedes link. */
export const c4CanonCorrectionInputSchema = c4CanonEventInputSchema.omit({ kind: true });
export type C4CanonCorrectionInput = z.infer<typeof c4CanonCorrectionInputSchema>;

/** Exact C4 mutation proposal: append a new fact or supersede one retained fact, never update/delete. */
export const c4CanonOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('append'),
    event: c4CanonEventInputSchema,
    confidence: confidenceSchema,
  }).strict(),
  z.object({
    op: z.literal('supersede'),
    targetId: entityIdSchema,
    correction: c4CanonCorrectionInputSchema,
    confidence: confidenceSchema,
  }).strict(),
]);
export type C4CanonOperation = z.infer<typeof c4CanonOperationSchema>;

/** JSON-only response permitted from the C4 narrative parser (design §5.11, §6.2, §6.6). */
export const c4CanonParserOutputSchema = z.object({
  ops: z.array(c4CanonOperationSchema),
}).strict();
export type C4CanonParserOutput = z.infer<typeof c4CanonParserOutputSchema>;

// The retained ledger can contain correction rows; only new append proposals exclude them.
const canonEventViewSchema = z.object({
  id: entityIdSchema,
  seq: z.number().int().nonnegative(),
  storyTime: z.string(),
  kind: canonKindSchema,
  summary: z.string().min(1),
  detail: z.string(),
  participants: z.array(entityIdSchema),
  location: z.string(),
  consequences: z.array(entityIdSchema),
  affectedLayers: z.array(z.string()),
  immutable: z.literal(true),
  supersedes: entityIdSchema.optional(),
  supersededBy: entityIdSchema.nullable(),
}).strict();

/** The parser sees only accepted prose and a JSON projection of the current C4 ledger. */
export const c4CanonParserInputSchema = z.object({
  prose: z.string().trim().min(1),
  canon: z.array(canonEventViewSchema),
}).strict();
export type C4CanonParserInput = z.infer<typeof c4CanonParserInputSchema>;

/** Parse a JSON-only C4 parser response and reject malformed or extra model output. */
export function parseC4CanonParserOutput(text: unknown): C4CanonParserOutput {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error('C4 Canon parser output must be valid JSON', { cause });
  }
  return c4CanonParserOutputSchema.parse(json);
}

/**
 * Invoke the Host-routed LLM for one C4-only recognition pass. It validates
 * proposals but does not mutate the ledger (design §6.6; plan I26).
 */
export async function parseC4CanonFromNarrative(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<C4CanonParserOutput> {
  const source = c4CanonParserInputSchema.parse(input);
  const candidate = await collectCandidate(backend, {
    prompt: buildC4CanonParserPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseC4CanonParserOutput(candidate.text);
  assertC4CanonOperations(source.canon, output.ops);
  return { ops: output.ops.map((operation) => structuredClone(operation)) };
}

/** Build the minimum C4-only JSON prompt; no other layer is disclosed. */
export function buildC4CanonParserPrompt(input: C4CanonParserInput): string {
  return [
    '你是小说 C4 正史解析器。比较已接受正文与给定当前 C4 正史账本，只识别需要追加的正史事实或对既有事实的更正提案。',
    '不得输出状态、关系、知情、世界观、大纲、风格或正文改写；不得更新、删除或重写旧正史行；不得解释、不得使用 Markdown。',
    '仅输出一个 JSON 对象，必须完全符合：',
    '{"ops":[{"op":"append","event":{"id":"string","storyTime":"string","kind":"event|decision|revelation|statechange|dialogue","summary":"string","detail":"string","participants":["id"],"location":"string","consequences":["id"],"affectedLayers":["string"]},"confidence":"low|medium|high"}|{"op":"supersede","targetId":"existing active id","correction":{"id":"string","storyTime":"string","summary":"string","detail":"string","participants":["id"],"location":"string","consequences":["id"],"affectedLayers":["string"]},"confidence":"low|medium|high"}]}',
    'append 仅新增事实；supersede 仅更正给出的未被更正事件，且不含 kind、seq、immutable 或 supersedes。无法确定事实时 confidence 为 low；没有变更输出 {"ops":[]}。',
    `当前 C4 正史账本：${JSON.stringify(input.canon)}`,
    `已接受正文：${input.prose}`,
  ].join('\n');
}

/**
 * Assert proposals are addressable in this exact retained ledger state. This is
 * deterministic validation, not natural-language interpretation (design §6.6).
 */
export function assertC4CanonOperations(
  canon: readonly CanonEventView[],
  operations: readonly C4CanonOperation[],
): void {
  const ids = new Set(canon.map((event) => event.id));
  const activeIds = new Set(canon.filter((event) => event.supersededBy === null).map((event) => event.id));
  const proposalIds = new Set<string>();
  const supersededTargets = new Set<string>();
  for (const operation of operations) {
    const id = operation.op === 'append' ? operation.event.id : operation.correction.id;
    if (ids.has(id) || proposalIds.has(id)) throw new Error(`Duplicate C4 canon event id: ${id}`);
    proposalIds.add(id);
    if (operation.op === 'supersede') {
      if (!activeIds.has(operation.targetId)) throw new Error(`Unknown or superseded C4 correction target: ${operation.targetId}`);
      if (supersededTargets.has(operation.targetId)) throw new Error(`C4 correction target appears more than once: ${operation.targetId}`);
      supersededTargets.add(operation.targetId);
    }
  }
}

/** Return whether this batch must remain in I11 pending state before any ledger write. */
export function requiresC4CanonConfirmation(operations: readonly C4CanonOperation[]): boolean {
  return operations.some((operation) => operation.confidence === 'low' || operation.op === 'supersede');
}

/**
 * Mechanically dispatch validated medium/high append proposals to CanonLedger.
 * Every correction requires I11 confirmation per design §6.2, so neither it nor
 * a low-confidence append can reach the ledger through this function.
 */
export async function applyC4CanonOperations(
  ledger: CanonLedger,
  output: C4CanonParserOutput,
): Promise<CanonEventView[]> {
  const current = ledger.query();
  assertC4CanonOperations(current, output.ops);
  if (requiresC4CanonConfirmation(output.ops)) {
    throw new Error('Low-confidence or supersede C4 operations require ConfirmationGate');
  }
  const applied: CanonEventView[] = [];
  for (const operation of output.ops) {
    if (operation.op !== 'append') throw new Error('C4 supersede operations require ConfirmationGate');
    const event = await ledger.append(operation.event);
    applied.push({ ...event, supersededBy: null });
  }
  return applied;
}

/** Propose, but never write, all low-confidence appends and every correction through the sole I11 Gate. */
export async function proposeC4CanonOperations(
  gate: ConfirmationGate,
  proposalId: string,
  canon: readonly CanonEventView[],
  output: C4CanonParserOutput,
): Promise<ConfirmationRecord> {
  assertC4CanonOperations(canon, output.ops);
  if (!requiresC4CanonConfirmation(output.ops)) {
    throw new Error('Only low-confidence or supersede C4 operations require ConfirmationGate');
  }
  return gate.propose({ id: proposalId, kind: 'c4-canon-parser-ops', payload: { ops: output.ops } });
}
