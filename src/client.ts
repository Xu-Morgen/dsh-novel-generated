import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, type WorkspaceViewModel } from './remote.js';
import { WORKBENCH_STYLES } from './client/styles.js';

export type BundleRequire = (spec: string) => unknown;
export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
}
export interface EditorRemote {
  characterList(projectId: string): Promise<unknown[]>;
  characterRead(projectId: string, entityId: string): Promise<unknown>;
  characterCreate(projectId: string, input: unknown): Promise<unknown>;
  characterUpdate(projectId: string, entityId: string, patch: unknown): Promise<unknown>;
  worldviewList(projectId: string): Promise<unknown[]>;
  worldviewRead(projectId: string, entityId: string): Promise<unknown>;
  worldviewCreate(projectId: string, input: unknown): Promise<unknown>;
  worldviewRewrite(projectId: string, entityId: string, input: unknown): Promise<unknown>;
  outlineRead(projectId: string): Promise<unknown>;
  outlineSave(projectId: string, input: unknown): Promise<unknown>;
  outlineBeatCards(projectId: string): Promise<unknown[]>;
  relationshipRead(projectId: string): Promise<unknown[]>;
  relationshipSave(projectId: string, input: unknown): Promise<unknown>;
  stateCurrent(projectId: string): Promise<unknown>;
  stateSnapshots(projectId: string): Promise<unknown[]>;
  stateRollback(projectId: string, seq: number): Promise<unknown>;
  stateDiff(projectId: string, fromSeq: number, toSeq: number): Promise<unknown>;
  canonQuery(projectId: string, filter?: unknown): Promise<unknown[]>;
  canonCorrectionPropose(projectId: string, targetId: string, input: unknown): Promise<unknown>;
  canonCorrectionAccept(projectId: string, proposalId: string): Promise<unknown>;
}
/** The mounted `remote.novelWorkspace` namespace service surface. */
export interface WorkspaceNamespace extends EditorRemote {
  viewModel(): Promise<unknown>;
}
export interface WorkspaceSlots {
  inject(key: string, cb: () => () => void): () => void;
  register(options: unknown, component: () => unknown): () => void;
}
export interface ClientPluginEntry {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: {
    slots: WorkspaceSlots;
    remote: { $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer> };
    get(name: string, silent?: boolean): unknown;
    /** Cordis effect: runs `callback` once, disposes its return on Fiber unload (H0-6). */
    effect(callback: () => void | (() => void), label?: string): () => void;
  }): void;
}

/** Minimal browser DOM surface for package-owned `<style>` injection (R10-3). */
interface WorkbenchStyleElement {
  setAttribute(name: string, value: string): void;
  remove(): void;
  textContent: string;
}
declare const document: {
  createElement(tag: 'style'): WorkbenchStyleElement;
  readonly head: { appendChild(node: WorkbenchStyleElement): unknown };
};

type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

/**
 * I46「创作台」六层信息架构（design §14.6 / R10-1）。每层只占一个空态占位；
 * 真实表单内容分别在 I47（B3/B2）、I48（B5/C1）、I49（C2/C4）交付，本迭代不
 * 实现任何真实字段。`id` 即测试契约 `data-novel-layer` 的取值。
 */
const LAYERS = [
  { id: 'characters', label: '角色', title: '角色核心（B3）', hint: '角色列表与详情表单将在 I47 交付。' },
  { id: 'worldview', label: '世界观', title: '世界观（B2）', hint: '世界观条目与改写（supersede）将在 I47 交付。' },
  { id: 'outline', label: '大纲', title: '大纲与细纲（B5）', hint: '幕→节→细纲结构化编辑将在 I48 交付。' },
  { id: 'relationship', label: '关系', title: '关系（C1）', hint: '关系对结构化编辑将在 I48 交付。' },
  { id: 'state', label: '状态', title: '状态快照（C2）', hint: '快照时间线 / 回滚 / diff 将在 I49 交付。' },
  { id: 'canon', label: '正史', title: '正史账本（C4）', hint: '只读账本与 supersede 更正将在 I49 交付。' },
] as const;
type LayerId = (typeof LAYERS)[number]['id'];

/** 面板交互态：overlay 面板与侧栏启动入口共享（关闭后由启动入口重开）。 */
interface WorkbenchUI {
  readonly open: boolean;
  readonly collapsed: boolean;
  readonly activeLayer: LayerId;
  collapse(): void;
  close(): void;
  launch(): void;
  activate(id: LayerId): void;
}

/** Unwrap a DSH RemoteResult envelope: resolve to `value`, reject on `!ok`. */
function unwrap(promise: Promise<unknown> | undefined): Promise<unknown> {
  if (promise === undefined) return Promise.resolve(undefined);
  return promise.then((result) => {
    const envelope = result as { ok?: boolean; value?: unknown; error?: { message?: string } };
    if (envelope !== null && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok === true) return envelope.value;
      throw new Error(envelope.error?.message ?? 'Remote call failed');
    }
    return result;
  });
}

/**
 * 小型 `el()` 助手（D13）：薄封装 `React.createElement`，不引入 JSX runtime。
 * 组件仍以 `React.createElement` 为唯一渲染原语，`el()` 只省去 `null` props。
 */
type El = (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
function el(React: ReactFace): El {
  return (tag, props, ...children) => React.createElement(tag, props ?? null, ...children);
}

/** 品牌头栏：砚台朱砂标记 + 衬线标题 + 折叠/关闭。 */
function brandHeader(h: El, subtitle: string | undefined, ui: WorkbenchUI): unknown {
  return h('header', { className: 'nv-workbench__brand', 'data-novel-brand': '' },
    h('span', { className: 'nv-workbench__mark', 'aria-hidden': 'true' }, '砚'),
    h('div', null,
      h('h2', { className: 'nv-workbench__title' }, '创作台'),
      subtitle === undefined ? null : h('span', { className: 'nv-workbench__subtitle' }, subtitle),
    ),
    h('button', { type: 'button', className: 'nv-workbench__toggle', 'aria-expanded': String(!ui.collapsed), onClick: () => ui.collapse() }, ui.collapsed ? '展开' : '折叠'),
    h('button', { type: 'button', className: 'nv-workbench__close', 'aria-label': '关闭创作台', onClick: () => ui.close() }, '关闭'),
  );
}

/** 左侧层级导航：六层一桌，激活项打朱砂。 */
function layerNav(h: El, ui: WorkbenchUI): unknown {
  return h('nav', { className: 'nv-workbench__nav', 'data-novel-nav': '', 'aria-label': '创作台层级' },
    LAYERS.map((layer) => h('button', {
      key: layer.id,
      type: 'button',
      className: 'nv-workbench__nav-item' + (ui.activeLayer === layer.id ? ' is-active' : ''),
      'data-novel-layer': layer.id,
      'aria-current': ui.activeLayer === layer.id ? 'page' : undefined,
      onClick: () => ui.activate(layer.id),
    }, layer.label)),
  );
}

/** 单层空态占位（I46 只占位，真实表单在 I47–I49）。 */
function emptyState(h: El, layer: (typeof LAYERS)[number]): unknown {
  return h('section', {
    className: 'nv-workbench__empty',
    'data-novel-layer-panel': layer.id,
    'data-novel-layer-state': 'empty',
  },
    h('h3', { className: 'nv-workbench__empty-title' }, layer.title),
    h('p', { className: 'nv-workbench__empty-hint' }, layer.hint),
  );
}

/** 内容区：当前激活层的空态面板。 */
function contentArea(h: El, ui: WorkbenchUI): unknown {
  const layer = LAYERS.find((item) => item.id === ui.activeLayer) ?? LAYERS[0];
  return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
    emptyState(h, layer),
  );
}

/** 面板主体：品牌头栏 + 层级导航 + 内容区。 */
function workbenchView(React: ReactFace, state: WorkspaceState, workspace: WorkspaceNamespace | undefined, ui: WorkbenchUI): unknown {
  const h = el(React);
  if (!ui.open) return null;
  const ready = state.status === 'ready' && workspace !== undefined;
  const effectiveStatus: WorkspaceState['status'] = ready ? 'ready'
    : state.status === 'error' ? 'error' : state.status;
  const message = state.status === 'error' ? state.message
    : (effectiveStatus === 'error' ? '创作台远程服务不可用' : undefined);
  const subtitle = ready ? `已就绪 · ${state.model.version}` : undefined;
  const body = effectiveStatus === 'ready'
    ? h('div', { className: 'nv-workbench__body' }, layerNav(h, ui), contentArea(h, ui))
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : message);
  return h('section', { className: 'nv-workbench', 'data-novel-workspace': effectiveStatus },
    brandHeader(h, subtitle, ui),
    ui.collapsed ? null : body,
  );
}

/** 侧栏启动入口（D11）：可发现的「创作台」按钮，点击后（重新）打开 overlay 面板。 */
function launchButton(React: ReactFace, launch: () => void): unknown {
  const h = el(React);
  return h('button', {
    type: 'button',
    className: 'nv-launch',
    'data-novel-launch': '',
    onClick: () => launch(),
  }, '创作台');
}

/** Public bundle factory; React and Remote are supplied by the DSH client shell. */
export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots', 'remote'],
    apply(ctx): void {
      let state: WorkspaceState = { status: 'loading' };
      let workspace: WorkspaceNamespace | undefined;
      let mounted = false;
      let remoteDisposer: TypertDisposer | undefined;
      let open = true;
      let collapsed = false;
      let activeLayer: LayerId = 'characters';
      const ui: WorkbenchUI = {
        get open() { return open; },
        get collapsed() { return collapsed; },
        get activeLayer() { return activeLayer; },
        collapse() { collapsed = !collapsed; },
        close() { open = false; },
        launch() { open = true; collapsed = false; },
        activate(id) { activeLayer = id; },
      };

      // I46 视觉体系：包内 <style> 注入并归属 Fiber，卸载即回收（R10-3 / D13）。
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.setAttribute('data-novel-workbench', 'styles');
        tag.textContent = WORKBENCH_STYLES;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'novel-creation-tool: workbench styles');

      ctx.slots.inject('shell.overlay', () => {
        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
          () => workbenchView(React, state, workspace, ui),
        );
        // Self-mount the namespace, then resolve it through `ctx.get` instead of
        // `inject`: injecting `remote.novelWorkspace` here would deadlock, because
        // that service only exists after `$mount` completes.
        void ctx.remote.$mount(workspaceRemoteContribution).then((dispose) => {
          if (!mounted) { void dispose(); return; }
          remoteDisposer = dispose;
          workspace = ctx.get('remote.novelWorkspace', false) as WorkspaceNamespace | undefined;
          if (!workspace) { state = { status: 'error', message: '创作台远程服务不可用' }; return; }
          return unwrap(workspace.viewModel()).then(
            (model) => { state = { status: 'ready', model: model as WorkspaceViewModel }; },
            () => { state = { status: 'error', message: '创作台远程服务不可用' }; },
          );
        }, () => { state = { status: 'error', message: '创作台远程服务不可用' }; });
        mounted = true;
        return () => {
          mounted = false;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
        };
      });

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
        () => launchButton(React, ui.launch),
      ));
    },
  };
}
