// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// statistics 层编辑动作 = I72 写作进度面板 ops（R14-7）：概览/筛选/章节详情/重建/删除派生统计，经 statisticsNamespace。

import { unwrap } from '../shared.js';
import type { StatisticsNamespace } from '../shared.js';
import type { ChapterDetailShape, SceneCardsResultShape, StatisticsEditOps, StatisticsLayerState, StatisticsOverviewShape, StatisticsStatsShape, TasksResultShape } from '../layers/statistics.js';
import type { OpsContext } from './context.js';

export function createStatisticsOps(ctx: OpsContext): StatisticsEditOps {
  const { act, snapshot, beginOp, endOp, active } = ctx;
  const projectId = ctx.projectId;
  const statisticsNamespace = ctx.statisticsNamespace;
      const statisticsPatch = (patch: Partial<StatisticsLayerState>): void => act.statisticsPatch(patch);
      const run = <T>(key: string, call: (target: StatisticsNamespace, projectId: string) => Promise<unknown>, onResult: (result: T) => void): void => {
        const target = statisticsNamespace;
        if (!target || projectId === undefined) { statisticsPatch({ status: 'error', message: '统计服务不可用' }); return; }
        if (!beginOp(key)) return;
        const release = (): void => endOp(key);
        statisticsPatch({ acting: true, message: undefined });
        void unwrap(call(target, projectId)).then((result) => {
          release();
          if (!active) return;
          onResult(result as T);
          statisticsPatch({ acting: false, status: 'ready' });
        }, (cause: Error) => { release(); if (!active) return; statisticsPatch({ acting: false, status: 'error', message: (cause as Error).message }); });
      };
      const loadCards = (filters: { actId: string; beatId: string; status: string }): void => {
        run<SceneCardsResultShape>(`statistics:cards:${filters.actId}:${filters.beatId}:${filters.status}`, (ns, pid) => ns.sceneCards(pid, {
          ...(filters.actId !== '' ? { actId: filters.actId } : {}),
          ...(filters.beatId !== '' ? { beatId: filters.beatId } : {}),
          ...(filters.status !== '' ? { status: filters.status } : {}),
        }), (result) => statisticsPatch({ sceneCards: result }));
      };
      const loadTasks = (status: string): void => {
        run<TasksResultShape>(`statistics:tasks:${status}`, (ns, pid) => ns.tasks(pid, status === '' ? undefined : { status }), (result) => statisticsPatch({ tasks: result }));
      };
      const loadOverview = (): void => {
        run<StatisticsOverviewShape>('statistics:overview', (ns, pid) => ns.overview(pid), (result) => statisticsPatch({ overview: result }));
      };
      return {
        setCardAct(value: string) { statisticsPatch({ cardActId: value, cardBeatId: '' }); loadCards({ actId: value, beatId: '', status: snapshot.statistics.cardStatus }); },
        setCardBeat(value: string) { statisticsPatch({ cardBeatId: value }); loadCards({ actId: snapshot.statistics.cardActId, beatId: value, status: snapshot.statistics.cardStatus }); },
        setCardStatus(value: string) { statisticsPatch({ cardStatus: value }); loadCards({ actId: snapshot.statistics.cardActId, beatId: snapshot.statistics.cardBeatId, status: value }); },
        setTaskStatus(value: string) { statisticsPatch({ taskStatus: value }); loadTasks(value); },
        selectChapter(value: string) {
          statisticsPatch({ chapterId: value });
          if (value === '') { statisticsPatch({ chapterDetail: undefined }); return; }
          run<ChapterDetailShape>(`statistics:chapterDetail:${value}`, (ns, pid) => ns.chapterDetail(pid, value), (result) => statisticsPatch({ chapterDetail: result }));
        },
        refreshOverview() { loadOverview(); },
        refreshStats() {
          run<StatisticsStatsShape>('statistics:stats', (ns, pid) => ns.stats(pid), (result) => statisticsPatch({ stats: result }));
        },
        rebuild(): void {
          run<StatisticsStatsShape>('statistics:rebuild', (ns, pid) => ns.rebuild(pid), (stats) => {
            statisticsPatch({ stats });
            loadOverview();
            loadCards({ actId: snapshot.statistics.cardActId, beatId: snapshot.statistics.cardBeatId, status: snapshot.statistics.cardStatus });
            loadTasks(snapshot.statistics.taskStatus);
            statisticsPatch({ message: `已从 C5/B5/C6/任务记录重建派生统计（章节 ${stats.counts.chapters} · 场景 ${stats.counts.scenes} · 场景卡 ${stats.counts.cards} · 任务 ${stats.counts.tasks}，零写结构层）。` });
          });
        },
        drop(): void {
          run<StatisticsStatsShape>('statistics:drop', (ns, pid) => ns.drop(pid), (stats) => {
            statisticsPatch({ stats, overview: undefined, sceneCards: undefined, tasks: undefined, chapterDetail: undefined, message: '已删除派生统计（可随时重建，不写任何结构层）。' });
          });
        },
        dismiss() { statisticsPatch({ status: 'idle', message: undefined, stats: undefined, overview: undefined, chapterId: '', chapterDetail: undefined, cardActId: '', cardBeatId: '', cardStatus: '', sceneCards: undefined, taskStatus: '', tasks: undefined, acting: false }); },
      };
}
