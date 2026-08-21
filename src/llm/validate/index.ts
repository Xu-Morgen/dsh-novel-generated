import { z } from 'zod';
import {
  adjudicateViolations,
  type ConsistencyAdjudication,
  type ConsistencyViolationView,
} from '../../core/validate/index.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

const detectorRuleSchema = z.object({
  id: z.string().trim().min(1),
  statement: z.string().trim().min(1),
  immutable: z.boolean(),
  active: z.boolean(),
}).strict();

const detectorCanonEventSchema = z.object({
  id: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  detail: z.string(),
}).strict();

/** The smallest B1/C4 projection the I21 detector is allowed to inspect. */
export const ruleCanonDetectionInputSchema = z.object({
  prose: z.string().trim().min(1),
  rules: z.array(detectorRuleSchema),
  canon: z.array(detectorCanonEventSchema),
}).strict();
export type RuleCanonDetectionInput = z.infer<typeof ruleCanonDetectionInputSchema>;

const hardViolationSchema = z.object({
  kind: z.enum(['immutable-rule', 'canon-conflict']),
  severity: z.literal('hard'),
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)).min(1),
}).strict();

/** Exact model envelope: prose analysis cannot introduce soft or unknown findings. */
export const ruleCanonDetectorOutputSchema = z.object({
  violations: z.array(hardViolationSchema),
}).strict();
export type RuleCanonDetectorOutput = z.infer<typeof ruleCanonDetectorOutputSchema>;

/**
 * Result of one I21 semantic hard-constraint pass (design §9.1 / R4-2).
 * The detector owns only rule/canon finding; I20 remains the sole authority
 * mapping validated findings to pass/warn/reject.
 */
export interface RuleCanonDetectionResult {
  readonly violations: readonly ConsistencyViolationView[];
  readonly adjudication: ConsistencyAdjudication;
}

/**
 * Parse a model's JSON-only response at the fail-closed boundary.
 * Malformed JSON, unknown fields, soft severities, and unsupported kinds throw
 * rather than being converted to a passing result (plan I21).
 */
export function parseRuleCanonDetectorOutput(text: unknown): RuleCanonDetectorOutput {
  const response = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(response);
  } catch (cause) {
    throw new Error('Rule/canon detector output must be valid JSON', { cause });
  }
  return ruleCanonDetectorOutputSchema.parse(json);
}

/**
 * Invoke the injected Host LLM to identify B1 immutable-rule and C4 canon
 * contradictions in prose. Only active immutable rules are disclosed to the
 * model; invalid model output remains a blocking failure, never a pass.
 */
export async function detectRuleAndCanonHardConstraints(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<RuleCanonDetectionResult> {
  const source = ruleCanonDetectionInputSchema.parse(input);
  const prompt = buildRuleCanonDetectorPrompt(source);
  const candidate = await collectCandidate(backend, { prompt, settings: resolveGenerationSettings(settings), signal });
  const output = parseRuleCanonDetectorOutput(candidate.text);
  assertDetectorReferences(output, source);
  const violations = Object.freeze(output.violations.map((violation) => Object.freeze({
    ...violation,
    references: Object.freeze([...violation.references]),
  })));
  return Object.freeze({ violations, adjudication: adjudicateViolations(violations) });
}

/**
 * Fail closed when the model cites facts outside the detector's disclosed view.
 * This prevents an invented hard finding from acquiring I20 reject authority.
 */
function assertDetectorReferences(output: RuleCanonDetectorOutput, source: RuleCanonDetectionInput): void {
  const allowedRules = new Set(source.rules.filter((rule) => rule.active && rule.immutable).map((rule) => rule.id));
  const allowedCanon = new Set(source.canon.map((event) => event.id));
  for (const violation of output.violations) {
    const allowed = violation.kind === 'immutable-rule' ? allowedRules : allowedCanon;
    if (violation.references.some((reference) => !allowed.has(reference))) {
      throw new Error(`Rule/canon detector cited an undisclosed ${violation.kind} reference`);
    }
  }
}

/** Build the JSON-only prompt from the minimum permitted B1/C4 detector view. */
export function buildRuleCanonDetectorPrompt(input: RuleCanonDetectionInput): string {
  const activeImmutableRules = input.rules
    .filter((rule) => rule.active && rule.immutable)
    .map(({ id, statement }) => ({ id, statement }));
  const canon = input.canon.map(({ id, summary, detail }) => ({ id, summary, detail }));
  return [
    '你是小说一致性硬约束检测器。只检查给定正文是否直接违反不可变规则，或直接与已落库正史矛盾。',
    '不得检查知情泄漏、关系、风格、大纲或任何软约束。',
    '仅输出一个 JSON 对象，不要 Markdown 或解释。对象必须完全符合：',
    '{"violations":[{"kind":"immutable-rule"|"canon-conflict","severity":"hard","message":"非空说明","references":["规则或正史 id"]}]}',
    '没有硬违规时输出 {"violations":[]}。',
    `不可变规则：${JSON.stringify(activeImmutableRules)}`,
    `正史：${JSON.stringify(canon)}`,
    `正文：${input.prose}`,
  ].join('\n');
}
