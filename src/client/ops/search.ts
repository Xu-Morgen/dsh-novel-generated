// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// search 层编辑动作 = I71 全局搜索与上下文追踪 ops（R14-6）：搜索/引用/跳转/重建/删除派生索引，经 searchNamespace；正文命中经共享 chapters ops ref 跳转。

import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { RemoteResult } from '../remote-namespace.js';
import type { SearchEditOps, SearchHitShape, SearchLayerState, SearchResultShape, SearchStatsShape } from '../layers/search.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type SearchPort = Pick<OpsPorts, 'searchNamespace'>;
import type { RouterEditOps } from '../router.js';

export function createSearchOps(runtime: OpsRuntime, port: SearchPort, router: RouterEditOps): SearchEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const searchNamespace = port.searchNamespace;
      const searchPatch = (patch: Partial<SearchLayerState>): void => act.searchPatch(patch);
      const run = <T>(method: 'search' | 'references', key: string, onResult: (result: T) => void): void => {
        const target = searchNamespace;
        if (!target || projectId === undefined) { searchPatch({ status: 'error', message: '搜索服务不可用' }); return; }
        if (!beginOp(`search:${method}:${key}`)) return;
        const release = (): void => endOp(`search:${method}:${key}`);
        searchPatch({ acting: true, message: undefined });
        const pov = snapshot.search.pov.trim();
        // I91：search/references 的 RemoteResult 载荷形状不同（query vs key），
        // 统一收窄为 RemoteResult<unknown>（onResult 侧仍按 T 强转既有断言）。
        const call: Promise<RemoteResult<unknown>> = method === 'search'
          ? target.search(projectId, key, pov === '' ? undefined : pov)
          : target.references(projectId, key, pov === '' ? undefined : pov);
        void unwrap(call).then((result) => {
          release();
          if (!isActive()) return;
          onResult(result as T);
          searchPatch({ acting: false, status: 'ready' });
        }, (cause: Error) => { release(); if (!isActive()) return; searchPatch({ acting: false, status: 'error', message: toUserMessage(cause) }); });
      };
      const runStats = (): void => {
        const target = searchNamespace;
        if (!target || projectId === undefined) return;
        if (!beginOp('search:stats')) return;
        const release = (): void => endOp('search:stats');
        searchPatch({ acting: true, message: undefined });
        void unwrap(target.stats(projectId)).then((stats) => {
          release();
          if (!isActive()) return;
          searchPatch({ acting: false, stats: stats as SearchStatsShape, message: undefined });
        }, (cause: Error) => { release(); if (!isActive()) return; searchPatch({ acting: false, message: toUserMessage(cause) }); });
      };
      return {
        setQuery(value: string) { searchPatch({ query: value, message: undefined }); },
        setPov(value: string) { searchPatch({ pov: value, message: undefined }); },
        search() {
          const q = snapshot.search.query.trim();
          if (q === '') return;
          searchPatch({ results: undefined, references: undefined, message: undefined });
          run<SearchResultShape>('search', q, (result) => searchPatch({ results: result }));
        },
        setReferenceKey(value: string) { searchPatch({ referenceKey: value, message: undefined }); },
        references() {
          const key = snapshot.search.referenceKey.trim();
          if (key === '') return;
          searchPatch({ references: undefined, message: undefined });
          run<{ key: string; total: number; hits: readonly SearchHitShape[] }>('references', key, (result) => searchPatch({ references: result }));
        },
        refreshStats() { runStats(); },
        rebuild(): void {
          const target = searchNamespace;
          if (!target || projectId === undefined) { searchPatch({ message: '搜索服务不可用' }); return; }
          if (!beginOp('search:rebuild')) return;
          const release = (): void => endOp('search:rebuild');
          searchPatch({ acting: true, message: undefined });
          void unwrap(target.build(projectId)).then((stats) => {
            release();
            if (!isActive()) return;
            searchPatch({ acting: false, stats: stats as SearchStatsShape, message: `已从六层 live source-of-truth 重建派生索引（${(stats as SearchStatsShape).totalEntries} 条，零写结构层）。` });
          }, (cause: Error) => { release(); if (!isActive()) return; searchPatch({ acting: false, message: toUserMessage(cause) }); });
        },
        drop(): void {
          const target = searchNamespace;
          if (!target || projectId === undefined) { searchPatch({ message: '搜索服务不可用' }); return; }
          if (!beginOp('search:drop')) return;
          const release = (): void => endOp('search:drop');
          searchPatch({ acting: true, message: undefined });
          void unwrap(target.drop(projectId)).then((stats) => {
            release();
            if (!isActive()) return;
            searchPatch({ acting: false, stats: stats as SearchStatsShape, results: undefined, references: undefined, message: '已删除派生索引（可随时重建，不写任何结构层）。' });
          }, (cause: Error) => { release(); if (!isActive()) return; searchPatch({ acting: false, message: toUserMessage(cause) }); });
        },
        // I124：Search 只提供 Host projection；统一目标转换与前进/返回由 Router owner 处理。
        jumpTo(hit: SearchHitShape): void {
          router.openFromSearch(hit);
        },
        dismiss() { searchPatch({ status: 'idle', message: undefined, results: undefined, references: undefined, query: '', pov: '', referenceKey: '', acting: false }); },
      };
}
