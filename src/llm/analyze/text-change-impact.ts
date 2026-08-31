import { z } from 'zod';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import {
  textChangeClassificationSchema,
  textChangeDeltaSchema,
  textChangeEvidenceSchema,
  textChangeFutureCardSchema,
  TEXT_CHANGE_IMPACT_MAX_AFFECTED_CARDS,
  TEXT_CHANGE_IMPACT_MAX_EVIDENCE,
  TEXT_CHANGE_IMPACT_MAX_FUTURE_CARDS,
  TEXT_CHANGE_IMPACT_MAX_TEXT,
  type TextChangeDelta,
  type TextChangeEvidence,
  type TextChangeFutureCard,
} from '../../core/schema/text-change-impact.js';
import { assertTextChangeEvidence } from '../../core/text-change-impact/index.js';
import { confidenceSchema, parseJsonObject } from '../parse/shared.js';
import type { GenerationSettings } from '../../core/schema/generation-settings.js';

export const TEXT_CHANGE_IMPACT_PROMPT_EXAMPLE =
  '{"classification":"wording-only|story-fact|plot-direction","confidence":"low|medium|high","evidence":[{"sourceHash":"sha256 of final text","beforeRange":{"start":0,"end":0},"afterRange":{"start":0,"end":0},"beforeQuote":"exact baseline quote","afterQuote":"exact final quote"}],"affectedDetailBeatIds":["future planned detail beat id"],"rationale":"short reason"}';

export const textChangeImpactParserInputSchema = z.object({
  before: z.string().max(TEXT_CHANGE_IMPACT_MAX_TEXT),
  after: z.string().max(TEXT_CHANGE_IMPACT_MAX_TEXT),
  delta: textChangeDeltaSchema,
  futureCards: textChangeFutureCardSchema.array().max(TEXT_CHANGE_IMPACT_MAX_FUTURE_CARDS),
}).strict();
export type TextChangeImpactParserInput = z.infer<typeof textChangeImpactParserInputSchema>;

export const textChangeImpactParserOutputSchema = z.object({
  classification: textChangeClassificationSchema,
  confidence: confidenceSchema,
  evidence: textChangeEvidenceSchema.array().min(1).max(TEXT_CHANGE_IMPACT_MAX_EVIDENCE),
  affectedDetailBeatIds: z.string().min(1).max(64).array().max(TEXT_CHANGE_IMPACT_MAX_AFFECTED_CARDS),
  rationale: z.string().max(2000),
}).strict();
export type TextChangeImpactParserOutput = z.infer<typeof textChangeImpactParserOutputSchema>;

export function parseTextChangeImpactOutput(text: unknown): TextChangeImpactParserOutput {
  return parseJsonObject(text, textChangeImpactParserOutputSchema, 'Text change impact output');
}

/** Fail closed on evidence drift, unknown future cards, and wording-only B5 mutations. */
export function assertTextChangeImpactOutput(input: TextChangeImpactParserInput, output: TextChangeImpactParserOutput): void {
  const allowed = new Set(input.futureCards.map((card) => card.detailBeatId));
  for (const evidence of output.evidence) assertTextChangeEvidence(input.before, input.after, input.delta.afterHash, evidence);
  for (const id of output.affectedDetailBeatIds) if (!allowed.has(id)) throw new Error(`Impact references ineligible future detail beat: ${id}`);
  if (output.classification === 'wording-only' && output.affectedDetailBeatIds.length > 0) {
    throw new Error('wording-only impact cannot affect future detail beats');
  }
}

export async function classifyTextChangeImpact(
  backend: LlmBackend | undefined,
  rawInput: TextChangeImpactParserInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<TextChangeImpactParserOutput> {
  const input = textChangeImpactParserInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildTextChangeImpactPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseTextChangeImpactOutput(candidate.text);
  assertTextChangeImpactOutput(input, output);
  return { ...output, evidence: output.evidence.map((evidence) => ({ ...evidence })), affectedDetailBeatIds: [...output.affectedDetailBeatIds] };
}

export function buildTextChangeImpactPrompt(input: TextChangeImpactParserInput): string {
  return [
    '你是正文变化影响分析器。比较生成基线中的作者正文与作者最终保存的正文，判断变化仅是措辞、事实变化还是剧情方向变化。',
    '不得修改正文、不得输出五层 parser ops、不得修改大纲；只能输出一个 JSON 对象。',
    'classification 规则：wording-only 只改表达而不改变故事事实或后续行动；story-fact 改变已发生/已知的事实；plot-direction 改变后续目标、路线、关系或事件方向。',
    'evidence 的 quote 必须逐字来自对应文本，range 是 UTF-16 半开区间，sourceHash 必须等于 final text 的 hash；affectedDetailBeatIds 只能从 futureCards 选择。',
    '仅输出一个 JSON 对象，必须完全符合：',
    TEXT_CHANGE_IMPACT_PROMPT_EXAMPLE,
    `确定性 delta：${JSON.stringify(input.delta)}`,
    `生成基线正文：${input.before}`,
    `作者最终正文：${input.after}`,
    `允许受影响的未来细纲卡：${JSON.stringify(input.futureCards)}`,
  ].join('\n');
}

export type { TextChangeDelta, TextChangeEvidence, TextChangeFutureCard };
