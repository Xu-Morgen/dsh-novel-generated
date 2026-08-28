import type { El, QueueNamespace, WorkspaceNamespace } from '../shared.js';

/**
 * I65 可恢复自动生成队列面板（design §14.9「可恢复自动生成队列」/ R13-6）。
 *
 * 队列由 Host 持有、按场景卡（B5 detailBeat）范围顺序执行：每个任务生成一张
 * 场景卡的候选并停在「待裁决」（candidate-ready）——作者在 I63 候选审阅面板
 * accept/reject/rewrite，队列绝不自动接受候选、绝不静默改 B5/C6。
 *
 * 面板能力（全部经 Host `novelQueue` Remote）：
 * - 范围与配置：场景卡勾选（来源 workspace.outlineBeatCards）、字数预算
 *   `data-novel-queue-budget`（空 = 不限）、重试次数 `data-novel-queue-retries`、
 *   软警告停止策略 `data-novel-queue-soft-stop`；
 * - 控制：开始/继续 `data-novel-queue-start`、暂停 `data-novel-queue-pause`、
 *   继续 `data-novel-queue-resume`、取消 `data-novel-queue-cancel`（全部幂等，
 *   由 Host 状态机裁决；运行中轮询 `data-novel-queue-status`）；
 * - 任务列表：每卡独立任务（状态徽标 + 场景 id + 尝试次数 + 错误），失败任务
 *   可「重试」`data-novel-queue-retry`；candidate-ready 任务提示去正文面板裁决。
 *
 * 契约与不变式：
 * - Client 只持有最小 owned JSON 投影（无候选正文、无 live object、无文件路径）；
 * - 面板状态机：idle → loading → ready / error；控制按钮按 runState 禁用，
 *   双击由 store 侧 inflight 去重（至多一次 Remote）。
 */

export interface QueueCardShape {
  readonly actId: string;
  readonly beatId: string;
  readonly id: string;
  readonly title: string;
  readonly pov: string;
  readonly wordTarget: number;
  readonly status: string;
}

export interface QueueTaskShape {
  readonly id: string;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly cardTitle: string;
  readonly cardPov: string;
  readonly status: 'queued' | 'running' | 'candidate-ready' | 'failed' | 'cancelled' | 'completed';
  readonly candidateId: string | null;
  readonly attempts: number;
  readonly error: string | null;
  readonly budgetUnits: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueStatusShape {
  readonly projectId: string;
  readonly runState: 'idle' | 'running' | 'paused' | 'stopped-hard' | 'stopped-soft' | 'budget-exhausted' | 'completed';
  readonly config: { readonly wordBudget: number | null; readonly maxRetries: number; readonly stopOnSoftWarnings: boolean };
  readonly consumedUnits: number;
  readonly updatedAt: string;
  readonly error: string | null;
  readonly tasks: readonly QueueTaskShape[];
}

export interface QueueStartInputShape {
  // I91：与 wire `queueStartInputSchema` 对齐（z.array 输出可变数组；readonly 会拒绝写回）。
  readonly cardIds?: string[];
  readonly wordBudget?: number | null;
  readonly maxRetries?: number;
  readonly stopOnSoftWarnings?: boolean;
}

export interface QueueLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly projection?: QueueStatusShape;
  /** 场景卡范围（B5 outline beatCards 投影；勾选决定下一次 start 的范围）。 */
  readonly cards: readonly QueueCardShape[];
  readonly selectedCardIds: readonly string[];
  /** 字数预算草稿（'' = 不限）。 */
  readonly wordBudget: string;
  /** 重试次数草稿。 */
  readonly maxRetries: string;
  readonly stopOnSoftWarnings: boolean;
  readonly acting: boolean;
}

export interface QueueEditOps {
  /** 装载场景卡 + 队列状态投影（惰性恢复）。 */
  refresh(): void;
  toggleCard(cardId: string): void;
  setBudget(value: string): void;
  setRetries(value: string): void;
  toggleSoftStop(): void;
  /** 以当前勾选范围与配置开始/继续 run。 */
  start(): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  retry(taskId: string): void;
  dismiss(): void;
}

export function freshQueue(): QueueLayerState {
  return {
    status: 'idle',
    cards: [],
    selectedCardIds: [],
    wordBudget: '',
    maxRetries: '0',
    stopOnSoftWarnings: false,
    acting: false,
  };
}

export const QUEUE_RUN_STATE_LABELS: Readonly<Record<string, string>> = {
  idle: '空闲',
  running: '生成中',
  paused: '已暂停',
  'stopped-hard': '已停止（硬冲突）',
  'stopped-soft': '已停止（软警告）',
  'budget-exhausted': '预算已耗尽',
  completed: '已完成',
};

export const QUEUE_TASK_STATUS_LABELS: Readonly<Record<string, string>> = {
  queued: '排队中',
  running: '生成中',
  'candidate-ready': '待裁决',
  failed: '失败',
  cancelled: '已取消',
  completed: '已完成',
};

function queueCardRow(h: El, card: QueueCardShape, selected: boolean, ops: QueueEditOps): unknown {
  return h('label', { className: 'nv-queue__card', 'data-novel-queue-card': card.id },
    h('input', {
      type: 'checkbox',
      'data-novel-queue-card-check': card.id,
      checked: selected,
      onChange: () => ops.toggleCard(card.id),
    }),
    h('span', { className: 'nv-queue__card-title' }, card.title),
    h('span', { className: 'nv-queue__card-meta' }, `POV ${card.pov} · 目标 ${card.wordTarget} · ${card.status}`),
  );
}

function queueTaskRow(h: El, task: QueueTaskShape, ops: QueueEditOps): unknown {
  const status = task.status;
  return h('li', { className: `nv-queue__task nv-queue__task--${status}`, 'data-novel-queue-task': task.id, 'data-novel-queue-task-status': status },
    h('div', { className: 'nv-queue__task-main' },
      h('span', { className: 'nv-queue__task-title', 'data-novel-queue-task-card': '' }, task.cardTitle),
      h('span', { className: 'nv-queue__badge nv-queue__badge--' + status, 'data-novel-queue-task-badge': status }, QUEUE_TASK_STATUS_LABELS[status] ?? status),
    ),
    h('p', { className: 'nv-queue__task-meta', 'data-novel-queue-task-meta': '' },
      `场景 ${task.sceneId} · 尝试 ${task.attempts}`,
      task.budgetUnits === null ? '' : ` · ${task.budgetUnits} 单位`,
      status === 'candidate-ready' ? ' · 请在正文面板裁决该候选' : '',
    ),
    task.error === null ? null : h('p', { className: 'nv-queue__task-error', 'data-novel-queue-task-error': '' }, task.error),
    status === 'failed'
      ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-retry': task.id, onClick: () => ops.retry(task.id) }, '重试')
      : null,
  );
}

/**
 * 生成队列面板。状态机：idle → loading → ready / error。ready 后渲染控制按钮
 * （按 runState 禁用）、范围/配置表单与任务列表。
 */
export function queuePanel(h: El, projectId: string, queue: QueueNamespace | undefined, workspace: WorkspaceNamespace | undefined, state: QueueLayerState, ops: QueueEditOps): unknown {
  const available = queue !== undefined && workspace !== undefined && projectId !== undefined;
  const busy = state.acting || state.status === 'loading';
  const runState = state.projection?.runState ?? 'idle';
  const running = runState === 'running';
  const paused = runState === 'paused';
  let body: unknown;
  if (!available) {
    body = h('p', { className: 'nv-queue__hint', 'data-novel-queue-unavailable': '' }, '生成队列服务不可用（novelQueue Remote 未挂载）。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-queue__hint', 'data-novel-queue-loading': '', role: 'status', 'aria-live': 'polite' }, '正在装载生成队列…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-queue__error', 'data-novel-queue-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', { 'data-novel-queue-error-text': '' }, state.message ?? '队列状态读取失败'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-refresh': '', onClick: () => ops.refresh() }, '重试'),
    );
  } else {
    const projection = state.projection;
    const summary = projection === undefined
      ? '尚未运行。勾选场景卡并设置预算/重试/停止策略后点击「开始生成」。'
      : `运行态：${QUEUE_RUN_STATE_LABELS[runState] ?? runState} · 已消耗 ${projection.consumedUnits}${projection.config.wordBudget === null ? ' 单位（未设预算）' : ` / ${projection.config.wordBudget} 单位`} · 任务 ${projection.tasks.length}`;
    const tasks = projection?.tasks ?? [];
    const cards = state.cards;
    body = h('div', { className: 'nv-queue__ready', 'data-novel-queue-ready': '' },
      h('p', { className: 'nv-queue__summary', 'data-novel-queue-summary': '', role: 'status', 'aria-live': 'polite' }, summary),
      // 控制：开始/继续、暂停、继续、取消（Host 状态机保证幂等）。
      h('div', { className: 'nv-editor__actions', 'data-novel-queue-controls': '' },
        h('button', {
          type: 'button',
          className: 'nv-btn nv-btn--primary',
          'data-novel-queue-start': '',
          disabled: busy || running,
          onClick: () => ops.start(),
        }, running ? '生成中…' : (paused || runState === 'stopped-hard' || runState === 'stopped-soft' || runState === 'budget-exhausted' ? '继续生成' : '开始生成')),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-pause': '', disabled: busy || !running, onClick: () => ops.pause() }, '暂停'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-resume': '', disabled: busy || !paused, onClick: () => ops.resume() }, '继续'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-cancel': '', disabled: busy || (!running && !paused), onClick: () => ops.cancel() }, '取消'),
      ),
      // 范围与配置（勾选范围决定下一次 start；空勾选 = 全部场景卡）。
      h('details', { className: 'nv-queue__config', 'data-novel-queue-config': '', open: true },
        h('summary', { 'data-novel-queue-config-summary': '' }, '范围与配置'),
        h('div', { className: 'nv-queue__cards', 'data-novel-queue-cards': '' },
          cards.length === 0
            ? h('p', { className: 'nv-queue__empty', 'data-novel-queue-cards-empty': '' }, '尚无场景卡（先在大纲中建立细纲场景卡）。')
            : cards.map((card) => queueCardRow(h, card, state.selectedCardIds.includes(card.id), ops)),
        ),
        h('div', { className: 'nv-queue__options' },
          h('label', { className: 'nv-field' },
            h('span', { className: 'nv-field__label' }, '字数预算（写作单位，留空 = 不限）'),
            h('input', { type: 'number', min: 1, className: 'nv-field__input', 'data-novel-queue-budget': '', value: state.wordBudget, onChange: (event: { target: { value: string } }) => ops.setBudget(event.target.value) }),
          ),
          h('label', { className: 'nv-field' },
            h('span', { className: 'nv-field__label' }, '失败重试次数'),
            h('input', { type: 'number', min: 0, className: 'nv-field__input', 'data-novel-queue-retries': '', value: state.maxRetries, onChange: (event: { target: { value: string } }) => ops.setRetries(event.target.value) }),
          ),
          h('label', { className: 'nv-queue__option' },
            h('input', { type: 'checkbox', 'data-novel-queue-soft-stop': '', checked: state.stopOnSoftWarnings, onChange: () => ops.toggleSoftStop() }),
            h('span', null, '遇软警告停止（默认继续；硬冲突始终立即停止）'),
          ),
        ),
      ),
      // 任务列表（每卡一个独立候选任务；candidate-ready = 停在待裁决）。
      tasks.length === 0
        ? h('p', { className: 'nv-queue__empty', 'data-novel-queue-tasks-empty': '' }, '尚无队列任务。')
        : h('ul', { className: 'nv-queue__tasks', 'data-novel-queue-tasks': '' }, tasks.map((task) => queueTaskRow(h, task, ops))),
    );
  }
  return h('section', { className: 'nv-queue', 'data-novel-queue-panel': '', 'data-novel-queue-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '生成队列'),
    h('p', { className: 'nv-queue__hint', 'data-novel-queue-desc': '' }, '按场景卡范围批量生成候选：每张卡独立生成并停在待裁决（正文面板裁决），绝不自动接受。'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-queue-refresh': '', disabled: busy, onClick: () => ops.refresh() }, '刷新'),
    ),
    body,
  );
}
