import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CanonEventView } from '../canon/index.js';
import type { CharacterCore } from '../schema/characters.js';
import type { KnowledgeDocument } from '../schema/knowledge.js';
import type { Outline } from '../schema/outline.js';
import type { Chapter } from '../schema/text.js';
import type { WorldEntry } from '../schema/worldview.js';

/**
 * I71 可重建全局搜索投影（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 职责与不变式：
 * - 投影是**派生视图**：`<projectDir>/.search/index.json` 从六层 source-of-truth
 *   文件确定性构建，可 `drop()` 删除、可随时 `build()` 重建（计划 §16「派生视图
 *   风险」：索引绝不成为第二真相，也不得越过 C3/POV 知识边界）。
 * - 索引覆盖：正文（C5 章节/场景）、角色（B3）、世界观（B2 active 条目）、大纲
 *   （B5 幕/节/场景卡/伏笔/结局）、正史（C4）、知情（C3）。
 * - `mentions` 是实体交叉引用索引：每条目扫描其可检索文本，记录其中出现的实体
 *   键（角色 id/名称/别名、世界观 id/标题/关键词、C3/C4/B5 条目 id），供
 *   `referenceEntries` 做精确引用查询。
 * - 检索为纯关键词（大小写不敏感子串），不引入向量检索（I71 明确不做）；命中
 *   排序完全确定（分数 → 层序 → id），同输入同输出。
 * - POV 边界不在索引内（不烘焙第二份 C3 可见性真相）：调用方以 `knows` 集合在
 *   查询时过滤 knowledge 层结果，`knows` 必须来自 live C3 文档（见 host 服务）。
 * - 结果只暴露有界 preview（≤ {@link SEARCH_PREVIEW_LENGTH} 字符）与跳转目标，
 *   绝不返回完整 live object；每条目携带最小 owned JSON 跳转（nav）。
 */

export const SEARCH_INDEX_DIRECTORY = '.search';
export const SEARCH_INDEX_FILE = 'index.json';
export const SEARCH_INDEX_VERSION = 1 as const;
/** 结果 preview 的最大 UTF-16 长度（有界摘要，防止完整对象入 wire）。 */
export const SEARCH_PREVIEW_LENGTH = 160;
/** 单次查询默认结果上限。 */
export const SEARCH_DEFAULT_LIMIT = 50;

/** 可检索层（六层固定集合；层序即稳定排序位）。 */
export const SEARCH_LAYER_ORDER = Object.freeze([
  'text',
  'characters',
  'worldview',
  'outline',
  'canon',
  'knowledge',
] as const);
export type SearchLayer = typeof SEARCH_LAYER_ORDER[number];

/**
 * 结果跳转目标（最小 owned JSON，Client 不持有任何文件路径）：
 * - text：正文视图章节/场景（chapterId/sceneId）；
 * - characters / worldview / canon / knowledge：对应层条目（entryId）；
 * - outline：幕/节/场景卡或伏笔/结局条目（entryId，可带 act/beat/detail）。
 */
export interface SearchNavigation {
  readonly kind: SearchLayer;
  readonly chapterId?: string;
  readonly sceneId?: string;
  readonly actId?: string;
  readonly beatId?: string;
  readonly detailId?: string;
  readonly entryId?: string;
}

/** 索引中的一条检索条目：可检索文本 + 有界展示 + 跳转 + 实体引用键。 */
export interface SearchEntry {
  readonly layer: SearchLayer;
  readonly id: string;
  readonly title: string;
  readonly searchText: string;
  readonly preview: string;
  readonly nav: SearchNavigation;
  readonly mentions: readonly string[];
}

/** 索引文件形状（派生视图；version 锁形状，重建不改语义）。 */
export interface SearchIndexFile {
  readonly version: 1;
  readonly projectId: string;
  readonly builtAt: string;
  readonly entries: readonly SearchEntry[];
}

/** 索引构建输入（调用方 owned，与 ContextAssembler 同一模式：本模块不读文件真相）。 */
export interface SearchIndexSources {
  readonly text: readonly Chapter[];
  readonly characters: readonly CharacterCore[];
  /** 只索引 active 条目（rewritten/obsolete 是历史，不进入当前真相检索）。 */
  readonly worldview: readonly WorldEntry[];
  readonly outline: Outline | undefined;
  readonly canon: readonly CanonEventView[];
  readonly knowledge: KnowledgeDocument;
}

/** 一次命中（最小 owned JSON 投影）。 */
export interface SearchHit {
  readonly layer: SearchLayer;
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly nav: SearchNavigation;
  readonly score: number;
  readonly matched: 'title' | 'content';
}

/** 层级统计（派生视图可重建的可观测性）。 */
export interface SearchLayerCounts {
  readonly text: number;
  readonly characters: number;
  readonly worldview: number;
  readonly outline: number;
  readonly canon: number;
  readonly knowledge: number;
}

/**
 * 从六层 source-of-truth 输入确定性构建索引条目。
 * 遍历顺序与条目内文本拼接都固定，保证重建后检索结果逐字节一致（可重建验收）。
 */
export function buildSearchEntries(sources: SearchIndexSources): readonly SearchEntry[] {
  const entries: SearchEntry[] = [];
  // 1) 实体键词汇：先把全部实体键注册（这样扫描条目时能引用到任意层的键）。
  const entityKeys: Array<{ key: string; owner: SearchLayer; id: string }> = [];
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
      for (const key of [act.id]) {
        const normalized = normalizeEntityKey(key);
        if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'outline', id: act.id });
      }
      for (const beat of act.beats) {
        for (const key of [beat.id]) {
          const normalized = normalizeEntityKey(key);
          if (normalized !== undefined) entityKeys.push({ key: normalized, owner: 'outline', id: beat.id });
        }
      }
    }
  }
  // 2) 逐层构建条目（固定顺序；全部经 pushEntry 统一扫描 mentions 并排序）。
  const pushEntry = (entry: SearchEntry): void => {
    entries.push({ ...entry, mentions: scanMentions(entry.searchText, entityKeys) });
  };

  for (const chapter of sources.text) {
    for (const scene of chapter.scenes) {
      pushEntry({
        layer: 'text',
        id: scene.id,
        title: `${chapter.title || chapter.id} · 场景 ${scene.index + 1}`,
        searchText: scene.content,
        preview: boundedPreview(scene.content),
        nav: { kind: 'text', chapterId: chapter.id, sceneId: scene.id },
        mentions: [],
      });
    }
  }
  for (const character of sources.characters) {
    const arc = character.arc;
    pushEntry({
      layer: 'characters',
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
      mentions: [],
    });
  }
  for (const entry of sources.worldview) {
    if (entry.status !== 'active') continue;
    pushEntry({
      layer: 'worldview',
      id: entry.id,
      title: entry.title,
      searchText: [entry.id, entry.title, ...entry.keywords, entry.content].join('\n'),
      preview: boundedPreview(entry.content),
      nav: { kind: 'worldview', entryId: entry.id },
      mentions: [],
    });
  }
  if (sources.outline !== undefined) {
    const outline = sources.outline;
    pushEntry({
      layer: 'outline',
      id: 'outline',
      title: '梗概与主题',
      searchText: [outline.logline, ...outline.themes].join('\n'),
      preview: boundedPreview(outline.logline),
      nav: { kind: 'outline', entryId: 'outline' },
      mentions: [],
    });
    for (const act of outline.acts) {
      pushEntry({
        layer: 'outline',
        id: `act:${act.id}`,
        title: `幕 ${act.index + 1} · ${act.title}`,
        searchText: [act.id, act.title, act.goal].join('\n'),
        preview: boundedPreview(act.goal),
        nav: { kind: 'outline', actId: act.id },
        mentions: [],
      });
      for (const beat of act.beats) {
        pushEntry({
          layer: 'outline',
          id: `beat:${beat.id}`,
          title: `节 · ${beat.title}`,
          searchText: [beat.id, beat.title, beat.description, ...beat.prerequisites, ...beat.charactersInvolved].join('\n'),
          preview: boundedPreview(beat.description),
          nav: { kind: 'outline', actId: act.id, beatId: beat.id },
          mentions: [],
        });
        for (const detail of beat.detailBeats) {
          pushEntry({
            layer: 'outline',
            id: `detail:${detail.id}`,
            title: `场景卡 · ${detail.title}`,
            searchText: [detail.id, detail.title, detail.summary, detail.pov, ...detail.points].join('\n'),
            preview: boundedPreview(detail.summary),
            nav: { kind: 'outline', actId: act.id, beatId: beat.id, detailId: detail.id },
            mentions: [],
          });
        }
      }
    }
    for (const foreshadowing of outline.foreshadowing) {
      pushEntry({
        layer: 'outline',
        id: `foreshadow:${foreshadowing.id}`,
        title: `伏笔 · ${foreshadowing.hint}`,
        searchText: [foreshadowing.id, foreshadowing.hint, foreshadowing.payoff, ...foreshadowing.knownBy].join('\n'),
        preview: boundedPreview(foreshadowing.payoff),
        nav: { kind: 'outline', entryId: `foreshadow:${foreshadowing.id}` },
        mentions: [],
      });
    }
    for (const ending of outline.endings) {
      pushEntry({
        layer: 'outline',
        id: `ending:${ending.id}`,
        title: `结局 · ${ending.title}`,
        searchText: [ending.id, ending.title, ...ending.conditions, ending.description].join('\n'),
        preview: boundedPreview(ending.description),
        nav: { kind: 'outline', entryId: `ending:${ending.id}` },
        mentions: [],
      });
    }
  }
  for (const event of sources.canon) {
    pushEntry({
      layer: 'canon',
      id: event.id,
      title: `正史 ${event.seq} · ${event.kind}`,
      searchText: [event.id, event.storyTime, event.kind, event.summary, event.detail, event.location, ...event.participants, ...event.consequences].join('\n'),
      preview: boundedPreview([event.summary, event.detail].filter((text) => text.length > 0).join(' ')),
      nav: { kind: 'canon', entryId: event.id },
      mentions: [],
    });
  }
  for (const entry of sources.knowledge.entries) {
    pushEntry({
      layer: 'knowledge',
      id: entry.id,
      title: `知情 · ${boundedPreview(entry.fact, 48)}`,
      searchText: [entry.id, entry.fact, entry.kind, entry.status, ...entry.holders, ...entry.revealPlan.revealTo, entry.revealPlan.revealAt].join('\n'),
      preview: boundedPreview(entry.fact),
      nav: { kind: 'knowledge', entryId: entry.id },
      mentions: [],
    });
  }
  return Object.freeze(entries);
}

/** 一次命中的集合结果：total 是未裁剪的命中总数（大规模项目可观测），hits 是有界列表。 */
export interface SearchHitCollection {
  readonly total: number;
  readonly hits: readonly SearchHit[];
}

/** 关键词命中（大小写不敏感子串；分数 → 层序 → id 全序确定；hits 按 limit 裁剪）。 */
export function searchEntries(
  entries: readonly SearchEntry[],
  query: string,
  options: { readonly knows?: ReadonlySet<string>; readonly limit?: number } = {},
): SearchHitCollection {
  const q = query.trim().toLowerCase();
  if (q === '') return Object.freeze({ total: 0, hits: Object.freeze([]) });
  const knows = options.knows;
  const limit = options.limit ?? SEARCH_DEFAULT_LIMIT;
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    if (knows !== undefined && entry.layer === 'knowledge' && !knows.has(entry.id)) continue;
    const title = entry.title.toLowerCase();
    const score = title === q ? 4 : title.includes(q) ? 3 : entry.searchText.toLowerCase().includes(q) ? 1 : 0;
    if (score === 0) continue;
    hits.push({ layer: entry.layer, id: entry.id, title: entry.title, preview: entry.preview, nav: entry.nav, score, matched: score >= 3 ? 'title' : 'content' });
  }
  const ordered = hits
    .sort((left, right) => right.score - left.score || layerRank(left.layer) - layerRank(right.layer) || left.id.localeCompare(right.id));
  return Object.freeze({ total: ordered.length, hits: Object.freeze(ordered.slice(0, limit)) });
}

/** 实体精确引用（mentions 交叉引用；命中与引用键大小写无关，稳定层序排序）。 */
export function referenceEntries(
  entries: readonly SearchEntry[],
  key: string,
  options: { readonly knows?: ReadonlySet<string>; readonly limit?: number } = {},
): SearchHitCollection {
  const normalized = normalizeEntityKey(key);
  if (normalized === undefined) return Object.freeze({ total: 0, hits: Object.freeze([]) });
  const knows = options.knows;
  const limit = options.limit ?? SEARCH_DEFAULT_LIMIT;
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    if (knows !== undefined && entry.layer === 'knowledge' && !knows.has(entry.id)) continue;
    if (!entry.mentions.includes(normalized)) continue;
    hits.push({ layer: entry.layer, id: entry.id, title: entry.title, preview: entry.preview, nav: entry.nav, score: 2, matched: 'content' });
  }
  const ordered = hits.sort((left, right) => layerRank(left.layer) - layerRank(right.layer) || left.id.localeCompare(right.id));
  return Object.freeze({ total: ordered.length, hits: Object.freeze(ordered.slice(0, limit)) });
}

/** 派生索引的层级统计（可重建 + 删除后恢复的可观测性）。 */
export function indexCounts(entries: readonly SearchEntry[]): SearchLayerCounts {
  const counts: Record<SearchLayer, number> = { text: 0, characters: 0, worldview: 0, outline: 0, canon: 0, knowledge: 0 };
  for (const entry of entries) counts[entry.layer] += 1;
  return Object.freeze({ ...counts });
}

/**
 * 搜索投影的文件仓库：`build` 写派生文件、`drop` 删除、`load` 读取。
 * 本仓库从不写任何 source-of-truth 层（派生视图，计划 §16）。
 */
export class SearchIndexRepository {
  private readonly filePath: string;

  constructor(projectDirectory: string) {
    this.filePath = join(projectDirectory, SEARCH_INDEX_DIRECTORY, SEARCH_INDEX_FILE);
  }

  /** 从调用方给定的六层输入构建并落盘索引（重建路径；幂等覆盖）。 */
  async build(sources: SearchIndexSources, projectId: string): Promise<SearchIndexFile> {
    const index: SearchIndexFile = {
      version: SEARCH_INDEX_VERSION,
      projectId,
      builtAt: new Date().toISOString(),
      entries: buildSearchEntries(sources),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(index)}\n`, 'utf8');
    return index;
  }

  /** 读取当前派生索引；不存在返回 undefined（由调用方决定 fail-closed 或引导重建）。 */
  async load(): Promise<SearchIndexFile | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = JSON.parse(raw) as SearchIndexFile;
    if (parsed.version !== SEARCH_INDEX_VERSION || !Array.isArray(parsed.entries)) {
      throw new Error(`Invalid search index (version ${String(parsed?.version)}) — rebuild it`);
    }
    return parsed;
  }

  /** 删除派生索引（删除后可重建；返回是否确实删除）。 */
  async drop(): Promise<boolean> {
    try {
      await rm(this.filePath, { force: false });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}

function scanMentions(searchText: string, entityKeys: readonly { key: string; owner: SearchLayer; id: string }[]): readonly string[] {
  const lowered = searchText.toLowerCase();
  const matched = new Set<string>();
  for (const { key } of entityKeys) {
    if (lowered.includes(key)) matched.add(key);
  }
  return Object.freeze([...matched].sort());
}

function normalizeEntityKey(key: string | null | undefined): string | undefined {
  if (typeof key !== 'string') return undefined;
  const normalized = key.trim().toLowerCase();
  if (normalized.length < 2) return undefined;
  return normalized;
}

/** 有界摘要（UTF-16 长度截断；确定性，同输入同输出）。 */
function boundedPreview(text: string, max = SEARCH_PREVIEW_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function layerRank(layer: SearchLayer): number {
  return SEARCH_LAYER_ORDER.indexOf(layer);
}
