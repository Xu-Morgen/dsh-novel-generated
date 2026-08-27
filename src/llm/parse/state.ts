import { z } from 'zod';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { type ConfirmationRecord } from '../../core/schema/confirm.js';
import { StateEngine, type StateDraft } from '../../core/state/index.js';
import { worldStateSchema, type WorldState } from '../../core/schema/state.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import { confidenceSchema, parseJsonObject } from './shared.js';

const stateFieldSchema = z.enum([
  'storyTime', 'location', 'timeOfDay', 'weather', 'season', 'atmosphere',
  'alive', 'health', 'mood', 'inventory', 'condition', 'currentGoal', 'flags',
]);
const stateActionSchema = z.enum(['set', 'add', 'remove', 'delete']);

/** Exact I25 operation envelope. Context-sensitive target/field rules are checked before use. */
export const c2StateOperationSchema = z.object({
  op: z.literal('modify'),
  target: z.string().trim().min(1),
  field: stateFieldSchema,
  action: stateActionSchema,
  value: z.json(),
  confidence: confidenceSchema,
}).strict();
export type C2StateOperation = z.infer<typeof c2StateOperationSchema>;

/** JSON-only response permitted from the C2 narrative parser (design §6.6). */
export const c2StateParserOutputSchema = z.object({
  ops: z.array(c2StateOperationSchema),
}).strict();
export type C2StateParserOutput = z.infer<typeof c2StateParserOutputSchema>;

/** The parser sees only accepted prose and the current C2 snapshot. */
export const c2StateParserInputSchema = z.object({
  prose: z.string().trim().min(1),
  state: worldStateSchema,
}).strict();
export type C2StateParserInput = z.infer<typeof c2StateParserInputSchema>;

const rootStateFields = new Set(['storyTime']);
const sceneFields = new Set(['location', 'timeOfDay', 'weather', 'season', 'atmosphere']);
const characterScalarFields = new Set(['location', 'alive', 'health', 'mood', 'condition', 'currentGoal']);

/** Parse a JSON-only C2 parser response and reject malformed or extra model output. */
export function parseC2StateParserOutput(text: unknown): C2StateParserOutput {
  return parseJsonObject(text, c2StateParserOutputSchema, 'C2 state parser output');
}

/**
 * Invoke the Host-routed LLM for a single C2-only recognition pass. It returns
 * validated operations but never mutates state (design §6.6; plan I25).
 */
export async function parseC2StateFromNarrative(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<C2StateParserOutput> {
  const source = c2StateParserInputSchema.parse(input);
  const candidate = await collectCandidate(backend, {
    prompt: buildC2StateParserPrompt(source),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseC2StateParserOutput(candidate.text);
  assertC2StateOperations(source.state, output.ops);
  return { ops: output.ops.map((operation) => ({ ...operation })) };
}

/** Build the minimum C2-only JSON prompt; no other layer is disclosed. */
export function buildC2StateParserPrompt(input: C2StateParserInput): string {
  return [
    '你是小说世界状态解析器。比较已接受正文与给定当前世界状态，只识别需要写入状态的变化。',
    '不得输出关系、知情、正史、世界观、大纲、风格或正文改写；不得解释、不得使用 Markdown。',
    '仅输出一个 JSON 对象，必须完全符合：',
    '{"ops":[{"op":"modify","target":"state|scene|现有 characterId","field":"允许的状态字段","action":"set|add|remove|delete","value":"JSON 值","confidence":"low|medium|high"}]}',
    'state 仅可 set storyTime；scene 仅可 set location/timeOfDay/weather/season/atmosphere；角色标量仅可 set location/alive/health/mood/condition/currentGoal；inventory 仅可 add/remove 字符串；flags 仅可 set {key,value} 或 delete {key}。没有变更输出 {"ops":[]}。',
    `当前世界状态：${JSON.stringify(input.state)}`,
    `已接受正文：${input.prose}`,
  ].join('\n');
}

/**
 * Assert that an operation is addressable and meaningful for this exact C2
 * snapshot. This is validation, not natural-language interpretation.
 */
export function assertC2StateOperations(state: WorldState, operations: readonly C2StateOperation[]): void {
  const characterIds = new Set(state.characters.map((character) => character.characterId));
  for (const operation of operations) {
    if (operation.target === 'state') {
      if (!rootStateFields.has(operation.field) || operation.action !== 'set' || typeof operation.value !== 'string') {
        throw new Error('Invalid C2 root-state operation');
      }
      continue;
    }
    if (operation.target === 'scene') {
      if (!sceneFields.has(operation.field) || operation.action !== 'set' || typeof operation.value !== 'string') {
        throw new Error('Invalid C2 scene operation');
      }
      continue;
    }
    if (!characterIds.has(operation.target)) throw new Error(`Unknown C2 operation target: ${operation.target}`);
    if (characterScalarFields.has(operation.field)) {
      if (operation.action !== 'set') throw new Error(`Invalid C2 action for ${operation.field}`);
      if (operation.field === 'alive') {
        if (typeof operation.value !== 'boolean') throw new Error('C2 alive value must be boolean');
      } else if (typeof operation.value !== 'string') {
        throw new Error(`C2 ${operation.field} value must be string`);
      }
      continue;
    }
    if (operation.field === 'inventory') {
      if ((operation.action !== 'add' && operation.action !== 'remove') || typeof operation.value !== 'string') {
        throw new Error('Invalid C2 inventory operation');
      }
      continue;
    }
    if (operation.field === 'flags') {
      if (!operation.value || typeof operation.value !== 'object' || Array.isArray(operation.value) || typeof operation.value.key !== 'string') {
        throw new Error('C2 flags value must contain a key');
      }
      if (operation.action === 'set' && !Object.hasOwn(operation.value, 'value')) throw new Error('C2 flag set requires a value');
      if (operation.action !== 'set' && operation.action !== 'delete') throw new Error('Invalid C2 flags action');
      continue;
    }
    throw new Error(`Invalid C2 field: ${operation.field}`);
  }
}

/** Apply validated non-low-confidence C2 operations in one StateEngine transaction. */
export async function applyC2StateOperations(
  engine: StateEngine,
  output: C2StateParserOutput,
): Promise<WorldState> {
  if (output.ops.some((operation) => operation.confidence === 'low')) {
    throw new Error('Low-confidence C2 operations require ConfirmationGate');
  }
  assertC2StateOperations(engine.current(), output.ops);
  return engine.transaction((draft) => applyC2StateOperationsToDraft(draft, output.ops));
}

/** Propose, but never write, low-confidence C2 changes through the sole I11 Gate. */
export async function proposeLowConfidenceC2StateOperations(
  gate: ConfirmationGate,
  proposalId: string,
  state: WorldState,
  output: C2StateParserOutput,
): Promise<ConfirmationRecord> {
  assertC2StateOperations(state, output.ops);
  if (!output.ops.some((operation) => operation.confidence === 'low')) {
    throw new Error('Only low-confidence C2 operations require ConfirmationGate');
  }
  return gate.propose({ id: proposalId, kind: 'c2-state-parser-ops', payload: { ops: output.ops } });
}

/**
 * Deterministically map already validated operations to a StateEngine draft.
 * Exported so Host-side orchestrators can apply ops through the StateEngine
 * `transaction` seam without re-implementing the field mapping (I25 owner).
 */
export function applyC2StateOperationsToDraft(draft: StateDraft, operations: readonly C2StateOperation[]): void {
  for (const operation of operations) {
    if (operation.target === 'state') {
      draft.storyTime = operation.value as string;
      continue;
    }
    if (operation.target === 'scene') {
      draft.scene[operation.field as keyof typeof draft.scene] = operation.value as never;
      continue;
    }
    const character = draft.characters.find((item) => item.characterId === operation.target);
    if (!character) throw new Error(`Unknown C2 operation target: ${operation.target}`);
    if (characterScalarFields.has(operation.field)) {
      character[operation.field as keyof typeof character] = operation.value as never;
    } else if (operation.field === 'inventory') {
      if (operation.action === 'add') character.inventory.push(operation.value as string);
      else character.inventory = character.inventory.filter((item) => item !== operation.value);
    } else {
      const value = operation.value as { key: string; value?: unknown };
      if (operation.action === 'set') character.flags[value.key] = value.value;
      else delete character.flags[value.key];
    }
  }
}
