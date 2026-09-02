import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import {
  narrativeAdaptationInputSchema,
  narrativeAdaptationOutputSchema,
  type NarrativeAdaptationInput,
  type NarrativeAdaptationOutput,
} from '../../core/schema/narrative-adaptation.js';
import { parseJsonObject } from '../parse/shared.js';

export const NARRATIVE_ADAPTATION_PROMPT_EXAMPLE =
  '{"confidence":"high","evidenceParagraphIds":["paragraph-0001"],"outline":{"id":"outline-id","structure":"three-act","logline":"调查者追踪一条异常线索","themes":["记忆"],"acts":[{"id":"act-1","index":0,"title":"调查开始","goal":"找到第一条可验证线索","beats":[{"id":"beat-1","title":"跟随线索","description":"调查者发现矛盾并作出暂时判断","charactersInvolved":["protagonist"],"conflictType":"external","prerequisites":[],"optional":false,"detailBeats":[]}]}],"foreshadowing":[],"endings":[]},"rationale":"先让读者经历调查，再逐步揭示幕后事实"}';

/** Parse only the strict POV adaptation payload; C3/C4/C5 fields are rejected. */
export function parseNarrativeAdaptationOutput(text: unknown): NarrativeAdaptationOutput {
  return parseJsonObject(text, narrativeAdaptationOutputSchema, 'Narrative adaptation output');
}

const FORBIDDEN_FIRST_ACT_TERMS = /自杀|真实自杀|助手操纵|操纵者|群体信念复活|suicide|assistant.{0,8}manipulat|mass.{0,8}resurrect|resurrection/i;
const INVESTIGATION_TERMS = /调查|追查|线索|疑问|误判|探查|investigat|clue|mystery|uncertain/i;

/**
 * Deterministic consumer guard: the first act must establish a reader-facing
 * investigation and must not disclose the canonical hidden answers from the
 * Ashen Codex fixture. Prompt wording alone is not a safety boundary.
 */
export function assertNarrativeAdaptationSafety(input: NarrativeAdaptationInput, output: NarrativeAdaptationOutput): void {
  const expected = input.evidence.map((item) => item.paragraphId);
  if (JSON.stringify(output.evidenceParagraphIds) !== JSON.stringify(expected)) {
    throw new Error('Narrative adaptation evidence must cover confirmed paragraphs in order');
  }
  if (new Set(output.evidenceParagraphIds).size !== output.evidenceParagraphIds.length) {
    throw new Error('Narrative adaptation evidence ids must be unique');
  }
  const firstAct = output.outline.acts[0];
  if (firstAct === undefined) throw new Error('Narrative adaptation must establish a first act');
  const firstActText = JSON.stringify(firstAct);
  if (!INVESTIGATION_TERMS.test(firstActText)) throw new Error('Narrative adaptation first act must establish investigation experience');
  if (FORBIDDEN_FIRST_ACT_TERMS.test(firstActText)) throw new Error('Narrative adaptation first act leaks a hidden answer');
  const intent = input.narrativeIntent;
  if (intent.pov === 'limited' && intent.protagonistCandidateId !== undefined) {
    const protagonistCandidateId = intent.protagonistCandidateId;
    if (output.protagonistCandidate?.id !== protagonistCandidateId) throw new Error('Limited POV candidate must preserve the confirmed protagonist candidate id');
    const protagonistUsed = output.outline.acts.some((act) => act.beats.some((beat) =>
      beat.charactersInvolved.includes(protagonistCandidateId)
      || beat.detailBeats.some((detail) => detail.pov === protagonistCandidateId),
    ));
    if (!protagonistUsed) throw new Error('Generated protagonist candidate must be used by the POV outline');
  } else if (output.protagonistCandidate !== undefined) {
    throw new Error('Protagonist candidate is only valid for a limited POV with a confirmed candidate id');
  }
  if (Object.prototype.hasOwnProperty.call(output.outline, 'version')) throw new Error('Narrative adaptation outline cannot include Host-owned version');
}

export async function classifyNarrativeAdaptation(
  backend: LlmBackend | undefined,
  rawInput: NarrativeAdaptationInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<NarrativeAdaptationOutput> {
  const input = narrativeAdaptationInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildNarrativeAdaptationPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseNarrativeAdaptationOutput(candidate.text);
  assertNarrativeAdaptationSafety(input, output);
  return structuredClone(output);
}

/** Dedicated prompt: confirmed POV and evidence are inputs; no I119 source-order reuse. */
export function buildNarrativeAdaptationPrompt(input: NarrativeAdaptationInput): string {
  return [
    '你是创作想法、幕后素材与混合文档的 POV 叙事化候选生成器，不是原文拆纲器。',
    '输入是作者已经确认的创作想法、背景/幕后资料或混合段，以及明确冻结的限知/全知视角。',
    '只输出一个严格 JSON 对象，字段必须只有 confidence、evidenceParagraphIds、outline、protagonistCandidate（仅限已确认的限知待创建主角）、rationale。',
    'B5 必须按视角重构读者体验，先表达所选视角可经历的行动、调查、线索、误判和冲突，再按揭示节奏逐步接近幕后答案；不得按幕后年表直接复述答案。',
    input.narrativeIntent.protagonistCandidateId === undefined
      ? '使用已确认的作品角色组织视角，不得另行输出 protagonistCandidate。'
      : `素材中尚无可绑定主角。必须提议 id 为 ${input.narrativeIntent.protagonistCandidateId} 的 protagonistCandidate，并让 outline 的 charactersInvolved 或 detailBeats.pov 实际引用该角色来串联故事。`,
    '第一幕必须建立调查体验，禁止直接讲解真实自杀、助手操纵、群体信念复活或其他幕后终局。作者指令和呈现提示只能成为规划约束，不得逐字成为正文或读者可见事实。',
    '不得输出 B2/B3/C1/C2/C3/C4/C5、secret、holder、revealPlan、写入命令、source range 或 Host-owned version/seq/status。',
    NARRATIVE_ADAPTATION_PROMPT_EXAMPLE,
    `已确认来源角色：${input.sourceRole}`,
    `已确认叙事意图：${JSON.stringify(input.narrativeIntent)}`,
    `已确认证据段（必须按 paragraphId 回引）：${JSON.stringify(input.evidence)}`,
  ].join('\n');
}
