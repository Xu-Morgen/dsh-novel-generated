import { z } from 'zod';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { KnowledgeRepository, assertKnowledgeStructure, type KnowledgeDocument, type KnowledgeEntry, type KnowledgeState, type KnowledgeStatus } from '../../core/knowledge/index.js';
import { type ConfirmationRecord } from '../../core/schema/confirm.js';
import { entityIdSchema } from '../../core/schema/base.js';
import { knowledgeEntrySchema, knowledgeStateSchema, knowledgeStatusSchema } from '../../core/schema/knowledge.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

const confidenceSchema = z.enum(['low', 'medium', 'high']);

/** Exact I28 C3 operation: add known holders and advance exactly one revelation status. */
export const c3KnowledgeAdvanceOperationSchema = z.object({
  op: z.literal('advance'),
  targetId: entityIdSchema,
  addHolders: z.array(entityIdSchema).min(1),
  status: knowledgeStatusSchema,
  confidence: confidenceSchema,
}).strict();
export type C3KnowledgeAdvanceOperation = z.infer<typeof c3KnowledgeAdvanceOperationSchema>;

/** JSON-only C3 parser envelope; I28 accepts no creation, deletion, or arbitrary replacement operation. */
export const c3KnowledgeParserOutputSchema = z.object({
  ops: z.array(c3KnowledgeAdvanceOperationSchema),
}).strict();
export type C3KnowledgeParserOutput = z.infer<typeof c3KnowledgeParserOutputSchema>;

/** The parser sees accepted prose and only the C3 graph it may advance (design §5.10, §6.6). */
export const c3KnowledgeParserInputSchema = z.object({
  prose: z.string().trim().min(1),
  entries: knowledgeEntrySchema.array(),
  states: knowledgeStateSchema.array(),
}).strict();
export type C3KnowledgeParserInput = z.infer<typeof c3KnowledgeParserInputSchema>;

/** Parse a JSON-only C3 parser response and reject malformed or extra model output. */
export function parseC3KnowledgeParserOutput(text: unknown): C3KnowledgeParserOutput {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error('C3 knowledge parser output must be valid JSON', { cause });
  }
  return c3KnowledgeParserOutputSchema.parse(json);
}

/**
 * Invoke the Host-routed LLM for one C3-only recognition pass. It returns
 * validated forward operations but cannot write C3 (design §5.10, §6.6; plan I28).
 */
export async function parseC3KnowledgeFromNarrative(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<C3KnowledgeParserOutput> {
  const source = c3KnowledgeParserInputSchema.parse(input);
  assertKnowledgeStructure(source.entries, source.states);
  const candidate = await collectCandidate(backend, {
    prompt: buildC3KnowledgeParserPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseC3KnowledgeParserOutput(candidate.text);
  assertC3KnowledgeOperations({ entries: source.entries, states: source.states }, output.ops);
  return { ops: output.ops.map((operation) => structuredClone(operation)) };
}

/** Build the minimum C3-only JSON prompt; C1 relationship publicity is never a knowledge source. */
export function buildC3KnowledgeParserPrompt(input: C3KnowledgeParserInput): string {
  return [
    '你是小说知情解析器。比较已接受正文与给定当前知情图，只识别已经发生的知情前进。',
    '不得输出状态、关系、正史、世界观、大纲、风格或正文改写；不得创建、删除或替换事实；不得解释、不得使用 Markdown。关系的 knownTo 是关系公开性，绝不是角色知情来源。',
    '仅输出一个 JSON 对象，必须完全符合：',
    '{"ops":[{"op":"advance","targetId":"existing knowledge id","addHolders":["existing character id"],"status":"partially-revealed|revealed","confidence":"low|medium|high"}]}',
    '每个 advance 只能为既有事实新增当前不知情的角色，并将状态恰好前进一步：hidden→partially-revealed 或 partially-revealed→revealed。不得跳级、倒退、重复 holder 或修改 fact/kind/revealPlan。没有变更输出 {"ops":[]}。',
    `当前知情条目：${JSON.stringify(input.entries)}`,
    `当前知情状态：${JSON.stringify(input.states)}`,
    `已接受正文：${input.prose}`,
  ].join('\n');
}

/** Assert addressability, one-step status progression, and strictly additive holder changes. */
export function assertC3KnowledgeOperations(
  current: KnowledgeDocument,
  operations: readonly C3KnowledgeAdvanceOperation[],
): void {
  materializeC3KnowledgeOperations(current, operations);
}

/**
 * Deterministically materialize validated C3 operations. The repository remains
 * the only persistence owner and repeats the monotonicity check against disk.
 */
export function materializeC3KnowledgeOperations(
  current: KnowledgeDocument,
  operations: readonly C3KnowledgeAdvanceOperation[],
): KnowledgeDocument {
  const entries = structuredClone(current.entries) as KnowledgeEntry[];
  const states = structuredClone(current.states) as KnowledgeState[];
  assertKnowledgeStructure(entries, states);
  for (const operation of operations) {
    const entry = entries.find((item) => item.id === operation.targetId);
    if (!entry) throw new Error(`Unknown C3 knowledge target: ${operation.targetId}`);
    assertNextKnowledgeStatus(entry.status, operation.status, operation.targetId);
    if (new Set(operation.addHolders).size !== operation.addHolders.length) {
      throw new Error(`Duplicate C3 knowledge holder: ${operation.targetId}`);
    }
    for (const holder of operation.addHolders) {
      if (entry.holders.includes(holder)) throw new Error(`C3 knowledge holder already knows fact: ${operation.targetId}/${holder}`);
      if (!entry.revealPlan.revealTo.includes(holder)) throw new Error(`C3 knowledge holder is not a pending reveal target: ${operation.targetId}/${holder}`);
      const state = states.find((item) => item.characterId === holder);
      if (!state) throw new Error(`Missing C3 knowledge state for holder: ${holder}`);
      if (state.knows.includes(entry.id)) throw new Error(`C3 knowledge state already knows fact: ${holder}/${entry.id}`);
      entry.holders.push(holder);
      entry.revealPlan.revealTo = entry.revealPlan.revealTo.filter((target) => target !== holder);
      state.knows.push(entry.id);
    }
    entry.status = operation.status;
  }
  assertKnowledgeStructure(entries, states);
  return { entries, states };
}

/** Return whether a C3 batch must remain pending before any automatic write. */
export function requiresC3KnowledgeConfirmation(operations: readonly C3KnowledgeAdvanceOperation[]): boolean {
  return operations.some((operation) => operation.confidence === 'low');
}

/** Mechanically persist one validated medium/high C3 batch through the canonical repository boundary. */
export async function applyC3KnowledgeOperations(
  repository: KnowledgeRepository,
  current: KnowledgeDocument,
  output: C3KnowledgeParserOutput,
): Promise<KnowledgeDocument> {
  if (requiresC3KnowledgeConfirmation(output.ops)) {
    throw new Error('Low-confidence C3 operations require ConfirmationGate');
  }
  const next = materializeC3KnowledgeOperations(current, output.ops);
  return repository.saveAll(next.entries, next.states);
}

/** Propose, but never write, low-confidence C3 changes through the sole I11 Gate. */
export async function proposeLowConfidenceC3KnowledgeOperations(
  gate: ConfirmationGate,
  proposalId: string,
  current: KnowledgeDocument,
  output: C3KnowledgeParserOutput,
): Promise<ConfirmationRecord> {
  assertC3KnowledgeOperations(current, output.ops);
  if (!requiresC3KnowledgeConfirmation(output.ops)) {
    throw new Error('Only low-confidence C3 operations require ConfirmationGate');
  }
  return gate.propose({ id: proposalId, kind: 'c3-knowledge-parser-ops', payload: { ops: output.ops } });
}

function assertNextKnowledgeStatus(current: KnowledgeStatus, next: KnowledgeStatus, targetId: string): void {
  const allowed: Record<KnowledgeStatus, KnowledgeStatus | undefined> = {
    hidden: 'partially-revealed',
    'partially-revealed': 'revealed',
    revealed: undefined,
  };
  if (allowed[current] !== next) {
    throw new Error(`Invalid C3 knowledge status transition: ${targetId} ${current} -> ${next}`);
  }
}
