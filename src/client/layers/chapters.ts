import type { El, WorkspaceNamespace } from '../shared.js';

/**
 * I60 C5 章节/场景只读导航面板（design §5.12 / R13-1）。
 *
 * 三栏布局：章节树 → 场景列表 → 正文。所有读取只经 Host `novelWorkspace` 的
 * chapterList / chapterRead / sceneRead 三个只读 Remote，Client 不拥有正文真相、
 * 不接触文件路径（design §0.1.2）。本面板只读：不提供编辑/生成/落盘入口
 * （I61 起才引入受控编辑）。
 *
 * 契约与不变式：
 * - `ChapterListItemShape` 只含元数据与 sceneCount（章节树）；`ChapterReadShape`
 *   只含场景摘要；`SceneReadShape` 是唯一携带正文的投影 —— 与 Host 侧
 *   `src/core/text/projection.ts` 的最小 owned JSON 契约一一对应。
 * - 空章态：章节树显示 0 场景章节；场景列与正文区显示 `data-novel-chapters-empty`
 *   空态提示，不崩溃。
 * - 错误态：章节/场景读取失败分别显示 `data-novel-chapters-error` 与重试按钮
 *   （`data-novel-chapters-retry`），可独立恢复，不 brick 整个面板。
 * - 场景正文按空行拆段渲染为只读段落（与 docs/ 派生镜像同一分节习惯）。
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
}

export interface ChaptersEditOps {
  selectChapter(chapterId: string): void;
  selectScene(sceneId: string): void;
  retryChapter(): void;
  retryScene(): void;
}

export function freshChapters(): ChaptersLayerState {
  return { status: 'loading', list: [], chapter: { status: 'idle' }, scene: { status: 'idle' } };
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

export function chaptersPanel(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, state: ChaptersLayerState, ops: ChaptersEditOps): unknown {
  if (state.status === 'loading') {
    return h('section', { className: 'nv-chapters', 'data-novel-chapters-panel': '', 'data-novel-chapters-state': 'loading' }, '正在装载章节…');
  }
  if (state.status === 'error') {
    return h('section', { className: 'nv-chapters', 'data-novel-chapters-panel': '', 'data-novel-chapters-state': 'error' },
      errorBlock(h, state.message ?? '章节列表读取失败', () => ops.retryChapter(), '重试'));
  }
  const chapter = state.chapter.read;
  const scenes = chapter?.scenes ?? [];
  // 正文区状态机：场景错误 → 场景读取中 → 章节错误 → 空章 → 场景正文 → 未选择。
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
    body = proseParagraphs(h, state.scene.item.content);
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
    ),
  );
}
