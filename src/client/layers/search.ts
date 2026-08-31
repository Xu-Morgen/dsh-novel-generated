import type { El } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { SearchNamespace } from '../shared.js';

/**
 * I71 全局搜索与上下文追踪 Client 面板（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 职责与不变式：
 * - 只经 Host `novelSearch` Remote 提交受控命令：关键词检索 / 实体引用 / 重建 /
 *   删除派生索引 / 索引状态；Client 不持有任何领域真相、文件路径或索引副本。
 * - 命中是 Host 的有界投影（layer/id/title/preview/nav/score）；「跳转」按钮把
 *   正文命中带到正文视图（chapters）打开对应场景，其余层命中切到对应层面板。
 * - POV 边界：pov 输入可选；指定后 Host 在查询时用 live C3 knows 过滤，Client
 *   不做任何领域过滤（不复制 KnowledgeFilter owner）。
 * - 本模块不导入 core 或 zod（Client bundle 负向扫描：无领域 fallback）。
 */

export interface SearchNavShape {
  readonly kind: string;
  readonly chapterId?: string;
  readonly sceneId?: string;
  readonly actId?: string;
  readonly beatId?: string;
  readonly detailId?: string;
  readonly entryId?: string;
}

export interface SearchHitShape {
  readonly layer: 'text' | 'characters' | 'worldview' | 'outline' | 'canon' | 'knowledge';
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly nav: SearchNavShape;
  readonly score: number;
  readonly matched: 'title' | 'content';
}

export interface SearchResultShape {
  readonly query: string;
  readonly pov?: string;
  readonly total: number;
  readonly hits: readonly SearchHitShape[];
}

export interface SearchStatsShape {
  readonly indexExists: boolean;
  readonly builtAt?: string;
  readonly counts: { readonly text: number; readonly characters: number; readonly worldview: number; readonly outline: number; readonly canon: number; readonly knowledge: number };
  readonly totalEntries: number;
}

export interface SearchLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly query: string;
  readonly pov: string;
  readonly results?: SearchResultShape;
  readonly referenceKey: string;
  readonly references?: { readonly key: string; readonly total: number; readonly hits: readonly SearchHitShape[] };
  readonly stats?: SearchStatsShape;
  readonly acting: boolean;
}

export interface SearchEditOps {
  setQuery(value: string): void;
  setPov(value: string): void;
  search(): void;
  setReferenceKey(value: string): void;
  references(): void;
  refreshStats(): void;
  /** 从六层 live source-of-truth 重建派生索引（零写结构层）。 */
  rebuild(): void;
  /** 删除派生索引（删除后可重建）。 */
  drop(): void;
  /** 结果跳转：正文命中 → 正文视图对应场景；其余 → 对应层面板。 */
  jumpTo(hit: SearchHitShape): void;
  dismiss(): void;
}

export function freshSearch(): SearchLayerState {
  return { status: 'idle', query: '', pov: '', referenceKey: '', acting: false };
}

export const SEARCH_LAYER_LABELS: Readonly<Record<string, string>> = {
  text: '正文', characters: '角色', worldview: '世界观', outline: '大纲', canon: '正史', knowledge: '知情',
};

function hitList(h: El, hits: readonly SearchHitShape[], ops: SearchEditOps): unknown {
  return h('ul', { className: 'nv-search__hits', 'data-novel-search-hits': '' },
    hits.map((hit) => h('li', { key: `${hit.layer}:${hit.id}`, className: 'nv-search__hit', 'data-novel-search-hit': `${hit.layer}:${hit.id}` },
      h('div', { className: 'nv-search__hit-main' },
        h('span', { className: 'nv-search__badge', 'data-novel-search-hit-layer': hit.layer }, SEARCH_LAYER_LABELS[hit.layer] ?? hit.layer),
        h('span', { className: 'nv-search__hit-title', 'data-novel-search-hit-title': '' }, hit.title),
        h('span', { className: 'nv-search__hit-score', 'data-novel-search-hit-score': String(hit.score) }, `分 ${hit.score}`),
      ),
      h('p', { className: 'nv-search__hit-preview', 'data-novel-search-hit-preview': '' }, hit.preview),
      h('button', { type: 'button', className: 'nv-btn nv-btn--small', 'data-novel-search-jump': hit.layer, onClick: () => ops.jumpTo(hit) }, '跳转'),
    )));
}

export function searchPanel(h: El, projectId: string, namespace: SearchNamespace | undefined, state: SearchLayerState, ops: SearchEditOps): unknown {
  const available = namespace !== undefined && projectId !== undefined;
  const stats = state.stats;
  const countsLine = stats === undefined
    ? null
    : h('p', { className: 'nv-search__stats', 'data-novel-search-stats': '' },
      stats.indexExists
        ? `派生索引已构建：正文 ${stats.counts.text} · 角色 ${stats.counts.characters} · 世界观 ${stats.counts.worldview} · 大纲 ${stats.counts.outline} · 正史 ${stats.counts.canon} · 知情 ${stats.counts.knowledge}（共 ${stats.totalEntries} 条；可删除重建，非第二真相）`
        : '派生索引未构建（可随时重建，不写任何结构层）。');
  return h('section', { className: 'nv-search', 'data-novel-search-panel': '', 'data-novel-search-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '全局搜索与上下文追踪'),
    available ? [
      h('label', { className: 'nv-field nv-search__query' },
        h('span', { className: 'nv-field__label' }, '关键词（跨正文/角色/世界观/大纲/正史/知情）'),
        h('input', {
          type: 'text', className: 'nv-field__input', 'data-novel-search-input': '',
          value: state.query, disabled: state.acting,
          placeholder: '如：海图、北港、守夜人',
          onChange: (event: { target: { value: string } }) => ops.setQuery(event.target.value),
        }),
      ),
      h('div', { className: 'nv-search__row' },
        h('label', { className: 'nv-field nv-search__pov' },
          h('span', { className: 'nv-field__label' }, 'POV 过滤（可选，只过滤知情层）'),
          h('input', {
            type: 'text', className: 'nv-field__input', 'data-novel-search-pov': '',
            value: state.pov, disabled: state.acting,
            placeholder: '角色 id，如 mira',
            onChange: (event: { target: { value: string } }) => ops.setPov(event.target.value),
          }),
        ),
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-search-submit': '', disabled: state.acting || state.query.trim() === '', onClick: () => ops.search() }, '搜索'),
      ),
      state.results === undefined
        ? null
        : h('div', { className: 'nv-search__results', 'data-novel-search-results': '' },
          h('p', { className: 'nv-search__result-count', 'data-novel-search-result-count': '' },
            `「${state.results.query}」${state.results.pov === undefined ? '' : `（POV：${state.results.pov}）`}命中 ${state.results.total} 条`),
          state.results.total === 0 ? h('p', { 'data-novel-search-empty': '' }, '无命中。') : hitList(h, state.results.hits, ops),
        ),
      h('h4', { className: 'nv-search__subtitle' }, '实体交叉引用'),
      h('div', { className: 'nv-search__row' },
        h('label', { className: 'nv-field nv-search__ref' },
          h('span', { className: 'nv-field__label' }, '引用键（角色名/别名/条目 id）'),
          h('input', {
            type: 'text', className: 'nv-field__input', 'data-novel-search-ref-input': '',
            value: state.referenceKey, disabled: state.acting,
            placeholder: '如：米拉、北港、know-1',
            onChange: (event: { target: { value: string } }) => ops.setReferenceKey(event.target.value),
          }),
        ),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-search-ref-submit': '', disabled: state.acting || state.referenceKey.trim() === '', onClick: () => ops.references() }, '查引用'),
      ),
      state.references === undefined
        ? null
        : h('div', { className: 'nv-search__results', 'data-novel-search-refs': '' },
          h('p', { className: 'nv-search__result-count', 'data-novel-search-ref-count': '' },
            `「${state.references.key}」被引用 ${state.references.total} 处`),
          state.references.total === 0 ? h('p', { 'data-novel-search-ref-empty': '' }, '无引用。') : hitList(h, state.references.hits, ops),
        ),
      h('h4', { className: 'nv-search__subtitle' }, '派生索引'),
      countsLine,
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-search-rebuild': '', disabled: state.acting, onClick: () => ops.rebuild() }, '重建索引'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-search-drop': '', disabled: state.acting || !(state.stats?.indexExists ?? false), onClick: () => ops.drop() }, '删除索引'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-search-stats': '', disabled: state.acting, onClick: () => ops.refreshStats() }, '刷新状态'),
      ),
      state.message === undefined ? null : h('p', { className: 'nv-search__message', 'data-novel-search-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    ] : h('p', { className: 'nv-search__hint', 'data-novel-search-unavailable': '' }, '搜索功能暂时不可用，请稍后重试。'),
  );
}
