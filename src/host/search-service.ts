import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { SearchIndexRepository, indexCounts, referenceEntries, searchEntries, type SearchEntry, type SearchHit, type SearchLayer, type SearchLayerCounts } from '../core/search/index.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelWorldviewService } from './worldview-service.js';

/**
 * I71 全局搜索与上下文追踪 Host facade（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 职责与不变式：
 * - 只经六层既有 Domain Service 读取 live source-of-truth 重建索引；索引文件是
 *   派生视图（`core/search`），`build`/`drop`/`stats` 控制其生命周期，绝不成为
 *   第二真相（计划 §16「派生视图风险」）。
 * - POV 边界在**查询时**施加：`pov` 指定时用 live C3 文档（`knowledge.read`）的
 *   `knows` 过滤 knowledge 层结果；未指定 pov 时作者全知面可检索全部知情
 *   （与 I66 作者全知面一致）。索引本身不烘焙可见性。
 * - 返回最小 owned JSON 投影（有界 preview + 跳转目标），不返回完整 live object，
 *   不携带任何文件路径。
 * - 索引缺失时 search/references fail closed（明确报错引导重建），不静默返回空。
 */

export interface SearchServiceDeps {
  readonly projectsRoot?: string;
  readonly text: NovelTextService;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly canon: NovelCanonService;
  readonly knowledge: NovelKnowledgeService;
}

export interface SearchStatsView {
  readonly indexExists: boolean;
  readonly builtAt?: string;
  readonly counts: SearchLayerCounts;
  readonly totalEntries: number;
}

export interface SearchResultView {
  readonly query: string;
  readonly pov?: string;
  readonly total: number;
  readonly hits: readonly SearchHit[];
}

export interface ReferenceResultView {
  readonly key: string;
  readonly pov?: string;
  readonly total: number;
  readonly hits: readonly SearchHit[];
}

export interface NovelSearchService {
  open(projectId: string): Promise<void>;
  /** 从六层 live source-of-truth 重建派生索引（幂等覆盖）。 */
  build(projectId: string): Promise<SearchStatsView>;
  /** 删除派生索引（删除后可重建）。 */
  drop(projectId: string): Promise<SearchStatsView>;
  /** 派生索引状态（存在性 + 分层条目数）。 */
  stats(projectId: string): Promise<SearchStatsView>;
  /** 关键词检索；pov 指定时 knowledge 层结果受该 POV 的 live knows 过滤。 */
  search(projectId: string, query: string, pov?: string): Promise<SearchResultView>;
  /** 实体精确引用（跨层 mentions 交叉引用）；pov 语义与 search 相同。 */
  references(projectId: string, key: string, pov?: string): Promise<ReferenceResultView>;
}

export function createSearchService(deps: SearchServiceDeps): NovelSearchService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const repositories = new Map<string, SearchIndexRepository>();
  /** 内存索引缓存（派生视图只读缓存；build/drop 失效，重启后惰性重读）。 */
  const cache = new Map<string, { builtAt: string; entries: readonly SearchEntry[] }>();

  const get = (projectId: string): SearchIndexRepository => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new SearchIndexRepository(projectDirectory(projectsRoot, projectId));
      repositories.set(projectId, repository);
    }
    return repository;
  };

  /** 从六层 live 服务并行读取 source-of-truth（只读，零写）。 */
  const collectSources = async (projectId: string) => {
    const [chapters, characters, worldview, outline, canonViews, knowledge] = await Promise.all([
      deps.text.listChapters(projectId),
      deps.characters.list(projectId),
      deps.worldview.list(projectId),
      deps.outline.read(projectId),
      Promise.resolve(deps.canon.query(projectId)),
      deps.knowledge.read(projectId),
    ]);
    return { text: chapters, characters, worldview, outline, canon: canonViews, knowledge };
  };

  /** 加载索引（内存缓存；build/drop 失效）。 */
  const loadIndex = async (projectId: string): Promise<{ projectId: string; builtAt: string; entries: readonly SearchEntry[] }> => {
    const cached = cache.get(projectId);
    if (cached !== undefined) return { projectId, ...cached };
    const index = await get(projectId).load();
    if (index === undefined) {
      throw new Error('搜索索引未构建：请先「重建索引」（派生视图可随时重建，不写任何结构层）。');
    }
    const loaded = { projectId, builtAt: index.builtAt, entries: index.entries };
    cache.set(projectId, loaded);
    return loaded;
  };

  /** live C3 knows 集合（POV 边界；缺 POV 状态 fail closed，与 filterKnowledge 同语义）。 */
  const knowsOf = async (projectId: string, pov: string): Promise<ReadonlySet<string>> => {
    const document = await deps.knowledge.read(projectId);
    const state = document.states.find((candidate) => candidate.characterId === pov);
    if (state === undefined) throw new Error(`Knowledge state is missing for POV: ${pov}`);
    return new Set(state.knows);
  };

  const statsOf = (index: { builtAt: string; entries: readonly SearchEntry[] } | undefined): SearchStatsView => {
    if (index === undefined) return { indexExists: false, counts: emptyCounts(), totalEntries: 0 };
    const counts = indexCounts(index.entries);
    return { indexExists: true, builtAt: index.builtAt, counts, totalEntries: index.entries.length };
  };

  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      get(projectId);
    },
    async build(projectId: string) {
      const sources = await collectSources(projectId);
      const index = await get(projectId).build(sources, projectId);
      const built = { builtAt: index.builtAt, entries: index.entries };
      cache.set(projectId, built);
      return statsOf(built);
    },
    async drop(projectId: string) {
      await get(projectId).drop();
      cache.delete(projectId);
      return statsOf(undefined);
    },
    async stats(projectId: string) {
      const index = await get(projectId).load();
      if (index === undefined) return statsOf(undefined);
      return statsOf({ builtAt: index.builtAt, entries: index.entries });
    },
    async search(projectId: string, query: string, pov?: string) {
      const trimmed = query.trim();
      if (trimmed === '') throw new Error('搜索关键词不能为空');
      const index = await loadIndex(projectId);
      const knows = pov === undefined || pov.trim() === '' ? undefined : await knowsOf(projectId, pov.trim());
      const result = searchEntries(index.entries, trimmed, { knows });
      return Object.freeze({ query: trimmed, ...(pov !== undefined && pov.trim() !== '' ? { pov: pov.trim() } : {}), total: result.total, hits: result.hits });
    },
    async references(projectId: string, key: string, pov?: string) {
      const trimmed = key.trim();
      if (trimmed === '') throw new Error('实体引用键不能为空');
      const index = await loadIndex(projectId);
      const knows = pov === undefined || pov.trim() === '' ? undefined : await knowsOf(projectId, pov.trim());
      const result = referenceEntries(index.entries, trimmed, { knows });
      return Object.freeze({ key: trimmed, ...(pov !== undefined && pov.trim() !== '' ? { pov: pov.trim() } : {}), total: result.total, hits: result.hits });
    },
  });
}

function emptyCounts(): SearchLayerCounts {
  return { text: 0, characters: 0, worldview: 0, outline: 0, canon: 0, knowledge: 0 };
}

export type { SearchHit, SearchLayer };
