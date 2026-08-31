import { z } from 'zod';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import {
  referenceCorrectionParserInputSchema,
  referenceCorrectionParserOutputSchema,
  type ReferenceCorrectionOperation,
  type ReferenceCorrectionParserInput,
  type ReferenceCorrectionParserOutput,
} from '../../core/schema/reference-correction.js';
import { relationshipTypeSchema } from '../../core/schema/relationship.js';
import { entityIdSchema, confidenceSchema } from '../../core/schema/base.js';
import { knowledgeStatusSchema } from '../../core/schema/knowledge.js';
import { parseJsonObject } from '../parse/shared.js';
import type { GenerationSettings } from '../../core/schema/generation-settings.js';

export const REFERENCE_CORRECTION_PROMPT_EXAMPLE =
  '{"confidence":"medium","operations":[{"owner":"c1","entityId":"relationship-id","field":"status","action":"set","value":"紧张"}],"rationale":"只根据作者指令修正被标记的引用"}';

export const referenceCorrectionParserInputWireSchema = referenceCorrectionParserInputSchema;
export const referenceCorrectionParserOutputWireSchema = referenceCorrectionParserOutputSchema;

/** Parse one strict semantic candidate; no parser output is a write command. */
export function parseReferenceCorrectionOutput(text: unknown): ReferenceCorrectionParserOutput {
  return parseJsonObject(text, referenceCorrectionParserOutputSchema, 'Reference correction output');
}

/**
 * Fail closed on source-target drift and field policy violations. The Host
 * performs a second, live-document validation before it creates a Gate record.
 */
export function assertReferenceCorrectionOutput(
  input: ReferenceCorrectionParserInput,
  output: ReferenceCorrectionParserOutput,
): void {
  const targets = new Set(input.markedTargets.map((target) => `${target.owner}/${target.entityId}`));
  const seen = new Set<string>();
  for (const operation of output.operations) {
    const targetKey = `${operation.owner}/${operation.entityId}`;
    if (!targets.has(targetKey)) throw new Error(`Correction references an unmarked target: ${targetKey}`);
    const operationKey = `${targetKey}/${operation.field}`;
    if (seen.has(operationKey)) throw new Error(`Correction repeats an operation target: ${operationKey}`);
    seen.add(operationKey);
    assertOperationValue(operation);
    const marked = input.markedTargets.find((target) => target.owner === operation.owner && target.entityId === operation.entityId);
    if (marked === undefined) throw new Error(`Correction target disappeared: ${targetKey}`);
    if (!isMarkedField(marked.field, operation.owner)) throw new Error(`Correction target field is not an I116 audit field: ${marked.field}`);
  }
}

export async function classifyReferenceCorrection(
  backend: LlmBackend | undefined,
  rawInput: ReferenceCorrectionParserInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<ReferenceCorrectionParserOutput> {
  const input = referenceCorrectionParserInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildReferenceCorrectionPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseReferenceCorrectionOutput(candidate.text);
  assertReferenceCorrectionOutput(input, output);
  return { ...output, operations: output.operations.map((operation) => ({ ...operation })) };
}

export function buildReferenceCorrectionPrompt(input: ReferenceCorrectionParserInput): string {
  return [
    '你是长篇小说跨层引用修正候选分析器。作者已经标记了引用审计记录，并给出修正指令。',
    '只能输出一个 JSON 候选，不能输出自由对话、文件操作、SQL、补丁、确认结果或任何直接写命令。',
    'operation 只能针对 markedTargets 中的 owner/entityId；每个目标最多输出一次对应 field。',
    'C1 可选 field：type、affinity、trust、status、milestones、knownTo；数组新增使用 action:add，其他字段使用 action:set。',
    'C3 可选 field：holders、status；holders 只能用 action:add，status 只能用 action:set；不得删除知识、回退 status 或修改 fact/kind/revealAt。',
    'C4 只能用 field:canon.append、action:append，value 必须是没有 seq/immutable/supersedes 的新事件；不得删除、重排或 supersede 旧事件。',
    '不确定时应降低 confidence，但仍只输出能由指令与当前投影支持的结构化 operation。',
    '仅输出一个 JSON 对象，必须完全符合：',
    REFERENCE_CORRECTION_PROMPT_EXAMPLE,
    `作者修正指令：${input.instruction}`,
    `被标记的审计目标：${JSON.stringify(input.markedTargets)}`,
    `当前 C1 投影：${JSON.stringify(input.relationships)}`,
    `当前 C3 投影：${JSON.stringify(input.knowledge)}`,
    `当前 C4 投影：${JSON.stringify(input.canon)}`,
  ].join('\n');
}

function isMarkedField(field: string, owner: 'c1' | 'c3' | 'c4'): boolean {
  return (owner === 'c1' && field === 'relationship')
    || (owner === 'c3' && field === 'knowledge-entry')
    || (owner === 'c4' && field === 'canon-event');
}

function assertOperationValue(operation: ReferenceCorrectionOperation): void {
  if (operation.owner === 'c1') {
    if (operation.field === 'type') relationshipTypeSchema.parse(operation.value);
    if (operation.field === 'affinity') z.number().int().min(-100).max(100).parse(operation.value);
    if (operation.field === 'trust') z.number().int().min(0).max(100).parse(operation.value);
    if (operation.field === 'status') z.string().trim().min(1).max(200).parse(operation.value);
    if (operation.field === 'milestones' || operation.field === 'knownTo') {
      if (operation.action !== 'add') throw new Error(`C1 ${operation.field} must use add`);
      entityIdSchema.parse(operation.value);
    }
    return;
  }
  if (operation.owner === 'c3') {
    if (operation.field === 'holders') {
      if (operation.action !== 'add') throw new Error('C3 holders must use add');
      entityIdSchema.parse(operation.value);
    } else {
      if (operation.action !== 'set') throw new Error('C3 status must use set');
      knowledgeStatusSchema.parse(operation.value);
    }
    return;
  }
  if (operation.owner === 'c4' && operation.value.id !== operation.entityId) {
    throw new Error(`C4 append id must match its target: ${operation.entityId}`);
  }
}

export { confidenceSchema };
