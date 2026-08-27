import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  QueueJournalFile,
  assertTaskTransition,
  countProseUnits,
  queueTaskId,
  queueTaskSchema,
  stableSceneId,
  type QueueConfig,
  type QueueJournalData,
  type QueueRunState,
  type QueueTaskData,
  type QueueTaskStatus,
} from '../core/queue/index.js';
import type { NovelWritingCandidateService, WritingCandidateRequest } from './candidate-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { OutlineBeatCard } from '../core/schema/outline.js';
import type { GenerationSettings } from '../llm/port/index.js';

/**
 * I65 可恢复自动生成队列 Host owner（design §14.9「可恢复自动生成队列」/ R13-6）。
 *
 * 队列由 Host 持有、按场景卡（B5 detailBeat）范围顺序执行：每个任务生成一张
 * 场景卡的候选（I62 合同经 `novelWritingCandidate`，只产候选、零写）→ 注册进
 * I63 裁决服务（作者可审阅/裁决）→ 停在「待裁决」（candidate-ready）→ 由
 * I63 面板裁决。队列**绝不自动接受候选、绝不静默改 B5/C6**（R13-6「先候选、
 * 后裁决」；accept 的唯一入口仍是 I63 adjudicate）。
 *
 * 产品语义：
 * - 范围/稳定 ID：`start(projectId, { cardIds })` 按场景卡入队；场景 id 由
 *   `stableSceneId(actId, beatId, cardId)` 确定性派生，任务 id 同源派生 ——
 *   重启恢复据此识别「已生成候选 / 已写正文」的场景，绝不重复追加正文。
 * - 停止策略（复用 I63 preview 的 I20 判定，不新增第二裁决器）：
 *   - 硬冲突（validation.status = reject）→ 立即 hard-stop（stopped-hard），
 *     当前候选仍待作者裁决；
 *   - 软警告（warn）→ 按 config.stopOnSoftWarnings：true 停（stopped-soft），
 *     false 继续；
 *   - 通过（pass）→ 继续下一场景卡。
 * - 预算：config.wordBudget 以 `countProseUnits` 累计 consumedUnits；一旦
 *   consumedUnits ≥ wordBudget 不再启动新任务（预算不超限，runState =
 *   budget-exhausted）。单次候选可能越过上限（无法预知长度），队列随即停止。
 * - retry policy：任务失败时 attempts 递增；attempts > maxRetries 才永久
 *   failed（可经 `retry` 归零重排队）；失败可自动重试（同一任务回到 queued）。
 * - 控制幂等：pause（当前任务完成后停）/ resume（仅 paused 起跑）/ cancel
 *   （中止在飞生成、running→queued、runState→idle）重复调用均为 no-op。
 * - 持久化与恢复：任务状态 + 候选正文原子写入 queue-journal.yaml；
 *   `recover`（status/start 惰性触发）把 candidate-ready 候选 rehydrate 回 I63、
 *   把 stale running 任务复位为 queued、把已写正文的任务标为 completed。
 * - Fiber dispose：中止全部在飞生成（AbortSignal）；journal 保留「running」标记，
 *   重启后由 recover 复位 —— 运行任务中止且持久状态可恢复。
 *
 * 复用而不复制：生成走 I62 候选服务（I17 流收集 + I43 prompt），裁决/校验走
 * I63（registerRecoveredCandidate + preview），场景卡来源走 B5 outline 服务。
 * 本模块不持有 llm、不调用任何层 writer。
 */

export interface QueueStartInput {
  /** 场景卡范围（B5 detailBeat id）；缺省 = 全部场景卡（含已写场景，将被 reconcile 跳过）。 */
  readonly cardIds?: readonly string[];
  /** 字数预算（写作单位；null = 不限）。 */
  readonly wordBudget?: number | null;
  /** 每任务首次失败之后的允许重试次数（attempts > maxRetries 才永久失败）。 */
  readonly maxRetries?: number;
  /** 软警告停止策略：true = 遇软警告即停（stopped-soft）。 */
  readonly stopOnSoftWarnings?: boolean;
}

export interface QueueTaskView {
  readonly id: string;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly cardTitle: string;
  readonly cardPov: string;
  readonly status: QueueTaskStatus;
  readonly candidateId: string | null;
  readonly attempts: number;
  readonly error: string | null;
  readonly budgetUnits: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 队列状态投影（最小 owned JSON；不含候选正文/完整 live object，供 Client 轮询）。 */
export interface QueueStatusView {
  readonly projectId: string;
  readonly runState: QueueRunState;
  readonly config: QueueConfig;
  readonly consumedUnits: number;
  readonly updatedAt: string;
  readonly error: string | null;
  readonly tasks: readonly QueueTaskView[];
}

export interface QueueServiceDeps {
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
  /** I62 候选服务：只产候选、零写（队列绝不落地正文/结构层）。 */
  readonly candidate: NovelWritingCandidateService;
  /** I63 裁决服务：候选注册（可审阅/裁决）与 preview（I20 停止策略判定）。 */
  readonly writing: NovelWritingAdjudicationService;
  /** C5 只读：reconcile 核对目标场景是否已写正文（已写 → completed，不重复生成）。 */
  readonly text: NovelTextService;
  /** B5 大纲：场景卡范围解析（beatCards）+ 大纲导航（prompt 重建）。 */
  readonly outline: NovelOutlineService;
  /** A2 生成设置解析（与 I62/I63 同一 owner）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
}

interface RunEntry {
  readonly controller: AbortController;
  pauseRequested: boolean;
}

const now = (): string => new Date().toISOString();

export function createQueueService(deps: QueueServiceDeps): QueueService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const journals = new Map<string, QueueJournalData>();
  const runs = new Map<string, RunEntry>();
  /** 本实例已 rehydrate 的任务（恢复可重入；新实例重启后再 rehydrate）。 */
  const hydrated = new Set<string>();

  const journalFileOf = (projectId: string): QueueJournalFile => {
    validateProjectId(projectId);
    return QueueJournalFile.forProject(projectDirectory(projectsRoot, projectId));
  };

  /** 打开项目：校验 id 与账本可读（corrupt fail-closed），并确保 outline/text 依赖
   *  可读（与 review-service 同模式；幂等，不写任何层内容）。 */
  const openProject = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    await load(projectId);
    await deps.outline.open(projectId);
    await deps.text.open(projectId);
  };

  /** 读（缓存优先）账本；首次读取即校验磁盘文件（corrupt → fail-closed）。 */
  const load = async (projectId: string): Promise<QueueJournalData> => {
    let journal = journals.get(projectId);
    if (journal === undefined) {
      journal = await journalFileOf(projectId).read();
      journals.set(projectId, journal);
    }
    return journal;
  };

  /** 每项目串行写队列：loop/doRecover/cancel 的并发持久化共用同一 .tmp 文件会撞车
   *  （ENOENT/EPERM），故所有落盘经本队列链式串行（同一缓存对象，末态一致）。 */
  const persistQueues = new Map<string, Promise<void>>();
  const persist = (projectId: string): Promise<void> => {
    const journal = journals.get(projectId);
    if (journal === undefined) return Promise.resolve();
    const previous = persistQueues.get(projectId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => journalFileOf(projectId).write(journal));
    persistQueues.set(projectId, run.catch(() => undefined));
    return run;
  };

  /** 变更账本并原子持久化（每次变更 bump updatedAt；写经串行队列）。 */
  const mutate = async (projectId: string, fn: (journal: QueueJournalData) => void): Promise<QueueJournalData> => {
    const journal = await load(projectId);
    fn(journal);
    journal.updatedAt = now();
    await persist(projectId);
    return journal;
  };

  /** 项目内已写正文的场景 id 集合（空正文不算；文本层不可读时视为无已写场景）。 */
  const writtenSceneIds = async (projectId: string): Promise<ReadonlySet<string>> => {
    try {
      const chapters = await deps.text.listChapters(projectId);
      const written = new Set<string>();
      for (const chapter of chapters) {
        for (const scene of chapter.scenes) {
          if (scene.content.trim().length > 0) written.add(scene.id);
        }
      }
      return written;
    } catch {
      // 文本层未打开/不可读：视为无已写场景（候选与既有场景冲突由 I63 accept 拦截）。
      return new Set<string>();
    }
  };

  const rehydrate = (projectId: string, task: QueueTaskData): void => {
    if (hydrated.has(task.id)) return;
    const candidate = task.candidate;
    const settings = task.settings;
    if (candidate === null || settings === null) {
      throw new Error(`队列任务 ${task.id} 候选数据缺失（账本损坏），请重试该任务`);
    }
    deps.writing.registerRecoveredCandidate(candidate, { card: task.card, navigation: task.navigation, settings });
    hydrated.add(task.id);
  };

  /**
   * 恢复 + 对账（幂等）：stale running→queued、stale running runState→idle、
   * 已写正文的任务→completed、candidate-ready 候选 rehydrate 回 I63。
   * 有活动 run 时跳过（loop 拥有状态，避免竞争）。
   */
  const doRecover = async (projectId: string): Promise<void> => {
    if (runs.has(projectId)) return;
    const journal = await load(projectId);
    let changed = false;
    for (const task of journal.tasks) {
      if (task.status === 'running') {
        assertTaskTransition('running', 'queued');
        task.status = 'queued';
        task.updatedAt = now();
        changed = true;
      }
    }
    if (journal.runState === 'running') {
      journal.runState = 'idle';
      changed = true;
    }
    const written = await writtenSceneIds(projectId);
    for (const task of journal.tasks) {
      if (task.status === 'candidate-ready') {
        if (written.has(task.sceneId)) {
          assertTaskTransition('candidate-ready', 'completed');
          task.status = 'completed';
          task.candidateId = null;
          task.candidate = null;
          task.updatedAt = now();
          changed = true;
        } else {
          // 候选仍待作者裁决：rehydrate 回 I63（可继续审阅/裁决，不重新生成）。
          rehydrate(projectId, task);
        }
      } else if (task.status === 'queued' && written.has(task.sceneId)) {
        // 场景已写正文：不再排队生成（重启恢复无重复正文）。
        assertTaskTransition('queued', 'completed');
        task.status = 'completed';
        task.updatedAt = now();
        changed = true;
      }
    }
    if (changed) await persist(projectId);
  };

  /** 按场景卡范围入队（幂等：已存在同 sceneId 任务不重复创建；未知卡 fail-closed）。 */
  const enqueue = async (projectId: string, cardIds: readonly string[] | undefined): Promise<void> => {
    const journal = await load(projectId);
    const cards = await deps.outline.beatCards(projectId);
    const navigation = await deps.outline.navigate(projectId);
    const byId = new Map(cards.map((card) => [card.detailBeat.id, card]));
    const requested = cardIds === undefined ? cards.map((card) => card.detailBeat.id) : [...cardIds];
    // 未知场景卡 fail-closed（绝不静默跳过）。
    const unknown = requested.filter((id) => !byId.has(id));
    if (unknown.length > 0) throw new Error(`未知场景卡：${unknown.join('、')}`);
    // 派生场景 id 冲突 fail-closed（不同卡不得映射到同一场景）。
    const cardOf = (id: string): OutlineBeatCard => {
      const card = byId.get(id);
      if (card === undefined) throw new Error(`未知场景卡：${id}`);
      return card;
    };
    const sceneByCard = new Map<string, string>();
    for (const id of requested) {
      const card = cardOf(id);
      sceneByCard.set(id, stableSceneId(card.actId, card.beatId, card.detailBeat.id));
    }
    const seen = new Set<string>();
    for (const sceneId of sceneByCard.values()) {
      if (seen.has(sceneId)) throw new Error(`场景卡范围派生场景 id 冲突：${sceneId}`);
      seen.add(sceneId);
    }
    const createdAt = now();
    for (const id of requested) {
      const card = cardOf(id);
      const sceneId = sceneByCard.get(id) as string;
      if (journal.tasks.some((task) => task.sceneId === sceneId)) continue;
      const task: QueueTaskData = queueTaskSchema.parse({
        id: queueTaskId(sceneId),
        projectId,
        chapterId: 'chapter-1',
        sceneId,
        actId: card.actId,
        beatId: card.beatId,
        cardId: card.detailBeat.id,
        card: { ...card.detailBeat },
        navigation: { ...navigation },
        intent: 'scene-card',
        status: 'queued',
        candidateId: null,
        attempts: 0,
        error: null,
        budgetUnits: null,
        createdAt,
        updatedAt: createdAt,
        candidate: null,
        settings: null,
      });
      journal.tasks.push(task);
    }
  };

  const taskViewOf = (task: QueueTaskData): QueueTaskView => ({
    id: task.id,
    sceneId: task.sceneId,
    chapterId: task.chapterId,
    cardTitle: task.card.title,
    cardPov: task.card.pov,
    status: task.status,
    candidateId: task.candidateId,
    attempts: task.attempts,
    error: task.error,
    budgetUnits: task.budgetUnits,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });

  const statusView = async (projectId: string): Promise<QueueStatusView> => {
    const journal = await load(projectId);
    return Object.freeze({
      projectId,
      runState: journal.runState,
      config: Object.freeze({ ...journal.config }),
      consumedUnits: journal.consumedUnits,
      updatedAt: journal.updatedAt,
      error: null,
      tasks: Object.freeze(journal.tasks.map(taskViewOf)),
    });
  };

  /** 是否有排队任务（loop 继续条件）。 */
  const hasQueued = (journal: QueueJournalData): boolean => journal.tasks.some((task) => task.status === 'queued');

  /** 开始/继续一次 run（幂等：已有活动 run 时只合并配置/范围并返回现状）。 */
  const beginRun = async (projectId: string): Promise<QueueStatusView> => {
    await doRecover(projectId);
    const journal = await load(projectId);
    if (!hasQueued(journal)) {
      await mutate(projectId, (j) => {
        j.runState = j.tasks.length === 0 ? 'idle' : 'completed';
      });
      return statusView(projectId);
    }
    await mutate(projectId, (j) => { j.runState = 'running'; });
    // 双检：两个并发 start 可能都过了 runs.has 检查；后到者让位给已起的 loop。
    if (runs.has(projectId)) return statusView(projectId);
    const run: RunEntry = { controller: new AbortController(), pauseRequested: false };
    runs.set(projectId, run);
    void runLoop(projectId, run).finally(() => {
      if (runs.get(projectId) === run) runs.delete(projectId);
    });
    return statusView(projectId);
  };

  /** 顺序执行排队任务：reconcile → 预算门 → 下一 queued 任务 → 停止策略。 */
  const runLoop = async (projectId: string, run: RunEntry): Promise<void> => {
    while (true) {
      if (run.controller.signal.aborted) return;
      if (run.pauseRequested) {
        run.pauseRequested = false;
        await mutate(projectId, (j) => { j.runState = 'paused'; });
        return;
      }
      await doRecover(projectId);
      const journal = await load(projectId);
      // 预算门：一旦累计消耗达到 wordBudget，不再启动新任务（预算不超限）。
      if (journal.config.wordBudget !== null && journal.consumedUnits >= journal.config.wordBudget) {
        await mutate(projectId, (j) => { j.runState = 'budget-exhausted'; });
        return;
      }
      const task = journal.tasks.find((item) => item.status === 'queued');
      if (task === undefined) {
        await mutate(projectId, (j) => { j.runState = 'completed'; });
        return;
      }
      const result = await runTask(projectId, task, run);
      if (result === 'aborted' || result === 'stopped-hard' || result === 'stopped-soft') return;
    }
  };

  /** 执行单个任务：标 running → 生成候选（I62，零写）→ 注册 I63 → 预算累计 → 停止策略。 */
  const runTask = async (projectId: string, task: QueueTaskData, run: RunEntry): Promise<'done' | 'aborted' | 'stopped-hard' | 'stopped-soft'> => {
    await mutate(projectId, (j) => {
      const target = j.tasks.find((item) => item.id === task.id);
      if (target !== undefined) {
        assertTaskTransition(target.status, 'running');
        target.status = 'running';
        target.attempts += 1;
        target.error = null;
        target.updatedAt = now();
      }
    });
    try {
      const settings = await deps.resolveSettings();
      const request: WritingCandidateRequest = {
        id: `cand-${task.id}-${task.attempts}`,
        intent: 'scene-card',
        target: { projectId, chapterId: task.chapterId, sceneId: task.sceneId },
        card: task.card,
        navigation: task.navigation,
        settings,
        signal: run.controller.signal,
      };
      const { candidate } = await deps.candidate.propose(request);
      // 注册进 I63：作者立即可审阅/裁决（候选不落地任何层）。
      deps.writing.registerRecoveredCandidate(candidate, { card: task.card, navigation: task.navigation, settings });
      // 本实例已注册（recover 的 rehydrate 幂等跳过，避免重复注册）。
      hydrated.add(task.id);
      const units = countProseUnits(candidate.text);
      const review = await deps.writing.preview(candidate.id);
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target !== undefined) {
          assertTaskTransition('running', 'candidate-ready');
          target.status = 'candidate-ready';
          target.candidateId = candidate.id;
          target.candidate = candidate;
          target.settings = settings;
          target.budgetUnits = units;
          target.error = null;
          target.updatedAt = now();
        }
        j.consumedUnits += units;
      });
      // 停止策略（复用 I63 preview 的 I20 判定；队列不裁决、只编排）。
      if (review.validation.status === 'reject') {
        await mutate(projectId, (j) => { j.runState = 'stopped-hard'; });
        return 'stopped-hard';
      }
      if (review.validation.status === 'warn') {
        const config = (await load(projectId)).config;
        if (config.stopOnSoftWarnings) {
          await mutate(projectId, (j) => { j.runState = 'stopped-soft'; });
          return 'stopped-soft';
        }
      }
      return 'done';
    } catch (error) {
      if (run.controller.signal.aborted) {
        // 取消/dispose：任务回到 queued（零写，重跑安全），runState → idle。
        await mutate(projectId, (j) => {
          const target = j.tasks.find((item) => item.id === task.id);
          if (target !== undefined) {
            assertTaskTransition('running', 'queued');
            target.status = 'queued';
            target.updatedAt = now();
          }
          j.runState = 'idle';
        });
        return 'aborted';
      }
      const message = error instanceof Error ? error.message : String(error);
      // task 是缓存账本中的活引用（running 标记已递增 attempts）；读取当前值判定重试。
      const journal = await load(projectId);
      const current = journal.tasks.find((item) => item.id === task.id);
      const attempts = current?.attempts ?? task.attempts;
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target === undefined) return;
        if (attempts > j.config.maxRetries) {
          assertTaskTransition('running', 'failed');
          target.status = 'failed';
          target.error = message;
        } else {
          // retry policy：次数未超 → 回队（loop 下一轮重试）。
          assertTaskTransition('running', 'queued');
          target.status = 'queued';
          target.error = message;
        }
        target.updatedAt = now();
      });
      return 'done';
    }
  };

  const dispose = (): void => {
    for (const run of runs.values()) run.controller.abort();
    runs.clear();
  };
  deps.onDispose?.(dispose);

  return Object.freeze({
    async open(projectId: string) {
      await openProject(projectId);
    },
    async status(projectId: string) {
      await openProject(projectId);
      // 无活动 run 时惰性恢复（重启后第一次 status 即对账 + rehydrate）。
      await doRecover(projectId);
      return statusView(projectId);
    },
    async start(projectId: string, input?: QueueStartInput) {
      await openProject(projectId);
      if (input !== undefined) {
        const journal = await load(projectId);
        journal.config = {
          wordBudget: input.wordBudget !== undefined ? input.wordBudget : journal.config.wordBudget,
          maxRetries: input.maxRetries !== undefined ? input.maxRetries : journal.config.maxRetries,
          stopOnSoftWarnings: input.stopOnSoftWarnings !== undefined ? input.stopOnSoftWarnings : journal.config.stopOnSoftWarnings,
        };
        await enqueue(projectId, input.cardIds);
        await persist(projectId);
      }
      // 幂等：已有活动 run 时合并范围/配置即可，不重复起 loop。
      if (runs.has(projectId)) return statusView(projectId);
      return beginRun(projectId);
    },
    async pause(projectId: string) {
      await openProject(projectId);
      const run = runs.get(projectId);
      if (run !== undefined) {
        // 当前任务完成后落 paused；重复 pause 幂等。
        run.pauseRequested = true;
        return statusView(projectId);
      }
      const journal = await load(projectId);
      if (journal.runState === 'running') {
        // 陈旧 running（无活动 loop）：直接置 paused（幂等收口）。
        await mutate(projectId, (j) => { j.runState = 'paused'; });
      }
      return statusView(projectId);
    },
    async resume(projectId: string) {
      await openProject(projectId);
      const run = runs.get(projectId);
      if (run !== undefined) {
        // 暂停请求尚未落地的窗口内 resume：撤销暂停（幂等）。
        run.pauseRequested = false;
        return statusView(projectId);
      }
      const journal = await load(projectId);
      if (journal.runState !== 'paused') return statusView(projectId);
      return beginRun(projectId);
    },
    async cancel(projectId: string) {
      await openProject(projectId);
      const run = runs.get(projectId);
      await mutate(projectId, (j) => {
        for (const task of j.tasks) {
          if (task.status === 'running') {
            assertTaskTransition('running', 'queued');
            task.status = 'queued';
            task.candidateId = null;
            task.candidate = null;
            task.updatedAt = now();
          }
        }
        if (j.runState !== 'idle') j.runState = 'idle';
      });
      if (run !== undefined) {
        run.controller.abort();
        run.pauseRequested = false;
      }
      return statusView(projectId);
    },
    async retry(projectId: string, taskId: string) {
      await openProject(projectId);
      await mutate(projectId, (j) => {
        const target = j.tasks.find((task) => task.id === taskId);
        if (target === undefined) return;
        if (target.status === 'failed' || target.status === 'candidate-ready') {
          assertTaskTransition(target.status, 'queued');
          target.status = 'queued';
          target.attempts = 0;
          target.candidateId = null;
          target.candidate = null;
          target.error = null;
          target.budgetUnits = null;
          target.updatedAt = now();
        }
      });
      return statusView(projectId);
    },
    async cancelTask(projectId: string, taskId: string) {
      await openProject(projectId);
      await mutate(projectId, (j) => {
        const target = j.tasks.find((task) => task.id === taskId);
        if (target === undefined) return;
        if (target.status === 'queued') {
          assertTaskTransition('queued', 'cancelled');
          target.status = 'cancelled';
          target.updatedAt = now();
        }
      });
      return statusView(projectId);
    },
    async recover(projectId: string) {
      await openProject(projectId);
      await doRecover(projectId);
      return statusView(projectId);
    },
  });
}

export interface QueueService {
  open(projectId: string): Promise<void>;
  /** 队列状态投影（惰性恢复；Client 轮询入口）。 */
  status(projectId: string): Promise<QueueStatusView>;
  /** 入队范围 + 配置并开始/继续 run（幂等：活动 run 只合并范围与配置）。 */
  start(projectId: string, input?: QueueStartInput): Promise<QueueStatusView>;
  /** 暂停：当前任务完成后停止（幂等）。 */
  pause(projectId: string): Promise<QueueStatusView>;
  /** 继续：仅 paused 恢复（幂等）。 */
  resume(projectId: string): Promise<QueueStatusView>;
  /** 取消：中止在飞生成，running→queued，runState→idle（幂等）。 */
  cancel(projectId: string): Promise<QueueStatusView>;
  /** 重试：failed/candidate-ready 任务归零重排队（幂等）。 */
  retry(projectId: string, taskId: string): Promise<QueueStatusView>;
  /** 取消单个排队任务（幂等；queued → cancelled）。 */
  cancelTask(projectId: string, taskId: string): Promise<QueueStatusView>;
  /** 显式恢复（对账 + rehydrate；status/start 已惰性触发）。 */
  recover(projectId: string): Promise<QueueStatusView>;
}
