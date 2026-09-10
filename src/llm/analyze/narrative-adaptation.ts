import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import { assertDistinctProtagonist } from '../../core/characters/identity.js';
import {
  narrativeAdaptationInputSchema,
  narrativeAdaptationOutputSchema,
  type NarrativeAdaptationInput,
  type NarrativeAdaptationOutput,
} from '../../core/schema/narrative-adaptation.js';
import { parseJsonObject } from '../parse/shared.js';
import { z } from 'zod';
import { adaptationReferenceIssues, generateWithNarrativeRepair, type RepairOptions } from './narrative-repair.js';

// I200 / §14.15: derive every nested field from its owner, so empty examples
// cannot leave the model to invent scene cards, foreshadowing or protagonists.
const outputJsonSchema = JSON.stringify(z.toJSONSchema(narrativeAdaptationOutputSchema));

export const NARRATIVE_ADAPTATION_PROMPT_EXAMPLE =
  '{"confidence":"high","evidenceParagraphIds":["paragraph-0001"],"outline":{"id":"outline-id","structure":"three-act","logline":"调查者追踪一条异常线索","themes":["记忆"],"acts":[{"id":"act-1","index":0,"title":"调查开始","goal":"找到第一条可验证线索","beats":[{"id":"beat-1","title":"跟随线索","description":"调查者发现矛盾并作出暂时判断","charactersInvolved":["protagonist"],"conflictType":"external","prerequisites":[],"optional":false,"detailBeats":[]}]}],"foreshadowing":[],"endings":[]},"rationale":"先让读者经历调查，再逐步揭示幕后事实"}';

/** Parse only the strict POV adaptation payload; C3/C4/C5 fields are rejected. */
export function parseNarrativeAdaptationOutput(text: unknown): NarrativeAdaptationOutput {
  try { return parseJsonObject(text, narrativeAdaptationOutputSchema, 'Narrative adaptation output'); }
  catch (cause) {
    if (cause instanceof z.ZodError) throw new NarrativeAdaptationFormatError('schema');
    if (cause instanceof Error && cause.message === 'Narrative adaptation output must be valid JSON') throw new NarrativeAdaptationFormatError('json');
    throw cause;
  }
}

/** Fixed parse diagnostics omit model values and raw Zod causes from background logs (§0.1.2). */
export class NarrativeAdaptationFormatError extends Error {
  constructor(kind: 'json' | 'schema') {
    super(kind === 'json' ? 'Narrative adaptation output must be valid JSON' : 'Narrative adaptation output must be a valid JSON object matching the required schema');
  }
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
  bound?: { characters: readonly { id: string; name: string }[] } & RepairOptions,
): Promise<NarrativeAdaptationOutput> {
  const input = narrativeAdaptationInputSchema.parse(rawInput);
  if (bound) {
    const characters = [...bound.characters, ...(input.narrativeIntent.protagonistCandidateId ? [{ id: input.narrativeIntent.protagonistCandidateId, name: '作者确认的待创建主角' }] : [])];
    const example = narrativeAdaptationOutputSchema.parse(JSON.parse(NARRATIVE_ADAPTATION_PROMPT_EXAMPLE));
    const protagonist = input.narrativeIntent.protagonistCandidateId ?? input.narrativeIntent.protagonistId ?? characters[0]?.id;
    example.evidenceParagraphIds = input.evidence.map(item => item.paragraphId);
    example.outline.acts[0].beats[0].charactersInvolved = protagonist ? [protagonist] : [];
    if (input.narrativeIntent.protagonistCandidateId) example.protagonistCandidate = { id: input.narrativeIntent.protagonistCandidateId, name: '待命名调查者', premise: '从可见线索展开调查。' };
    const output = await generateWithNarrativeRepair({ backend, settings: resolveGenerationSettings(settings), signal, stage: 'adaptation', onRepair: bound.onRepair,
      referenceContext: JSON.stringify(characters),
      prompt: `${buildNarrativeAdaptationPrompt(input).replace(NARRATIVE_ADAPTATION_PROMPT_EXAMPLE, JSON.stringify(example))}\n允许的角色 ID 与姓名（所有角色引用只能精确选取这些 id，不得重新音译姓名生成 id）：${JSON.stringify(characters)}`,
      schema: narrativeAdaptationOutputSchema, references: value => adaptationReferenceIssues(value, characters.map(c => c.id)), validate: value => assertNarrativeAdaptationSafety(input, value) });
    assertDistinctProtagonist(output.protagonistCandidate, bound.characters);
    return output;
  }
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
    '本次只生成简洁的读者体验大纲，不展开逐场景细纲：每个 beat 的 detailBeats 必须输出 []，细纲留给后续独立创作步骤。建议最多 3 幕、每幕最多 3 个核心节拍、伏笔最多 3 条、结局最多 2 个；合并次要支线而非逐个罗列调查点。',
    'description/goal/hint/payoff/premise 各用一两句，rationale 不超过 200 字。输出紧凑 JSON，不缩进、不重复原文；必须完整闭合 JSON，不能因追求细节遗漏末尾字段。',
    input.narrativeIntent.protagonistCandidateId === undefined
      ? '使用已确认的作品角色组织视角，不得另行输出 protagonistCandidate。'
      : `作者尚未绑定主角身份。当前请求创建主角，必须提议 id 为 ${input.narrativeIntent.protagonistCandidateId} 的 protagonistCandidate，并让 outline 的 charactersInvolved 或 detailBeats.pov 实际引用该角色。已有角色表不代表素材缺少主角；新候选必须是另一位人物，不能将同一人的职业称谓、别名或不同写法另建为角色。不得复制已有角色的姓名与身份；复用已有主角应由作者选择后重新请求。`,
    '第一幕必须建立调查体验，禁止直接讲解真实自杀、助手操纵、群体信念复活或其他幕后终局。作者指令和呈现提示只能成为规划约束，不得逐字成为正文或读者可见事实。',
    '不得输出 B2/B3/C1/C2/C3/C4/C5、secret、holder、revealPlan、写入命令、source range 或 Host-owned version/seq/status。细纲和伏笔自身的 status 必须按下方 schema 填写。',
    '完整输出 JSON Schema（所有嵌套对象必须严格遵守 required、enum 和 additionalProperties；空数组示例不代表非空数组可以自定义字段）：',
    outputJsonSchema,
    '新主角候选只能含 id、name、premise；detailBeats 使用 id、title、summary、pov、wordTarget、points、status；foreshadowing 使用 id、hint、payoff、status、knownBy；人际冲突使用 relational，不使用 social。',
    NARRATIVE_ADAPTATION_PROMPT_EXAMPLE,
    `已确认来源角色：${input.sourceRole}`,
    `已确认叙事意图：${JSON.stringify(input.narrativeIntent)}`,
    `已确认证据段（必须按 paragraphId 回引）：${JSON.stringify(input.evidence)}`,
  ].join('\n');
}
