import type { El } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { StatisticsNamespace } from '../shared.js';
import type { EntityOption } from '../entity-selectors.js';

/**
 * I72 写作进度面板 Client（design §14.10「写作进度」/ R14-7）。
 *
 * 职责与不变式：
 * - 只经 Host `novelStatistics` Remote 提交受控命令：重建/删除派生统计、概览、
 *   章节详情、场景卡筛选、任务历史；Client 不持有任何领域真相、文件路径或
 *   统计副本（统计是派生视图，可删除重建，非第二真相）。
 * - 概览/行都是 Host 的有界最小 owned JSON；「大规模作品视图」只渲染有界行 +
 *   总数，不做任何本地聚合。
 * - 空作品视图：`overview.empty` 时明确提示「空作品，统计为零」，不显示假进度。
 * - 本模块不导入 core 或 zod（Client bundle 负向扫描：无领域 fallback）。
 */

export interface StatisticsStatsShape {
  readonly indexExists: boolean;
  readonly builtAt?: string;
  readonly counts: { readonly chapters: number; readonly scenes: number; readonly cards: number; readonly tasks: number };
}

export interface ChapterRowShape {
  readonly chapterId: string;
  readonly index: number;
  readonly title: string;
  readonly pov: string;
  readonly status: string;
  readonly sceneCount: number;
  readonly units: number;
  readonly chars: number;
}

export interface StatisticsOverviewShape {
  readonly empty: boolean;
  readonly chapterCount: number;
  readonly sceneCount: number;
  readonly totalUnits: number;
  readonly totalChars: number;
  readonly cardCount: number;
  readonly totalWordTarget: number;
  readonly cardWrittenUnits: number;
  readonly completionRatio: number;
  readonly beatCount: number;
  readonly completedBeatCount: number;
  readonly beatCompletionRatio: number;
  readonly currentBeat: string | null;
  readonly cardStatusCounts: { readonly planned: number; readonly writing: number; readonly done: number };
  readonly povStats: readonly { readonly pov: string; readonly chapters: number; readonly scenes: number; readonly units: number; readonly chars: number }[];
  readonly cardPovStats: readonly { readonly pov: string; readonly cards: number; readonly wordTarget: number }[];
  readonly queue: {
    readonly runState: string;
    readonly consumedUnits: number;
    readonly taskCounts: { readonly queued: number; readonly running: number; readonly 'candidate-ready': number; readonly failed: number; readonly cancelled: number; readonly completed: number };
    readonly totalTasks: number;
  };
  readonly chapters: readonly ChapterRowShape[];
  readonly acts: readonly { readonly id: string; readonly index: number; readonly title: string; readonly beats: readonly { readonly id: string; readonly title: string }[] }[];
}

export interface SceneCardShape {
  readonly actId: string;
  readonly actIndex: number;
  readonly actTitle: string;
  readonly beatId: string;
  readonly beatTitle: string;
  readonly cardId: string;
  readonly title: string;
  readonly pov: string;
  readonly wordTarget: number;
  readonly status: string;
  readonly sceneId: string;
  readonly writtenUnits: number;
  readonly completionRatio: number;
}

export interface TaskRowShape {
  readonly id: string;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly cardTitle: string;
  readonly cardPov: string;
  readonly status: string;
  readonly attempts: number;
  readonly budgetUnits: number | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SceneCardsResultShape {
  readonly total: number;
  readonly cards: readonly SceneCardShape[];
}

export interface TasksResultShape {
  readonly total: number;
  readonly tasks: readonly TaskRowShape[];
}

export interface ChapterDetailShape {
  readonly chapter: {
    readonly chapterId: string;
    readonly index: number;
    readonly title: string;
    readonly pov: string;
    readonly status: string;
    readonly sceneCount: number;
    readonly units: number;
    readonly chars: number;
    readonly scenes: readonly { readonly sceneId: string; readonly index: number; readonly summary: string; readonly units: number; readonly chars: number }[];
  };
}

/** I101：子工作流独立 busy（review v2.0 §5 / 计划 §18 I101）——概览/详情/筛选/
 * 任务/重建/删除各自独立，互不阻塞（不再共用一个 acting 互锁）。 */
export type StatisticsBusy = Partial<Record<'rebuild' | 'drop' | 'overview' | 'stats' | 'detail' | 'cards' | 'tasks', boolean>>;

export interface StatisticsLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly stats?: StatisticsStatsShape;
  readonly overview?: StatisticsOverviewShape;
  readonly chapterId: string;
  readonly chapterDetail?: ChapterDetailShape;
  readonly cardActId: string;
  readonly cardBeatId: string;
  readonly cardStatus: string;
  readonly sceneCards?: SceneCardsResultShape;
  readonly taskStatus: string;
  readonly tasks?: TasksResultShape;
  readonly busy: StatisticsBusy;
}

export interface StatisticsEditOps {
  setCardAct(value: string): void;
  setCardBeat(value: string): void;
  setCardStatus(value: string): void;
  setTaskStatus(value: string): void;
  selectChapter(value: string): void;
  refreshOverview(): void;
  refreshStats(): void;
  /** 从 C5/B5/C6/任务记录 live source-of-truth 重建派生统计（零写结构层）。 */
  rebuild(): void;
  /** 删除派生统计（删除后可重建）。 */
  drop(): void;
  dismiss(): void;
}

export function freshStatistics(): StatisticsLayerState {
  return { status: 'idle', chapterId: '', cardActId: '', cardBeatId: '', cardStatus: '', taskStatus: '', busy: {} };
}

export const STATISTICS_TASK_STATUS_LABELS: Readonly<Record<string, string>> = {
  queued: '排队中', running: '生成中', 'candidate-ready': '待裁决', failed: '失败', cancelled: '已取消', completed: '已完成',
};
export const STATISTICS_CARD_STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: '计划', writing: '写作中', done: '已完成',
};

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function progressBar(h: El, ratio: number, testId: string): unknown {
  return h('div', { className: 'nv-statistics__bar', 'data-novel-statistics-bar': testId },
    h('div', { className: 'nv-statistics__bar-fill', style: { width: `${Math.min(100, Math.max(0, ratio * 100))}%` } }));
}

export function statisticsPanel(h: El, projectId: string, namespace: StatisticsNamespace | undefined, state: StatisticsLayerState, ops: StatisticsEditOps, characterOptions: readonly EntityOption[] = []): unknown {
  const characterName = (id: string): string => characterOptions.find((option) => option.id === id)?.label ?? (id === '' ? '未指定' : '引用已缺失');
  const available = namespace !== undefined && projectId !== undefined;
  const stats = state.stats;
  const statsLine = stats === undefined
    ? null
    : h('p', { className: 'nv-statistics__stats', 'data-novel-statistics-stats': '' },
      stats.indexExists
        ? `派生统计已构建：章节 ${stats.counts.chapters} · 场景 ${stats.counts.scenes} · 场景卡 ${stats.counts.cards} · 任务 ${stats.counts.tasks}（可删除重建，非第二真相）`
        : '派生统计未构建（可随时重建，不写任何结构层）。');

  const overview = state.overview;
  const overviewBlock = overview === undefined
    ? null
    : overview.empty
      ? h('div', { className: 'nv-statistics__empty', 'data-novel-statistics-empty': '' },
        '空作品视图：暂无正文、大纲与任务记录，全部统计为零 —— 不视为进度（可先创建章节或规划大纲）。')
      : [
          h('div', { className: 'nv-statistics__totals', 'data-novel-statistics-totals': '' },
            `正文：${overview.chapterCount} 章 / ${overview.sceneCount} 场景，共 ${overview.totalUnits} 字（写作单位，含 ${overview.totalChars} 字符）`),
          h('div', { className: 'nv-statistics__completion', 'data-novel-statistics-completion': '' },
            h('p', { 'data-novel-statistics-completion-text': '' }, `目标完成度：${overview.cardWrittenUnits} / ${overview.totalWordTarget} 字（${overview.cardCount} 张场景卡）→ ${formatRatio(overview.completionRatio)}`),
            progressBar(h, overview.completionRatio, 'completion'),
            h('p', { 'data-novel-statistics-beat-completion-text': '' }, `节完成度：${overview.completedBeatCount} / ${overview.beatCount} 节 → ${formatRatio(overview.beatCompletionRatio)}${overview.currentBeat === null ? '' : `（当前节 ${overview.currentBeat}）`}`),
            progressBar(h, overview.beatCompletionRatio, 'beat'),
          ),
          h('div', { className: 'nv-statistics__cards', 'data-novel-statistics-cards': '' },
            `场景卡状态：计划 ${overview.cardStatusCounts.planned} · 写作中 ${overview.cardStatusCounts.writing} · 已完成 ${overview.cardStatusCounts.done}`),
          h('div', { className: 'nv-statistics__pov', 'data-novel-statistics-pov': '' },
            h('span', { className: 'nv-statistics__pov-title' }, '视角分布（已写字数）'),
            overview.povStats.length === 0
              ? h('span', {}, '（暂无正文）')
              : h('ul', {},
                overview.povStats.map((stat) => h('li', { key: stat.pov, 'data-novel-statistics-pov-row': stat.pov },
                  `${characterName(stat.pov)}：${stat.units} 字 · ${stat.scenes} 场景 · ${stat.chapters} 章`))),
            overview.cardPovStats.length === 0 ? null : h('p', { className: 'nv-statistics__pov-note', 'data-novel-statistics-card-pov': '' },
              `场景卡目标分布：${overview.cardPovStats.map((stat) => `${characterName(stat.pov)} ${stat.wordTarget} 字`).join(' · ')}`),
          ),
          h('div', { className: 'nv-statistics__queue', 'data-novel-statistics-queue': '' },
            `生成队列：${overview.queue.runState} · 已消耗 ${overview.queue.consumedUnits} 字预算 · 任务 ${overview.queue.totalTasks} 个（排队 ${overview.queue.taskCounts.queued} / 生成中 ${overview.queue.taskCounts.running} / 待裁决 ${overview.queue.taskCounts['candidate-ready']} / 失败 ${overview.queue.taskCounts.failed} / 已取消 ${overview.queue.taskCounts.cancelled} / 已完成 ${overview.queue.taskCounts.completed}）`),
          h('div', { className: 'nv-statistics__chapters', 'data-novel-statistics-chapters': '' },
            h('span', { className: 'nv-statistics__subtitle' }, `章节字数（显示前 ${overview.chapters.length} 行，共 ${overview.chapterCount} 章）`),
            overview.chapters.length === 0
              ? h('p', { 'data-novel-statistics-chapter-empty': '' }, '暂无章节。')
              : h('ul', {},
                overview.chapters.map((chapter) => h('li', { key: chapter.chapterId, 'data-novel-statistics-chapter': chapter.chapterId },
                  h('span', { className: 'nv-statistics__chapter-main' },
                    `第 ${chapter.index} 章 ${chapter.title}（${characterName(chapter.pov)}）· ${chapter.units} 字 / ${chapter.sceneCount} 场景`),
                  h('button', {
                    type: 'button', className: 'nv-btn nv-btn--small', 'data-novel-statistics-chapter-select': chapter.chapterId,
                    disabled: state.busy.detail === true, onClick: () => ops.selectChapter(chapter.chapterId),
                  }, state.chapterId === chapter.chapterId ? '已选' : '详情'),
                ))),
          ),
          h('h4', { className: 'nv-statistics__subtitle' }, '章节场景明细'),
          h('div', { className: 'nv-statistics__chapter-detail', 'data-novel-statistics-chapter-detail': '' },
            state.chapterDetail === undefined
              ? h('p', { 'data-novel-statistics-chapter-detail-empty': '' }, '选择上方章节查看场景字数明细。')
              : h('ul', {},
                state.chapterDetail.chapter.scenes.map((scene) => h('li', { key: scene.sceneId, 'data-novel-statistics-scene': scene.sceneId },
                  `场景 ${scene.index + 1} ${scene.summary}：${scene.units} 字`)))),
          h('h4', { className: 'nv-statistics__subtitle' }, '场景卡状态（筛选）'),
          h('div', { className: 'nv-statistics__filters' },
            h('label', { className: 'nv-field nv-statistics__filter' },
              h('span', { className: 'nv-field__label' }, '幕'),
              h('select', { className: 'nv-field__input', 'data-novel-statistics-card-act': '', value: state.cardActId, disabled: state.busy.cards === true, onChange: (event: { target: { value: string } }) => ops.setCardAct(event.target.value) },
                h('option', { value: '' }, '全部'),
                overview.acts.map((act) => h('option', { key: act.id, value: act.id }, `第 ${act.index + 1} 幕 ${act.title}`)))),
            h('label', { className: 'nv-field nv-statistics__filter' },
              h('span', { className: 'nv-field__label' }, '节'),
              h('select', { className: 'nv-field__input', 'data-novel-statistics-card-beat': '', value: state.cardBeatId, disabled: state.busy.cards === true, onChange: (event: { target: { value: string } }) => ops.setCardBeat(event.target.value) },
                h('option', { value: '' }, '全部'),
                (overview.acts.find((act) => act.id === state.cardActId)?.beats ?? overview.acts.flatMap((act) => act.beats)).map((beat) => h('option', { key: beat.id, value: beat.id }, beat.title)))),
            h('label', { className: 'nv-field nv-statistics__filter' },
              h('span', { className: 'nv-field__label' }, '状态'),
              h('select', { className: 'nv-field__input', 'data-novel-statistics-card-status': '', value: state.cardStatus, disabled: state.busy.cards === true, onChange: (event: { target: { value: string } }) => ops.setCardStatus(event.target.value) },
                h('option', { value: '' }, '全部'),
                Object.entries(STATISTICS_CARD_STATUS_LABELS).map(([value, label]) => h('option', { key: value, value }, label)))),
          ),
          state.sceneCards === undefined
            ? null
            : h('div', { className: 'nv-statistics__card-results', 'data-novel-statistics-card-results': '' },
              h('p', { className: 'nv-statistics__result-count', 'data-novel-statistics-card-total': '' },
                `场景卡 ${state.sceneCards.total} 张${state.sceneCards.total > state.sceneCards.cards.length ? `（显示前 ${state.sceneCards.cards.length} 张）` : ''}`),
              state.sceneCards.total === 0
                ? h('p', { 'data-novel-statistics-card-empty': '' }, '无匹配场景卡。')
                : h('ul', {},
                  state.sceneCards.cards.map((card) => h('li', { key: card.cardId, 'data-novel-statistics-card': card.cardId },
                    `${card.actTitle} / ${card.beatTitle} / ${card.title}（${characterName(card.pov)}）· 目标 ${card.wordTarget} 字 · 已写 ${card.writtenUnits} 字 → ${formatRatio(card.completionRatio)} · ${STATISTICS_CARD_STATUS_LABELS[card.status] ?? '无法识别的场景状态'}`)))),
          h('h4', { className: 'nv-statistics__subtitle' }, '任务历史（筛选）'),
          h('div', { className: 'nv-statistics__filters' },
            h('label', { className: 'nv-field nv-statistics__filter' },
              h('span', { className: 'nv-field__label' }, '状态'),
              h('select', { className: 'nv-field__input', 'data-novel-statistics-task-status': '', value: state.taskStatus, disabled: state.busy.tasks === true, onChange: (event: { target: { value: string } }) => ops.setTaskStatus(event.target.value) },
                h('option', { value: '' }, '全部'),
                Object.entries(STATISTICS_TASK_STATUS_LABELS).map(([value, label]) => h('option', { key: value, value }, label)))),
          ),
          state.tasks === undefined
            ? null
            : h('div', { className: 'nv-statistics__task-results', 'data-novel-statistics-task-results': '' },
              h('p', { className: 'nv-statistics__result-count', 'data-novel-statistics-task-total': '' },
                `任务 ${state.tasks.total} 个${state.tasks.total > state.tasks.tasks.length ? `（显示前 ${state.tasks.tasks.length} 个）` : ''}`),
              state.tasks.total === 0
                ? h('p', { 'data-novel-statistics-task-empty': '' }, '无任务记录。')
                : h('ul', {},
                  state.tasks.tasks.map((task) => h('li', { key: task.id, 'data-novel-statistics-task': task.id },
                    `${task.cardTitle}（${characterName(task.cardPov)}）· ${STATISTICS_TASK_STATUS_LABELS[task.status] ?? '无法识别的任务状态'} · 尝试 ${task.attempts} 次 · 消耗 ${task.budgetUnits ?? 0} 字${task.error === null ? '' : ` · ${toUserMessage(task.error)}`} · ${task.updatedAt.slice(0, 10)}`)))),
        ];

  return h('section', { className: 'nv-statistics', 'data-novel-statistics-panel': '', 'data-novel-statistics-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '写作进度面板'),
    available ? [
      statsLine,
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-statistics-rebuild': '', disabled: state.busy.rebuild === true, onClick: () => ops.rebuild() }, '重建统计'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-statistics-drop': '', disabled: state.busy.drop === true || !(state.stats?.indexExists ?? false), onClick: () => ops.drop() }, '删除统计'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-statistics-refresh': '', disabled: state.busy.overview === true, onClick: () => ops.refreshOverview() }, '刷新概览'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-statistics-stats': '', disabled: state.busy.stats === true, onClick: () => ops.refreshStats() }, '刷新状态'),
      ),
      overviewBlock,
      state.message === undefined ? null : h('p', { className: 'nv-statistics__message', 'data-novel-statistics-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    ] : h('p', { className: 'nv-statistics__hint', 'data-novel-statistics-unavailable': '' }, '写作进度暂时不可用，请稍后重试。'),
  );
}
