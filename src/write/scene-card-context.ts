import type { StoryContextAssembly } from '../core/pipeline/index.js';
import type { SceneCharacterView } from '../core/schema/characters.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import { buildChapterWritingPrompt } from './chapter.js';
import { assertNavigationConsistent } from './continuation.js';

/** I214 / §14.14.2: preserve the selected B5 card and B3 identities alongside the POV-safe I19 assembly. */
export function buildSceneCardContextPrompt(
  context: StoryContextAssembly,
  characters: readonly SceneCharacterView[],
  card: DetailBeat,
  navigation: OutlineNavigation,
): string {
  assertNavigationConsistent(context, navigation);
  // Character details are budgeted by I19; the compact identity list must not
  // lose a protagonist merely because an earlier character had a long profile.
  const roster = characters.map(({ character }) => ({
    id: character.id, name: character.name, aliases: character.aliases, kind: character.kind,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const pov = roster.find((character) => character.id === card.pov);
  return [
    buildChapterWritingPrompt(card, navigation, { singleScene: true }),
    `当前细纲场景卡 ID: ${card.id}`,
    `当前细纲场景卡状态: ${card.status}`,
    `当前视角角色姓名: ${pov?.name ?? card.pov}`,
    '人物姓名表（ID 仅用于引用，正文使用设定姓名或已有别名；不得擅自改名、替换主角或将角色表理解为全部必须出场）：',
    JSON.stringify(roster),
    '以上目标卡是本次唯一待写剧情范围。以下 History 是已保存、已经发生的正文，不是待写提纲：承接其末尾的人物位置、持有物、对话和动作，不重复已完成事件。若目标卡与已发生事实重叠，只展开尚未写出的部分，不重置事实、不自行推进到下一张卡。人物设定不代表所有角色都要出场，背景中的未来经历不代表本场景已经发生。',
    '遵循以下人物设定、规则、文风及知识边界；在目标字数附近充分展开当前场景，避免以概述替代正文：',
    context.prompt,
  ].join('\n');
}
