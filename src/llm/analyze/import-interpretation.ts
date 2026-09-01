import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import {
  assertImportInterpretationCoverage,
  importInterpretationInputSchema,
  sourceInterpretationOutputSchema,
  type ImportInterpretationInput,
  type SourceInterpretationOutput,
} from '../../core/schema/import-interpretation-analysis.js';
import { parseJsonObject } from '../parse/shared.js';

/** Frozen shape example kept beside the dedicated source-interpretation prompt. */
export const SOURCE_INTERPRETATION_PROMPT_EXAMPLE =
  '{"sourceRole":"background-material","confidence":"high","evidenceParagraphIds":["paragraph-0001"],"paragraphs":[{"paragraphId":"paragraph-0001","role":"world-truth","confidence":"high","evidence":"可验证的世界设定事实"}],"rationale":"按段落语义判断来源角色"}';

export function parseSourceInterpretationOutput(text: unknown): SourceInterpretationOutput {
  return parseJsonObject(text, sourceInterpretationOutputSchema, 'Source interpretation output');
}

/** Run the zero-write source classifier and enforce Host paragraph coverage. */
export async function classifySourceInterpretation(
  backend: LlmBackend | undefined,
  rawInput: ImportInterpretationInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<SourceInterpretationOutput> {
  const input = importInterpretationInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildSourceInterpretationPrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseSourceInterpretationOutput(candidate.text);
  assertImportInterpretationCoverage(input, output);
  return structuredClone(output);
}

export function buildSourceInterpretationPrompt(input: ImportInterpretationInput): string {
  return [
    '你是来源解释分类器。只判断每个 Host 提供的稳定段落属于哪一种来源语义：world-truth（世界/幕后事实）、plot-plan（剧情计划/梗概）、prose（可用叙事正文）、author-instruction（作者指令/待办）、presentation-note（呈现/跑团/场景控制说明）。',
    '必须覆盖全部段落，保持 paragraphId 原顺序且每个只出现一次。evidenceParagraphIds 只能引用输入段落 id。',
    '只能输出一个 JSON 对象，不得输出 treatment、POV、主角、字符 offset、范围、写入命令、B/C 层、确认结果或 Markdown；offset 始终由 Host 从 paragraphId 投影。',
    'sourceRole 只是整体来源角色建议，不是作者确认结果；不要替作者选择 expand-outline/adapt-pov。',
    SOURCE_INTERPRETATION_PROMPT_EXAMPLE,
    `项目与导入会话（只用于绑定，不要复制到输出）：${JSON.stringify({ projectId: input.projectId, importSessionId: input.importSessionId, sourceHash: input.sourceHash })}`,
    `Host 段落（按 index 阅读）：${JSON.stringify(input.paragraphs)}`,
  ].join('\n');
}
