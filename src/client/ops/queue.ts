// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// queue 层编辑动作 = I65 生成队列 ops（R13-6）：范围/配置 + 暂停/继续/取消 + 重试，经 queueNamespace。

import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { QueueEditOps, QueueLayerState, QueueStartInputShape } from '../layers/queue.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type QueuePort = Pick<OpsPorts, 'workspace' | 'queueNamespace'>;

export { QUEUE_POLL_INTERVAL_MS } from '../queue-poll.js';

export function createQueueOps(runtime: OpsRuntime, port: QueuePort): QueueEditOps {
  const { act, snapshot, beginOp, endOp, isActive, queuePoll } = runtime;
  const projectId = runtime.projectId;
  const workspace = port.workspace;
  const queueNamespace = port.queueNamespace;
      const queuePatch = (patch: Partial<QueueLayerState>): void => act.queuePatch(patch);
      const loadCards = (): void => {
        const target = workspace;
        if (!target || projectId === undefined) return;
        void unwrap(target.outlineBeatCards(projectId)).then((cards) => {
          if (!isActive()) return;
          const shaped = (cards as Array<{ actId: string; beatId: string; detailBeat: { id: string; title: string; pov: string; wordTarget: number; status: string } }>).map((card) => ({
            actId: card.actId, beatId: card.beatId, id: card.detailBeat.id, title: card.detailBeat.title,
            pov: card.detailBeat.pov, wordTarget: card.detailBeat.wordTarget, status: card.detailBeat.status,
          }));
          // 默认全选（start 时全部入队）；已有勾选保留。
          queuePatch({ cards: shaped, selectedCardIds: snapshot.queue.selectedCardIds.length > 0 ? snapshot.queue.selectedCardIds : shaped.map((card) => card.id), status: 'ready' });
        }, (cause: Error) => { if (isActive()) queuePatch({ status: 'ready', message: toUserMessage(cause) }); });
      };
      /** 通用队列命令（幂等由 Host 状态机保证；同键 inflight 去重）。 */
      const queueCommand = (method: 'pause' | 'resume' | 'cancel' | 'retry', taskId?: string): void => {
        const target = queueNamespace;
        if (!target || projectId === undefined) return;
        if (!beginOp(`queue:${method}:${taskId ?? ''}`)) return;
        const release = (): void => endOp(`queue:${method}:${taskId ?? ''}`);
        if (method === 'retry' && taskId === undefined) { release(); return; }
        const call = method === 'retry'
          ? target.retry(projectId, taskId!)
          : method === 'pause'
            ? target.pause(projectId)
            : method === 'resume'
              ? target.resume(projectId)
              : target.cancel(projectId);
        void unwrap(call).then((projection) => {
          release();
          if (!isActive()) return;
          const next = projection;
          queuePatch({ status: 'ready', projection: next, acting: false, message: undefined });
          // I88：轮询命令发往 Fiber 级控制器（单飞行，不堆积并行轮询链）。
          if (next.runState === 'running' || next.runState === 'paused') queuePoll.start();
        }, (cause: Error) => { release(); if (!isActive()) return; queuePatch({ message: toUserMessage(cause) }); });
      };
      return {
        refresh(): void {
          const target = queueNamespace;
          if (!target || projectId === undefined) { queuePatch({ status: 'error', message: '生成队列服务不可用' }); return; }
          if (!beginOp('queue:refresh')) return;
          const release = (): void => endOp('queue:refresh');
          queuePatch({ status: 'loading', message: undefined });
          void unwrap(target.status(projectId)).then((projection) => {
            release();
            if (!isActive()) return;
            const next = projection;
            queuePatch({ status: 'ready', projection: next });
            loadCards();
            if (next.runState === 'running' || next.runState === 'paused') queuePoll.start();
          }, (cause: Error) => { release(); if (!isActive()) return; queuePatch({ status: 'error', message: toUserMessage(cause) }); });
        },
        toggleCard(cardId: string) {
          const selected = snapshot.queue.selectedCardIds;
          queuePatch({ selectedCardIds: selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId] });
        },
        setBudget(value: string) { queuePatch({ wordBudget: value }); },
        setRetries(value: string) { queuePatch({ maxRetries: value }); },
        toggleSoftStop() { queuePatch({ stopOnSoftWarnings: !snapshot.queue.stopOnSoftWarnings }); },
        start(): void {
          const target = queueNamespace;
          const state = snapshot.queue;
          if (!target || projectId === undefined || state.acting) return;
          const chapterId = snapshot.chapters.selectedChapterId;
          if (chapterId === undefined) {
            queuePatch({ status: 'error', acting: false, message: '请先选择目标章节' });
            return;
          }
          if (!beginOp('queue:start')) return;
          const release = (): void => endOp('queue:start');
          const budget = state.wordBudget.trim();
          const parsedBudget = budget === '' ? undefined : Number.parseInt(budget, 10);
          const parsedRetries = Number.parseInt(state.maxRetries, 10);
          const input: QueueStartInputShape = {
            chapterId,
            ...(state.selectedCardIds.length > 0 ? { cardIds: [...state.selectedCardIds] } : {}),
            ...(parsedBudget !== undefined && Number.isFinite(parsedBudget) && parsedBudget > 0 ? { wordBudget: parsedBudget } : {}),
            ...(Number.isFinite(parsedRetries) && parsedRetries >= 0 ? { maxRetries: parsedRetries } : {}),
            stopOnSoftWarnings: state.stopOnSoftWarnings,
          };
          queuePatch({ acting: true, message: undefined });
          void unwrap(target.startAt(projectId, input)).then((projection) => {
            release();
            if (!isActive()) return;
            const next = projection;
            queuePatch({ acting: false, status: 'ready', projection: next });
            if (next.runState === 'running' || next.runState === 'paused') queuePoll.start();
          }, (cause: Error) => { release(); if (!isActive()) return; queuePatch({ acting: false, message: toUserMessage(cause) }); });
        },
        pause() { queueCommand('pause'); },
        resume() { queueCommand('resume'); },
        cancel() { queueCommand('cancel'); },
        retry(taskId: string) { queueCommand('retry', taskId); },
        dismiss() { queuePatch({ status: 'idle', projection: undefined, message: undefined, acting: false }); queuePoll.stop(); },
      };
}
