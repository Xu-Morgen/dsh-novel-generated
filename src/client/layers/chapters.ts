import type { El, WorkspaceNamespace, WritingNamespace, BranchNamespace } from '../shared.js';
import { branchPanel, freshBranchPanel, type BranchPanelState } from './branch.js';
import { candidatePanel, freshCandidatePanel, type CandidatePanelState } from './candidate.js';
import { errorBlock, proseParagraphs } from './chapters-shared.js';
import { freshSceneEditor, sceneEditorPanel, type SceneEditorState } from './scene-editor.js';

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
}

export function freshChapters(): ChaptersLayerState {
  return {
    status: 'loading', list: [],
    chapter: { status: 'idle' },
    scene: { status: 'idle' },
    editor: freshSceneEditor(),
    candidate: freshCandidatePanel(),
    branches: freshBranchPanel(),
  };
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

// I95 兼容重导出（拆分后外部符号入口不变）。
export { freshBranchPanel, branchPanel, type BranchDiffLineShape, type BranchDiffState, type BranchPanelState, type BranchSummaryShape } from './branch.js';
export { freshCandidatePanel, candidatePanel, type CandidatePanelState, type CandidateReviewShape, type CandidateTraceSectionShape, type CandidateTraceShape, type CandidateUiState, type CandidateValidationShape } from './candidate.js';
export { computeEditRange, freshSceneEditor, reparseLocked, sceneEditorPanel, type ReparseUiState, type SceneEditRange, type SceneEditorState } from './scene-editor.js';
