import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import {
  narrativeRevealInputSchema,
  narrativeRevealOutputSchema,
  type NarrativeRevealInput,
  type NarrativeRevealOutput,
} from '../../core/schema/narrative-reveal.js';
import { parseJsonObject } from '../parse/shared.js';

export const NARRATIVE_REVEAL_PROMPT_EXAMPLE =
  '{"confidence":"high","entries":[{"id":"secret-ash","fact":"档案中的事实需要通过调查逐步验证","kind":"secret","holders":["archivist"],"revealPlan":{"revealTo":["mira"],"revealAt":"act-1-beat-1"},"status":"hidden","evidenceParagraphIds":["paragraph-0001"]}],"states":[{"characterId":"archivist","knows":["secret-ash"]},{"characterId":"mira","knows":[]}],"rationale":"让主角在第一幕保持未知，通过 B5 调查锚点安排逐步揭示"}';

/** Parse only the strict C3 reveal candidate payload. */
export function parseNarrativeRevealOutput(text: unknown): NarrativeRevealOutput {
  return parseJsonObject(text, narrativeRevealOutputSchema, 'Narrative reveal output');
}

/**
 * Deterministic C3 consumer guard. It mirrors the canonical holders/knows
 * invariant without assigning persistence or Host-owned versions.
 */
export function assertNarrativeRevealSafety(input: NarrativeRevealInput, output: NarrativeRevealOutput): void {
  const anchorIds = new Set(input.b5Anchors.map((anchor) => anchor.id));
  const characterIds = new Set(input.characterIds);
  const evidenceIds = new Set(input.evidence.map((item) => item.paragraphId));
  const entryIds = new Set<string>();
  const holderByEntry = new Map<string, readonly string[]>();
  for (const entry of output.entries) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate narrative reveal entry: ${entry.id}`);
    entryIds.add(entry.id);
    if (!anchorIds.has(entry.revealPlan.revealAt)) throw new Error(`Unknown B5 reveal anchor: ${entry.revealPlan.revealAt}`);
    if (entry.holders.some((id) => !characterIds.has(id))) throw new Error(`Unknown C3 holder: ${entry.id}`);
    if (entry.revealPlan.revealTo.some((id) => !characterIds.has(id))) throw new Error(`Unknown C3 reveal target: ${entry.id}`);
    if (entry.holders.some((id) => entry.revealPlan.revealTo.includes(id))) throw new Error(`Reveal target is already a holder: ${entry.id}`);
    if (new Set(entry.holders).size !== entry.holders.length) throw new Error(`Duplicate C3 holder: ${entry.id}`);
    if (new Set(entry.revealPlan.revealTo).size !== entry.revealPlan.revealTo.length) throw new Error(`Duplicate C3 reveal target: ${entry.id}`);
    if (entry.evidenceParagraphIds.some((id) => !evidenceIds.has(id))) throw new Error(`Unknown narrative reveal evidence: ${entry.id}`);
    const protagonistId = input.narrativeIntent.protagonistId ?? input.narrativeIntent.protagonistCandidateId;
    if (protagonistId !== undefined && entry.holders.includes(protagonistId) && !input.narrativeIntent.initialKnown.includes(entry.id)) {
      throw new Error(`POV protagonist starts with hidden C3 fact: ${entry.id}`);
    }
    holderByEntry.set(entry.id, entry.holders);
  }
  const stateByCharacter = new Map<string, readonly string[]>();
  for (const state of output.states) {
    if (!characterIds.has(state.characterId)) throw new Error(`Unknown C3 state character: ${state.characterId}`);
    if (stateByCharacter.has(state.characterId)) throw new Error(`Duplicate C3 state: ${state.characterId}`);
    if (new Set(state.knows).size !== state.knows.length) throw new Error(`Duplicate C3 state reference: ${state.characterId}`);
    for (const id of state.knows) if (!entryIds.has(id)) throw new Error(`Unknown C3 state entry: ${id}`);
    stateByCharacter.set(state.characterId, state.knows);
  }
  for (const [entryId, holders] of holderByEntry) {
    for (const holder of holders) if (!stateByCharacter.get(holder)?.includes(entryId)) throw new Error(`Knowledge holder/state mismatch: ${entryId}/${holder}`);
  }
  for (const [characterId, knows] of stateByCharacter) {
    for (const entryId of knows) if (!holderByEntry.get(entryId)?.includes(characterId)) throw new Error(`Knowledge state/holder mismatch: ${characterId}/${entryId}`);
  }
}

export async function planNarrativeReveal(
  backend: LlmBackend | undefined,
  rawInput: NarrativeRevealInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<NarrativeRevealOutput> {
  const input = narrativeRevealInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildNarrativeRevealPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseNarrativeRevealOutput(candidate.text);
  assertNarrativeRevealSafety(input, output);
  return structuredClone(output);
}

/** Dedicated C3 planner: facts may be secret, but their visibility is explicit. */
export function buildNarrativeRevealPrompt(input: NarrativeRevealInput): string {
  return [
    '你是幕后素材的 C3 揭示候选规划器，只生成待审阅的知情候选，不写入作品。',
    '输入已通过 I145 生成并确认了 POV B5；每个 revealAt 必须精确引用给定 B5 beat anchor。',
    '只输出 confidence、entries、states、rationale；entries 只能是 secret、backstory、foreshadow、plotpoint，status 必须为 hidden。',
    'holders 表示故事起点已知者，states.knows 必须与 holders 双向一致；revealTo 不得包含 holder，主角起点不得知道未列入 initialKnown 的新事实。',
    '不得输出 B3/B5/C4/C5 写入命令、正文、未来年表、任意未知 B5 id、version 或自动确认；不要把 presentation note/author instruction 当作已公开正史。',
    NARRATIVE_REVEAL_PROMPT_EXAMPLE,
    `来源角色：${input.sourceRole}`,
    `POV 意图：${JSON.stringify(input.narrativeIntent)}`,
    `I145 B5 candidate：${input.b5CandidateId}`,
    `B5 anchors：${JSON.stringify(input.b5Anchors)}`,
    `允许的角色：${JSON.stringify(input.characterIds)}`,
    `已确认来源证据：${JSON.stringify(input.evidence)}`,
  ].join('\n');
}
