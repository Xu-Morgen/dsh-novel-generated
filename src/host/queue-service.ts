import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  QueueJournalFile,
  assertTaskTransition,
  countProseUnits,
  queueTaskId,
  queueTaskSchema,
  refreshQueueJournal,
  type QueueConfig,
  type QueueJournalData,
  type LegacyQueueTaskData,
  type QueueRunState,
  type QueueTaskData,
  type QueueTaskRefresh,
  type StoredQueueTaskData,
  type QueueTaskStatus,
} from '../core/queue/index.js';
import type { NovelWritingCandidateService, WritingCandidateRequest } from './candidate-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { GenerationSettings } from '../llm/port/index.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';

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

export interface QueueStartAtInput extends QueueStartInput {
  /** Required existing chapter selected by the caller. */
  readonly chapterId: string;
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
  /** I105 canonical manual/default owner and three-token freshness gate. */
  readonly sceneOutlineBinding: NovelSceneOutlineBindingService;
  /** A2 生成设置解析（与 I62/I63 同一 owner）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  /** Deterministic lifecycle seam for holding settlement after the terminal
   * journal write; production composition does not provide it. */
  readonly beforeRunCleanup?: (projectId: string) => Promise<void>;
}

interface RunEntry {
  readonly controller: AbortController;
  readonly done: Promise<void>;
  pauseRequested: boolean;
}

const now = (): string => new Date().toISOString();
const nextQueueCandidateId = (taskId: string, attempt: number): string =>
  `cand-${taskId}-${attempt}-${randomUUID()}`;
const isCurrentTask = (task: StoredQueueTaskData): task is QueueTaskData => task.version === 2;
const isLegacyTask = (task: StoredQueueTaskData): task is LegacyQueueTaskData & { version: 1 } => task.version === 1;
const hydrationKey = (projectId: string, taskId: string): string => `${projectId}:${taskId}`;

export function createQueueService(deps: QueueServiceDeps): QueueService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const journals = new Map<string, QueueJournalData>();
  const runs = new Map<string, RunEntry>();
  const runErrors = new Map<string, string>();
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

  const rehydrate = async (projectId: string, task: QueueTaskData): Promise<void> => {
    const key = hydrationKey(projectId, task.id);
    if (hydrated.has(key)) return;
    const candidate = task.candidate;
    const settings = task.settings;
    if (candidate === null || settings === null) {
      throw new Error(`队列任务 ${task.id} 候选数据缺失（账本损坏），请重试该任务`);
    }
    await deps.sceneOutlineBinding.assertQueueTargetFresh(projectId, task.targetSnapshot);
    await deps.writing.registerRecoveredCandidate(candidate, { card: task.card, navigation: task.navigation, settings, targetSnapshot: task.targetSnapshot });
    hydrated.add(key);
  };

  /** Explicit pre-I105 recovery. Active rows upgrade only through a fresh,
   * exactly-one-chapter canonical resolution; legacy candidates fail closed. */
  const migrateLegacyTasks = async (projectId: string): Promise<void> => {
    const journal = await load(projectId);
    const migratable = journal.tasks.filter((task): task is LegacyQueueTaskData & { version: 1 } => isLegacyTask(task) && (task.status === 'queued' || task.status === 'running'));
    const legacyCandidates = journal.tasks.filter((task): task is LegacyQueueTaskData & { version: 1 } => isLegacyTask(task) && task.status === 'candidate-ready');
    if (migratable.length === 0 && legacyCandidates.length === 0) return;

    const failLegacy = (task: LegacyQueueTaskData & { version: 1 }, message: string): void => {
      task.status = 'failed';
      task.candidateId = null;
      task.candidate = null;
      task.settings = null;
      task.error = message;
      task.updatedAt = now();
    };
    for (const task of legacyCandidates) {
      failLegacy(task, 'Legacy candidate cannot reconstruct generation-time target fingerprints; retry with an explicit chapter.');
    }

    if (migratable.length > 0) {
      const chapters = await deps.text.listChapters(projectId);
      if (chapters.length !== 1) {
        for (const task of migratable) failLegacy(task, `Legacy queue recovery requires exactly one existing chapter; found ${chapters.length}.`);
      } else {
        try {
          // Resolve every legacy card in one owner capture before changing any
          // row, so migration cannot mix C5/B5/binding revisions.
          const targets = await deps.sceneOutlineBinding.resolveQueueTargets(projectId, chapters[0].id, migratable.map((task) => task.cardId));
          const targetByCard = new Map(targets.map((target) => [target.card.detailBeat.id, target]));
          const upgrades = migratable.map((task) => {
            const target = targetByCard.get(task.cardId);
            if (target === undefined) throw new Error(`Missing resolved legacy queue card: ${task.cardId}`);
            return queueTaskSchema.parse({
              ...task,
              version: 2,
              id: queueTaskId(target.sceneId),
              chapterId: target.chapterId,
              sceneId: target.sceneId,
              status: target.occupied ? 'completed' : task.status,
              targetSnapshot: target.targetSnapshot,
            });
          });
          for (const upgrade of upgrades) {
            const index = journal.tasks.findIndex((task) => !isCurrentTask(task) && task.cardId === upgrade.cardId && (task.status === 'queued' || task.status === 'running'));
            if (index < 0) throw new Error(`Legacy queue task disappeared during migration: ${upgrade.cardId}`);
            journal.tasks[index] = upgrade;
          }
        } catch (error) {
          const message = `Legacy queue recovery failed: ${error instanceof Error ? error.message : String(error)}`;
          for (const task of migratable) failLegacy(task, message);
        }
      }
    }
    await persist(projectId);
  };

  const projectSceneContents = async (projectId: string): Promise<ReadonlyMap<string, string>> => {
    const chapters = await deps.text.listChapters(projectId);
    const scenes = new Map<string, string>();
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) {
        if (scenes.has(scene.id)) throw new Error(`Duplicate scene id across project: ${scene.id}`);
        scenes.set(scene.id, scene.content);
      }
    }
    return scenes;
  };

  const occupiedRecovery = (
    task: QueueTaskData,
    scenes: ReadonlyMap<string, string>,
  ): { readonly status: 'absent' | 'completed' | 'conflict'; readonly error?: string } => {
    const content = scenes.get(task.sceneId);
    if (content === undefined) return { status: 'absent' };
    if (task.status === 'queued') return { status: 'completed' };
    if (task.status === 'candidate-ready' && task.candidate !== null && content === task.candidate.text) {
      return { status: 'completed' };
    }
    return { status: 'conflict', error: `Queue target occupied by conflicting content: ${task.chapterId}/${task.sceneId}` };
  };

  /**
   * 恢复 + 对账（幂等）：stale running→queued、stale running runState→idle、
   * 已写正文的任务→completed、candidate-ready 候选 rehydrate 回 I63。
   * 有活动 run 时跳过（loop 拥有状态，避免竞争）。
   */
  const doRecover = async (projectId: string): Promise<void> => {
    if (runs.has(projectId)) return;
    await migrateLegacyTasks(projectId);
    const journal = await load(projectId);
    let changed = false;
    for (const task of journal.tasks) {
      if (!isCurrentTask(task)) continue;
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
    const scenes = await projectSceneContents(projectId);
    for (const task of journal.tasks) {
      if (!isCurrentTask(task) || (task.status !== 'candidate-ready' && task.status !== 'queued')) continue;
      const occupied = occupiedRecovery(task, scenes);
      if (occupied.status === 'completed') {
        assertTaskTransition(task.status, 'completed');
        task.status = 'completed';
        task.error = null;
        task.updatedAt = now();
        changed = true;
        continue;
      }
      try {
        if (occupied.status === 'conflict') throw new Error(occupied.error);
        await deps.sceneOutlineBinding.assertQueueTargetFresh(projectId, task.targetSnapshot);
        if (task.status === 'candidate-ready') {
          // Rehydrate the persisted body; never regenerate after restart.
          await rehydrate(projectId, task);
        }
      } catch (error) {
        assertTaskTransition(task.status, 'failed');
        task.status = 'failed';
        task.candidateId = null;
        task.candidate = null;
        task.settings = null;
        task.error = error instanceof Error ? error.message : String(error);
        task.updatedAt = now();
        changed = true;
      }
    }
    if (changed) await persist(projectId);
  };

  const refreshFromTarget = (
    sourceTaskId: string,
    target: Awaited<ReturnType<NovelSceneOutlineBindingService['resolveQueueTargets']>>[number],
    navigation: Awaited<ReturnType<NovelOutlineService['navigate']>>,
    updatedAt: string,
  ): QueueTaskRefresh => ({
    sourceTaskId,
    chapterId: target.chapterId,
    sceneId: target.sceneId,
    actId: target.card.actId,
    beatId: target.card.beatId,
    card: target.card.detailBeat,
    navigation: {
      ...navigation,
      prerequisites: [...navigation.prerequisites],
      deviationIds: [...navigation.deviationIds],
    },
    targetSnapshot: target.targetSnapshot,
    occupied: target.occupied,
    updatedAt,
  });

  /** Resolve the whole batch before mutating the journal; any stale/unknown/
   * collision error leaves tasks and config untouched. */
  const enqueueAt = async (
    projectId: string,
    chapterId: string,
    cardIds: readonly string[] | undefined,
    allowLegacyFailed = false,
  ): Promise<void> => {
    const targets = await deps.sceneOutlineBinding.resolveQueueTargets(projectId, chapterId, cardIds);
    const navigation = await deps.outline.navigate(projectId);
    const journal = await load(projectId);
    const additions: QueueTaskData[] = [];
    const refreshes: QueueTaskRefresh[] = [];
    const batchCards = new Set<string>();
    const batchTargets = new Set<string>();
    const createdAt = now();
    for (const target of targets) {
      if (batchCards.has(target.card.detailBeat.id)) throw new Error(`Duplicate queue card in resolved batch: ${target.card.detailBeat.id}`);
      const targetKey = `${target.chapterId}\u0000${target.sceneId}`;
      if (batchTargets.has(targetKey)) throw new Error(`Queue target collision in resolved batch: ${target.chapterId}/${target.sceneId}`);
      batchCards.add(target.card.detailBeat.id);
      batchTargets.add(targetKey);

      const sameCard = journal.tasks.find((task) => task.cardId === target.card.detailBeat.id);
      if (sameCard !== undefined) {
        if ((isCurrentTask(sameCard) && (sameCard.status === 'failed' || sameCard.status === 'queued'))
          || (allowLegacyFailed && isLegacyTask(sameCard) && sameCard.status === 'failed')) {
          refreshes.push(refreshFromTarget(sameCard.id, target, navigation, createdAt));
        }
        // Current running/candidate-ready/completed/cancelled rows retain their
        // lifecycle semantics; only explicit startAt reconstructs legacy failed.
        continue;
      }
      additions.push(queueTaskSchema.parse({
        version: 2,
        id: queueTaskId(target.sceneId),
        projectId,
        chapterId: target.chapterId,
        sceneId: target.sceneId,
        actId: target.card.actId,
        beatId: target.card.beatId,
        cardId: target.card.detailBeat.id,
        card: { ...target.card.detailBeat },
        navigation: { ...navigation },
        intent: 'scene-card',
        status: target.occupied ? 'completed' : 'queued',
        candidateId: null,
        attempts: 0,
        error: null,
        budgetUnits: null,
        createdAt,
        updatedAt: createdAt,
        candidate: null,
        settings: null,
        targetSnapshot: target.targetSnapshot,
      }));
    }
    const replacement = refreshQueueJournal(journal, refreshes, additions);
    journal.tasks = replacement.tasks;
  };

  const taskViewOf = (task: StoredQueueTaskData): QueueTaskView => ({
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
      error: runErrors.get(projectId) ?? null,
      tasks: Object.freeze(journal.tasks.map(taskViewOf)),
    });
  };

  /** 是否有排队任务（loop 继续条件）。 */
  const hasQueued = (journal: QueueJournalData): boolean => journal.tasks.some((task) => isCurrentTask(task) && task.status === 'queued');

  /** Explicit start calls may arrive after the old loop persisted a terminal
   * state but before its identity cleanup. Wait for that tracked settlement;
   * only a genuinely running journal preserves merge/idempotent behavior. */
  const hasGenuinelyRunningEntry = async (projectId: string): Promise<boolean> => {
    const run = runs.get(projectId);
    if (run === undefined) return false;
    if ((await load(projectId)).runState === 'running') return true;
    await run.done;
    return false;
  };

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
    let run: RunEntry;
    const done = Promise.resolve()
      .then(() => runLoop(projectId, run))
      .then(async () => { await deps.beforeRunCleanup?.(projectId); })
      .catch((error: unknown) => {
        // Infrastructure failures are process-local status only: a catch here
        // must not recursively attempt the journal write that just failed.
        const message = error instanceof Error ? error.message : String(error);
        runErrors.set(projectId, message.slice(0, 1_000));
      })
      .finally(() => {
        if (runs.get(projectId) === run) runs.delete(projectId);
      });
    run = { controller: new AbortController(), pauseRequested: false, done };
    runErrors.delete(projectId);
    runs.set(projectId, run);
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
      const task = journal.tasks.find((item): item is QueueTaskData => isCurrentTask(item) && item.status === 'queued');
      if (task === undefined) {
        await mutate(projectId, (j) => { j.runState = 'completed'; });
        return;
      }
      const result = await runTask(projectId, task, run);
      if (result === 'aborted' || result === 'stopped-hard' || result === 'stopped-soft' || result === 'stopped-infrastructure') return;
    }
  };

  /** 执行单个任务：标 running → 生成候选（I62，零写）→ 注册 I63 → 预算累计 → 停止策略。 */
  const runTask = async (projectId: string, task: QueueTaskData, run: RunEntry): Promise<'done' | 'aborted' | 'stopped-hard' | 'stopped-soft' | 'stopped-infrastructure'> => {
    const occupied = occupiedRecovery(task, await projectSceneContents(projectId));
    if (occupied.status === 'completed') {
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target !== undefined && target.status === 'queued') {
          assertTaskTransition('queued', 'completed');
          target.status = 'completed';
          target.error = null;
          target.updatedAt = now();
        }
      });
      return 'done';
    }
    try {
      await deps.sceneOutlineBinding.assertQueueTargetFresh(projectId, task.targetSnapshot);
    } catch (error) {
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target !== undefined && target.status === 'queued') {
          assertTaskTransition('queued', 'failed');
          target.status = 'failed';
          target.error = error instanceof Error ? error.message : String(error);
          target.updatedAt = now();
        }
      });
      return 'done';
    }
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
    let candidatePersisted = false;
    let registered = false;
    let attemptUnits: number | null = null;
    try {
      const settings = await deps.resolveSettings();
      const request: WritingCandidateRequest = {
        id: nextQueueCandidateId(task.id, task.attempts),
        intent: 'scene-card',
        target: { projectId, chapterId: task.chapterId, sceneId: task.sceneId },
        card: task.card,
        navigation: task.navigation,
        settings,
        signal: run.controller.signal,
      };
      const { candidate } = await deps.candidate.propose(request);
      await deps.sceneOutlineBinding.assertQueueTargetFresh(projectId, task.targetSnapshot);
      const units = countProseUnits(candidate.text);
      attemptUnits = units;
      // Candidate body/settings/snapshot become actionable in one journal replacement.
      // Persist before registration so a crash rehydrates instead of regenerating.
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target !== undefined && isCurrentTask(target)) {
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
      candidatePersisted = true;
      // The journal write is an async boundary: reassert immediately before
      // registration so an actionable candidate never crosses stale owner tokens.
      await deps.sceneOutlineBinding.assertQueueTargetFresh(projectId, task.targetSnapshot);
      await deps.writing.registerRecoveredCandidate(candidate, { card: task.card, navigation: task.navigation, settings, targetSnapshot: task.targetSnapshot });
      registered = true;
      hydrated.add(hydrationKey(projectId, task.id));
      const review = await deps.writing.preview(candidate.id);
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
      const message = error instanceof Error ? error.message : String(error);
      if (registered) {
        // Registration made the persisted candidate actionable. Later preview/
        // stop-policy infrastructure failures must preserve that truth and stop
        // this run instead of orphaning the candidate or advancing the queue.
        await mutate(projectId, (j) => {
          const target = j.tasks.find((item) => item.id === task.id);
          if (target !== undefined && target.status === 'candidate-ready') {
            target.error = message;
            target.updatedAt = now();
          }
          j.runState = 'idle';
        });
        return 'stopped-infrastructure';
      }
      if (candidatePersisted) {
        // The body became durable but registration never succeeded. Roll back
        // the exact attempt atomically and halt so no later task becomes actionable.
        await mutate(projectId, (j) => {
          const target = j.tasks.find((item) => item.id === task.id);
          if (target !== undefined && target.status === 'candidate-ready') {
            assertTaskTransition('candidate-ready', 'failed');
            target.status = 'failed';
            target.candidateId = null;
            target.candidate = null;
            target.settings = null;
            target.budgetUnits = null;
            target.error = message;
            target.updatedAt = now();
          }
          if (attemptUnits !== null) j.consumedUnits = Math.max(0, j.consumedUnits - attemptUnits);
          j.runState = 'idle';
        });
        return 'stopped-infrastructure';
      }
      if (run.controller.signal.aborted) {
        // 取消/dispose：任务回到 queued（零写，重跑安全），runState → idle。
        await mutate(projectId, (j) => {
          const target = j.tasks.find((item) => item.id === task.id);
          if (target !== undefined && target.status === 'running') {
            assertTaskTransition('running', 'queued');
            target.status = 'queued';
            target.updatedAt = now();
          }
          j.runState = 'idle';
        });
        return 'aborted';
      }
      // Before candidate-ready persistence, retain the existing running retry
      // policy. A failed journal write may have mutated the cached object; first
      // restore its pre-write running shape and undo only this attempt's units.
      const journal = await load(projectId);
      const current = journal.tasks.find((item) => item.id === task.id);
      const attempts = current?.attempts ?? task.attempts;
      await mutate(projectId, (j) => {
        const target = j.tasks.find((item) => item.id === task.id);
        if (target === undefined) return;
        if (target.status === 'candidate-ready') {
          target.status = 'running';
          target.candidateId = null;
          target.candidate = null;
          target.settings = null;
          target.budgetUnits = null;
          if (attemptUnits !== null) j.consumedUnits = Math.max(0, j.consumedUnits - attemptUnits);
        }
        if (target.status === 'running' && attempts > j.config.maxRetries) {
          assertTaskTransition('running', 'failed');
          target.status = 'failed';
          target.error = message;
        } else if (target.status === 'running') {
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
        const chapters = await deps.text.listChapters(projectId);
        if (chapters.length !== 1) {
          throw new Error(`Legacy start requires exactly one existing chapter; found ${chapters.length}. Use startAt with an explicit chapter.`);
        }
        await enqueueAt(projectId, chapters[0].id, input.cardIds);
        const journal = await load(projectId);
        journal.config = {
          wordBudget: input.wordBudget !== undefined ? input.wordBudget : journal.config.wordBudget,
          maxRetries: input.maxRetries !== undefined ? input.maxRetries : journal.config.maxRetries,
          stopOnSoftWarnings: input.stopOnSoftWarnings !== undefined ? input.stopOnSoftWarnings : journal.config.stopOnSoftWarnings,
        };
        await persist(projectId);
      }
      if (await hasGenuinelyRunningEntry(projectId)) return statusView(projectId);
      return beginRun(projectId);
    },
    async startAt(projectId: string, input: QueueStartAtInput) {
      await openProject(projectId);
      await enqueueAt(projectId, input.chapterId, input.cardIds, true);
      const journal = await load(projectId);
      journal.config = {
        wordBudget: input.wordBudget !== undefined ? input.wordBudget : journal.config.wordBudget,
        maxRetries: input.maxRetries !== undefined ? input.maxRetries : journal.config.maxRetries,
        stopOnSoftWarnings: input.stopOnSoftWarnings !== undefined ? input.stopOnSoftWarnings : journal.config.stopOnSoftWarnings,
      };
      await persist(projectId);
      if (await hasGenuinelyRunningEntry(projectId)) return statusView(projectId);
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
      const journal = await load(projectId);
      const existing = journal.tasks.find((task) => task.id === taskId);
      if (existing !== undefined && !isCurrentTask(existing)) throw new Error('Legacy failed task must be restarted with startAt; fingerprints cannot be reconstructed by retry.');
      if (existing === undefined || (existing.status !== 'failed' && existing.status !== 'candidate-ready')) return statusView(projectId);
      const observed = Object.freeze({
        id: existing.id,
        cardId: existing.cardId,
        chapterId: existing.chapterId,
        sceneId: existing.sceneId,
        status: existing.status,
        candidateId: existing.candidateId,
      });

      // Target/navigation resolution and old-candidate rejection may await other
      // owners. They intentionally happen before the final journal transform.
      const targets = await deps.sceneOutlineBinding.resolveQueueTargets(projectId, observed.chapterId, [observed.cardId]);
      const navigation = await deps.outline.navigate(projectId);
      const target = targets[0];
      if (targets.length !== 1 || target === undefined || target.card.detailBeat.id !== observed.cardId) {
        throw new Error(`Queue retry did not resolve exactly one matching card: ${observed.cardId}`);
      }
      if (observed.status === 'candidate-ready') {
        if (observed.candidateId === null) throw new Error(`Queue candidate-ready task has no candidate id: ${observed.id}`);
        const rejected = await deps.writing.adjudicate(observed.candidateId, 'reject');
        if (rejected.status !== 'rejected') {
          throw new Error(`Queue retry requires rejected old candidate ${observed.candidateId}; received ${rejected.status}`);
        }
      }
      await mutate(projectId, (current) => {
        const live = current.tasks.find((task) => task.id === observed.id);
        if (live === undefined || !isCurrentTask(live)) throw new Error(`Queue retry source disappeared: ${observed.id}`);
        // A duplicate retry that observes the already-refreshed row is an
        // idempotent no-op. Any other identity/status drift fails closed.
        if (live.status === 'queued' && live.candidateId === null && live.cardId === observed.cardId) return;
        if (live.cardId !== observed.cardId
          || live.chapterId !== observed.chapterId
          || live.sceneId !== observed.sceneId
          || live.status !== observed.status
          || live.candidateId !== observed.candidateId) {
          throw new Error(`Queue retry source changed concurrently: ${observed.id}`);
        }
        const replacement = refreshQueueJournal(current, [refreshFromTarget(live.id, target, navigation, now())]);
        current.tasks = replacement.tasks;
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
  /** Additive explicit-chapter queue entry; public result remains QueueStatusView. */
  startAt(projectId: string, input: QueueStartAtInput): Promise<QueueStatusView>;
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
