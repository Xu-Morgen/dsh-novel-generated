import { z } from 'zod';
import { outlineReconciliationSuggestionSchema, type OutlineReconciliationSuggestion } from '../../core/schema/outline-reconciliation.js';
import { entityIdSchema } from '../../core/schema/base.js';
import { textChangeImpactReportSchema, type TextChangeImpactReport } from '../../core/schema/text-change-impact.js';
import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import { parseJsonObject } from '../parse/shared.js';

export const OUTLINE_RECONCILIATION_PROMPT_EXAMPLE =
  '{"suggestions":[{"detailBeatId":"future planned detail beat id","title":"replacement title","summary":"replacement summary","pov":"pov","wordTarget":500,"points":["replacement point"],"rationale":"why this preserves the changed fact or direction"}]}';

const suggestionRecordSchema = outlineReconciliationSuggestionSchema.extend({
  detailBeatId: entityIdSchema,
  rationale: z.string().max(1000),
}).strict();

export const outlineReconciliationParserInputSchema = z.object({
  report: textChangeImpactReportSchema,
  cards: z.object({
    detailBeatId: entityIdSchema,
    actId: entityIdSchema,
    beatId: entityIdSchema,
    position: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1000),
    pov: z.string().trim().min(1).max(200),
    wordTarget: z.number().int().positive(),
    points: z.string().trim().min(1).array(),
    status: z.literal('planned'),
  }).strict().array().max(32),
}).strict();
export type OutlineReconciliationParserInput = z.infer<typeof outlineReconciliationParserInputSchema>;

export const outlineReconciliationParserOutputSchema = z.object({
  suggestions: suggestionRecordSchema.array().min(1).max(32),
}).strict();
export type OutlineReconciliationParserOutput = z.infer<typeof outlineReconciliationParserOutputSchema>;

export function parseOutlineReconciliationOutput(text: unknown): OutlineReconciliationParserOutput {
  return parseJsonObject(text, outlineReconciliationParserOutputSchema, 'Outline reconciliation output');
}

/** The model can edit only the five fields; Host supplies identity/status and order. */
export function assertOutlineReconciliationOutput(input: OutlineReconciliationParserInput, output: OutlineReconciliationParserOutput): void {
  const expected = input.cards.map((card) => card.detailBeatId);
  const actual = output.suggestions.map((suggestion) => suggestion.detailBeatId);
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index]) || new Set(actual).size !== actual.length) {
    throw new Error('Outline reconciliation suggestions must cover exactly the affected future cards');
  }
}

export async function generateOutlineReconciliationSuggestions(
  backend: LlmBackend | undefined,
  rawInput: OutlineReconciliationParserInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<OutlineReconciliationParserOutput> {
  const input = outlineReconciliationParserInputSchema.parse(rawInput);
  if (input.cards.length === 0) return { suggestions: [] };
  const candidate = await collectCandidate(backend, {
    prompt: buildOutlineReconciliationPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseOutlineReconciliationOutput(candidate.text);
  assertOutlineReconciliationOutput(input, output);
  return { suggestions: output.suggestions.map((suggestion) => ({ ...suggestion, points: [...suggestion.points] })) };
}

export function buildOutlineReconciliationPrompt(input: OutlineReconciliationParserInput): string {
  return [
    '你是后续细纲调和候选生成器。只为正文影响报告列出的未来 planned detailBeat 生成建议。',
    '不得输出 ID、所属幕/节、数组位置、status、删除/新增/重排命令；只能输出 title、summary、pov、wordTarget、points 和 rationale。',
    '建议必须保留原卡身份并围绕正文证据，不能改写角色、世界观、正史或当前/已完成卡。只输出一个 JSON 对象：',
    OUTLINE_RECONCILIATION_PROMPT_EXAMPLE,
    `正文影响报告：${JSON.stringify(input.report)}`,
    `允许调和的未来卡：${JSON.stringify(input.cards)}`,
  ].join('\n');
}

export type { OutlineReconciliationSuggestion, TextChangeImpactReport };
