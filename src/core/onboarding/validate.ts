import { z } from 'zod';
import {
  ONBOARDING_LAYER_KEYS,
  onboardingAnalysisOutputSchema,
  type OnboardingAnalysisOutput,
  type OnboardingLayerKey,
  type OnboardingLayers,
} from '../schema/onboarding.js';

/**
 * I52 six-layer initialization analyzer —— **输入/输出校验段**（design §14.8 /
 * R11-3；架构审查 §4.1 拆分：validate.ts 持输入归一化守卫 + 严格 envelope 解码 +
 * 跨层不变式；prompt 构建在 prompt.ts，few-shot 字面量在 example.ts）。
 *
 * 语义：每个 LLM 邻近的失败模式在任何字节写入前 fail-closed ——
 * 1. `assertFreeText` 输入归一化/结构守卫（超限文本绝不进入模型）；
 * 2. `parseOnboardingOutput` 严格 JSON-only envelope 解码；
 * 3. `assertOnboardingOutput` 跨层不变式（evidence 可达、id 唯一、B3 空前向引用、
 *    无 C3/items/factions/globalFlags、C4 仅文本显式事件）。
 */

export const FREE_TEXT_MAX_BYTES = 2 * 1024 * 1024;

/** Hard-coded input size budget; the LLM is never entered for oversized text. */
export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** Structurally validate free text before any model call. */
export function assertFreeText(text: string): string {
  const normalized = text.normalize('NFC').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) throw new Error('Free text is empty');
  if (normalized.includes('\u0000')) throw new Error('Free text contains NUL');
  if (byteLength(normalized) > FREE_TEXT_MAX_BYTES) throw new Error('Free text exceeds 2 MiB limit');
  return normalized.trim();
}

/** One validation issue extracted from a Zod failure, for the concise error. */
interface ContractIssue {
  path?: Array<string | number>;
  message?: string;
}

/**
 * Map a strict-schema validation failure into a concise, actionable error while
 * preserving the original ZodError as `cause` for server-side diagnostics.
 *
 * Rationale (design §14.7.3): illegal model output must fail closed with zero
 * writes, but the raw multi-hundred-line issue dump is not a user-facing
 * message. We surface the first few offending paths plus the recovery verb, and
 * keep the full issues on `error.cause`.
 */
export function formatContractViolation(context: string, guidance: string, cause: unknown): Error {
  const issues = ((cause as { issues?: ContractIssue[] } | null)?.issues ?? []).filter((issue) => issue.message !== undefined);
  const sample = issues.slice(0, 3).map((issue) => `${(issue.path ?? []).join('.') || '(root)'}: ${issue.message}`).join('；');
  const detail = sample ? `（前 ${Math.min(issues.length, 3)} 项：${sample}）` : '';
  return new Error(`${context}不符合六层候选契约${detail}。${guidance}`, { cause });
}

/** Parse a model response into the strict I52 envelope (JSON only, no markdown). */
export function parseOnboardingOutput(text: unknown): OnboardingAnalysisOutput {
  let raw: string;
  try {
    raw = z.string().trim().min(1).parse(text);
  } catch (cause) {
    // Empty/whitespace completions (e.g. reasoning-only API responses) surface
    // as the same readable, retryable failure as malformed JSON.
    throw new Error('Onboarding output must be valid JSON', { cause });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Onboarding output must be valid JSON', { cause });
  }
  try {
    return onboardingAnalysisOutputSchema.parse(json);
  } catch (cause) {
    throw formatContractViolation(
      '六层分析结果',
      '模型输出已被拒绝且未写入任何层；请重试分析，或在审阅页对不合格层执行整层重生成。',
      cause,
    );
  }
}

function assertUniqueIds(layers: OnboardingLayers): void {
  const seen = new Map<OnboardingLayerKey, Set<string>>();
  for (const layer of ONBOARDING_LAYER_KEYS) {
    const ids = new Set<string>();
    for (const candidate of layers[layer].candidates) {
      if (ids.has(candidate.id)) throw new Error(`Duplicate ${layer} candidate id: ${candidate.id}`);
      ids.add(candidate.id);
    }
    seen.set(layer, ids);
  }
  for (const layer of ONBOARDING_LAYER_KEYS) {
    const self = seen.get(layer)!;
    const witnesses = new Set<string>();
    for (const other of ONBOARDING_LAYER_KEYS) {
      if (other === layer) continue;
      for (const id of seen.get(other)!) {
        if (self.has(id) && !witnesses.has(id)) witnesses.add(id);
      }
    }
    if (witnesses.size > 0) throw new Error(`Candidate id collides across layers: ${[...witnesses].join(', ')}`);
  }
}

function assertNoForbiddenFields(layers: OnboardingLayers): void {
  for (const character of layers.characters.candidates) {
    if (character.relationships.length !== 0) throw new Error(`B3 character ${character.id} must not infer relationships`);
    if (character.knowledgeIds.length !== 0) throw new Error(`B3 character ${character.id} must not infer knowledgeIds`);
    if (character.arc.keyBeats.length !== 0) throw new Error(`B3 character ${character.id} arc.keyBeats must be empty`);
  }
  const serialized = JSON.stringify(layers);
  if (/"(items|factions|globalFlags|knowledge)"/.test(serialized)) {
    throw new Error('Forbidden C3/items/factions/globalFlags fields present');
  }
}

function assertEvidenceReachable(output: OnboardingAnalysisOutput): void {
  const evidenceIds = new Set(Object.keys(output.evidence));
  for (const layer of ONBOARDING_LAYER_KEYS) {
    for (const id of output.layers[layer].evidenceIds) {
      if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id in ${layer}: ${id}`);
    }
  }
}

/**
 * Validate the model envelope against every cross-layer invariant. Throws on the
 * first violation; the caller must fail closed (no candidate is ever persisted).
 */
export function assertOnboardingOutput(output: OnboardingAnalysisOutput): void {
  assertEvidenceReachable(output);
  assertUniqueIds(output.layers);
  assertNoForbiddenFields(output.layers);
}
