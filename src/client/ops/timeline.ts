// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// timeline 层编辑动作 = 方案 A 剧情时间线 ops（design §8 相关角色对）：刷新/自建/节点选择/编辑/手动设当前/保存，经 timelineNamespace。

import { unwrap } from '../shared.js';
import type { TimelineEditOps, TimelineLayerState, TimelineShape } from '../layers/timeline.js';
import type { OpsContext } from './context.js';

export function createTimelineOps(ctx: OpsContext): TimelineEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const timelineNamespace = ctx.timelineNamespace;
      const timelinePatch = (patch: Partial<TimelineLayerState>): void => act.timelinePatch(patch);
      const load = (): void => {
        const target = timelineNamespace;
        if (!target || projectId === undefined) { timelinePatch({ status: 'error', message: '时间线服务不可用' }); return; }
        if (!beginOp('timeline:read')) return;
        const release = (): void => endOp('timeline:read');
        timelinePatch({ status: 'loading', message: undefined });
        void unwrap(target.read(projectId)).then((timeline) => {
          release();
          if (!isActive()) return;
          timelinePatch({ status: 'ready', timeline: (timeline ?? undefined) as TimelineShape | undefined, selectedId: undefined, dirty: false, saving: false, saveMessage: '', error: '', message: undefined });
        }, (cause: Error) => { release(); if (!isActive()) return; timelinePatch({ status: 'error', message: (cause as Error).message }); });
      };
      return {
        refresh: load,
        ensure(): void {
          const target = timelineNamespace;
          if (!target || projectId === undefined) { timelinePatch({ status: 'error', message: '时间线服务不可用' }); return; }
          if (!beginOp('timeline:ensure')) return;
          const release = (): void => endOp('timeline:ensure');
          timelinePatch({ status: 'loading', error: '', message: undefined });
          void unwrap(target.ensureFromOutline(projectId)).then((timeline) => {
            release();
            if (!isActive()) return;
            timelinePatch({ status: 'ready', timeline: timeline as TimelineShape, selectedId: undefined, dirty: false, saving: false, saveMessage: '已从大纲生成时间线骨架', error: '', message: undefined });
          }, (cause: Error) => { release(); if (!isActive()) return; timelinePatch({ status: 'error', error: (cause as Error).message, message: undefined }); });
        },
        select(nodeId: string) {
          timelinePatch({ selectedId: nodeId, dirty: false, error: '', saveMessage: '' });
        },
        mutate(update: (draft: TimelineShape) => TimelineShape) {
          const current = snapshot.timeline.timeline;
          if (current === undefined) return;
          timelinePatch({ timeline: update(current), dirty: true, error: '', saveMessage: '' });
        },
        setCurrent(nodeId: string | null): void {
          const target = timelineNamespace;
          const current = snapshot.timeline.timeline;
          if (!target || projectId === undefined || current === undefined) return;
          if (!beginOp('timeline:setCurrent')) return;
          const release = (): void => endOp('timeline:setCurrent');
          // I91：wire nodeId 是 optional stringCodec（acceptsUndefined），真实客户端
          // 绑定器对 null 做 strict parse 会拒绝 —— 「恢复自动锚定」以显式 undefined
          // 上行（Host 适配闭包 `nodeId ?? null` 归一为 null 再调服务）。
          void unwrap(target.setCurrentNode(projectId, nodeId === null ? undefined : nodeId)).then((timeline) => {
            release();
            if (!isActive()) return;
            timelinePatch({ timeline: timeline as TimelineShape, dirty: false, saveMessage: nodeId === null ? '已恢复自动锚定' : '已设为当前时间点', error: '' });
          }, (cause: Error) => { release(); if (!isActive()) return; timelinePatch({ error: (cause as Error).message }); });
        },
        save(): void {
          const target = timelineNamespace;
          const current = snapshot.timeline.timeline;
          if (!target || projectId === undefined || current === undefined || snapshot.timeline.saving) return;
          if (!beginOp('timeline:save')) return;
          const release = (): void => endOp('timeline:save');
          timelinePatch({ saving: true, error: '', saveMessage: '' });
          void unwrap(target.save(projectId, current)).then((timeline) => {
            release();
            if (!isActive()) return;
            timelinePatch({ timeline: timeline as TimelineShape, dirty: false, saving: false, saveMessage: '已保存', error: '' });
          }, (cause: Error) => { release(); if (!isActive()) return; timelinePatch({ saving: false, error: (cause as Error).message, saveMessage: '' }); });
        },
      };
}
