// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// review 层编辑动作 = I64 一致性审校中心 ops（R13-5）：刷新/过滤/选中/显式裁决，经 reviewNamespace。

import { unwrap } from '../shared.js';
import type { ReviewAdjudicationOutcomeShape, ReviewAuditRecordShape, ReviewEditOps, ReviewLayerState, ReviewProjectionShape } from '../layers/review.js';
import type { OpsContext } from './context.js';

export function createReviewOps(ctx: OpsContext): ReviewEditOps {
  const { act, snapshot, beginOp, endOp, active } = ctx;
  const projectId = ctx.projectId;
  const reviewNamespace = ctx.reviewNamespace;
      const reviewPatch = (patch: Partial<ReviewLayerState>): void => act.reviewPatch(patch);
      const toggleFilter = (kind: 'categories' | 'severities' | 'statuses', value: string): void => {
        const filter = snapshot.review.filter;
        const next = (filter[kind] as readonly string[]).includes(value)
          ? (filter[kind] as readonly string[]).filter((item) => item !== value)
          : [...(filter[kind] as readonly string[]), value];
        reviewPatch({ filter: { ...filter, [kind]: next } });
      };
      return {
        scan(): void {
          const target = reviewNamespace;
          if (!target || projectId === undefined) { reviewPatch({ status: 'error', message: '审校服务不可用' }); return; }
          if (!beginOp('review:scan')) return;
          const release = (): void => endOp('review:scan');
          reviewPatch({ status: 'scanning', message: undefined });
          // 投影 + 审计记录并行读取（都为只读 Remote）。
          void Promise.all([
            unwrap(target.scan(projectId)),
            unwrap(target.records(projectId)),
          ]).then(([projection, recordList]) => {
            release();
            if (!active) return;
            // I77：records wire 契约即裸数组（组合根不再包 envelope）。
            const records = (recordList as ReviewAuditRecordShape[] | undefined) ?? [];
            reviewPatch({ status: 'ready', projection: projection as ReviewProjectionShape, records, selected: [], message: undefined });
          }, (cause: Error) => { release(); if (!active) return; reviewPatch({ status: 'error', message: (cause as Error).message }); });
        },
        toggleFilter,
        clearFilters() { reviewPatch({ filter: { categories: [], severities: [], statuses: [] } }); },
        selectIssue(issueId: string) {
          const selected = snapshot.review.selected;
          reviewPatch({ selected: selected.includes(issueId) ? selected.filter((item) => item !== issueId) : [...selected, issueId] });
        },
        adjudicate(decision: 'continue' | 'rewrite-requested'): void {
          const target = reviewNamespace;
          const state = snapshot.review;
          if (!target || projectId === undefined || state.status !== 'ready') return;
          if (state.selected.length === 0 || state.acting) return;
          if (!beginOp(`review:adjudicate:${decision}`)) return;
          const release = (): void => endOp(`review:adjudicate:${decision}`);
          reviewPatch({ acting: true, message: undefined });
          void unwrap(target.adjudicate(projectId, { decision, issueIds: [...state.selected] })).then((outcome) => {
            release();
            if (!active) return;
            const result = outcome as ReviewAdjudicationOutcomeShape;
            reviewPatch({
              acting: false,
              projection: result.projection,
              records: result.records,
              selected: [],
              message: `已记录 ${result.applied.length} 项${decision === 'continue' ? '「显式继续」' : '「请求重写」'}（重复 ${result.duplicate.length} 项）。`,
            });
          }, (cause: Error) => { release(); if (!active) return; reviewPatch({ acting: false, message: (cause as Error).message }); });
        },
        dismiss() { reviewPatch({ status: 'idle', projection: undefined, message: undefined, selected: [], acting: false, records: [] }); },
      };
}
