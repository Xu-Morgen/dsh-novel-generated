import { z } from 'zod';
import { RelationshipRepository, assertRelationshipStructure, type Relationship } from '../../core/relationship/index.js';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { type ConfirmationRecord } from '../../core/schema/confirm.js';
import { relationshipSchema, relationshipTypeSchema } from '../../core/schema/relationship.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

const confidenceSchema = z.enum(['low', 'medium', 'high']);
const relationshipInputSchema = relationshipSchema.omit({ version: true });
const relationshipFieldSchema = z.enum(['type', 'affinity', 'trust', 'status', 'milestones', 'knownTo']);

/** C1 creation content supplied by the parser; repository-owned version remains implicit. */
export const c1RelationshipCreateSchema = relationshipInputSchema;
export type C1RelationshipCreate = z.infer<typeof c1RelationshipCreateSchema>;

/** Exact I27 C1 operation envelope. Identity and endpoints never change after creation. */
export const c1RelationshipOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create'),
    relationship: c1RelationshipCreateSchema,
    confidence: confidenceSchema,
  }).strict(),
  z.object({
    op: z.literal('modify'),
    targetId: z.string().min(1),
    field: relationshipFieldSchema,
    action: z.literal('set'),
    value: z.json(),
    confidence: confidenceSchema,
  }).strict(),
]);
export type C1RelationshipOperation = z.infer<typeof c1RelationshipOperationSchema>;

/** JSON-only response permitted from the C1 narrative parser (design §6.5, §6.6). */
export const c1RelationshipParserOutputSchema = z.object({
  ops: z.array(c1RelationshipOperationSchema),
}).strict();
export type C1RelationshipParserOutput = z.infer<typeof c1RelationshipParserOutputSchema>;

/** The parser sees only accepted prose and the current C1 relationship projection. */
export const c1RelationshipParserInputSchema = z.object({
  prose: z.string().trim().min(1),
  current: relationshipSchema.array(),
}).strict();
export type C1RelationshipParserInput = z.infer<typeof c1RelationshipParserInputSchema>;

/** Parse a JSON-only C1 parser response and reject malformed or extra model output. */
export function parseC1RelationshipParserOutput(text: unknown): C1RelationshipParserOutput {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error('C1 relationship parser output must be valid JSON', { cause });
  }
  return c1RelationshipParserOutputSchema.parse(json);
}

/**
 * Invoke the Host-routed LLM for one C1-only recognition pass. It identifies
 * proposals but cannot write C1 (design §6.5, §6.6; plan I27).
 */
export async function parseC1RelationshipsFromNarrative(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<C1RelationshipParserOutput> {
  const source = c1RelationshipParserInputSchema.parse(input);
  const candidate = await collectCandidate(backend, {
    prompt: buildC1RelationshipParserPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseC1RelationshipParserOutput(candidate.text);
  assertC1RelationshipOperations(source.current, output.ops);
  return { ops: output.ops.map((operation) => structuredClone(operation)) };
}

/** Build the minimum C1-only JSON prompt; C1 knownTo remains relationship publicity, never C3 knowledge. */
export function buildC1RelationshipParserPrompt(input: C1RelationshipParserInput): string {
  return [
    '你是小说关系解析器。比较已接受正文与给定当前关系，只识别需要新增或变更的关系。',
    '不得输出状态、知情、正史、世界观、大纲、风格或正文改写；不得解释、不得使用 Markdown。knownTo 只表示关系公开性，不表示角色知情。',
    '仅输出一个 JSON 对象，必须完全符合：',
    '{"ops":[{"op":"create","relationship":{"id":"string","from":"id","to":"id","type":"kin|romantic|friendship|rivalry|enmity|allegiance|mentor|subordinate","affinity":"-100..100 integer","trust":"0..100 integer","status":"string","milestones":["正史事件 id"],"knownTo":["id"]},"confidence":"low|medium|high"}|{"op":"modify","targetId":"existing relationship id","field":"type|affinity|trust|status|milestones|knownTo","action":"set","value":"field value","confidence":"low|medium|high"}]}',
    'create 必须提供完整新关系；modify 只能修改现有关系的 type、affinity、trust、status、milestones 或 knownTo，不能修改 id、from 或 to。没有变更输出 {"ops":[]}。',
    `当前关系：${JSON.stringify(input.current)}`,
    `已接受正文：${input.prose}`,
  ].join('\n');
}

/** Assert that operations are addressable and preserve all C1 store invariants without natural-language interpretation. */
export function assertC1RelationshipOperations(
  relationships: readonly Relationship[],
  operations: readonly C1RelationshipOperation[],
): void {
  materializeC1RelationshipOperations(relationships, operations);
}

/**
 * Deterministically materialize a validated C1 operation batch. This is the
 * sole default automatic C1 writer path; RelationshipRepository still validates
 * and atomically persists the resulting C1 document (plan I27; requirements R5-3).
 */
export function materializeC1RelationshipOperations(
  relationships: readonly Relationship[],
  operations: readonly C1RelationshipOperation[],
): Relationship[] {
  const next = structuredClone(relationships) as Relationship[];
  const ids = new Set(next.map((relationship) => relationship.id));
  for (const operation of operations) {
    if (operation.op === 'create') {
      if (ids.has(operation.relationship.id)) throw new Error(`Duplicate C1 relationship id: ${operation.relationship.id}`);
      const relationship = relationshipSchema.parse({ ...operation.relationship, version: 1 });
      next.push(relationship);
      ids.add(relationship.id);
      continue;
    }
    const index = next.findIndex((relationship) => relationship.id === operation.targetId);
    if (index < 0) throw new Error(`Unknown C1 relationship target: ${operation.targetId}`);
    const current = next[index];
    const candidate = relationshipSchema.parse({ ...current, [operation.field]: operation.value });
    next[index] = candidate;
  }
  assertRelationshipStructure(next);
  return next;
}

/** Return whether a C1 batch must remain pending before any automatic write. */
export function requiresC1RelationshipConfirmation(operations: readonly C1RelationshipOperation[]): boolean {
  return operations.some((operation) => operation.confidence === 'low');
}

/** Mechanically persist one validated medium/high C1 batch through the canonical repository boundary. */
export async function applyC1RelationshipOperations(
  repository: RelationshipRepository,
  relationships: readonly Relationship[],
  output: C1RelationshipParserOutput,
): Promise<Relationship[]> {
  if (requiresC1RelationshipConfirmation(output.ops)) {
    throw new Error('Low-confidence C1 operations require ConfirmationGate');
  }
  const next = materializeC1RelationshipOperations(relationships, output.ops);
  return repository.saveAll(next);
}

/** Propose, but never write, low-confidence C1 changes through the sole I11 Gate. */
export async function proposeLowConfidenceC1RelationshipOperations(
  gate: ConfirmationGate,
  proposalId: string,
  relationships: readonly Relationship[],
  output: C1RelationshipParserOutput,
): Promise<ConfirmationRecord> {
  assertC1RelationshipOperations(relationships, output.ops);
  if (!requiresC1RelationshipConfirmation(output.ops)) {
    throw new Error('Only low-confidence C1 operations require ConfirmationGate');
  }
  return gate.propose({ id: proposalId, kind: 'c1-relationship-parser-ops', payload: { ops: output.ops } });
}

export { relationshipTypeSchema };
