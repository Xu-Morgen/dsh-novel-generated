/**
 * I90 client.ts 拆 controllers（review v2.0 §3.5 / 计划 §18 I90）。
 *
 * 从 client.ts factory 闭包拆出的四个纯逻辑 controller（无渲染、无 DOM）：
 * - `createProjectController`：作品打开/创建/列表浏览（迁移 client.ts 400-509 行）；
 * - `createOnboardingController`：六层分析/裁决/apply 流（迁移 510-654 行，
 *   含 ANALYSIS_POLL_INTERVAL_MS 轮询与 clearAnalysisPoll 的 Fiber 归属）；
 * - `createSettingsController`：LLM 设置 / 创作设置惰性装载与保存（迁移 Overlay
 *   ui 方法表 725-804 行附近）；
 * - `createUploadController`：DOCX 受控上传链（迁移 ui.uploadFile）。
 *
 * 纪律：deps 一律窄化传参（函数或值），**禁止把完整 ctx / store / snapshot 传进
 * controller**；渲染期快照相关输入（如 `browsing`、`settingsView` 是否已装载）
 * 由调用方（presenter ui 表，每次渲染重建）显式传入，controller 不持有 store。
 *
 * 行为不变式（迁移等价，review v2.0 §3.5「行为等价」）：
 * - `isActive()` 函数守卫：Remote 完成晚于 Fiber 卸载时不 dispatch、不续调；
 * - `beginOp/endOp` 请求去重（I59/R12-6）：同一操作键至多一次在途；
 * - 写 store 一律经 `dispatch`（inject 捕获的 baked actions，I46–I49 缺陷修复）。
 */
import type { WorkbenchActions } from './store/types.js';
import { reloadProject, type ProjectOpenLayers } from './project-session.js';
import { toUserMessage } from './presentation.js';
import { projectIdForUpload, selectDocx, uploadDocx } from './upload.js';
import {
  ANALYSIS_POLL_INTERVAL_MS,
  adjudicateOne,
  analysisResult,
  applyAccepted,
  beginAnalysis,
  type OnboardingAdjudicationExtra,
  type OnboardingAnalysisState,
  type OnboardingAnalyzerNamespace,
  type OnboardingDecision,
  type OnboardingLayerId,
  type OnboardingNamespace,
  type OnboardingState,
} from './onboarding.js';
import type { LlmConfigDraftShape, LlmConfigNamespace, LlmConfigViewShape } from './settings.js';
import type { WorkbenchSettingsDraftShape, WorkbenchSettingsNamespace, WorkbenchSettingsViewShape } from './workbench-settings.js';
import type { WorkspaceNamespace } from './shared.js';
import { slug, unwrap } from './shared.js';
import { sha256Hex } from './sha256.js';
import { readWorkflowResume, writeWorkflowResume } from './workflow.js';

/** 通用窄依赖面：各 controller 只 Pick 自己需要的字段（I90 窄化传参）。 */
export interface ControllerBaseDeps {
  isActive(): boolean;
  beginOp(key: string): boolean;
  endOp(key: string): void;
  dispatch(fn: (a: WorkbenchActions) => void): void;
}

// ---------------------------------------------------------------------------
// Project controller（作品打开/创建/列表浏览）
// ---------------------------------------------------------------------------

export interface ProjectControllerDeps extends ControllerBaseDeps {
  workspace(): WorkspaceNamespace | undefined;
  currentProjectId(): string | undefined;
  /** 记录当前作品 id（apply 级闭包写入，Fiber 生命周期内可变）。 */
  setProjectId(id: string | undefined): void;
  /** reloadProject 装载动作（I82 契约，client/ops 外唯一装载入口）。 */
  reloadProject: typeof reloadProject;
}

export interface ProjectController {
  openProject(projectId: string, onOpened?: () => void): void;
  createProject(input: { projectId: string; name: string }, onOpened?: () => void): void;
  archiveProject(projectId: string): void;
  restoreProject(projectId: string): void;
  browseToProjects(): void;
  cancelBrowse(): void;
}

/**
 * 项目打开/创建/列表切换（迁移 client.ts 400-509 行闭包）。
 * 行为逐字保持：open 成功先 selectProject+resetEditors 再 reloadProject；
 * 失败 projectFailed 保持当前视图不 brick；列表刷新失败保留既有列表。
 */
export function createProjectController(deps: ProjectControllerDeps): ProjectController {
  const refreshCatalog = async (target: WorkspaceNamespace): Promise<void> => {
    const [projects, archivedProjects] = await Promise.all([
      unwrap(target.projectList()),
      unwrap(target.projectArchiveList()),
    ]);
    if (!deps.isActive()) return;
    deps.dispatch((actions) => {
      actions.setProjects(projects as unknown[]);
      actions.setArchivedProjects(archivedProjects as unknown[]);
    });
  };
  const openProject = (projectId: string, onOpened?: () => void): void => {
    const target = deps.workspace();
    if (!deps.isActive() || target === undefined) return;
    if (!deps.beginOp(`project:open:${projectId}`)) return;
    const release = (): void => deps.endOp(`project:open:${projectId}`);
    void unwrap(target.projectOpen(projectId)).then((result) => {
      release();
      if (!deps.isActive()) return;
      deps.setProjectId(projectId);
      const layers = (result as { layers?: ProjectOpenLayers } | undefined)?.layers;
      const name = (result as { project?: { name?: string } } | undefined)?.project?.name;
      deps.dispatch((actions) => {
        actions.selectProject(projectId, name);
        // I55：打开/切换成功前清空旧作品编辑器草案与初始化状态，杜绝跨项目串写。
        actions.resetEditors();
        // I139：恢复只按当前作品 id 命中；无记录的新作品从导入阶段开始。
        actions.workflowResume(readWorkflowResume(projectId));
        deps.reloadProject(target, projectId, actions, deps.dispatch, () => deps.isActive(), layers);
      });
      if (onOpened) onOpened();
    }, (cause: Error) => { release(); deps.dispatch((actions) => actions.projectFailed(`作品打开失败：${toUserMessage(cause, '未知错误')}`)); });
  };
  const createProject = (input: { projectId: string; name: string }, onOpened?: () => void): void => {
    const target = deps.workspace();
    if (!deps.isActive() || target === undefined) return;
    if (!deps.beginOp('project:create')) return;
    const release = (): void => deps.endOp('project:create');
    deps.dispatch((actions) => actions.createProject(input));
    void unwrap(target.projectCreate(input)).then((project) => {
      release();
      if (!deps.isActive()) return;
      deps.dispatch((actions) => actions.setProjects([project]));
      openProject((project as { id: string }).id, onOpened);
    }, () => { release(); deps.dispatch((actions) => actions.fail('作品创建失败')); });
  };
  const archiveProject = (projectId: string): void => {
    const target = deps.workspace();
    if (!deps.isActive() || target === undefined) return;
    const key = `project:archive:${projectId}`;
    if (!deps.beginOp(key)) return;
    deps.dispatch((actions) => actions.projectOperationStarted());
    void unwrap(target.projectArchive(projectId)).then(async () => {
      if (!deps.isActive()) return;
      if (deps.currentProjectId() === projectId) {
        deps.setProjectId(undefined);
        deps.dispatch((actions) => { actions.clearProjectSelection(); actions.resetEditors(); });
      }
      await refreshCatalog(target);
    }).catch((cause: Error) => {
      if (deps.isActive()) deps.dispatch((actions) => actions.projectFailed(`作品归档失败：${toUserMessage(cause, '未知错误')}`));
    }).finally(() => deps.endOp(key));
  };
  const restoreProject = (projectId: string): void => {
    const target = deps.workspace();
    if (!deps.isActive() || target === undefined) return;
    const key = `project:restore:${projectId}`;
    if (!deps.beginOp(key)) return;
    deps.dispatch((actions) => actions.projectOperationStarted());
    void unwrap(target.projectRestore(projectId)).then(() => refreshCatalog(target)).catch((cause: Error) => {
      if (deps.isActive()) deps.dispatch((actions) => actions.projectFailed(`作品恢复失败：${toUserMessage(cause, '未知错误')}`));
    }).finally(() => deps.endOp(key));
  };
  // I55：返回作品列表（切换入口）。脏表单裁决由组件层 `requestBrowse` 先行完成，
  // 这里只切换为列表视图并刷新作品列表，不丢当前作品（browseProjects 保留 selectedProjectId）。
  const browseToProjects = (): void => {
    if (!deps.beginOp('browse:list')) return;
    const release = (): void => deps.endOp('browse:list');
    deps.dispatch((actions) => actions.browseProjects());
    const target = deps.workspace();
    if (target !== undefined) {
      void refreshCatalog(target).then(
        release,
        release, // 列表刷新失败不 brick：保留既有列表，切换本身非破坏性。
      );
    } else {
      release();
    }
  };
  const cancelBrowse = (): void => {
    deps.dispatch((actions) => actions.cancelBrowse());
  };
  return Object.freeze({ openProject, createProject, archiveProject, restoreProject, browseToProjects, cancelBrowse });
}

// ---------------------------------------------------------------------------
// Onboarding controller（分析/裁决/apply 流）
// ---------------------------------------------------------------------------

export interface OnboardingControllerDeps extends ControllerBaseDeps {
  analyzer(): OnboardingAnalyzerNamespace | undefined;
  onboarding(): OnboardingNamespace | undefined;
  currentProjectId(): string | undefined;
  /** apply 成功后离开审阅并重开作品（复用 project controller 的 openProject）。 */
  openProject(projectId: string, onOpened?: () => void): void;
}

export interface OnboardingController {
  /** 原文入口：trim + sha256 后启动分析（I53/R12-4）。 */
  analyzeText(text: string): void;
  /** 已知 sourceHash 时直接启动分析（DOCX 上传复用，免二次哈希）。 */
  startAnalysis(projectId: string, sourceHash: string, text: string): void;
  cancelAnalysis(): void;
  retryAnalysis(): void;
  decideOnboarding(layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra): void;
  applyOnboarding(): void;
  patchOnboarding(patch: Partial<OnboardingState>): void;
  /** Fiber disposer 归属：清除分析轮询 timer（与 I57 clearAnalysisPoll 等价）。 */
  clearPoll(): void;
}

/**
 * 六层分析/裁决/apply 流（迁移 client.ts 510-654 行闭包）。
 *
 * 轮询 timer 属 Fiber：`clearPoll()` 由 client.ts 的 Fiber disposer 调用一次，
 * 卸载后零新调度（配合 isActive() 守卫，review v2.0 §3.5 / 设计 §0.1.1 Fiber 行）。
 * 分析/裁决/apply 的防重复、终态门、partial-retryable 语义逐字保持。
 */
export function createOnboardingController(deps: OnboardingControllerDeps): OnboardingController {
  // I53: The current onboarding state is mirrored in a closure so the verdict/apply
  // handlers can read it without reaching into the reactive store snapshot.
  let currentOnboarding: OnboardingState | undefined;
  const setOnboarding = (next: OnboardingState | undefined): void => {
    currentOnboarding = next;
    deps.dispatch((actions) => actions.onboarding(next));
  };
  // I57 session-first flow (R12-4): `begin` returns the session id immediately,
  // then the client polls `status` for busy/progress and calls `cancel` or
  // `result` on terminal states. The poll timer belongs to the Fiber and is
  // cleared on dispose, so no listener leaks after unload.
  let analysisPollTimer: ReturnType<typeof setTimeout> | undefined;
  const clearAnalysisPoll = (): void => {
    if (analysisPollTimer !== undefined) { clearTimeout(analysisPollTimer); analysisPollTimer = undefined; }
  };
  const setAnalysis = (analysis: OnboardingAnalysisState | undefined): void => {
    if (currentOnboarding === undefined) return;
    currentOnboarding = { ...currentOnboarding, analysis };
    deps.dispatch((actions) => actions.onboardingAnalysis(analysis));
  };
  const startAnalysis = (projectId: string, sourceHash: string, text: string): void => {
    const target = deps.analyzer();
    if (!deps.isActive() || target === undefined) { setOnboarding({ projectId, onboardingSessionId: '', sourceHash, decisions: {}, analysis: { status: 'failed', error: '分析服务不可用', sourceText: text } }); return; }
    // 分析中防重复 start：queued/running 期间忽略再次点击（R12-4）。
    const status = currentOnboarding?.analysis?.status;
    if (status === 'queued' || status === 'running') return;
    // 分析开始即切到独立「六层初始化审阅」页签，让原文入口与审阅面板可见。
    deps.dispatch((actions) => actions.activateOnboarding());
    clearAnalysisPoll();
    // 以原文本（或 DOCX 提取文本）发起分析；busy 状态先行，让进度立即可见。
    setOnboarding({ projectId, onboardingSessionId: '', sourceHash, decisions: {}, analysis: { status: 'queued', sourceText: text } });
    void beginAnalysis(target, { projectId, sourceHash, text }).then((sessionId) => {
      if (!deps.isActive()) return;
      if (currentOnboarding?.projectId !== projectId || currentOnboarding?.sourceHash !== sourceHash) return;
      setAnalysis({ status: 'running', sessionId, sourceText: text });
      const poll = (): void => {
        const next = deps.analyzer();
        if (!deps.isActive() || next === undefined) { clearAnalysisPoll(); return; }
        void unwrap(next.status(sessionId)).then((statusRaw) => {
          if (!deps.isActive()) return;
          // 取消竞态防护：用户已取消/失败后，即使上一次 status 刚返回 running
          // 也不再继续轮询（R12-4 监听归零）。
          const local = currentOnboarding?.analysis;
          if (local !== undefined && (local.status === 'cancelled' || local.status === 'failed' || local.status === 'succeeded')) { clearAnalysisPoll(); return; }
          const s = statusRaw as string;
          if (s === 'succeeded') {
            clearAnalysisPoll();
            void analysisResult(next, sessionId).then((result) => {
              if (!deps.isActive()) return;
              const session = result as { onboardingSessionId?: string; sourceHash?: string; layers?: unknown };
              setOnboarding({
                projectId,
                onboardingSessionId: session.onboardingSessionId ?? sessionId,
                sourceHash: session.sourceHash ?? sourceHash,
                decisions: {},
                layers: session.layers,
                analysis: { status: 'succeeded', sessionId, sourceText: text },
              });
            }, (cause: Error) => setAnalysis({ status: 'failed', sessionId, error: toUserMessage(cause), sourceText: text }));
            return;
          }
          if (s === 'failed' || s === 'cancelled') {
            clearAnalysisPoll();
            if (s === 'failed') {
              void analysisResult(next, sessionId).then(() => undefined, (cause: Error) => setAnalysis({ status: 'failed', sessionId, error: toUserMessage(cause), sourceText: text }));
            } else {
              setAnalysis({ status: 'cancelled', sessionId, error: '分析已取消', sourceText: text });
            }
            return;
          }
          analysisPollTimer = setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS);
        }, (cause: Error) => {
          clearAnalysisPoll();
          setAnalysis({ status: 'failed', sessionId, error: toUserMessage(cause), sourceText: text });
        });
      };
      poll();
    }, (cause: Error) => {
      if (!deps.isActive()) return;
      setAnalysis({ status: 'failed', error: toUserMessage(cause), sourceText: text });
    });
  };
  const cancelAnalysis = (): void => {
    const target = deps.analyzer();
    const sessionId = currentOnboarding?.analysis?.sessionId;
    if (!deps.isActive() || target === undefined || !sessionId) return;
    clearAnalysisPoll();
    setAnalysis({ status: 'cancelled', sessionId, error: '分析已取消', sourceText: currentOnboarding?.analysis?.sourceText });
    void unwrap(target.cancel(sessionId)).catch(() => undefined);
  };
  const retryAnalysis = (): void => {
    const state = currentOnboarding;
    const text = state?.analysis?.sourceText;
    if (state === undefined || !text) return;
    // 重试复用同一原文重新分析；busy 状态由 startAnalysis 重建（R12-4）。
    startAnalysis(state.projectId, state.sourceHash, text);
  };
  // I56: 逐层裁决草稿（编辑 JSON 文本 / 重生成反馈 / 打开面板）与终态门都经
  // store 持久化；`currentOnboarding` 闭包镜像同步更新，保证裁决回调读到最新绑定。
  const patchOnboarding = (patch: Partial<OnboardingState>): void => {
    if (!deps.isActive()) return;
    if (currentOnboarding) currentOnboarding = { ...currentOnboarding, ...patch };
    deps.dispatch((actions) => actions.onboardingPatch(patch));
  };
  const decideLayer = (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra): void => {
    const target = deps.onboarding();
    const state = currentOnboarding;
    if (!deps.isActive() || target === undefined || !state) return;
    // I59 防重复提交（R12-6）：同一层在裁决返回前忽略再次点击。
    if (!deps.beginOp(`onboarding:decide:${layer}`)) return;
    const release = (): void => deps.endOp(`onboarding:decide:${layer}`);
    deps.dispatch((actions) => actions.onboardingDecision(layer, decision));
    void adjudicateOne(target, state, layer, decision, extra).then(() => {
      release();
      if (!deps.isActive()) return;
      // 裁决成功即关闭该层打开的裁决面板（草稿保留，可再次编辑）。
      patchOnboarding({ openPanel: { ...(currentOnboarding?.openPanel ?? {}), [layer]: undefined } });
    }, (cause: Error) => { release(); if (!deps.isActive()) return; deps.dispatch((actions) => actions.onboardingError(toUserMessage(cause))); });
  };
  // I57 (R12-4): final apply 成功后刷新六层并激活创作台；partial-retryable
  // 只重试未完成层 —— 重试按钮直接再次调用 finalApply，Host 侧按领域身份
  // 幂等（已应用层不重复写，见 I53 验收「重复 apply 语义幂等」）。
  // I59：apply 进行中置 applying（按钮忙碌禁用），同 tick 连点至多一次 finalApply。
  const applyOnboarding = (): void => {
    const target = deps.onboarding();
    const state = currentOnboarding;
    if (!deps.isActive() || target === undefined || !state) return;
    if (state.applying === true || !deps.beginOp('onboarding:apply')) return;
    const release = (): void => deps.endOp('onboarding:apply');
    patchOnboarding({ applying: true, error: undefined });
    void applyAccepted(target, state).then((result) => {
      release();
      if (!deps.isActive()) return;
      patchOnboarding({ applying: false });
      if (result.blockedLayers.length === 0 && result.pendingLayers.length === 0 && !result.retryable) {
        // 成功：离开审阅页签，经 Host projectOpen 复核并刷新六层（成功刷新六层）。
        setOnboarding(undefined);
        writeWorkflowResume({ projectId: state.projectId, stage: 'outline' });
        deps.openProject(state.projectId, () => {
          deps.dispatch((actions) => {
            actions.workflowStage('outline');
            actions.activateView('workflow');
          });
        });
        return;
      }
      deps.dispatch((actions) => actions.onboardingApplyResult(result));
    }, (cause: Error) => { release(); if (!deps.isActive()) return; patchOnboarding({ applying: false }); deps.dispatch((actions) => actions.onboardingError(toUserMessage(cause))); });
  };
  const analyzeText = (text: string): void => {
    const projectId = deps.currentProjectId();
    const normalized = text.trim();
    if (!projectId || normalized.length === 0) return;
    void sha256Hex(normalized).then((hash) => {
      startAnalysis(projectId, hash, normalized);
    });
  };
  return Object.freeze({
    analyzeText,
    startAnalysis,
    cancelAnalysis,
    retryAnalysis,
    decideOnboarding: decideLayer,
    applyOnboarding,
    patchOnboarding,
    clearPoll: clearAnalysisPoll,
  });
}

// ---------------------------------------------------------------------------
// Settings controller（LLM 设置 / 创作设置惰性装载与保存）
// ---------------------------------------------------------------------------

export interface SettingsControllerDeps extends ControllerBaseDeps {
  llmConfig(): LlmConfigNamespace | undefined;
  workbenchSettings(): WorkbenchSettingsNamespace | undefined;
  currentProjectId(): string | undefined;
}

export interface SettingsController {
  /** 首次进入 settings 视图时惰性装载 Host 视图（missing = 渲染快照 settingsView 未装载）。 */
  ensureLlmConfigLoaded(missing: boolean): void;
  /** 保存 LLM 路由（draft/hasKey 来自渲染快照；I59 防重复提交 + saving 忙碌挡）。 */
  saveLlmConfig(draft: LlmConfigDraftShape, hasKey: boolean): void;
  /** 首次进入 creationSettings 视图时惰性装载 Host 视图。 */
  ensureCreationSettingsLoaded(missing: boolean): void;
  /** 保存创作设置（wordTarget 下限 100；I59 防重复提交）。 */
  saveCreationSettings(draft: WorkbenchSettingsDraftShape): void;
  /** 打开当前作品落地文件夹（需已选择作品）。 */
  openProjectFolder(): void;
}

/**
 * LLM / 创作设置惰性装载与保存（迁移 Overlay ui 方法表 725-804 行附近）。
 * 渲染期快照输入（draft/hasKey/missing）由 presenter ui 表每次渲染传入，
 * controller 不持有 store（I90 窄化传参纪律）。
 */
export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  const ensureLlmConfigLoaded = (missing: boolean): void => {
    const target = deps.llmConfig();
    if (!missing || target === undefined) return;
    void unwrap(target.load()).then((loaded) => {
      if (deps.isActive()) deps.dispatch((x) => x.settingsLoaded(loaded as LlmConfigViewShape));
    }, () => deps.dispatch((x) => x.settingsSettled({ error: '设置读取失败' })));
  };
  const saveLlmConfig = (draft: LlmConfigDraftShape, hasKey: boolean): void => {
    const target = deps.llmConfig();
    // I59 防重复提交（R12-6）：saving 忙碌挡 + 同 tick inflight 挡。
    if (draft.saving || !deps.beginOp('settings:llm:save')) return;
    const release = (): void => deps.endOp('settings:llm:save');
    if (!target) { release(); deps.dispatch((x) => x.settingsSettled({ error: '设置服务不可用' })); return; }
    const baseUrl = draft.baseUrl.trim();
    const model = draft.model.trim();
    if (baseUrl === '' || model === '') { release(); deps.dispatch((x) => x.settingsSettled({ error: '请填写服务地址与模型名称' })); return; }
    if (draft.apiKey === '' && !hasKey) { release(); deps.dispatch((x) => x.settingsSettled({ error: '请填写访问密钥（留空将保留已保存的密钥）' })); return; }
    deps.dispatch((x) => x.settingsSettled({ saving: true, message: '', error: '' }));
    // I91：wire maxTokens 是固定档位枚举（32768/65536/131072，core/schema/llm-config）；
    // draft 来自 UI select（LLM_MAX_TOKENS_OPTIONS 同源），此处收窄到 wire 枚举。
    void unwrap(target.save({ baseUrl, model, apiKey: draft.apiKey, maxTokens: draft.maxTokens as 32768 | 65536 | 131072, thinking: draft.thinking, reasoningEffort: draft.reasoningEffort })).then(
      (result) => {
        release();
        if (!deps.isActive()) return;
        deps.dispatch((x) => x.settingsSettled({ saving: false, message: '已保存 AI 服务设置（重启创作台后生效）' }));
        // 保存成功后回读视图，让 hasKey 等派生字段与 Host 一致。
        void unwrap(deps.llmConfig()?.load()).then((view) => { if (deps.isActive() && view !== undefined) deps.dispatch((x) => x.settingsLoaded(view as LlmConfigViewShape)); }, () => undefined);
      },
      (cause: Error) => { release(); if (!deps.isActive()) return; deps.dispatch((x) => x.settingsSettled({ saving: false, error: toUserMessage(cause) })); },
    );
  };
  const ensureCreationSettingsLoaded = (missing: boolean): void => {
    const target = deps.workbenchSettings();
    if (!missing || target === undefined) return;
    void unwrap(target.load()).then((loaded) => {
      if (deps.isActive()) deps.dispatch((x) => x.creationSettingsLoaded(loaded as WorkbenchSettingsViewShape));
    }, () => deps.dispatch((x) => x.creationSettingsSettled({ error: '创作设置读取失败' })));
  };
  const saveCreationSettings = (draft: WorkbenchSettingsDraftShape): void => {
    const target = deps.workbenchSettings();
    if (draft.saving || !deps.beginOp('settings:workbench:save')) return;
    const release = (): void => deps.endOp('settings:workbench:save');
    if (!target) { release(); deps.dispatch((x) => x.creationSettingsSettled({ error: '创作设置服务不可用' })); return; }
    if (!Number.isFinite(draft.wordTarget) || draft.wordTarget < 100) { release(); deps.dispatch((x) => x.creationSettingsSettled({ error: '目标字数至少 100' })); return; }
    deps.dispatch((x) => x.creationSettingsSettled({ saving: true, message: '', error: '' }));
    void unwrap(target.save({ wordTarget: draft.wordTarget, askWhenThin: draft.askWhenThin })).then(
      (view) => {
        release();
        if (!deps.isActive()) return;
        deps.dispatch((x) => x.creationSettingsSettled({ saving: false, message: '创作设置已保存' }));
        if (deps.isActive() && view !== undefined) deps.dispatch((x) => x.creationSettingsLoaded(view as WorkbenchSettingsViewShape));
      },
      (cause: Error) => { release(); if (!deps.isActive()) return; deps.dispatch((x) => x.creationSettingsSettled({ saving: false, error: toUserMessage(cause) })); },
    );
  };
  const openProjectFolder = (): void => {
    const target = deps.workbenchSettings();
    const projectId = deps.currentProjectId();
    if (!deps.beginOp('settings:open-folder')) return;
    const release = (): void => deps.endOp('settings:open-folder');
    if (!target || projectId === undefined) { release(); deps.dispatch((x) => x.creationSettingsSettled({ error: '请先选择作品' })); return; }
    deps.dispatch((x) => x.creationSettingsSettled({ message: '', error: '' }));
    void unwrap(target.openProjectFolder(projectId)).then(
      (result) => {
        release();
        if (!deps.isActive()) return;
        deps.dispatch((x) => x.creationSettingsSettled({ message: `已打开作品落地文件夹：${(result as { path: string }).path}` }));
      },
      (cause: Error) => { release(); if (!deps.isActive()) return; deps.dispatch((x) => x.creationSettingsSettled({ error: toUserMessage(cause) })); },
    );
  };
  return Object.freeze({ ensureLlmConfigLoaded, saveLlmConfig, ensureCreationSettingsLoaded, saveCreationSettings, openProjectFolder });
}

// ---------------------------------------------------------------------------
// Upload controller（DOCX 受控上传链）
// ---------------------------------------------------------------------------

export interface UploadControllerDeps extends ControllerBaseDeps {
  workspace(): WorkspaceNamespace | undefined;
  currentProjectId(): string | undefined;
  /** I159：目录层和作品内 DOCX 都进入同一来源审阅。 */
  startSourceReview(projectId: string, source: { sourceHash: string; text: string; chunks: readonly unknown[] }): void;
  /** 目录层上传 → 从 DOCX 新建独立作品。 */
  createProject(input: { projectId: string; name: string }, onOpened?: () => void): void;
  /** I179 Desktop uses Main's OS chooser; the historical Client mount keeps File input mode. */
  readonly useMainFileDialog?: boolean;
  /** Desktop keeps the newly opened import target visible for semantic review. */
  readonly keepProjectOpenAfterImport?: boolean;
}

export interface UploadController {
  /** 一次受控上传链；作品内入口必须先通过 N-7 空作品门。 */
  uploadFile(file: File | undefined, browsing: boolean, currentProjectEligible: boolean): void;
}

/**
 * DOCX 受控上传链（迁移 ui.uploadFile；uploadDocx 逻辑在 client/upload.ts）。
 * 目录层从 DOCX 新建独立作品；作品内仅空作品可上传。两条路径都把 Host
 * sourceHash/text/chunks 交给同一来源语义审阅，产品 Client 不再启动旧六层分析。
 */
export function createUploadController(deps: UploadControllerDeps): UploadController {
  const uploadFile = (file: File | undefined, browsing: boolean, currentProjectEligible: boolean): void => {
    const target = deps.workspace();
    if (!target || !deps.isActive()) return;
    if (deps.currentProjectId() !== undefined && !browsing && !currentProjectEligible) {
      deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: '当前作品已有内容，不能合并导入。请返回作品列表，新建独立作品后再导入。' }));
      return;
    }
    // I59 防重复上传（R12-6）：一次 Remote 上传链进行中忽略再次选择文件。
    if (!deps.beginOp('upload')) return;
    const upload = deps.useMainFileDialog === true
      ? selectDocx(target, (progress) => deps.dispatch((x) => x.uploadProgress(progress)))
      : file === undefined
        ? Promise.resolve(undefined)
        : uploadDocx(target, file, (progress) => deps.dispatch((x) => x.uploadProgress(progress)));
    void upload.then(
      (result) => {
        deps.endOp('upload');
        if (result === undefined) {
          deps.dispatch((x) => x.uploadSettled(undefined));
          return;
        }
        const { uploadId, ...uploadResult } = result;
        deps.dispatch((x) => { x.uploadSettled(uploadResult); x.uploadProgress({ phase: 'done' }); });
        const projectId = deps.currentProjectId();
        // 作品内空作品直接复用来源审阅；目录层上传则新建独立作品后复用同一入口。
        if (projectId !== undefined && !browsing) {
          deps.startSourceReview(projectId, { sourceHash: result.sourceHash, text: result.text, chunks: result.chunks });
          return;
        }
        // I153：目录层 DOCX 是新作品的首次受控导入。创建并打开作品后必须直接
        // 建立来源审阅；作者确认该 session 才形成 I151 的唯一触发事件。旧实现
        // 在这里直接启动六层分析，使来源类型/主角选项与规则文风初始化均不可达。
        const name = result.fileName.replace(/\.docx$/i, '') || '未命名作品';
        deps.createProject({ projectId: projectIdForUpload(name, uploadId), name }, () => {
          const openedId = deps.currentProjectId();
          if (openedId !== undefined) {
            deps.startSourceReview(openedId, { sourceHash: result.sourceHash, text: result.text, chunks: result.chunks });
            // 来源审阅保持在目录层；确认后由 source-aware workflow 决定后续路径。
            if (deps.keepProjectOpenAfterImport !== true) deps.dispatch((actions) => actions.browseProjects());
          }
        });
      },
      () => { deps.endOp('upload'); deps.dispatch((x) => x.uploadSettled(undefined)); },
    );
  };
  return Object.freeze({ uploadFile });
}
