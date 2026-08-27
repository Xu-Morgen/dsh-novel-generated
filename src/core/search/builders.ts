import type { CanonEventView } from '../canon/index.js';
import type { CharacterCore } from '../schema/characters.js';
import type { KnowledgeDocument } from '../schema/knowledge.js';
import type { Outline } from '../schema/outline.js';
import type { Chapter } from '../schema/text.js';
import type { WorldEntry } from '../schema/worldview.js';
import type { SearchEntry, SearchIndexSources, SearchLayer } from './index.js';

/**
 * I71 可重建全局搜索投影 —— **逐层条目构建段**（design §14.10「搜索与上下文追踪」/
 * R14-6；架构审查 §4.1 拆分：buildSearchEntries 原 178 行内联六层条目构建按层拆为
 * per-layer builder，查询/仓库留在 index.ts）。
 *
 * 职责与不变式：
 * - 本模块只把六层 source-of-truth 输入确定性投影为「检索条目草稿」（无 mentions），
 *   实体键注册表与 mentions 扫描在 `buildSearchEntries` 汇总时统一完成 —— 先注册
 *   全部实体键、再扫描，保证任意层的键都能被其他层条目引用到（与 I71 原语义一致）。
 * - 遍历顺序固定：text → characters → worldview → outline（梗概→幕→节→场景卡→
 *   伏笔→结局）→ canon → knowledge；同输入同输出（可重建验收）。
 * - 结果只暴露有界 preview（≤ {@link SEARCH_PREVIEW_LENGTH} 字符）与跳转目标，
 *   绝不返回完整 live object；每条目携带最小 owned JSON 跳转（nav）。
 */

/** 无 mentions 的检索条目草稿（mentions 由 buildSearchEntries 扫描后补齐）。 */
export type SearchEntryDraft = Omit<SearchEntry, 'mentions'>;

/** 结果 preview 的最大 UTF-16 长度（有界摘要，防止完整对象入 wire）。 */
export const SEARCH_PREVIEW_LENGTH = 160;

/** 实体键引用（注册表条目：归一化键 → 所属层与条目 id）。 */
export interface SearchEntityKeyRef {
  key: string;
  owner: SearchLayer;
  id: string;
}

/** 正文（C5）条目：章节/场景，可检索文本 = 场景正文。 */
export function buildTextLayerEntries(chapters: readonly Chapter[]): readonly SearchEntryDraft[] {
  return chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({
    layer: 'text' as const,
    id: scene.id,
    title: `${chapter.title || chapter.id} · 场景 ${scene.index + 1}`,
    searchText: scene.content,
    preview: boundedPreview(scene.content),
    nav: { kind: 'text', chapterId: chapter.id, sceneId: scene.id },
  })));
}

/** 角色（B3）条目：全部 CharacterCore（含 arc 字段与别名）。 */
export function buildCharacterLayerEntries(characters: readonly CharacterCore[]): readonly SearchEntryDraft[] {
  return characters.map((character) => {
    const arc = character.arc;
    return {
      layer: 'characters' as const,
      id: character.id,
      title: character.name,
      searchText: [
        character.id, character.name, ...character.aliases,
        character.personality, character.background, character.motivation,
        ...character.goals, ...character.flaws, ...character.abilities,
        character.speechStyle, ...character.staticTraits,
        arc.startingPoint, arc.desiredEnd, ...arc.keyBeats,
      ].join('\n'),
      preview: boundedPreview([character.background, character.motivation].filter((text) => text.length > 0).join(' ') || character.name),
      nav: { kind: 'characters', entryId: character.id },
    };
  });
}

/** 世界观（B2）条目：只索引 active 条目（rewritten/obsolete 是历史，不进当前真相检索）。 */
export function buildWorldviewLayerEntries(worldview: readonly WorldEntry[]): readonly SearchEntryDraft[] {
  return worldview
    .filter((entry) => entry.status === 'active')
    .map((entry) => ({
      layer: 'worldview' as const,
      id: entry.id,
      title: entry.title,
      searchText: [entry.id, entry.title, ...entry.keywords, entry.content].join('\n'),
      preview: boundedPreview(entry.content),
      nav: { kind: 'worldview', entryId: entry.id },
    }));
}

/** 大纲（B5）条目：梗概/主题 + 幕/节/场景卡 + 伏笔 + 结局（undefined = 未初始化）。 */
export function buildOutlineLayerEntries(outline: Outline | undefined): readonly SearchEntryDraft[] {
  if (outline === undefined) return [];
  const drafts: SearchEntryDraft[] = [];
  drafts.push({
    layer: 'outline',
    id: 'outline',
    title: '梗概与主题',
    searchText: [outline.logline, ...outline.themes].join('\n'),
    preview: boundedPreview(outline.logline),
    nav: { kind: 'outline', entryId: 'outline' },
  });
  for (const act of outline.acts) {
    drafts.push({
      layer: 'outline',
      id: `act:${act.id}`,
      title: `幕 ${act.index + 1} · ${act.title}`,
      searchText: [act.id, act.title, act.goal].join('\n'),
      preview: boundedPreview(act.goal),
      nav: { kind: 'outline', actId: act.id },
    });
    for (const beat of act.beats) {
      drafts.push({
        layer: 'outline',
        id: `beat:${beat.id}`,
        title: `节 · ${beat.title}`,
        searchText: [beat.id, beat.title, beat.description, ...beat.prerequisites, ...beat.charactersInvolved].join('\n'),
        preview: boundedPreview(beat.description),
        nav: { kind: 'outline', actId: act.id, beatId: beat.id },
      });
      for (const detail of beat.detailBeats) {
        drafts.push({
          layer: 'outline',
          id: `detail:${detail.id}`,
          title: `场景卡 · ${detail.title}`,
          searchText: [detail.id, detail.title, detail.summary, detail.pov, ...detail.points].join('\n'),
          preview: boundedPreview(detail.summary),
          nav: { kind: 'outline', actId: act.id, beatId: beat.id, detailId: detail.id },
        });
      }
    }
  }
  for (const foreshadowing of outline.foreshadowing) {
    drafts.push({
      layer: 'outline',
      id: `foreshadow:${foreshadowing.id}`,
      title: `伏笔 · ${foreshadowing.hint}`,
      searchText: [foreshadowing.id, foreshadowing.hint, foreshadowing.payoff, ...foreshadowing.knownBy].join('\n'),
      preview: boundedPreview(foreshadowing.payoff),
      nav: { kind: 'outline', entryId: `foreshadow:${foreshadowing.id}` },
    });
  }
  for (const ending of outline.endings) {
    drafts.push({
      layer: 'outline',
      id: `ending:${ending.id}`,
      title: `结局 · ${ending.title}`,
      searchText: [ending.id, ending.title, ...ending.conditions, ending.description].join('\n'),
      preview: boundedPreview(ending.description),
      nav: { kind: 'outline', entryId: `ending:${ending.id}` },
    });
  }
  return drafts;
}

/** 正史（C4）条目：全部事件（含 seq 定位与参与者/后果引用键）。 */
export function buildCanonLayerEntries(canon: readonly CanonEventView[]): readonly SearchEntryDraft[] {
  return canon.map((event) => ({
    layer: 'canon' as const,
    id: event.id,
    title: `正史 ${event.seq} · ${event.kind}`,
    searchText: [event.id, event.storyTime, event.kind, event.summary, event.detail, event.location, ...event.participants, ...event.consequences].join('\n'),
    preview: boundedPreview([event.summary, event.detail].filter((text) => text.length > 0).join(' ')),
    nav: { kind: 'canon', entryId: event.id },
  }));
}

/** 知情（C3）条目：事实/种类/状态/持有者/揭示计划；POV 边界由调用方查询时过滤。 */
export function buildKnowledgeLayerEntries(knowledge: KnowledgeDocument): readonly SearchEntryDraft[] {
  return knowledge.entries.map((entry) => ({
    layer: 'knowledge' as const,
    id: entry.id,
    title: `知情 · ${boundedPreview(entry.fact, 48)}`,
    searchText: [entry.id, entry.fact, entry.kind, entry.status, ...entry.holders, ...entry.revealPlan.revealTo, entry.revealPlan.revealAt].join('\n'),
    preview: boundedPreview(entry.fact),
    nav: { kind: 'knowledge', entryId: entry.id },
  }));
}

/**
 * 从六层 source-of-truth 输入确定性构建索引条目。
 * 先把全部实体键注册（这样扫描条目时能引用到任意层的键），再按固定层序逐层构建
 * 草稿并统一扫描 mentions；遍历顺序与条目内文本拼接都固定，保证重建后检索结果
 * 逐字节一致（可重建验收）。
 */
export function buildSearchEntries(sources: SearchIndexSources): readonly SearchEntry[] {
  const entityKeys = collectEntityKeys(sources);
  const drafts: readonly SearchEntryDraft[] = [
    ...buildTextLayerEntries(sources.text),
    ...buildCharacterLayerEntries(sources.characters),
    ...buildWorldviewLayerEntries(sources.worldview),
    ...buildOutlineLayerEntries(sources.outline),
    ...buildCanonLayerEntries(sources.canon),
    ...buildKnowledgeLayerEntries(sources.knowledge),
  ];
  return Object.freeze(drafts.map((entry) => ({ ...entry, mentions: scanMentions(entry.searchText, entityKeys) })));
}

/** 实体键注册表：先注册全部层的键，供后续逐条扫描（跨层交叉引用）。 */
function collectEntityKeys(sources: SearchIndexSources): readonly SearchEntityKeyRef[] {
  const entityKeys: SearchEntityKeyRef[] = [];
  for (const character of sources.characters) {
    for (const key of [character.id, character.name, ...character.aliases]) {
      const normalized = normalizeEntityKey(key);
      if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'characters', id: character.id });
    }
  }
  for (const entry of sources.worldview) {
    if (entry.status !== 'active') continue;
    for (const key of [entry.id, entry.title, ...entry.keywords]) {
      const normalized = normalizeEntityKey(key);
      if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'worldview', id: entry.id });
    }
  }
  for (const entry of sources.knowledge.entries) {
    const normalized = normalizeEntityKey(entry.id);
    if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'knowledge', id: entry.id });
  }
  for (const event of sources.canon) {
    const normalized = normalizeEntityKey(event.id);
    if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'canon', id: event.id });
  }
  if (sources.outline !== undefined) {
    for (const act of sources.outline.acts) {
      const actKey = normalizeEntityKey(act.id);
      if (actKey !== undefined) entityKeys.push({ key: actKey, owner: 'outline', id: act.id });
      for (const beat of act.beats) {
        const beatKey = normalizeEntityKey(beat.id);
        if (beatKey !== undefined) entityKeys.push({ key: beatKey, owner: 'outline', id: beat.id });
      }
    }
  }
  return entityKeys;
}

/** 实体交叉引用扫描：可检索文本中的已注册实体键（大小写无关，稳定排序）。 */
export function scanMentions(searchText: string, entityKeys: readonly SearchEntityKeyRef[]): readonly string[] {
  const lowered = searchText.toLowerCase();
  const matched = new Set<string>();
  for (const { key } of entityKeys) {
    if (lowered.includes(key)) matched.add(key);
  }
  return Object.freeze([...matched].sort());
}

/** 归一化实体键（供查询与注册共用；长度 < 2 的键不参与引用）。 */
export function normalizeEntityKey(key: string | null | undefined): string | undefined {
  if (typeof key !== 'string') return undefined;
  const normalized = key.trim().toLowerCase();
  if (normalized.length < 2) return undefined;
  return normalized;
}

/** 有界摘要（UTF-16 长度截断；确定性，同输入同输出）。 */
export function boundedPreview(text: string, max = SEARCH_PREVIEW_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}
