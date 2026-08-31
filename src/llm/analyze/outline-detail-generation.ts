import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import {
  outlineDetailGenerationParserInputSchema,
  outlineDetailGenerationParserOutputSchema,
  type OutlineDetailGenerationParserInput,
  type OutlineDetailGenerationParserOutput,
} from '../../core/schema/outline-detail-generation.js';
import { parseJsonObject } from '../parse/shared.js';

export const OUTLINE_DETAIL_GENERATION_PROMPT_EXAMPLE =
  '{"detailBeats":[{"title":"细纲标题","summary":"可执行的场景摘要","pov":"视角角色","wordTarget":500,"points":["动作或事实要点"]}],"rationale":"保持节拍边界的理由"}';

export function parseOutlineDetailGenerationOutput(text: unknown): OutlineDetailGenerationParserOutput {
  return parseJsonObject(text, outlineDetailGenerationParserOutputSchema, 'Outline detail generation output');
}

/** The model cannot output identity/status/order and regeneration must stay one-card-at-a-time. */
export function assertOutlineDetailGenerationOutput(
  input: OutlineDetailGenerationParserInput,
  output: OutlineDetailGenerationParserOutput,
): void {
  if (input.mode === 'regenerate-existing' && output.detailBeats.length !== 1) {
    throw new Error('Regeneration must return exactly one detail beat');
  }
}

export async function generateOutlineDetailBeats(
  backend: LlmBackend | undefined,
  rawInput: OutlineDetailGenerationParserInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<OutlineDetailGenerationParserOutput> {
  const input = outlineDetailGenerationParserInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildOutlineDetailGenerationPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseOutlineDetailGenerationOutput(candidate.text);
  assertOutlineDetailGenerationOutput(input, output);
  return structuredClone(output);
}

export function buildOutlineDetailGenerationPrompt(input: OutlineDetailGenerationParserInput): string {
  const modeInstruction = input.mode === 'fill-missing'
    ? '为这个 B5 节拍补齐一到若干张缺失的 planned 细纲卡；只补缺失，不改变节拍边界。'
    : '为已有 planned 细纲卡提出一张替代候选；只改可编辑字段，不改变原卡身份。';
  return [
    '你是小说细纲候选生成器。',
    modeInstruction,
    '只输出一个 JSON 对象，字段必须严格是 detailBeats 与 rationale。detailBeats 只能含 title、summary、pov、wordTarget、points；不得输出 id、status、actId、beatId、index、删除或重排命令。',
    'summary 与 points 必须围绕给定节拍，不得创造与输入冲突的新人物、世界规则或剧情方向。',
    OUTLINE_DETAIL_GENERATION_PROMPT_EXAMPLE,
    `所属幕：${input.actId}`,
    `所属节拍：${input.beatId}`,
    `节拍标题：${input.beatTitle}`,
    `节拍描述：${input.beatDescription}`,
    input.existing === undefined ? '已有细纲：无（这是补缺）' : `已有细纲：${JSON.stringify(input.existing)}`,
  ].join('\n');
}
