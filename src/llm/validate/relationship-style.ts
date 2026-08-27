import { z } from 'zod';
import { relationshipSchema } from '../../core/schema/relationship.js';
import { styleProfileSchema } from '../../core/schema/style.js';
import {
  adjudicateViolations,
  type ConsistencyAdjudication,
  type ConsistencyViolationView,
} from '../../core/validate/index.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import { parseJsonObject } from '../parse/shared.js';
import { violationSchema } from './shared.js';

/** The minimum C1/B4 source view available to I24 semantic soft detection. */
export const relationshipStyleDetectionInputSchema = z.object({
  prose: z.string().trim().min(1),
  relationships: z.array(relationshipSchema),
  style: styleProfileSchema,
}).strict();
export type RelationshipStyleDetectionInput = z.infer<typeof relationshipStyleDetectionInputSchema>;

const relationshipStyleViolationSchema = violationSchema(z.enum(['relationship-drift', 'style-deviation']), 'soft');

/** Exact I24 model envelope; hard and unrelated findings fail closed. */
export const relationshipStyleDetectorOutputSchema = z.object({
  violations: z.array(relationshipStyleViolationSchema),
}).strict();
export type RelationshipStyleDetectorOutput = z.infer<typeof relationshipStyleDetectorOutputSchema>;

/** Result of one C1/B4 semantic soft-constraint pass (design §9.1 / R4-5). */
export interface RelationshipStyleDetectionResult {
  readonly violations: readonly ConsistencyViolationView[];
  readonly adjudication: ConsistencyAdjudication;
}

/** Parse JSON-only model output at the I24 fail-closed boundary. */
export function parseRelationshipStyleDetectorOutput(text: unknown): RelationshipStyleDetectorOutput {
  return parseJsonObject(text, relationshipStyleDetectorOutputSchema, 'Relationship/style detector output');
}

/**
 * Ask the injected Host LLM to identify semantic C1 relationship drift and B4
 * style deviation. The only valid output severity is soft: I20 therefore owns
 * the sole warning decision and this detector can never create a rejection
 * (design §9 / plan I24).
 */
export async function detectRelationshipAndStyleSoftConstraints(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<RelationshipStyleDetectionResult> {
  const source = relationshipStyleDetectionInputSchema.parse(input);
  const prompt = buildRelationshipStyleDetectorPrompt(source);
  const candidate = await collectCandidate(backend, { prompt, settings: resolveGenerationSettings(settings), signal });
  const output = parseRelationshipStyleDetectorOutput(candidate.text);
  assertRelationshipStyleReferences(output, source);
  const violations = Object.freeze(output.violations.map((violation) => Object.freeze({
    ...violation,
    references: Object.freeze([...violation.references]),
  })));
  return Object.freeze({ violations, adjudication: adjudicateViolations(violations) });
}

/** Build the minimum C1/B4-only prompt view for I24 semantic soft checks. */
export function buildRelationshipStyleDetectorPrompt(input: RelationshipStyleDetectionInput): string {
  const relationships = input.relationships.map(({ id, from, to, type, affinity, trust, status, milestones }) => ({
    id, from, to, type, affinity, trust, status, milestones,
  }));
  const style = {
    id: input.style.id,
    name: input.style.name,
    person: input.style.person,
    tense: input.style.tense,
    povScope: input.style.povScope,
    tone: input.style.tone,
    proseStyle: input.style.proseStyle,
    chapterFormat: input.style.chapterFormat,
    dialogueConventions: input.style.dialogueConventions,
    forbidden: input.style.forbidden,
  };
  return [
    '你是小说一致性软约束检测器。只检查正文是否与给定关系状态发生显著关系漂移，或偏离叙事风格档案。',
    '不得检查规则、正史、POV 知情、大纲、实体引用或任何硬约束；不得输出 hard。',
    '仅输出一个 JSON 对象，不要 Markdown 或解释。对象必须完全符合：',
    '{"violations":[{"kind":"relationship-drift"|"style-deviation","severity":"soft","message":"非空说明","references":["关系记录 id 或风格档案 id"]}]}',
    '没有软偏离时输出 {"violations":[]}。relationship-drift 只能引用给定关系 id；style-deviation 只能引用给定风格 id。',
    `关系状态：${JSON.stringify(relationships)}`,
    `风格档案：${JSON.stringify(style)}`,
    `正文：${input.prose}`,
  ].join('\n');
}

/** Reject any model citation outside the C1/B4 view supplied to this detector. */
function assertRelationshipStyleReferences(
  output: RelationshipStyleDetectorOutput,
  source: RelationshipStyleDetectionInput,
): void {
  const relationshipIds = new Set(source.relationships.map((relationship) => relationship.id));
  for (const violation of output.violations) {
    const allowed = violation.kind === 'relationship-drift'
      ? relationshipIds
      : new Set([source.style.id]);
    if (violation.references.some((reference) => !allowed.has(reference))) {
      throw new Error(`Relationship/style detector cited an undisclosed ${violation.kind} reference`);
    }
  }
}
