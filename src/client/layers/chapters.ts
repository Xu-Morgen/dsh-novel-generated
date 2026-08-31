import type { El, WorkspaceNamespace, WritingNamespace, BranchNamespace } from '../shared.js';
import type { TextDeletionImpact, TextDeletionTarget } from '../../core/schema/text-deletion.js';
import type { ChapterStatus } from '../../core/schema/text.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import type { OutlineReconciliationChoice, OutlineReconciliationPlan } from '../../core/schema/outline-reconciliation.js';
import type { OutlineReconciliationContinueResult, OutlineReconciliationFinalizeResult } from '../../core/schema/outline-reconciliation-application.js';
import { branchPanel, freshBranchPanel, type BranchPanelState } from './branch.js';
import { candidatePanel, freshCandidatePanel, type CandidatePanelState } from './candidate.js';
import { errorBlock, proseParagraphs } from './chapters-shared.js';
import { freshSceneEditor, sceneEditorPanel, type SceneEditorState } from './scene-editor.js';
import { freshWritingWorkflow, type WritingWorkflowState } from '../writing-workflow.js';

/**
 * I60/I61 C5 章节/场景导航 + 正文编辑面板组合根（design §5.12 / §14.9 / R13-1 /
 * R13-2）。
 *
 * I95 拆分（计划 §18 I95）：本文件只保留章节树类型（Chapter/Scene 投影）、
 * ChaptersLayerState / ChaptersEditOps 合同、freshChapters 与 chaptersPanel
 * 组合；场景编辑（scene-editor.ts）、候选审阅（candidate.ts）、版本分支
 * （branch.ts）与共享渲染辅助（chapters-shared.ts）各归自有切片；外部符号经
 * 本文件兼容重导出。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelWorkspace` Remote；编辑请求始终携带装载时的
 *   `baseHash = sha256(original)`，Host 核对不一致即拒绝（脏文本保护）。
 * - `computeEditRange`（scene-editor.ts）是纯函数：`original` 与 `draft` 的
 *   最小前缀/后缀分解唯一，替换后的文本恒等于 draft（exact round-trip）。
 * - reparse 提案期间锁定草稿（textarea disabled），范围/替换冻结在提案状态里。
 */

export interface ChapterListItemShape { id: string; index: number; title: string; pov: string; status: string; sceneCount: number; [key: string]: unknown; }
export interface SceneSummaryShape { id: string; index: number; summary: string; [key: string]: unknown; }
export interface ChapterReadShape { id: string; index: number; title: string; pov: string; status: string; scenes: SceneSummaryShape[]; [key: string]: unknown; }
export interface SceneReadShape { id: string; index: number; summary: string; content: string; beats: string[]; canonEvents: string[]; notes: string; [key: string]: unknown; }

/**
 * I107 章节工作区唯一可见操作模式（R18-9）。模式只属于 Client 交互态；各模式
 * 复用既有 panel/Remote，不产生新的 Host 真相或顶层 WorkbenchViewId。
 */
export type ChaptersMode = 'writing' | 'candidate' | 'versions' | 'materials';

const CHAPTER_MODE_ITEMS = [
  { id: 'writing', label: '正文', hint: '阅读与编辑当前场景正文' },
  { id: 'candidate', label: '候选', hint: '生成、审阅与裁决候选' },
  { id: 'versions', label: '版本', hint: '管理正文版本与分支' },
  { id: 'materials', label: '素材', hint: '管理章节、场景与细纲绑定' },
] as const satisfies ReadonlyArray<{ id: ChaptersMode; label: string; hint: string }>;

export interface ChapterManagementDraft {
  id: string;
  index: number;
  title: string;
  pov: string;
  status: ChapterStatus;
}

export interface SceneManagementDraft {
  id: string;
  index: number;
  summary: string;
  content: string;
  beats: string[];
  canonEvents: string[];
  notes: string;
}

export type ChapterManagementStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ChapterDeletionStatus = 'idle' | 'loading' | 'ready' | 'blocked' | 'proposing' | 'pending' | 'applying' | 'rejecting' | 'done' | 'stale' | 'error';
export type OutlineReconciliationUiStatus = 'idle' | 'loading' | 'ready' | 'proposing' | 'pending' | 'accepting' | 'rejecting' | 'finalizing' | 'continuing' | 'done' | 'needs-target' | 'blocked-pending' | 'error';
export interface OutlineReconciliationPanelState {
  readonly status: OutlineReconciliationUiStatus;
  readonly planId: string;
  readonly plan?: OutlineReconciliationPlan;
  readonly decisions: Readonly<Record<string, OutlineReconciliationChoice>>;
  readonly manualValues: Readonly<Record<string, DetailBeat>>;
  readonly proposalId?: string;
  readonly finalResult?: OutlineReconciliationFinalizeResult;
  readonly continueResult?: OutlineReconciliationContinueResult;
  readonly message?: string;
}
export interface ChapterManagementState {
  readonly status: ChapterManagementStatus;
  readonly message?: string;
  readonly projectFingerprint?: string;
  readonly chapterDraft: ChapterManagementDraft;
  readonly sceneDraft: SceneManagementDraft;
  readonly bindingDetailBeatId: string;
  readonly binding?: { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly manual: Array<{ sceneId: string; detailBeatId: string }>; readonly effective: Array<{ sceneId: string; detailBeatId: string; chapterId: string; source: 'manual' | 'default' }>; readonly fingerprint?: string; readonly message?: string };
  readonly deletion: { readonly status: ChapterDeletionStatus; readonly target?: TextDeletionTarget; readonly impact?: TextDeletionImpact; readonly proposalId?: string; readonly message?: string };
  /** I114 materials-mode reconciliation state; the plan is a Host-owned read projection. */
  readonly reconciliation: OutlineReconciliationPanelState;
}

export interface ChaptersLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: ChapterListItemShape[];
  readonly message?: string;
  readonly selectedChapterId?: string;
  readonly selectedSceneId?: string;
  /** I107 当前唯一可见模式；模式切换不丢失各 panel 的未保存 Client 草稿。 */
  readonly mode: ChaptersMode;
  /** 导航世代，用于丢弃切场景后晚到的旧候选响应。 */
  readonly navigationRevision: number;
  /** I121 当前“候选→保存→下一场景”交互态；不持久化领域真相。 */
  readonly workflow: WritingWorkflowState;
  /** 已选章节的读取结果（元数据 + 场景摘要）。 */
  readonly chapter: { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly read?: ChapterReadShape; readonly message?: string };
  /** 已选场景的读取结果（唯一携带正文）。 */
  readonly scene: { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly item?: SceneReadShape; readonly message?: string };
  /** I61 正文编辑器状态（每个场景装载时以原文初始化）。 */
  readonly editor: SceneEditorState;
  /** I63 候选审阅面板（生成后裁决；正文/diff/校验结果可见后才允许 accept/reject/rewrite）。 */
  readonly candidate: CandidatePanelState;
  /** I70 版本/分支面板（R14-5）：版本列表、命名存档、选用与对比。 */
  readonly branches: BranchPanelState;
  /** I106 CRUD/binding/deletion interaction state; Host remains domain truth. */
  readonly management: ChapterManagementState;
}

export interface ChaptersEditOps {
  selectChapter(chapterId: string): void;
  selectScene(sceneId: string): void;
  openScene(chapterId: string, sceneId: string): void;
  retryChapter(): void;
  retryScene(): void;
  startEdit(): void;
  textChange(value: string): void;
  save(reparse: boolean): void;
  acceptReparse(): void;
  rejectReparse(): void;
  discardDraft(): void;
  cancelLeave(): void;
  proposeWriting(intent: 'continue' | 'scene-card'): void;
  rewritePromptChange(value: string): void;
  proposeRewrite(): void;
  adjudicateCandidate(decision: 'accept' | 'reject' | 'rewrite'): void;
  dismissCandidate(): void;
  branchesLoad(): void;
  branchLabelChange(value: string): void;
  branchSave(): void;
  branchChoose(branchId: string): void;
  branchDiff(branchId: string): void;
  branchCloseDiff(): void;
  setMode(mode: ChaptersMode): void;
  chapterDraft(patch: Partial<ChapterManagementDraft>): void;
  sceneDraft(patch: Partial<SceneManagementDraft>): void;
  createChapter(): void;
  updateChapter(): void;
  createScene(): void;
  updateScene(): void;
  reorder(direction: 'up' | 'down'): void;
  refreshManagement(): void;
  bindingSave(): void;
  bindingRebind(): void;
  bindingUnbind(): void;
  managementPatch(patch: Partial<ChapterManagementState>): void;
  chooseDeleteTarget(target: TextDeletionTarget): void;
  refreshDeleteImpact(target?: TextDeletionTarget): void;
  cancelDeleteQueue(): void;
  rejectDeleteCandidates(): void;
  proposeDelete(): void;
  applyDelete(): void;
  rejectDelete(): void;
  reconciliationPlanId(value: string): void;
  reconciliationRead(): void;
  reconciliationChoice(detailBeatId: string, choice: OutlineReconciliationChoice): void;
  reconciliationManualPatch(detailBeatId: string, patch: Partial<DetailBeat>): void;
  reconciliationPropose(): void;
  reconciliationAccept(): void;
  reconciliationReject(): void;
  reconciliationFinalize(): void;
  reconciliationContinue(): void;
}

export function freshChapters(): ChaptersLayerState {
  return {
    status: 'loading', list: [],
    mode: 'writing',
    navigationRevision: 0,
    workflow: freshWritingWorkflow(),
    chapter: { status: 'idle' },
    scene: { status: 'idle' },
    editor: freshSceneEditor(),
    candidate: freshCandidatePanel(),
    branches: freshBranchPanel(),
    management: {
      status: 'idle',
      chapterDraft: { id: '', index: 1, title: '', pov: '', status: 'draft' },
      sceneDraft: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' },
      bindingDetailBeatId: '',
      binding: { status: 'idle', manual: [], effective: [] },
      deletion: { status: 'idle' },
      reconciliation: { status: 'idle', planId: '', decisions: {}, manualValues: {} },
    },
  };
}

function writingWorkflowPanel(h: El, state: WritingWorkflowState): unknown {
  const labels = {
    idle: '等待开始写作',
    loading: '正在生成候选…',
    ready: '候选已就绪，等待作者审阅',
    saved: '正文已保存，可继续下一场景',
    rejected: '候选已拒绝，未写入正文',
    cancelled: '当前写作操作已取消',
    error: '写作操作失败',
  } as const;
  return h('div', {
    className: 'nv-chapters__workflow',
    'data-novel-writing-workflow': '',
    'data-novel-writing-workflow-state': state.status,
    role: 'status',
    'aria-live': 'polite',
  },
    h('span', { className: 'nv-chapters__item-meta', 'data-novel-writing-workflow-status': state.status }, labels[state.status]),
    state.message === undefined ? null : h('span', { className: state.status === 'error' ? 'nv-error' : 'nv-chapters__item-meta', 'data-novel-writing-workflow-message': '' }, state.message),
  );
}

function modeBadge(state: ChaptersLayerState, mode: ChaptersMode): string | undefined {
  if (mode === 'candidate') {
    const kind = state.candidate.ui.kind;
    return kind === 'proposing' || kind === 'ready' || kind === 'acting' ? '待处理' : undefined;
  }
  if (mode === 'versions') return state.branches.list.length > 0 ? String(state.branches.list.length) : undefined;
  if (mode === 'materials') {
    const status = state.management.deletion.status;
    return status === 'pending' || status === 'proposing' || status === 'applying' ? '待确认' : undefined;
  }
  return undefined;
}

function chapterModeTabs(h: El, state: ChaptersLayerState, ops: ChaptersEditOps): unknown {
  const focusMode = (index: number, event: { key: string; preventDefault(): void }): void => {
    const current = CHAPTER_MODE_ITEMS.findIndex((item) => item.id === state.mode);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % CHAPTER_MODE_ITEMS.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + CHAPTER_MODE_ITEMS.length) % CHAPTER_MODE_ITEMS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = CHAPTER_MODE_ITEMS.length - 1;
    else return;
    event.preventDefault();
    const selected = CHAPTER_MODE_ITEMS[next];
    if (selected !== undefined) ops.setMode(selected.id);
  };
  return h('div', { className: 'nv-chapters__modes', role: 'tablist', 'aria-label': '章节操作模式', 'data-novel-chapter-modes': '' },
    CHAPTER_MODE_ITEMS.map((item, index) => {
      const selected = state.mode === item.id;
      const badge = modeBadge(state, item.id);
      return h('button', {
        key: item.id,
        type: 'button',
        role: 'tab',
        className: 'nv-chapters__mode' + (selected ? ' is-active' : ''),
        'data-novel-chapter-mode': item.id,
        'aria-selected': selected,
        'aria-controls': 'novel-chapters-mode-panel',
        'aria-label': item.hint,
        tabIndex: selected ? 0 : -1,
        onClick: () => ops.setMode(item.id),
        onKeyDown: (event: { key: string; preventDefault(): void }) => focusMode(index, event),
      },
        h('span', { className: 'nv-chapters__mode-label' }, item.label),
        badge === undefined ? null : h('span', { className: 'nv-chapters__mode-badge', 'data-novel-chapter-mode-badge': item.id, 'aria-label': badge }, badge),
      );
    }),
  );
}

function modePanel(h: El, projectId: string, writing: WritingNamespace | undefined, branches: BranchNamespace | undefined, state: ChaptersLayerState, ops: ChaptersEditOps, body: unknown): unknown {
  const item = CHAPTER_MODE_ITEMS.find((candidate) => candidate.id === state.mode) ?? CHAPTER_MODE_ITEMS[0];
  const content = state.mode === 'writing'
    ? body
    : state.mode === 'candidate'
      ? candidatePanel(h, projectId, writing, state.candidate, ops)
      : state.mode === 'versions'
        ? branchPanel(h, projectId, branches, state.branches, ops)
        : managementPanel(h, state, ops);
  return h('div', {
    id: 'novel-chapters-mode-panel',
    className: 'nv-chapters__mode-panel',
    role: 'tabpanel',
    tabIndex: 0,
    'data-novel-chapter-mode-panel': state.mode,
    'aria-label': item.hint,
  }, content);
}

function managementInput(h: El, label: string, value: string, onChange: (value: string) => void, data: string): unknown {
  return h('label', { className: 'nv-field' },
    h('span', { className: 'nv-field__label' }, label),
    h('input', { type: 'text', className: 'nv-field__input', value, 'data-novel-management-input': data, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

function managementPanel(h: El, state: ChaptersLayerState, ops: ChaptersEditOps): unknown {
  const management = state.management;
  const chapter = state.chapter.read;
  const selectedScene = state.scene.item;
  const deletion = management.deletion;
  const reconciliation = management.reconciliation;
  return h('div', { className: 'nv-chapters__management', 'data-novel-chapter-management': '', 'data-novel-management-state': management.status },
    h('h3', { className: 'nv-editor__title' }, '章节管理'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapter-create': '', onClick: () => ops.createChapter() }, '新建章节'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-management-refresh': '', onClick: () => ops.refreshManagement() }, '刷新管理状态'),
    ),
    managementInput(h, '章节 ID', management.chapterDraft.id, (value) => ops.chapterDraft({ id: value }), 'chapter-id'),
    managementInput(h, '章节标题', management.chapterDraft.title, (value) => ops.chapterDraft({ title: value }), 'chapter-title'),
    managementInput(h, 'POV ID', management.chapterDraft.pov, (value) => ops.chapterDraft({ pov: value }), 'chapter-pov'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapter-update': '', onClick: () => ops.updateChapter() }, '保存章节元数据'),
      state.selectedChapterId !== undefined ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapter-reorder-up': '', onClick: () => ops.reorder('up') }, '章节上移') : null,
      state.selectedChapterId !== undefined ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapter-reorder-down': '', onClick: () => ops.reorder('down') }, '章节下移') : null,
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--danger', 'data-novel-chapter-delete': state.selectedChapterId ?? '', onClick: () => state.selectedChapterId !== undefined && ops.chooseDeleteTarget({ kind: 'chapter', chapterId: state.selectedChapterId }) }, '删除当前章节'),
    ),
    chapter !== undefined ? h('div', { className: 'nv-chapters__management-scene-form', 'data-novel-scene-management': '' },
      h('h4', { className: 'nv-editor__title' }, `第 ${chapter.index} 章场景管理`),
      managementInput(h, '场景 ID', management.sceneDraft.id, (value) => ops.sceneDraft({ id: value }), 'scene-id'),
      managementInput(h, '场景摘要', management.sceneDraft.summary, (value) => ops.sceneDraft({ summary: value }), 'scene-summary'),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-create': '', onClick: () => ops.createScene() }, '新建场景'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-update': '', onClick: () => ops.updateScene() }, '保存场景元数据'),
        selectedScene !== undefined ? h('button', { type: 'button', className: 'nv-btn nv-btn--danger', 'data-novel-scene-delete': selectedScene.id, onClick: () => ops.chooseDeleteTarget({ kind: 'scene', chapterId: chapter.id, sceneId: selectedScene.id }) }, '删除当前场景') : null,
      ),
    ) : null,
    h('div', { className: 'nv-chapters__binding', 'data-novel-scene-outline-binding': '' },
      h('h4', { className: 'nv-editor__title' }, '场景—细纲绑定'),
      managementInput(h, '细纲目标 ID', management.bindingDetailBeatId, (value) => ops.managementPatch({ bindingDetailBeatId: value }), 'binding-target'),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-binding-save': '', onClick: () => ops.bindingSave() }, '绑定'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-binding-rebind': '', onClick: () => ops.bindingRebind() }, '改绑'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-binding-unbind': '', onClick: () => ops.bindingUnbind() }, '解除绑定'),
      ),
      h('p', { className: 'nv-chapters__item-meta', 'data-novel-binding-state': management.binding?.status ?? 'idle' }, `手动绑定 ${management.binding?.manual.length ?? 0} 条；有效映射 ${management.binding?.effective.length ?? 0} 条`),
    ),
    reconciliationPanel(h, reconciliation, ops),
    h('div', { className: 'nv-chapters__deletion', 'data-novel-deletion': '', 'data-novel-deletion-state': deletion.status },
      h('h4', { className: 'nv-editor__title' }, '受控删除'),
      deletion.impact !== undefined ? h('p', { className: 'nv-chapters__item-meta', 'data-novel-deletion-impact': '' }, `影响：${deletion.impact.sceneCount} 个场景，${deletion.impact.proseCharacters} 字，${deletion.impact.branchCount} 个分支；绑定 ${deletion.impact.bindings.length} 条`) : null,
      deletion.impact !== undefined && deletion.impact.activeQueue.length > 0 ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-deletion-cancel-queue': '', onClick: () => ops.cancelDeleteQueue() }, `取消活动队列（${deletion.impact.activeQueue.length}）`) : null,
      deletion.impact !== undefined && deletion.impact.activeCandidates.length > 0 ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-deletion-reject-candidates': '', onClick: () => ops.rejectDeleteCandidates() }, `拒绝活动候选（${deletion.impact.activeCandidates.length}）`) : null,
      deletion.message !== undefined ? h('p', { className: 'nv-error', 'data-novel-deletion-message': '' }, deletion.message) : null,
      deletion.status === 'ready' ? h('button', { type: 'button', className: 'nv-btn nv-btn--danger', 'data-novel-deletion-propose': '', onClick: () => ops.proposeDelete() }, '提交删除确认') : null,
      deletion.status === 'blocked' ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-deletion-refresh': '', onClick: () => ops.refreshDeleteImpact() }, '刷新阻塞原因') : null,
      deletion.status === 'pending' ? h('div', { className: 'nv-editor__actions', 'data-novel-deletion-pending': '' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--danger', 'data-novel-deletion-apply': '', onClick: () => ops.applyDelete() }, '确认并删除'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-deletion-reject': '', onClick: () => ops.rejectDelete() }, '拒绝'),
      ) : null,
    ),
  );
}

function reconciliationPanel(h: El, state: ChapterManagementState['reconciliation'], ops: ChaptersEditOps): unknown {
  const plan = state.plan;
  return h('div', { className: 'nv-chapters__reconciliation', 'data-novel-outline-reconciliation': '', 'data-novel-reconciliation-state': state.status },
    h('h4', { className: 'nv-editor__title' }, '正文变化与细纲调和'),
    managementInput(h, '调和计划 ID', state.planId, (value) => ops.reconciliationPlanId(value), 'reconciliation-plan-id'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-read': '', onClick: () => ops.reconciliationRead() }, '读取影响计划'),
      state.proposalId === undefined ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-propose': '', onClick: () => ops.reconciliationPropose(), disabled: plan === undefined }, '提交一次确认') : null,
      state.proposalId !== undefined ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-accept': '', onClick: () => ops.reconciliationAccept() }, '接受已确认方案') : null,
      state.proposalId !== undefined ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-reject': '', onClick: () => ops.reconciliationReject() }, '拒绝方案') : null,
    ),
    plan === undefined ? h('p', { className: 'nv-chapters__empty', 'data-novel-reconciliation-empty': '' }, '读取 I113 影响计划后，在此逐卡选择。') : h('div', { 'data-novel-reconciliation-plan': plan.planId },
      h('p', { className: 'nv-chapters__item-meta', 'data-novel-reconciliation-summary': '' }, `影响类型：${plan.reportClassification}；受影响细纲：${plan.items.length} 张；版本 ${plan.revision}`),
      plan.items.map((item) => {
        const choice = state.decisions[item.detailBeatId] ?? item.choice;
        const manual = state.manualValues[item.detailBeatId] ?? item.before;
        return h('article', { key: item.detailBeatId, className: 'nv-chapters__reconciliation-card', 'data-novel-reconciliation-card': item.detailBeatId },
          h('h5', { className: 'nv-editor__title' }, `${item.position + 1}. ${item.before.title}`),
          h('p', { className: 'nv-chapters__item-meta' }, `证据：${item.evidence.map((evidence) => evidence.afterQuote).join('；')}`),
          h('div', { className: 'nv-editor__actions', 'data-novel-reconciliation-choices': item.detailBeatId },
            (['keep', 'ai', 'manual', 'pending'] as const).map((option) => h('button', {
              key: option, type: 'button', className: 'nv-btn' + (choice === option ? ' is-active' : ''),
              'data-novel-reconciliation-choice': option, 'aria-pressed': choice === option,
              onClick: () => ops.reconciliationChoice(item.detailBeatId, option),
            }, option === 'keep' ? '保留' : option === 'ai' ? '采用 AI' : option === 'manual' ? '手动编辑' : '待定')),
          ),
          h('button', { type: 'button', className: 'nv-btn nv-btn--link', 'data-novel-reconciliation-evidence': item.detailBeatId, onClick: () => undefined }, '定位正文证据'),
          choice === 'manual' ? h('div', { className: 'nv-chapters__reconciliation-manual', 'data-novel-reconciliation-manual': item.detailBeatId },
            managementInput(h, '手动标题', manual.title, (value) => ops.reconciliationManualPatch(item.detailBeatId, { title: value }), 'reconciliation-manual-title'),
            managementInput(h, '手动摘要', manual.summary, (value) => ops.reconciliationManualPatch(item.detailBeatId, { summary: value }), 'reconciliation-manual-summary'),
          ) : null,
        );
      }),
      h('div', { className: 'nv-editor__actions', 'data-novel-reconciliation-next-scene': '' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-finalize': '', onClick: () => ops.reconciliationFinalize(), disabled: state.proposalId === undefined }, '定稿当前细纲'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-reconciliation-continue': '', onClick: () => ops.reconciliationContinue(), disabled: state.proposalId === undefined }, '定稿并继续下一场'),
      ),
    ),
    state.message === undefined ? null : h('p', { className: 'nv-error', 'data-novel-reconciliation-message': '' }, state.message),
  );
}

export function chaptersPanel(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, writing: WritingNamespace | undefined, branches: BranchNamespace | undefined, state: ChaptersLayerState, ops: ChaptersEditOps): unknown {
  if (state.status === 'loading') {
    return h('section', { className: 'nv-chapters', 'data-novel-chapters-panel': '', 'data-novel-chapters-state': 'loading' }, '正在装载章节…');
  }
  if (state.status === 'error') {
    return h('section', { className: 'nv-chapters', 'data-novel-chapters-panel': '', 'data-novel-chapters-state': 'error' },
      errorBlock(h, state.message ?? '章节列表读取失败', () => ops.retryChapter(), '重试'));
  }
  const chapter = state.chapter.read;
  const scenes = chapter?.scenes ?? [];
  // 正文区状态机：场景错误 → 场景读取中 → 章节错误 → 空章 → 正文（编辑/只读）→ 未选择。
  let body: unknown;
  if (state.scene.status === 'error') {
    body = errorBlock(h, state.scene.message ?? '场景读取失败', () => ops.retryScene(), '重试场景');
  } else if (state.scene.status === 'loading') {
    body = h('p', { className: 'nv-chapters__empty', 'data-novel-scene-loading': '' }, '正在读取场景正文…');
  } else if (state.chapter.status === 'error') {
    body = errorBlock(h, state.chapter.message ?? '章节读取失败', () => ops.retryChapter(), '重试章节');
  } else if (state.chapter.status === 'ready' && state.chapter.read !== undefined && scenes.length === 0) {
    body = h('p', { className: 'nv-chapters__empty', 'data-novel-chapters-empty': '' }, '本章暂无场景正文（空章）。');
  } else if (state.scene.status === 'ready' && state.scene.item !== undefined) {
    body = state.editor.mode === 'edit'
      ? sceneEditorPanel(h, state.editor, ops)
      : h('div', { className: 'nv-chapters__read', 'data-novel-scene-read': '' },
        proseParagraphs(h, state.scene.item.content),
        h('div', { className: 'nv-editor__actions' },
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-edit': '', onClick: () => ops.startEdit() }, '编辑正文'),
        ),
      );
  } else {
    body = h('p', { className: 'nv-chapters__empty' }, '选择左侧章节与场景后阅读正文。');
  }
  return h('section', { className: 'nv-chapters', 'data-novel-chapters-panel': '', 'data-novel-chapters-state': 'ready' },
    h('div', { className: 'nv-chapters__pane', 'data-novel-chapter-tree': '' },
      h('h3', { className: 'nv-editor__title' }, '章节'),
      state.list.length === 0
        ? h('p', { className: 'nv-chapters__empty', 'data-novel-chapters-empty': '' }, '尚无章节：正文由写作能力生成后在此阅读。')
        : state.list.map((item) => h('button', {
          key: item.id, type: 'button',
          className: 'nv-editor__item' + (state.selectedChapterId === item.id ? ' is-active' : ''),
          'data-novel-chapter-item': item.id,
          onClick: () => ops.selectChapter(item.id),
        },
          h('span', { className: 'nv-chapters__item-title' }, `第 ${item.index} 章 · ${item.title}`),
          h('span', { className: 'nv-chapters__item-meta' }, `POV ${item.pov || '—'} · ${item.sceneCount} 个场景`),
        )),
    ),
    h('div', { className: 'nv-chapters__pane', 'data-novel-chapter-scenes': '' },
      h('h3', { className: 'nv-editor__title' }, '场景'),
      state.chapter.status === 'error'
        ? errorBlock(h, state.chapter.message ?? '章节读取失败', () => ops.retryChapter(), '重试章节')
        : state.chapter.status === 'loading'
          ? h('p', { className: 'nv-chapters__empty', 'data-novel-scene-loading': '' }, '正在读取章节…')
          : state.chapter.status !== 'ready'
            ? h('p', { className: 'nv-chapters__empty' }, '选择左侧章节查看场景。')
            : scenes.length === 0
              ? h('p', { className: 'nv-chapters__empty', 'data-novel-chapters-empty': '' }, '本章暂无场景（空章）。')
              : scenes.map((scene) => h('button', {
                key: scene.id, type: 'button',
                className: 'nv-editor__item' + (state.selectedSceneId === scene.id ? ' is-active' : ''),
                'data-novel-scene-item': scene.id,
                onClick: () => ops.selectScene(scene.id),
              },
                h('span', { className: 'nv-chapters__item-title' }, `场景 ${scene.index + 1}`),
                scene.summary === '' ? null : h('span', { className: 'nv-chapters__item-summary' }, scene.summary),
              )),
    ),
    h('div', { className: 'nv-chapters__pane nv-chapters__pane--body', 'data-novel-scene-body': '' },
      h('h3', { className: 'nv-editor__title', 'data-novel-chapter-mode-title': state.mode }, CHAPTER_MODE_ITEMS.find((item) => item.id === state.mode)?.label ?? '正文'),
      writingWorkflowPanel(h, state.workflow),
      chapterModeTabs(h, state, ops),
      modePanel(h, projectId, writing, branches, state, ops, body),
    ),
  );
}

// I95 兼容重导出（拆分后外部符号入口不变）。
export { freshBranchPanel, branchPanel, type BranchDiffLineShape, type BranchDiffState, type BranchPanelState, type BranchSummaryShape } from './branch.js';
export { freshCandidatePanel, candidatePanel, type CandidatePanelState, type CandidateReviewShape, type CandidateTraceSectionShape, type CandidateTraceShape, type CandidateUiState, type CandidateValidationShape } from './candidate.js';
export { computeEditRange, freshSceneEditor, reparseLocked, sceneEditorPanel, type ReparseUiState, type SceneEditRange, type SceneEditorState } from './scene-editor.js';
