import { collectCandidate, resolveGenerationSettings, type GenerationSettings, type LlmBackend } from '../port/index.js';
import {
  longDraftOutlineAgentOutputSchema,
  longDraftOutlineParserInputSchema,
  type LongDraftOutlineAgentOutput,
  type LongDraftOutlineParserInput,
} from '../../core/schema/long-draft.js';
import { parseJsonObject } from '../parse/shared.js';

/** Few-shot contract example kept beside the dedicated I119 prompt. */
export const LONG_DRAFT_OUTLINE_PROMPT_EXAMPLE =
  '{"confidence":"high","sourceChunkIndices":[0],"outline":{"id":"outline-id","structure":"free","logline":"故事梗概","themes":[],"acts":[],"foreshadowing":[],"endings":[]},"rationale":"仅根据长稿整理 B5 大纲"}';

/** Parse one outline-only response; the I38 candidates envelope is deliberately not accepted. */
export function parseLongDraftOutlineOutput(text: unknown): LongDraftOutlineAgentOutput {
  return parseJsonObject(text, longDraftOutlineAgentOutputSchema, 'Long draft outline output');
}

/** Ensure no source chunk is silently lost or reordered at the model boundary. */
export function assertLongDraftOutlineOutput(input: LongDraftOutlineParserInput, output: LongDraftOutlineAgentOutput): void {
  const expected = input.chunks.map((chunk) => chunk.index);
  const actual = output.sourceChunkIndices;
  if (new Set(actual).size !== actual.length) throw new Error('Long draft sourceChunkIndices must be unique');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Long draft outline must acknowledge every source chunk in order');
  }
  if (Object.prototype.hasOwnProperty.call(output.outline, 'version')) {
    throw new Error('Long draft outline cannot include Host-owned version');
  }
}

export async function classifyLongDraftOutline(
  backend: LlmBackend | undefined,
  rawInput: LongDraftOutlineParserInput,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<LongDraftOutlineAgentOutput> {
  const input = longDraftOutlineParserInputSchema.parse(rawInput);
  const candidate = await collectCandidate(backend, {
    prompt: buildLongDraftOutlinePrompt(input),
    settings: resolveGenerationSettings(settings),
    signal,
  });
  const output = parseLongDraftOutlineOutput(candidate.text);
  assertLongDraftOutlineOutput(input, output);
  return structuredClone(output);
}

export function buildLongDraftOutlinePrompt(input: LongDraftOutlineParserInput): string {
  return [
    '你是长篇小说长稿拆纲分析器。输入是 Host 按原文顺序提供的全部文本块。',
    '只能输出一个 outline-only JSON 对象，不得输出自由对话、Markdown、文件操作、确认结果或任何写命令。',
    '输出必须只有 confidence、sourceChunkIndices、outline、rationale 四个字段；sourceChunkIndices 必须逐字覆盖所有输入块且保持 0..N-1 顺序。',
    'outline 必须是完整 B5 大纲；detailBeats 只能作为 B5 beat 内的嵌套细纲卡，不能返回 I38 的 candidates 数组，也不能单独返回 worldview、relationship、state、knowledge、canon 或其他层。',
    '不要输出 version、seq、status、immutable、supersededBy 等 Host 持有字段；不要静默丢弃无法确定的内容，保留在 B5 的 description/summary/foreshadowing 或 rationale 中。',
    LONG_DRAFT_OUTLINE_PROMPT_EXAMPLE,
    `sourceHash（只用于本次边界识别，不要复制到输出）：${input.sourceHash}`,
    `输入文本块（必须按 index 阅读）：${JSON.stringify(input.chunks)}`,
  ].join('\n');
}
