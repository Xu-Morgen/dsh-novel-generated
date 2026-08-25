import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  ONBOARDING_LAYER_KEYS,
  onboardingAnalysisOutputSchema,
  onboardingAnalysisResultSchema,
  type OnboardingAnalysisInput,
  type OnboardingAnalysisOutput,
  type OnboardingAnalysisResult,
  type OnboardingLayerKey,
  type OnboardingLayers,
  type OnboardingSession,
} from '../schema/onboarding.js';

/**
 * I52 six-layer initialization analyzer core (design §14.8 / R11-3).
 *
 * The analyzer is split into four mechanical, deterministic stages so that
 * every LLM-adjacent failure mode is fail-closed before any bytes are written:
 *
 * 1. `assertInput`         — input normalization/structure guards.
 * 2. `parseOutput`         — strict JSON-only envelope decode.
 * 3. `assertOutput`        — cross-layer invariants (evidence reachability,
 *                            id uniqueness, B3 empty forward refs, no C3/items/
 *                            factions/globalFlags, C4 text-explicit only).
 * 4. `reduceLayers`        — bind the binding triple and drop non-canonical
 *                            layer fields, producing the final result.
 *
 * This module owns no LLM transport and no persistence; the Host service wraps
 * it with the `ctx.llm` backend and the Cordis Fiber abort scope.
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

/** Parse a model response into the strict I52 envelope (JSON only, no markdown). */
export function parseOnboardingOutput(text: unknown): OnboardingAnalysisOutput {
  const raw = z.string().trim().min(1).parse(text);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Onboarding output must be valid JSON', { cause });
  }
  return onboardingAnalysisOutputSchema.parse(json);
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

const LAYER_KEY_TO_NAME: Record<OnboardingLayerKey, string> = {
  characters: 'B3',
  worldview: 'B2',
  outline: 'B5',
  relationship: 'C1',
  state: 'C2',
  canon: 'C4',
};

/**
 * Reduce the parsed envelope into a Host-bound result: attach the binding triple
 * and return only the six layer projections plus the shared evidence map.
 */
export function reduceOnboardingResult(
  session: OnboardingSession,
  output: OnboardingAnalysisOutput,
): OnboardingAnalysisResult {
  const result = {
    projectId: session.projectId,
    onboardingSessionId: session.onboardingSessionId,
    sourceHash: session.sourceHash,
    evidence: output.evidence,
    layers: output.layers,
  };
  return onboardingAnalysisResultSchema.parse(result);
}

/** Deterministic candidate fingerprint for one layer (cross-layer isolation). */
export function layerHash(layers: OnboardingLayers, key: OnboardingLayerKey): string {
  const canonical = JSON.stringify({
    label: LAYER_KEY_TO_NAME[key],
    layer: layers[key],
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** All six layer hashes, keyed by layer, for regenerate isolation assertions. */
export function layerHashes(layers: OnboardingLayers): Record<OnboardingLayerKey, string> {
  const result = {} as Record<OnboardingLayerKey, string>;
  for (const key of ONBOARDING_LAYER_KEYS) result[key] = layerHash(layers, key);
  return result;
}

/** Build the deterministic I52 prompt for a full six-layer analysis. */
export function buildOnboardingPrompt(input: OnboardingAnalysisInput): string {
  return [
    '你是小说六层初始化分析器。根据输入文本生成严格候选包，只输出一个 JSON 对象，不得解释，不得写文件，不得使用 Markdown。',
    '必须输出 evidence（共享证据 map，键为证据 id，值为 sourceChunkIndex 与 quote）与 layers（六层）。',
    '六层为：characters(B3)、worldview(B2)、outline(B5)、relationship(C1)、state(C2)、canon(C4)。每层结构为 {candidates, confidence, warnings, evidenceIds}。',
    '每条候选必须复用既有 Domain Schema，并携带 id；evidenceIds 引用 evidence map；confidence 取 low|medium|high。',
    '强制约束：B3 的 relationships/knowledgeIds/arc.keyBeats 必须为空数组；C2 只表达输入终点/故事起点，仅含 scene 与 characters 子集；C4 只包含文本明确事件且可为空数组。',
    '严格禁止：C3 知情层、items、factions、globalFlags、以及任何 C3/知识泄漏推断。',
    '输出格式：{"evidence":{"e1":{"sourceChunkIndex":0,"quote":"原文证据"}},"layers":{"characters":{"candidates":[],"confidence":"high","warnings":[],"evidenceIds":[]},...}}',
    `输入文本块：${JSON.stringify(input.chunks)}`,
    `绑定（仅供你输出合法性参考，不得改写）：projectId=${input.projectId} onboardingSessionId=${input.onboardingSessionId} sourceHash=${input.sourceHash}`,
  ].join('\n');
}

/** Build a single-layer regeneration prompt; the other five layers are frozen. */
export function buildRegeneratePrompt(input: OnboardingAnalysisInput, layer: OnboardingLayerKey): string {
  return [
    '你是小说六层初始化分析器的单层重生成模块。',
    `只重新生成「${LAYER_KEY_TO_NAME[layer]}」这一层，严格保持其候选、confidence、warnings 与 evidenceIds 的结构契约。`,
    '只输出该层的 JSON 对象（{candidates,confidence,warnings,evidenceIds}），不得输出其他五层，不得解释，不得写文件，不得使用 Markdown。',
    layer === 'characters' ? 'B3 的 relationships/knowledgeIds/arc.keyBeats 必须为空数组。' : '',
    layer === 'state' ? 'C2 只表达输入终点/故事起点，仅含 scene 与 characters 子集。' : '',
    layer === 'canon' ? 'C4 只包含文本明确事件且可为空数组。' : '',
    `输入文本块：${JSON.stringify(input.chunks)}`,
    `绑定：projectId=${input.projectId} onboardingSessionId=${input.onboardingSessionId} sourceHash=${input.sourceHash}`,
  ].filter(Boolean).join('\n');
}
