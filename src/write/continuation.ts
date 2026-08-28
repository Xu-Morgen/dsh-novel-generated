import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { StoryContextAssembly } from '../core/pipeline/index.js';

/**
 * I92 双导航一致性校验（review v2.0 §8#3 / 计划 §18 I92）：assembly 渲染时
 * 已把 `sources.navigation` 写进 Outline 段（core/pipeline/index.ts
 * renderNavigation），此处独立传入的 `navigation` 必须与 assembly 记录的是
 * 同一真相，否则 prompt 同时携带两套导航 → 语义分叉。全字段深比较，不等即
 * fail loudly，拒绝使用分叉视图。
 */
export function assertNavigationConsistent(
  assembly: StoryContextAssembly,
  navigation: OutlineNavigation,
): void {
  const base = assembly.navigation;
  if (
    base.actId !== navigation.actId || base.beatId !== navigation.beatId ||
    base.title !== navigation.title || base.description !== navigation.description ||
    base.prerequisitesMet !== navigation.prerequisitesMet ||
    base.instruction !== navigation.instruction ||
    !sameStringList(base.prerequisites, navigation.prerequisites) ||
    !sameStringList(base.deviationIds, navigation.deviationIds)
  ) {
    throw new Error('Navigation mismatch: assembled context outline and explicit navigation diverge; refusing forked view');
  }
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

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
  assertNavigationConsistent(context, navigation);
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
