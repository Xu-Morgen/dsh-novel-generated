import type { El, WorkspaceNamespace, WritingNamespace, BranchNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';

/**
 * I60/I61 C5 章节/场景导航 + 正文编辑面板（design §5.12 / §14.9 / R13-1 / R13-2）。
 *
 * I60 只读三栏：章节树 → 场景列表 → 正文（最小 owned JSON 投影，Client 不拥有
 * 正文真相、不接触文件路径）。
 *
 * I61 受控编辑：正文区默认仍为只读段落（保留 I60 阅读语义），经「编辑」按钮
 * `data-novel-scene-edit` 进入编辑模式 —— textarea 草稿 + 单一连续范围 diff 计算
 * （`computeEditRange`，任意草稿变化都精确映射为最小范围替换，逐字 round-trip）：
 * - 「保存修改」`data-novel-scene-save`：只写 C5（sceneEdit），不动结构层。
 * - 「保存并重解析」`data-novel-scene-save-reparse`：sceneReparsePropose →
 *   面板显示提案；「确认重解析」`data-novel-scene-reparse-accept` 才走
 *   sceneReparseAccept（Gate 确认 + 既有 parser fan-out）；「拒绝」
 *   `data-novel-scene-reparse-reject` 零写。
 * - 脏文本保护：草稿未保存时切换章节/场景先弹确认条（放弃并离开
 *   `data-novel-scene-discard` / 取消 `data-novel-scene-leave-cancel`）；
 *   Host 侧另有 baseHash 陈旧草稿校验（sceneEdit/propose 都带装载时哈希）。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelWorkspace` Remote；编辑请求始终携带装载时的
 *   `baseHash = sha256(original)`，Host 核对不一致即拒绝（脏文本保护）。
 * - `computeEditRange` 是纯函数：`original` 与 `draft` 的最小前缀/后缀分解唯一，
 *   替换后的文本恒等于 draft（exact round-trip），未变前后缀逐字保留。
 * - reparse 提案期间锁定草稿（textarea disabled），范围/替换冻结在提案状态里，
 *   避免 accept 时使用与提案不一致的新范围。
 */

export interface ChapterListItemShape { id: string; index: number; title: string; pov: string; status: string; sceneCount: number; [key: string]: unknown; }
export interface SceneSummaryShape { id: string; index: number; summary: string; [key: string]: unknown; }
export interface ChapterReadShape { id: string; index: number; title: string; pov: string; status: string; scenes: SceneSummaryShape[]; [key: string]: unknown; }
export interface SceneReadShape { id: string; index: number; summary: string; content: string; beats: string[]; canonEvents: string[]; notes: string; [key: string]: unknown; }

/** I61 单一连续范围（半开区间 [start, end)，UTF-16 code unit 偏移）。 */
export interface SceneEditRange { start: number; end: number; }

/** I61 reparse 提案的 UI 状态机（kind 即三态 + 忙碌/终态）。 */
export type ReparseUiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'proposed'; readonly proposalId: string; readonly range: SceneEditRange; readonly replacement: string; readonly baseHash: string }
  | { readonly kind: 'accepting'; readonly proposalId: string; readonly range: SceneEditRange; readonly replacement: string; readonly baseHash: string }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** I61 正文编辑表单状态（mode: read = 只读段落，edit = textarea 草稿）。 */
export interface SceneEditorState {
  readonly mode: 'read' | 'edit';
  /** 装载时的正文（baseHash 计算基准；保存成功/重解析成功后被新内容替换）。 */
  readonly original: string;
  readonly draft: string;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveMessage: string;
  readonly error: string;
  readonly reparse: ReparseUiState;
  /** 脏文本导航保护：true 时显示确认条，pendingNavigation 记录被推迟的切换。 */
  readonly leaveConfirm: boolean;
  readonly pendingNavigation: { readonly chapterId: string; readonly sceneId?: string } | undefined;
}

/** I63 候选审阅（R13-4）：正文 + diff + 校验结果的最小 owned JSON（Host preview 投影）。 */
export interface CandidateValidationShape {
  readonly status: 'pass' | 'warn' | 'reject';
  readonly violations: readonly { readonly severity: 'hard' | 'soft'; readonly message: string; readonly references: readonly string[] }[];
}
/** I71 生成注入解释投影（design §14.10 / R14-6）：只含层/触发/预算摘要，无 secret 内容。 */
export interface CandidateTraceSectionShape {
  readonly id: string;
  readonly characterCount: number;
  readonly budget: number;
  readonly truncated: boolean;
}
export interface CandidateTraceShape {
  readonly intent: 'generate' | 'continue' | 'scene-card' | 'rewrite';
  readonly pov: string;
  readonly navigation?: { readonly actId: string; readonly beatId: string; readonly title: string };
  readonly sections: readonly CandidateTraceSectionShape[];
  readonly triggers: readonly { readonly entryId: string; readonly title: string; readonly matchedKeywords: readonly string[] }[];
  readonly totals: { readonly characterCount: number; readonly budget: number; readonly truncatedSectionCount: number };
  readonly rewritePromptCharacters: number;
  readonly knowledgeVisibleCount: number;
  readonly sceneCard?: { readonly title: string; readonly pov: string; readonly wordTarget: number };
}
export interface CandidateReviewShape {
  readonly candidateId: string;
  readonly intent: string;
  readonly text: string;
  readonly diff: { readonly kind: 'new-scene' } | { readonly kind: 'replace'; readonly before: string; readonly after: string };
  readonly validation: CandidateValidationShape;
  readonly trace?: CandidateTraceShape;
}

/** I63 审阅面板 UI 状态机：只有正文/diff/校验结果可见（ready）后才允许裁决。 */
export type CandidateUiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'proposing'; readonly intent: string }
  | { readonly kind: 'ready'; readonly review: CandidateReviewShape }
  | { readonly kind: 'acting'; readonly review: CandidateReviewShape; readonly action: 'accept' | 'reject' | 'rewrite' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** I63 候选审阅面板状态（局部重写指令草稿 + 面板状态机）。 */
export interface CandidatePanelState {
  readonly ui: CandidateUiState;
  readonly rewritePrompt: string;
}

/** I70 分支版本元数据投影（Host `novelBranches.list` 的最小 owned JSON，无正文）。 */
export interface BranchSummaryShape {
  readonly id: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly charCount: number;
  readonly hash: string;
  [key: string]: unknown;
}

/** I70 分支 diff 行（Host `novelBranches.diff` 的确定性行 diff 投影）。 */
export interface BranchDiffLineShape {
  readonly kind: 'same' | 'del' | 'add';
  readonly text: string;
}

/** I70 分支比较视图状态（idle → loading → ready / error）。 */
export interface BranchDiffState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly fromLabel?: string;
  readonly toLabel?: string;
  readonly lines: BranchDiffLineShape[];
  readonly message?: string;
}

/** I70 分支面板状态（版本列表 + 命名存档草稿 + 对比视图；只经 Host Remote 读写）。 */
export interface BranchPanelState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly list: BranchSummaryShape[];
  readonly message?: string;
  readonly labelDraft: string;
  readonly acting: boolean;
  readonly diff: BranchDiffState;
}

export interface ChaptersLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: ChapterListItemShape[];
  readonly message?: string;
  readonly selectedChapterId?: string;
  readonly selectedSceneId?: string;
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
}

export interface ChaptersEditOps {
  selectChapter(chapterId: string): void;
  selectScene(sceneId: string): void;
  /** I71：搜索结果跳转 —— 打开指定章节/场景（脏文本保护复用离开确认流程）。 */
  openScene(chapterId: string, sceneId: string): void;
  retryChapter(): void;
  retryScene(): void;
  /** I61：进入/退出编辑模式。 */
  startEdit(): void;
  textChange(value: string): void;
  save(reparse: boolean): void;
  acceptReparse(): void;
  rejectReparse(): void;
  discardDraft(): void;
  cancelLeave(): void;
  /** I63：发起续写/按场景卡写作候选（只产候选、零写）。 */
  proposeWriting(intent: 'continue' | 'scene-card'): void;
  /** I63：局部重写指令草稿。 */
  rewritePromptChange(value: string): void;
  /** I63：对选中场景发起局部重写候选（绑定 sourceHash）。 */
  proposeRewrite(): void;
  /** I63：裁决当前候选（accept 受控写回 / reject 零写 / rewrite 后继候选）。 */
  adjudicateCandidate(decision: 'accept' | 'reject' | 'rewrite'): void;
  /** I63：关闭/清除审阅面板（错误/完成态）。 */
  dismissCandidate(): void;
  /** I70：装载选中场景的版本列表 / 命名存档草稿 / 存档 / 选用 / 对比 / 关闭对比（R14-5）。 */
  branchesLoad(): void;
  branchLabelChange(value: string): void;
  branchSave(): void;
  branchChoose(branchId: string): void;
  branchDiff(branchId: string): void;
  branchCloseDiff(): void;
}

export function freshChapters(): ChaptersLayerState {
  return { status: 'loading', list: [], chapter: { status: 'idle' }, scene: { status: 'idle' }, editor: freshSceneEditor(), candidate: freshCandidatePanel(), branches: freshBranchPanel() };
}

export function freshCandidatePanel(): CandidatePanelState {
  return { ui: { kind: 'idle' }, rewritePrompt: '' };
}

/** I70 分支面板初始态（无版本 = 隐含单版本；diff 视图空闲）。 */
export function freshBranchPanel(): BranchPanelState {
  return { status: 'idle', list: [], labelDraft: '', acting: false, diff: { status: 'idle', lines: [] } };
}

export function freshSceneEditor(): SceneEditorState {
  return {
    mode: 'read', original: '', draft: '', dirty: false, saving: false, saveMessage: '', error: '',
    reparse: { kind: 'idle' }, leaveConfirm: false, pendingNavigation: undefined,
  };
}

/**
 * 把任意 (original, draft) 映射为「最小单一连续范围」替换。
 *
 * 前缀/后缀贪心分解是唯一的：`original = P + A + S`、`draft = P + B + S` 且 P、S
 * 取最大匹配。返回的 range 即 A 的 [start, end)，replacement 即 B。替换结果恒等于
 * draft（exact round-trip），P/S（范围外文本）逐字不变。相同文本返回 none。
 */
export function computeEditRange(original: string, draft: string): { kind: 'none' } | { kind: 'single'; range: SceneEditRange; replacement: string } {
  if (original === draft) return { kind: 'none' };
  const max = Math.min(original.length, draft.length);
  let start = 0;
  while (start < max && original[start] === draft[start]) start += 1;
  let endOriginal = original.length;
  let endDraft = draft.length;
  while (endOriginal > start && endDraft > start && original[endOriginal - 1] === draft[endDraft - 1]) {
    endOriginal -= 1;
    endDraft -= 1;
  }
  return { kind: 'single', range: { start, end: endOriginal }, replacement: draft.slice(start, endDraft) };
}

/** reparse 提案/接受进行中锁定草稿（禁止继续修改，避免 accept 用错范围）。 */
function reparseLocked(state: SceneEditorState): boolean {
  return state.reparse.kind === 'proposed' || state.reparse.kind === 'accepting';
}

function errorBlock(h: El, message: string, retry: () => void, retryLabel: string): unknown {
  return h('div', { className: 'nv-chapters__state', 'data-novel-chapters-error': '', role: 'alert' },
    h('p', { className: 'nv-chapters__error-text' }, message),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapters-retry': '', onClick: retry }, retryLabel),
  );
}

/** 场景正文按空行拆段（与 docs/ 派生镜像同分节习惯），空段忽略。 */
function proseParagraphs(h: El, content: string): unknown {
  const paragraphs = content.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  return h('div', { className: 'nv-chapters__prose', 'data-novel-scene-prose': '' },
    paragraphs.length === 0
      ? h('p', { className: 'nv-chapters__empty', 'data-novel-chapters-empty': '' }, '（本场景暂无正文）')
      : paragraphs.map((paragraph, index) => h('p', { key: index, className: 'nv-chapters__paragraph' }, paragraph)),
  );
}

/** I61 编辑模式：textarea 草稿 + 范围提示 + 保存/重解析动作 + 提案面板 + 离开确认。 */
function sceneEditorPanel(h: El, state: SceneEditorState, ops: ChaptersEditOps): unknown {
  const diff = computeEditRange(state.original, state.draft);
  const canSave = state.dirty && diff.kind === 'single' && !state.saving && !reparseLocked(state);
  const locked = reparseLocked(state);
  let rangeHint: unknown;
  if (diff.kind === 'none') {
    rangeHint = h('p', { className: 'nv-chapters__editor-range', 'data-novel-scene-range': 'none' }, '未检测到修改。');
  } else {
    rangeHint = h('p', { className: 'nv-chapters__editor-range', 'data-novel-scene-range': 'single' },
      `检测到 1 处修改：第 ${diff.range.start + 1}–${diff.range.end} 字符（范围外保持不变）。`);
  }
  let reparsePanel: unknown;
  if (state.reparse.kind === 'idle') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse-hint', 'data-novel-scene-reparse-hint': '' },
      '可选：保存并重解析将把本次修改经 ConfirmationGate 同步到结构层（C2/C1/C3/C4/B2）。');
  } else if (state.reparse.kind === 'proposed') {
    reparsePanel = h('div', { className: 'nv-chapters__reparse nv-chapters__reparse--proposed', 'data-novel-scene-reparse-proposed': '', role: 'status', 'aria-live': 'polite' },
      h('p', { className: 'nv-chapters__reparse-status' }, '重解析提案已发起，确认后才会同步结构层。'),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-scene-reparse-accept': '', onClick: () => ops.acceptReparse() }, '确认重解析'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-reparse-reject': '', onClick: () => ops.rejectReparse() }, '拒绝'),
      ),
    );
  } else if (state.reparse.kind === 'accepting') {
    reparsePanel = h('div', { className: 'nv-chapters__reparse nv-chapters__reparse--accepting', 'data-novel-scene-reparse-accepting': '', role: 'status', 'aria-live': 'polite' },
      h('p', { className: 'nv-chapters__reparse-status' }, '正在重解析并同步结构层…'));
  } else if (state.reparse.kind === 'rejected') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--rejected', 'data-novel-scene-reparse-rejected': '', role: 'status', 'aria-live': 'polite' },
      '已拒绝重解析，结构层未改动。可再次「保存并重解析」或仅保存正文。');
  } else if (state.reparse.kind === 'done') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--done', 'data-novel-scene-reparse-done': '', role: 'status', 'aria-live': 'polite' }, state.reparse.message);
  } else {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--error', 'data-novel-scene-reparse-error': '', role: 'alert', 'aria-live': 'assertive' },
      `重解析失败：${state.reparse.message}`);
  }
  const leaveConfirm = state.leaveConfirm
    ? h('div', { className: 'nv-chapters__leave', 'data-novel-scene-leave': '', role: 'alertdialog', 'aria-label': '放弃未保存的正文修改' },
      h('p', { className: 'nv-chapters__leave-hint', 'data-novel-scene-leave-hint': '' }, '有未保存的正文修改，放弃将丢失这些修改。'),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-discard': '', onClick: () => ops.discardDraft() }, '放弃并离开'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-leave-cancel': '', onClick: () => ops.cancelLeave() }, '取消'),
      ),
    )
    : null;
  return h('div', { className: 'nv-chapters__editor', 'data-novel-scene-editor': '' },
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '正文（编辑模式）'),
      h('textarea', {
        className: 'nv-field__input nv-chapters__editor-input',
        'data-novel-scene-text': '',
        value: state.draft,
        rows: 12,
        disabled: locked,
        onChange: (event: { target: { value: string } }) => ops.textChange(event.target.value),
      }),
    ),
    rangeHint,
    h('div', { className: 'nv-editor__actions' },
      h('button', {
        type: 'button',
        className: 'nv-btn',
        'data-novel-scene-save': '',
        disabled: !canSave,
        onClick: () => ops.save(false),
      }, saveButtonLabel(state.saving, '保存修改')),
      h('button', {
        type: 'button',
        className: 'nv-btn nv-btn--primary',
        'data-novel-scene-save-reparse': '',
        disabled: !canSave,
        onClick: () => ops.save(true),
      }, saveButtonLabel(state.saving, '保存并重解析')),
    ),
    renderSaveStatus(h, saveStatusLine(state.saving, state.saveMessage, state.error), 'scene'),
    reparsePanel,
    leaveConfirm,
  );
}

/**
 * I63 候选审阅面板（design §14.9 / R13-4）：作者在正文 + diff + 校验结果可见后，
 * 才允许接受 / 拒绝 / 重写（R13-4 验收「可见后才允许裁决」）。
 *
 * 状态机：idle（发起入口）→ proposing → ready（审阅）→ acting（裁决中）→
 * done / error。ready 前不渲染任何裁决按钮；双击由 store 侧 inflight 去重。
 */
function candidatePanel(h: El, projectId: string, writing: WritingNamespace | undefined, state: CandidatePanelState, ops: ChaptersEditOps): unknown {
  const available = writing !== undefined && projectId !== undefined;
  const disabled = !available || state.ui.kind === 'proposing' || state.ui.kind === 'acting';
  const proposeEntry = h('div', { className: 'nv-candidate__entry', 'data-novel-candidate-entry': '' },
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-propose-continue': '', disabled, onClick: () => ops.proposeWriting('continue') }, '续写下一场景'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-propose-scene-card': '', disabled, onClick: () => ops.proposeWriting('scene-card') }, '按场景卡写作'),
    ),
    h('label', { className: 'nv-field nv-candidate__rewrite' },
      h('span', { className: 'nv-field__label' }, '局部重写当前场景'),
      h('textarea', {
        className: 'nv-field__input',
        'data-novel-candidate-rewrite-prompt': '',
        value: state.rewritePrompt,
        rows: 2,
        disabled,
        placeholder: '描述希望改写的方向（如：更有悬念、缩短、切换人称）',
        onChange: (event: { target: { value: string } }) => ops.rewritePromptChange(event.target.value),
      }),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-candidate-propose-rewrite': '', disabled: disabled || state.rewritePrompt.trim() === '', onClick: () => ops.proposeRewrite() }, '发起重写候选'),
    ),
  );
  if (!available) {
    return h('section', { className: 'nv-candidate', 'data-novel-candidate-panel': '', 'data-novel-candidate-state': 'unavailable' },
      h('h3', { className: 'nv-editor__title' }, '写作候选'),
      h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-unavailable': '' }, '候选审阅服务不可用（novelWriting Remote 未挂载）。'),
    );
  }
  let body: unknown;
  const ui = state.ui;
  if (ui.kind === 'idle') {
    body = h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-hint': '' }, '生成后先审阅候选正文、改动与校验结果，再接受、拒绝或重写。');
  } else if (ui.kind === 'proposing') {
    body = h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-proposing': '', role: 'status', 'aria-live': 'polite' }, `正在生成${ui.intent === 'continue' ? '续写' : '场景卡写作'}候选…`);
  } else if (ui.kind === 'ready' || ui.kind === 'acting') {
    const review = ui.review;
    const acting = ui.kind === 'acting' ? ui.action : undefined;
    const diffBlock = review.diff.kind === 'new-scene'
      ? h('p', { className: 'nv-candidate__diff', 'data-novel-candidate-diff': 'new-scene' }, '新场景：将追加到「chapter-1」。')
      : h('details', { className: 'nv-candidate__diff', 'data-novel-candidate-diff': 'replace' },
        h('summary', { 'data-novel-candidate-diff-summary': '' }, '局部重写：将替换当前场景正文'),
        h('p', { className: 'nv-candidate__diff-before', 'data-novel-candidate-diff-before': '' }, review.diff.before),
        h('p', { className: 'nv-candidate__diff-after', 'data-novel-candidate-diff-after': '' }, review.diff.after),
      );
    const validation = review.validation;
    const validationBlock = h('div', { className: `nv-candidate__validation nv-candidate__validation--${validation.status}`, 'data-novel-candidate-validation': validation.status, role: 'status', 'aria-live': 'polite' },
      h('p', null, validation.status === 'pass' ? '校验通过：未发现硬约束或软警告。'
        : validation.status === 'warn' ? '校验警告：存在软警告，可继续或重写。'
          : '校验未通过：存在硬冲突，接受将被拒绝（请重写）。'),
      validation.violations.length === 0 ? null
        : h('ul', { className: 'nv-candidate__violations' }, validation.violations.map((violation, index) => h('li', { key: index, 'data-novel-candidate-violation': violation.severity }, `${violation.severity === 'hard' ? '硬' : '软'}冲突：${violation.message}`))),
    );
    const trace = review.trace;
    const traceBlock = trace === undefined
      ? null
      : h('details', { className: 'nv-candidate__trace', 'data-novel-candidate-trace': '' },
        h('summary', { 'data-novel-candidate-trace-summary': '' }, `本次生成注入解释（${trace.sections.length} 层 / ${trace.totals.characterCount} 字 / 预算 ${trace.totals.budget}）`),
        h('p', { className: 'nv-candidate__trace-intent', 'data-novel-candidate-trace-intent': '' },
          trace.intent === 'rewrite'
            ? '局部重写：未注入结构层，只注入作者重写指令。'
            : trace.intent === 'scene-card'
              ? `按场景卡写作：未注入结构层，只注入场景卡「${trace.sceneCard?.title ?? ''}」（POV ${trace.pov}，目标 ${trace.sceneCard?.wordTarget ?? 0} 字）。`
              : `上下文组装：POV ${trace.pov}，注入 ${trace.sections.length} 个层（含 ${trace.knowledgeVisibleCount} 条该 POV 可见的知情）。`),
        trace.sections.length === 0 ? null
          : h('ul', { className: 'nv-candidate__trace-sections', 'data-novel-candidate-trace-sections': '' },
            trace.sections.map((section) => h('li', { key: section.id, 'data-novel-candidate-trace-section': section.id },
              `${section.id}：${section.characterCount}/${section.budget} 字${section.truncated ? '（已裁剪）' : ''}`))),
        trace.triggers.length === 0 ? null
          : h('ul', { className: 'nv-candidate__trace-triggers', 'data-novel-candidate-trace-triggers': '' },
            trace.triggers.map((trigger) => h('li', { key: trigger.entryId, 'data-novel-candidate-trace-trigger': trigger.entryId },
              `世界观触发：${trigger.title}（关键词：${trigger.matchedKeywords.join('、') || '—'}）`))),
        trace.totals.truncatedSectionCount > 0
          ? h('p', { className: 'nv-candidate__trace-truncated', 'data-novel-candidate-trace-truncated': String(trace.totals.truncatedSectionCount) }, `其中 ${trace.totals.truncatedSectionCount} 层因预算被确定性裁剪。`)
          : null,
      );
    body = h('div', { className: 'nv-candidate__review', 'data-novel-candidate-review': '' },
      h('div', { className: 'nv-candidate__meta' },
        h('span', { className: 'nv-candidate__intent', 'data-novel-candidate-intent': '' }, { continue: '续写', 'scene-card': '场景卡写作', rewrite: '局部重写', generate: '生成' }[review.intent] ?? review.intent),
        h('span', { className: 'nv-candidate__id' }, review.candidateId),
      ),
      proseParagraphs(h, review.text),
      diffBlock,
      validationBlock,
      traceBlock,
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-candidate-accept': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('accept') }, acting === 'accept' ? '正在接受…' : '接受'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-reject': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('reject') }, acting === 'reject' ? '正在拒绝…' : '拒绝'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-rewrite': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('rewrite') }, acting === 'rewrite' ? '正在重写…' : '重写'),
      ),
    );
  } else if (ui.kind === 'done') {
    body = h('p', { className: 'nv-candidate__done', 'data-novel-candidate-done': '', role: 'status', 'aria-live': 'polite' }, ui.message);
  } else {
    body = h('div', { className: 'nv-candidate__error', 'data-novel-candidate-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', null, ui.message),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-dismiss': '', onClick: () => ops.dismissCandidate() }, '关闭'),
    );
  }
  return h('section', { className: 'nv-candidate', 'data-novel-candidate-panel': '', 'data-novel-candidate-state': ui.kind },
    h('h3', { className: 'nv-editor__title' }, '写作候选'),
    proposeEntry,
    body,
  );
}

/**
 * I70 版本与分支面板（design §14.10「正文版本与分支」/ R14-5）：展示当前场景的
 * 全部版本（chosen 唯一），支持给当前正文打命名版本、选用历史版本（可逆切换，
 * 只写 C5）与分支行 diff 对比。所有读写只经 Host `novelBranches` Remote；Client
 * 不持有版本真相（列表始终由 Host 投影刷新）。
 */
function branchPanel(h: El, projectId: string, branches: BranchNamespace | undefined, state: BranchPanelState, ops: ChaptersEditOps): unknown {
  const unavailable = branches === undefined || projectId === undefined;
  let body: unknown;
  if (unavailable) {
    body = h('p', { className: 'nv-branch__hint', 'data-novel-branch-unavailable': '' }, '版本服务不可用（novelBranches Remote 未挂载）。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-branch__hint', 'data-novel-branch-loading': '' }, '正在读取版本…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-branch__error', 'data-novel-branch-error': '', role: 'alert' },
      h('p', { className: 'nv-chapters__error-text' }, state.message ?? '版本读取失败'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-retry': '', onClick: () => ops.branchesLoad() }, '重试'),
    );
  } else {
    const list = state.list;
    const rows = list.length === 0
      ? h('p', { className: 'nv-branch__hint', 'data-novel-branch-empty': '' }, '尚无保留的版本（隐含单版本）。接受重写候选后旧正文会自动保留为分支，也可先「存档当前版本」。')
      : h('ul', { className: 'nv-branch__list', 'data-novel-branch-list': '' }, list.map((branch) => h('li', {
        key: branch.id,
        className: 'nv-branch__item' + (branch.chosen ? ' is-chosen' : ''),
        'data-novel-branch-item': branch.id,
      },
        h('div', { className: 'nv-branch__item-head' },
          h('span', { className: 'nv-branch__label', 'data-novel-branch-label': '' }, branch.label || '未命名版本'),
          branch.chosen ? h('span', { className: 'nv-branch__badge', 'data-novel-branch-chosen': '' }, '当前') : null,
        ),
        h('span', { className: 'nv-branch__meta' }, `${branch.charCount} 字 · ${branch.hash.slice(0, 8)}`),
        h('div', { className: 'nv-editor__actions' },
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-choose': '', disabled: branch.chosen || state.acting, onClick: () => ops.branchChoose(branch.id) }, branch.chosen ? '当前版本' : '选用此版本'),
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-diff': '', disabled: state.acting, onClick: () => ops.branchDiff(branch.id) }, '对比当前'),
        ),
      )));
    let diffBlock: unknown;
    const diff = state.diff;
    if (diff.status === 'loading') {
      diffBlock = h('p', { className: 'nv-branch__hint', 'data-novel-branch-diff-loading': '' }, '正在对比…');
    } else if (diff.status === 'error') {
      diffBlock = h('p', { className: 'nv-chapters__error-text', 'data-novel-branch-diff-error': '', role: 'alert' }, diff.message ?? '对比失败');
    } else if (diff.status === 'ready') {
      diffBlock = h('div', { className: 'nv-branch__diff', 'data-novel-branch-diff-view': '' },
        h('p', { className: 'nv-branch__diff-title', 'data-novel-branch-diff-title': '' }, `对比：${diff.fromLabel ?? '—'} → ${diff.toLabel ?? '当前'}`),
        h('div', { className: 'nv-branch__diff-lines' }, diff.lines.length === 0
          ? h('p', { className: 'nv-branch__hint' }, '两个版本内容相同。')
          : diff.lines.map((line, index) => h('p', { key: index, className: `nv-branch__line nv-branch__line--${line.kind}`, 'data-novel-branch-line': line.kind }, `${line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '} ${line.text}`))),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-diff-close': '', onClick: () => ops.branchCloseDiff() }, '关闭对比'),
      );
    }
    body = h('div', { className: 'nv-branch__body' },
      rows,
      h('label', { className: 'nv-field nv-branch__save' },
        h('span', { className: 'nv-field__label' }, '给当前版本命名存档'),
        h('div', { className: 'nv-editor__actions' },
          h('input', {
            type: 'text',
            className: 'nv-field__input',
            'data-novel-branch-label': '',
            value: state.labelDraft,
            placeholder: '如：初稿、伏笔加强版',
            disabled: state.acting,
            onChange: (event: { target: { value: string } }) => ops.branchLabelChange(event.target.value),
          }),
          h('button', {
            type: 'button',
            className: 'nv-btn nv-btn--primary',
            'data-novel-branch-save': '',
            disabled: state.acting || state.labelDraft.trim() === '',
            onClick: () => ops.branchSave(),
          }, state.acting ? '处理中…' : '存档'),
        ),
      ),
      state.message === undefined ? null : h('p', { className: 'nv-branch__hint nv-branch__message', 'data-novel-branch-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
      diffBlock,
    );
  }
  return h('section', { className: 'nv-branch', 'data-novel-branch-panel': '', 'data-novel-branch-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '版本与分支'),
    body,
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
      h('h3', { className: 'nv-editor__title' }, '正文'),
      body,
      // I70：版本与分支面板（R14-5）—— 只对已选中的场景展示（与正文同窗）。
      state.scene.status === 'ready' && state.scene.item !== undefined ? branchPanel(h, projectId, branches, state.branches, ops) : null,
      // I63：候选审阅面板（生成后裁决）挂在正文区下方。
      candidatePanel(h, projectId, writing, state.candidate, ops),
    ),
  );
}
