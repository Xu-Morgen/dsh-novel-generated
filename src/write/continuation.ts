import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { StoryContextAssembly } from '../core/pipeline/index.js';

/**
 * I44 continuation prompt contract (design §9.4): the caller supplies the
 * complete I19 assembly, while this layer adds only explicit next-segment
 * intent. It never hides the current state, canon, outline, detail beat, or POV.
 */
export function buildContinuationPrompt(
  context: StoryContextAssembly,
  card: DetailBeat,
  navigation: OutlineNavigation,
): string {
  if (!card.title.trim() || !card.summary.trim() || !card.pov.trim()) {
    throw new Error('Continuation card title, summary, and POV are required');
  }
  if (!navigation.beatId || !navigation.instruction.trim()) throw new Error('Outline navigation is required');
  return [
    '你是长篇小说续写 agent。只输出下一段连续的小说正文，不要标题、解释、Markdown 或字数报告。',
    '必须承接当前正文的最后状态，推进当前细纲，不重复已经完成的内容；段落必须有自然收束，但不要替后续场景作结。',
    `当前 POV: ${card.pov}`,
    `当前细纲: ${card.title}`,
    `细纲摘要: ${card.summary}`,
    `细纲要点: ${card.points.join('；') || '无'}`,
    `大纲 Beat: ${navigation.beatId} / ${navigation.title}`,
    `大纲指令: ${navigation.instruction}`,
    `目标字数: ${card.wordTarget}（软引导，仅用于控制篇幅）`,
    '以下是当前状态、正史、知识边界、大纲、细纲与近期正文，必须以它们为唯一上下文：',
    context.prompt,
  ].join('\n');
}
