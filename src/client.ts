import {
  type BundleRequire,
  type ClientPluginEntry,
  type El,
  type ReactFace,
  type WorkspaceViewModel,
  el as createElement,
  unwrap,
} from './client/shared.js';
import { reloadProject } from './client/project-session.js';
import { WORKBENCH_STYLES } from './client/styles.js';
import { scheduleFocus } from './client/focus.js';
// I83：视图分发（viewPanel + 面板注册表）迁至 client/panels/，mount 生命周期
// 迁至 client/mount.ts（架构审查 §4.1 / §9 #5）；client.ts 只保留装配与渲染外壳。
// I90：Overlay 渲染面（workbenchView / ui 方法表）迁至 client/presenter.ts，
// 纯逻辑（project/onboarding/settings/upload）迁至 client/controllers.ts，
// Remote 资源清单迁至 client/mount-registry.ts（review v2.0 §3.5）。
import { createWorkbenchStore, type DefineStore, type LayerData, type WorkbenchActions, type WorkbenchOps, type WorkbenchState } from './client/store/index.js';
import { createWorkbenchOps } from './client/ops/index.js';
import { createQueuePollController } from './client/queue-poll.js';
import type { LlmConfigDraftShape } from './client/settings.js';
import type { WorkbenchSettingsDraftShape } from './client/workbench-settings.js';
import type { MountContext } from './client/mount.js';
import { mountRemoteRegistry, type RemoteServiceBag } from './client/mount-registry.js';
import { createOnboardingController, createProjectController, createSettingsController, createUploadController } from './client/controllers.js';
import { createImportInterpretationController, paragraphsFromHostChunks } from './client/import-interpretation-review.js';
import { createWorkbenchUi, launchButton, workbenchView, type WorkbenchViewProps } from './client/presenter.js';

/** 侧栏/面板宽度与步进常量已迁至 store 契约层（I82，src/client/store/types.ts）；
 *  此处 re-export 保持既有导入面（client.test.ts 的 NAV/PANEL 锚点不变）。 */
export { NAV_WIDTH_MIN, NAV_WIDTH_MAX, NAV_WIDTH_DEFAULT, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT, PANEL_NAV_AUTO_COLLAPSE, GRID_STEP } from './client/store/types.js';

/** Compatibility facade retained for the public client rendering contract.
 *  I90 后渲染面迁至 presenter.ts（el 实现仍由 shared.js 拥有）；此 facade 保持
 *  `src/client.ts` 的 I46 源级契约 —— client-shell.test.ts 断言入口可见
 *  `React.createElement` 与 `function el(`（渲染只经 createElement + el()，
 *  无 JSX runtime）。非死代码：测试契约即消费者。 */
function el(React: ReactFace): El {
  // Keep the explicit primitive visible at the entry boundary; shared owns the implementation.
  void React.createElement;
  return createElement(React);
}

/**
 * I90 client.ts 收敛为纯装配根（review v2.0 §3.5 / 计划 §18 I90）：
 * - Remote 资源清单（23 个 namespace）单份维护于 mount-registry.ts；
 * - project/onboarding/settings/upload 纯逻辑在 controllers.ts；
 * - Overlay 渲染面（workbenchView 21 形参 → props 对象 + ui 方法表）在 presenter.ts；
 * - 本文件只做：入口契约（factory/apply/slot 注册/store 创建/re-export 常量）+
 *   装配（service bag → controllers → Overlay）+ Fiber disposer。
 */
export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  const runtime = require('@deepseek-ai/dsh-client-runtime/client') as { defineStore?: DefineStore } | undefined;
  const defineStore = runtime?.defineStore;
  if (defineStore === undefined) {
    throw new Error('DSH client runtime defineStore is unavailable');
  }
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots', 'remote'],
    apply(ctx): void {
      let active = true;
      let currentProjectId: string | undefined;

      // I59 请求去重（design §14.8 / R12-6）：同一操作键在 Remote 返回前至多提交
      // 一次（双击/连点至多一次 Remote）。键为「领域:动作」：层保存按层、项目打开
      // 按 projectId、裁决按层；synchronous 判定，React 重渲染前的同 tick 连点也能挡住。
      const inflight = new Set<string>();
      const beginOp = (key: string): boolean => {
        if (inflight.has(key)) return false;
        inflight.add(key);
        return true;
      };
      const endOp = (key: string): void => { inflight.delete(key); };

      // The store is the wiring hub: actions write it; the component subscribes
      // via useStore and re-renders. Every load result and every editor draft
      // mutation flows through an action, so no plain `let` mutation can leave
      // the UI stale (the I46–I49 defect this fixes).
      // I82：store 工厂（fresh 状态 + actions 表）迁至 src/client/store/index.ts，
      // 此处只把 DSH defineStore 交给它；返回的 StoreHandle 由 slot 注册的 `store:` 工厂持有。
      const storeHandle = createWorkbenchStore(defineStore);

      // The renderer owns the store instance (created from the `store:` factory on
      // the registration). We capture its baked actions through the registration's
      // `inject` factory — the SAME instance the component receives as
      // `props.actions` — so every async load and edit write re-renders the
      // overlay. Never call `storeHandle.create()` here: a second instance would
      // be a disguised singleton that the UI does not subscribe to.
      let capturedActions: WorkbenchActions | undefined;
      const pending: Array<(a: WorkbenchActions) => void> = [];
      const lifecycleActions = (actions: WorkbenchActions): WorkbenchActions => {
        const guarded: Record<string, (...params: unknown[]) => void> = {};
        for (const [name, action] of Object.entries(actions as unknown as Record<string, (...params: unknown[]) => void>)) {
          guarded[name] = (...params: unknown[]) => { if (active) action(...params); };
        }
        return guarded as unknown as WorkbenchActions;
      };
      const dispatch = (fn: (a: WorkbenchActions) => void): void => {
        if (!active) return;
        if (capturedActions !== undefined) fn(capturedActions);
        else pending.push(fn);
      };

      // I90：声明式 Remote registry + service bag（review v2.0 §3.5）——Remote
      // 资源清单单份维护于 mount-registry.ts；此处只注入 workspace 特例钩子
      // （viewModel + 作品列表装载 / dispatch fail 全屏错误）。bag 字段经函数
      // 延迟读取（controllers/ops），避免闭包固化陈旧引用。
      const serviceBag: RemoteServiceBag = {};
      const mountContext: MountContext = { remote: ctx.remote, get: (name, silent) => ctx.get(name, silent), isActive: () => active };
      const unmountRemotes = mountRemoteRegistry(mountContext, serviceBag, {
        workspaceAfter: (service) => {
          if (service === undefined) { dispatch((x) => x.fail('创作台远程服务不可用')); return; }
          void unwrap(service.viewModel()).then(
            (model) => {
              dispatch((x) => x.ready(model as WorkspaceViewModel));
              void unwrap(service.projectList()).then(
                (projects) => dispatch((x) => x.setProjects(projects as unknown[])),
                () => dispatch((x) => x.fail('作品列表读取失败')),
              );
            },
            () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
          );
        },
        workspaceError: () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
      });

      // I88：队列轮询 timer 归 Fiber 级持有（review v2.0 §3.3）——控制器单例在
      // slot 装配作用域创建一次（非每次渲染），随 slot 卸载（Fiber dispose）经下方
      // disposer 回收；ops 只发 start/stop 命令。isActive 用函数读取当前活跃态。
      const queuePoll = createQueuePollController({
        isActive: () => active,
        projectId: () => currentProjectId,
        queue: () => serviceBag.queueNamespace,
        onStatus: (next) => dispatch((x) => x.queuePatch({ projection: next })),
      });

      // I90：controllers（review v2.0 §3.5）——project/onboarding/settings/upload
      // 纯逻辑从 factory 闭包拆至 src/client/controllers.ts；deps 一律窄化传参。
      const project = createProjectController({
        workspace: () => serviceBag.workspace,
        currentProjectId: () => currentProjectId,
        setProjectId: (id) => { currentProjectId = id; },
        isActive: () => active,
        beginOp,
        endOp,
        dispatch,
        reloadProject,
      });
      const onboarding = createOnboardingController({
        analyzer: () => serviceBag.analyzer,
        onboarding: () => serviceBag.onboarding,
        currentProjectId: () => currentProjectId,
        isActive: () => active,
        beginOp,
        endOp,
        dispatch,
        openProject: (projectId, onOpened) => project.openProject(projectId, onOpened),
      });
      const importInterpretation = createImportInterpretationController({
        analysis: () => serviceBag.importInterpretationAnalysis,
        session: () => serviceBag.importInterpretation,
        initialization: () => serviceBag.ruleStyleImportInitialization,
        currentProjectId: () => currentProjectId,
        isActive: () => active,
        beginOp,
        endOp,
        dispatch,
        onConfirmed: () => {
          if (active) capturedActions?.workflowStage('outline');
        },
      });
      const settings = createSettingsController({
        llmConfig: () => serviceBag.llmConfig,
        workbenchSettings: () => serviceBag.workbenchSettings,
        currentProjectId: () => currentProjectId,
        isActive: () => active,
        beginOp,
        endOp,
        dispatch,
      });
      const upload = createUploadController({
        workspace: () => serviceBag.workspace,
        currentProjectId: () => currentProjectId,
        isActive: () => active,
        beginOp,
        endOp,
        dispatch,
        startAnalysis: (projectId, sourceHash, text) => onboarding.startAnalysis(projectId, sourceHash, text),
        startSourceReview: (projectId, source) => {
          // createProject/onOpened 可能与作品切换竞争；只允许刚打开的新作品消费
          // 这份上传结果，且段落范围始终来自 Host chunks。
          if (currentProjectId !== projectId) return;
          try {
            importInterpretation.begin({ sourceHash: source.sourceHash, text: source.text, paragraphs: paragraphsFromHostChunks(source.chunks) });
          } catch {
            importInterpretation.begin({ sourceHash: source.sourceHash, text: source.text, paragraphs: [] });
          }
        },
        createProject: (input, onOpened) => project.createProject(input, onOpened),
      });

      // Edit-op closures: derive from the current store snapshot and write back
      // via actions. `makeOps` runs at render time, after `inject` has captured
      // the renderer's baked actions, so `capturedActions` resolves safely.
      // I82：逐层编辑动作（makeOps 1300 行）迁至 src/client/ops/（按层工厂）；
      // 此处只构建 OpsContext 并交给组合根 createWorkbenchOps。渲染期闭包语义
      // 不变：snapshot 是当前渲染快照，act 是 inject 捕获的 baked actions。
      // I101：OpsRuntime + 窄 port 拆分（组合根按域 Pick 传参，见 ops/index.ts）。
      const makeOps = (snapshot: WorkbenchState): WorkbenchOps => createWorkbenchOps(
        {
          snapshot,
          act: capturedActions as WorkbenchActions,
          projectId: currentProjectId,
          isActive: () => active,
          beginOp,
          endOp,
          queuePoll,
        },
        {
          workspace: serviceBag.workspace,
          writing: serviceBag.writing,
          reviewNamespace: serviceBag.reviewNamespace,
          reviewRepairNamespace: serviceBag.reviewRepairNamespace,
          queueNamespace: serviceBag.queueNamespace,
          knowledgeNamespace: serviceBag.knowledgeNamespace,
          ruleStyleNamespace: serviceBag.ruleStyleNamespace,
          progressNamespace: serviceBag.progressNamespace,
          importExportNamespace: serviceBag.importExportNamespace,
          branchNamespace: serviceBag.branchNamespace,
          searchNamespace: serviceBag.searchNamespace,
          statisticsNamespace: serviceBag.statisticsNamespace,
          timelineNamespace: serviceBag.timelineNamespace,
          sceneOutlineBinding: serviceBag.sceneOutlineBinding,
          textMutation: serviceBag.textMutation,
          textDeletion: serviceBag.textDeletion,
          outlineReconciliation: serviceBag.outlineReconciliation,
          outlineDetailGeneration: serviceBag.outlineDetailGeneration,
          referenceAuditNamespace: serviceBag.referenceAudit,
          referenceCorrectionNamespace: serviceBag.referenceCorrection,
        },
      );

      // I46 视觉体系：包内 <style> 注入并归属 Fiber，卸载即回收（R10-3 / D13）。
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.setAttribute('data-novel-workbench', 'styles');
        tag.textContent = WORKBENCH_STYLES;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'novel-creation-tool: workbench styles');

      ctx.slots.inject('shell.overlay', () => {
        // I59 焦点恢复（R12-6）：关闭/Esc 时把焦点恢复到悬浮圆形入口
        // `data-novel-launch`（焦点进入由打开入口的 scheduleFocus 负责）。
        const closeWorkbench = (): void => {
          dispatch((actions) => actions.close());
          // 关闭后面板消失、悬浮圆形入口重新挂载，焦点恢复到 `data-novel-launch`（经宏任务等 React 提交）。
          scheduleFocus('[data-novel-launch]');
        };
        // The component is a real React function component subscribing to the
        // store; close/collapse/activate and every draft mutation dispatch an
        // action, and `useStore` re-renders this component on every change.
        // I90：ui 方法表经 presenter.createWorkbenchUi 构建（渲染期快照 → 控制器
        // 命令），workbenchView 以 props 对象接收 —— Overlay 只做装配。
        const Overlay = (props: { useStore: <S>(sel: (s: WorkbenchState) => S) => S; actions: WorkbenchActions }): unknown => {
          const s = props.useStore((snapshot) => snapshot);
          const ui = createWorkbenchUi({ snapshot: s, actions: props.actions, dispatch, project, onboarding, settings, upload, importInterpretation, closeWorkbench });
          const layers: LayerData = {
            characters: s.characters,
            worldview: s.worldview,
            outline: s.outline,
            relationship: s.relationship,
            state: s.state,
            canon: s.canon,
            characterEditor: s.characterEditor,
            worldEditor: s.worldEditor,
            outlineEditor: s.outlineEditor,
            relationshipEditor: s.relationshipEditor,
            stateEditor: s.stateEditor,
            canonEditor: s.canonEditor,
          };
          // UI 打磨：面板关闭时渲染悬浮圆形入口（主页面右上角）；点击打开主控界面并隐藏自己。
          if (!s.open) {
            return launchButton(React, () => {
              dispatch((actions) => actions.open());
              scheduleFocus('[data-novel-focus-scope] [data-novel-focus-target]');
            });
          }
          const viewProps: WorkbenchViewProps = {
            status: s.status,
            ns: {
              workspace: serviceBag.workspace,
              writing: serviceBag.writing,
              reviewNamespace: serviceBag.reviewNamespace,
              reviewRepairNamespace: serviceBag.reviewRepairNamespace,
              queueNamespace: serviceBag.queueNamespace,
              knowledgeNamespace: serviceBag.knowledgeNamespace,
              ruleStyleNamespace: serviceBag.ruleStyleNamespace,
              progressNamespace: serviceBag.progressNamespace,
              importExportNamespace: serviceBag.importExportNamespace,
              branchNamespace: serviceBag.branchNamespace,
              searchNamespace: serviceBag.searchNamespace,
              statisticsNamespace: serviceBag.statisticsNamespace,
              timelineNamespace: serviceBag.timelineNamespace,
              sceneOutlineBinding: serviceBag.sceneOutlineBinding,
              textMutation: serviceBag.textMutation,
              textDeletion: serviceBag.textDeletion,
              outlineReconciliation: serviceBag.outlineReconciliation,
              outlineDetailGeneration: serviceBag.outlineDetailGeneration,
              referenceAuditNamespace: serviceBag.referenceAudit,
              referenceCorrectionNamespace: serviceBag.referenceCorrection,
              onboardingNamespace: serviceBag.onboarding,
              importInterpretation: serviceBag.importInterpretation,
              importInterpretationAnalysis: serviceBag.importInterpretationAnalysis,
              longDraft: serviceBag.longDraft,
            },
            ui,
            states: {
              workflow: s.workflow,
              layers,
              chapters: s.chapters,
              review: s.review,
              referenceReview: s.referenceReview,
              queue: s.queue,
              knowledge: s.knowledge,
              ruleStyle: s.ruleStyle,
              progress: s.progress,
              importExport: s.importExport,
              search: s.search,
              statistics: s.statistics,
              timeline: s.timeline,
              router: s.router,
              outlineDetailGeneration: s.outlineDetailGeneration,
            },
            ops: makeOps(s),
            selectedProjectId: s.selectedProjectId,
            selectedProjectName: s.selectedProjectName,
            projects: s.projects,
            browsing: s.browsing,
            leaveConfirm: s.leaveConfirm,
            projectError: s.projectError,
            upload: s.upload,
            uploadResult: s.uploadResult,
            onboardingState: s.onboarding,
            importInterpretationReview: s.importInterpretationReview,
            decideOnboarding: (layer, decision, extra) => onboarding.decideOnboarding(layer, decision, extra),
            applyOnboarding: () => onboarding.applyOnboarding(),
            patchOnboarding: (patch) => onboarding.patchOnboarding(patch),
            settings: {
              view: s.settingsView,
              draft: s.settingsDraft,
              namespace: serviceBag.llmConfig,
              mutate: (patch: Partial<LlmConfigDraftShape>) => dispatch((x) => x.settingsMutate(patch)),
              save: () => ui.saveLlmConfig(),
            },
            creationSettings: {
              view: s.creationSettingsView,
              draft: s.creationSettingsDraft,
              namespace: serviceBag.workbenchSettings,
              mutate: (patch: Partial<WorkbenchSettingsDraftShape>) => dispatch((x) => x.creationSettingsMutate(patch)),
              save: () => ui.saveCreationSettings(),
              projectId: s.selectedProjectId,
              openFolder: () => ui.openCreationFolder(),
            },
          };
          return workbenchView(React, viewProps);
        };

        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: '创作台', store: () => storeHandle, inject: (actions: WorkbenchActions) => { if (!active) return {}; const guarded = lifecycleActions(actions); capturedActions = guarded; for (const fn of pending.splice(0)) fn(guarded); return {}; } },
          Overlay as unknown as () => unknown,
        );
        return () => {
          // I122：先清理当前 store 的瞬态会话，再关闭生命周期守卫；否则
          // guarded actions 会把卸载清理本身短路掉。
          capturedActions?.chaptersPolishReset();
          active = false;
          // I90：分析轮询 timer 归 onboarding controller（clearPoll = 旧 clearAnalysisPoll）；
          // namespace 清空由 service bag 生命周期负责（一次性清空，等价迁移前
          // 23 个 namespace 变量逐项置 undefined）；disposer 释放由 registry 卸载器
          // 统一做（等价迁移前逐 disposer 变量释放）。
          onboarding.clearPoll();
          importInterpretation.dispose();
          queuePoll.stop();
          capturedActions = undefined;
          pending.splice(0);
          for (const key of Object.keys(serviceBag)) { (serviceBag as Record<string, unknown>)[key] = undefined; }
          slotDisposer();
          unmountRemotes();
        };
      });
    },
  };
}
