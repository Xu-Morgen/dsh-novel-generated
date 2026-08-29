import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CanonEventView } from '../canon/index.js';
import type { CharacterCore } from '../schema/characters.js';
import type { KnowledgeDocument } from '../schema/knowledge.js';
import type { Outline } from '../schema/outline.js';
import type { Chapter } from '../schema/text.js';
import type { WorldEntry } from '../schema/worldview.js';
import { buildSearchEntries, normalizeEntityKey } from './builders.js';

/**
 * I71 可重建全局搜索投影 —— **查询/仓库兼容组合面**（design §14.10「搜索与上下文
 * 追踪」/ R14-6；架构审查 §4.1 拆分：逐层条目构建在 builders.ts，本文件保留契约
 * 类型、关键词/引用查询与文件仓库，并 re-export builders —— 既有消费方
 * （search-service 等）的导入面不变）。
 *
 * 职责与不变式：
 * - 索引是**派生视图**：`<projectDir>/.search/index.json` 从六层 source-of-truth
 *   文件确定性构建，可 `drop()` 删除、可随时 `build()` 重建（计划 §16「派生视图
 *   风险」：索引绝不成为第二真相，也不得越过 C3/POV 知识边界）。
 * - 检索为纯关键词（大小写不敏感子串），不引入向量检索（I71 明确不做）；命中
 *   排序完全确定（分数 → 层序 → id），同输入同输出。
 * - POV 边界不在索引内（不烘焙第二份 C3 可见性真相）：调用方以 `knows` 集合在
 *   查询时过滤 knowledge 层结果，`knows` 必须来自 live C3 文档（见 host 服务）。
 */

export const SEARCH_INDEX_DIRECTORY = '.search';
export const SEARCH_INDEX_FILE = 'index.json';
export const SEARCH_INDEX_VERSION = 1 as const;
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
export type SearchNavigation =
  | { readonly kind: 'text'; readonly chapterId: string; readonly sceneId: string }
  | { readonly kind: 'characters' | 'worldview' | 'canon' | 'knowledge'; readonly entryId: string }
  | {
      readonly kind: 'outline';
      readonly actId?: string;
      readonly beatId?: string;
      readonly detailId?: string;
      readonly entryId?: string;
    };

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

function layerRank(layer: SearchLayer): number {
  return SEARCH_LAYER_ORDER.indexOf(layer);
}

export { buildSearchEntries, buildTextLayerEntries, buildCharacterLayerEntries, buildWorldviewLayerEntries, buildOutlineLayerEntries, buildCanonLayerEntries, buildKnowledgeLayerEntries, scanMentions, SEARCH_PREVIEW_LENGTH } from './builders.js';
export type { SearchEntryDraft, SearchEntityKeyRef } from './builders.js';
