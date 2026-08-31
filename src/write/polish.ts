import type { PolishMode } from '../core/candidate/index.js';

/**
 * I123 三种章节润色模式的唯一 prompt preset owner（design §14.14.2 D25 / R18-4）。
 * 三个模式只改变 rewrite 的编辑意图，不改变候选、校验、预览或落地 pipeline；
 * preset 明确要求输出完整正文，避免把解释性文字混入 C5。
 */
const POLISH_MODE_PRESETS: Readonly<Record<PolishMode, string>> = Object.freeze({
  language: '语言润色：改善用词、语序、节奏和标点；只保留原文已有的故事事实、人物关系、视角与事件顺序，不新增或删改情节。',
  condense: '压缩精简：删除重复、赘述和无效铺陈；保留原文的故事事实、必要动作、人物关系与叙事视角，不因缩短而丢失关键事件。',
  expand: '扩写细节：在原文事实边界内补充有限的动作、感官或环境细节；保持人物关系、叙事视角与事件顺序，不引入新人物身份或新事件。',
});

/** Build one parameterized rewrite prompt; mode-specific prose stays in this shared owner. */
export function buildPolishPrompt(mode: PolishMode, instruction: string): string {
  if (!Object.prototype.hasOwnProperty.call(POLISH_MODE_PRESETS, mode)) throw new Error(`Unknown polish mode: ${String(mode)}`);
  if (!instruction.trim()) throw new Error('Polish instruction requires a non-empty prompt');
  return [
    `[polishMode:${mode}]`,
    '你是小说章节润色器。只输出润色后的完整正文，不要标题、解释、Markdown 或字数报告。',
    POLISH_MODE_PRESETS[mode],
    `作者要求：${instruction}`,
  ].join('\n');
}

/** Exposed for deterministic sample/held-out checks without duplicating preset text. */
export function polishModePreset(mode: PolishMode): string {
  if (!Object.prototype.hasOwnProperty.call(POLISH_MODE_PRESETS, mode)) throw new Error(`Unknown polish mode: ${String(mode)}`);
  return POLISH_MODE_PRESETS[mode];
}
