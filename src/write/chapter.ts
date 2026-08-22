import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';

/** I43 soft word-target evidence; generation is guided, never rejected by length. */
export interface WordTargetReport {
  readonly target: number;
  readonly actual: number;
  readonly errorRatio: number;
  readonly withinControlBand: boolean;
}

/** Build the bounded chapter prompt from the current scene card and navigation. */
export function buildChapterWritingPrompt(card: DetailBeat, navigation: OutlineNavigation): string {
  if (!card.title.trim() || !card.summary.trim() || !card.pov.trim()) throw new Error('Scene card title, summary, and POV are required');
  if (!navigation.beatId || !navigation.instruction.trim()) throw new Error('Outline navigation is required');
  return [
    '你是长篇小说章节写作器。只输出完整的小说正文，不要标题、解释、Markdown 或字数报告。',
    '按照场景卡完成一个自洽场景，必须有自然的开头、发展和收束；不要截断，不要续写提示。',
    `当前 POV: ${card.pov}`,
    `场景标题: ${card.title}`,
    `场景摘要: ${card.summary}`,
    `场景要点: ${card.points.join('；') || '无'}`,
    `大纲 Beat: ${navigation.beatId} / ${navigation.title}`,
    `大纲指令: ${navigation.instruction}`,
    `目标字数: ${card.wordTarget}（软引导，仅用于控制篇幅，不能为了凑数牺牲完整性）`,
  ].join('\n');
}

/** Report absolute UTF-16 length error and a bounded no-hard-gate control signal. */
export function reportWordTarget(target: number, text: string): WordTargetReport {
  if (!Number.isInteger(target) || target <= 0) throw new Error('Word target must be a positive integer');
  const actual = [...text].length;
  const errorRatio = Math.abs(actual - target) / target;
  return Object.freeze({ target, actual, errorRatio, withinControlBand: errorRatio <= 0.3 });
}

export function assertCompleteProse(text: string): void {
  if (!text.trim()) throw new Error('Generated chapter prose must be non-empty');
}

export type ChapterWritingPromptInput = { readonly card: DetailBeat; readonly navigation: OutlineNavigation };

export function buildChapterWritingPromptFrom(input: ChapterWritingPromptInput): string {
  return buildChapterWritingPrompt(input.card, input.navigation);
}
