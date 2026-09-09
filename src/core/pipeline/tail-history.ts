import { sceneSchema } from '../schema/text.js';
import type { StoryHistorySources, StoryContextSection } from './index.js';

/** I215 / §8: bounded saved prose retains the latest ending, never an unmarked prefix masquerading as current context. */
export function renderTailHistory(history: StoryHistorySources, budget: number): StoryContextSection | undefined {
  const scenes = history.recentScenes.map(scene => sceneSchema.parse(scene));
  if (scenes.length === 0) return undefined;
  const prefix = '## History\n以下为已保存且已经发生的正文，按叙事顺序排列：\n';
  const body = scenes.map(scene => `[scene ${scene.id}]\n${scene.content}`).join('\n\n');
  const full = prefix + body;
  if (full.length <= budget) return { id: 'history', text: full, characterCount: full.length, truncated: false };
  const summaries = scenes.filter(scene => scene.summary.trim()).map(scene => `[scene ${scene.id}] ${scene.summary}`).join('\n').slice(-1200);
  const heading = prefix + '前文过长，较早正文已省略；以下保存摘要也可能只保留末尾条目。[truncated]\n'
    + summaries + '\n以下为已保存正文的最新末尾（可能从句中开始，请只承接结尾，不补写被省略的前文）：\n';
  const text = heading + body.slice(-(budget - heading.length));
  return { id: 'history', text, characterCount: text.length, truncated: true };
}
