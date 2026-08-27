import type { Context } from '@deepseek-ai/cordis';

import { createCanonService } from './host/canon-service.js';
import { createCharacterService } from './host/character-service.js';
import { createConfirmationService } from './host/confirmation-service.js';
import { createProjectService } from './host/project-service.js';
import { createRuleService } from './host/rule-service.js';
import { createStateService } from './host/state-service.js';
import { createStyleService } from './host/style-service.js';
import { createTextService } from './host/text-service.js';
import { createWorldviewService } from './host/worldview-service.js';
import { createOutlineService } from './host/outline-service.js';
import { createRelationshipService } from './host/relationship-service.js';
import { createKnowledgeService } from './host/knowledge-service.js';
import { createGenerationService } from './host/generation-service.js';
import { createStoryGenerationService } from './host/story-generation-service.js';
import { createSettingsService } from './host/settings-service.js';
import { createStoryLifecycleService } from './host/story-lifecycle-service.js';
import { createConsistencyDetectionService } from './host/consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from './host/knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from './host/relationship-style-detection-service.js';
import { createStateParserService } from './host/state-parser-service.js';
import { createRelationshipParserService } from './host/relationship-parser-service.js';
import { createKnowledgeParserService } from './host/knowledge-parser-service.js';
import { createWorldviewParserService } from './host/worldview-parser-service.js';
import { createExtensionService } from './host/extension-service.js';
import { createHostImportService } from './host/import-service.js';
import { createSplitAgentService } from './host/split-agent-service.js';
import { createExportService } from './host/export-service.js';
import { createClassifierService } from './host/classifier-service.js';
import { createLocalizedEditService } from './host/edit-service.js';
import { createTextEditService } from './host/text-edit-service.js';
import { createChapterWritingService } from './host/chapter-writing-service.js';
import { createContinuationService } from './host/continuation-service.js';
import { createInspirationService } from './host/inspiration-service.js';
import { createHostUploadService } from './host/upload-service.js';
import { createLlmConfigService } from './host/llm-config-service.js';
import { createOnboardingAnalyzerService } from './host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from './host/onboarding-adjudication-service.js';
import { createWorkbenchSettingsService } from './host/workbench-settings-service.js';
import { workbenchSettingsRemoteContribution } from './host/remote/workbench-settings.js';
import { SettingsIndex, A2_SETTINGS_FILE, resolveA2GenerationConfig } from './core/settings-index/index.js';
import { NOVEL_PROBE_NAMESPACE, probeData, NOVEL_WORKSPACE_NAMESPACE, hostContribution, bindRemote, createWorkspaceEditorService } from './remote.js';
import { createNovelAgentService, registerNovelAgentTools } from './agents/agent-tools.js';

/**
 * I1 Host plugin extended by I2 (design §0.1.3 I2): proves the ordinary
 * out-of-tree Cordis package contract with a Host service, and now also
 * registers the gate-only public Remote probe.
 *
 * - `novelCreation` (I1): minimal read-only status service, removed on dispose.
 * - `novelProject` (I3) / `novelState` (I4) / `novelCanon` (I5): Host facades over
 *   the project, C2 state, and C4 canon stores respectively.
 * - `novelText` (I6): Host facade over controlled C5 chapter/scene text storage.
 * - `novelRule` (I7): Host facade over the B1 hard-constraint rule store.
 * - `novelWorldview` (I8): Host facade over the B2 worldview (WorldEntry) store.
 * - `novelCharacter` (I9): Host facade over the B3 character-core (CharacterCore)
 *   store, explicitly separated from the C2 mutable state layer (R1-B3).
 * - `novelStyle` (I10): Host facade over the one global B4 StyleProfile,
 *   including independently queryable forbidden expressions (R1-B4).
 * - `novelConfirmation` (I11): Host facade over the persistent, idempotent
 *   proposal→accept/reject gate shared by all later user-confirmed writes.
 * - `novelOutline` (I14/I15): Host facade over B5 outline/detail-beat storage and
 *   C6 progress/navigation; C6 never rewrites the B5 source.
 * - `novelKnowledge` (I18): Host facade over the C3 knowledge store and POV filter;
 *   C3 never derives visibility from C1 relationship publicity.
 * - `novelGeneration` (I17): Host-only ctx.llm candidate collection.
 * - `novelSettings` (I31): Host-only persisted A2 template/preset/route settings;
 *   it resolves SecretRefs through the Host seam and delegates through the existing ctx.llm adapter.
 * - `novelExtension` (I32): Fiber-owned internal Provider/Injector/Validator/
 *   Parser/relationship-rule/backend-strategy registry; it grants no independent
 *   file, credential, LLM, UI, or composition ownership (design §11.1).
 * - `novelStoryGeneration` (I19): full navigation/context/history candidate path;
 *   it deliberately has no parser or writeback operation.
 * - `novelConsistencyDetection` (I21): Host-only B1 immutable/C4 semantic
 *   detector using the injected `ctx.llm` route; it returns I20 adjudication
 *   but has no parser or writeback operation.
 * - `novelKnowledgeLeakDetection` (I22): Host-only C3 POV leak detector.
 *   It derives the allowed view through I18, returns I20 adjudication, and
 *   has no C3 write, parser, or Client operation.
 * - `novelRelationshipStyleDetection` (I24): Host-only C1/B4 semantic soft
 *   detector. It returns I20 warnings only and has no parser or writeback.
 * - `novelStateParser` (I25): Host-only C2 recognition through `ctx.llm`; it
 *   returns strict ops only, leaving StateEngine and I11 Gate write authority intact.
 * - `novelRelationshipParser` (I27): Host-only C1 recognition through `ctx.llm`.
 *   It returns strict operations only; its parser path is the default C1
 *   automatic writer, while RelationshipRepository persists validated C1 state.
 * - `novelKnowledgeParser` (I28): Host-only C3 recognition through `ctx.llm`.
 *   It returns strict forward operations only; KnowledgeRepository retains C3
 *   graph validation and persistence while I11 owns low-confidence confirmation.
 * - `novelWorldviewParser` (I29): Host-only B2 recognition through `ctx.llm`.
 *   It returns supersede proposals only; every B2 rewrite remains confirmation-first
 *   and WorldRepository retains the rewritten-history persistence contract.
 * - `novelImport` (I37): Host-only controlled text import and pending candidates.
 * - `novelSplitAgent` (I38): Host-routed B5/B2/detail-beat candidates; every
 *   result remains confirmation-first and never writes C1/C2/C3/C4.
 * - `novelOnboardingAnalyzer` (I52): Host-only six-layer B3/B2/B5/C1/C2/C4
 *   candidate-package analyzer with start/status/cancel/regenerate lifecycle;
 *   it returns candidates only, never writes a layer, and forbids C3/
 *   items/factions/globalFlags inference.
 * - `novelProbe` (I2): plain Host service backing the `novelProbe/probe` Remote.
 *   Its Typert contribution is registered only when the DSH Typert registry
 *   (`ctx.typert`, key `typert`) is present, so the plugin still boots in the
 *   minimal I1 loader smoke where that registry is absent. Registration runs
 *   through `ctx.effect`, so Fiber dispose withdraws it (H0-6).
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export interface NovelCreationConfig {
  projectsRoot?: string;
  /** Host-only location for A2 settings; it is not a project/export data path. */
  settingsRoot?: string;
  /** 是否注册对话创作 Agent 工具（novel_open/status/context/continue/inspire），默认 true。 */
  agentTools?: boolean;
}

export function apply(ctx: Context, config: NovelCreationConfig = {}): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Services are owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
  const projectsRoot = config.projectsRoot;
  const characterService = createCharacterService(projectsRoot);
  const worldviewService = createWorldviewService(projectsRoot);
  const outlineService = createOutlineService(projectsRoot);
  const relationshipService = createRelationshipService(projectsRoot);
  const stateService = createStateService(projectsRoot);
  const canonService = createCanonService(projectsRoot);
  const confirmationService = createConfirmationService(projectsRoot);
  const projectService = createProjectService(projectsRoot, {
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    confirmation: confirmationService,
  });
  ctx.provide('novelProject', projectService);
  ctx.provide('novelState', stateService);
  ctx.provide('novelCanon', canonService);
  const textService = createTextService(projectsRoot);
  ctx.provide('novelText', textService);
  const ruleService = createRuleService(projectsRoot);
  ctx.provide('novelRule', ruleService);
  ctx.provide('novelWorldview', worldviewService);
  ctx.provide('novelCharacter', characterService);
  const styleService = createStyleService(projectsRoot);
  ctx.provide('novelStyle', styleService);
  ctx.provide('novelConfirmation', confirmationService);
  ctx.provide('novelOutline', outlineService);
  ctx.provide('novelRelationship', relationshipService);
  const knowledgeService = createKnowledgeService(projectsRoot);
  ctx.provide('novelKnowledge', knowledgeService);
  const llm = ctx.get('llm', false);
  const credentials = ctx.get('credentials', false);
  ctx.provide('novelGeneration', createGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelSettings', createSettingsService(llm, config.settingsRoot, credentials, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelExtension', createExtensionService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryGeneration', createStoryGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryLifecycle', createStoryLifecycleService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelConsistencyDetection', createConsistencyDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeLeakDetection', createKnowledgeLeakDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipStyleDetection', createRelationshipStyleDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStateParser', createStateParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipParser', createRelationshipParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeParser', createKnowledgeParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelWorldviewParser', createWorldviewParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelImport', createHostImportService());
  ctx.provide('novelSplitAgent', createSplitAgentService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelExport', createExportService());
  ctx.provide('novelClassifier', createClassifierService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelLocalizedEdit', createLocalizedEditService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
   ctx.provide('novelChapterWriting', createChapterWritingService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
   const continuationService = createContinuationService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose));
   ctx.provide('novelContinuation', continuationService);
   const inspirationService = createInspirationService(llm, (dispose) => ctx.effect(() => dispose));
   ctx.provide('novelInspiration', inspirationService);
  const uploadService = createHostUploadService((dispose) => ctx.effect(() => dispose));
  const llmConfigService = createLlmConfigService(undefined, config.settingsRoot);
  ctx.provide('novelLlmConfig', bindRemote({
    load: () => llmConfigService.load(),
    save: (input: unknown) => llmConfigService.save(input as Parameters<typeof llmConfigService.save>[0]),
  }, 'novelLlmConfig', 'novelLlmConfig'));
  // 创作台通用设置：目标字数 + 内容不足时是否询问 + 打开作品落地文件夹（Host 侧持久化）。
  const workbenchSettingsService = createWorkbenchSettingsService(config.settingsRoot, projectsRoot);
  ctx.provide('novelWorkbenchSettings', bindRemote({
    load: () => workbenchSettingsService.load(),
    save: (input: unknown) => workbenchSettingsService.save(input as Parameters<typeof workbenchSettingsService.save>[0]),
    openProjectFolder: (projectId: unknown) => workbenchSettingsService.openProjectFolder(String(projectId)),
  }, 'novelWorkbenchSettings', 'novelWorkbenchSettings'));
  const analyzerService = createOnboardingAnalyzerService(llm, (dispose) => ctx.effect(() => dispose));
  // The wire marks `settings` optional (`acceptsUndefined`), and the Client has
  // no generation settings of its own — so when the caller omits them, resolve
  // them from the plugin's persisted A2 config (I31 `novelSettings` owner).
  const settingsIndex = new SettingsIndex(config.settingsRoot);
  const resolveAnalyzerSettings = async (settings: unknown): Promise<unknown> => {
    if (settings !== undefined) return settings;
    try {
      return resolveA2GenerationConfig(await settingsIndex.load()).settings;
    } catch (cause) {
      throw new Error(
        `生成设置未配置：缺少 generation settings（modelRef/credentialRef），且 ${settingsIndex.root}/${A2_SETTINGS_FILE} 不存在或无效`,
        { cause },
      );
    }
  };
  // The analyzer is frozen by its constructor. The small mutable Remote carrier
  // delegates to that single owner under the same canonical service key. I57:
  // `begin` resolves settings once, then hands the resolved settings to the
  // background job so the client can poll `status`/`cancel` without a second
  // resolution path.
  const analyzerRemote = bindRemote({
    begin: async (input: unknown, settings: unknown) => analyzerService.begin(input as Parameters<typeof analyzerService.begin>[0], await resolveAnalyzerSettings(settings)),
    start: async (input: unknown, settings: unknown) => analyzerService.start(input as Parameters<typeof analyzerService.start>[0], await resolveAnalyzerSettings(settings)),
    status: (onboardingSessionId: string) => analyzerService.status(onboardingSessionId),
    cancel: (onboardingSessionId: string) => analyzerService.cancel(onboardingSessionId),
    result: (onboardingSessionId: string) => analyzerService.result(onboardingSessionId),
  }, 'novelOnboardingAnalyzer', 'novelOnboardingAnalyzer');
  ctx.provide('novelOnboardingAnalyzer', analyzerRemote);
  // I53: adjudication builds on the analyzer's bound results. The layer source
  // adapts `getResult`/`regenerate` so the adjudication facade stays independent
  // of the analyzer's job lifecycle internals.
  const layerSource: OnboardingLayerSource = {
    getResult(onboardingSessionId) { return analyzerService.getResult(onboardingSessionId); },
    async regenerate(onboardingSessionId, layer, settings) {
      const result = await analyzerService.regenerate(onboardingSessionId, layer, await resolveAnalyzerSettings(settings));
      return { layers: result.layers };
    },
  };
  const adjudicationService = createOnboardingAdjudicationService({
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    confirmation: confirmationService,
  }, layerSource);
  // The service is immutable; expose the same owner through a mutable Remote carrier.
  ctx.provide('novelOnboarding', bindRemote({
    adjudicate: (input: unknown, settings: unknown) => adjudicationService.adjudicate(input as Parameters<typeof adjudicationService.adjudicate>[0], settings),
    acceptedLayers: (onboardingSessionId: string) => adjudicationService.acceptedLayers(onboardingSessionId),
    finalApply: (input: unknown) => adjudicationService.finalApply(input as Parameters<typeof adjudicationService.finalApply>[0]),
  }, 'novelOnboarding', 'novelOnboarding'));

  // I2 public Remote probe: provide the service, then register its Typert
  // contribution when the registry is available (full DSH Host composition).
  ctx.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
  // I61 C5 正文编辑与可选 reparse（design §5.12 / §14.9 / R13-2）：I42 编辑服务 +
  // 真实 I25–I29 parser fan-out + 既有 Domain Service writers + I11 Gate。设置解析
  // 惰性执行（accept 时才需要），与 analyzer 共用同一 A2 generation settings owner。
  const textEditService = createTextEditService({
    llm,
    projectsRoot,
    state: stateService,
    relationship: relationshipService,
    knowledge: knowledgeService,
    canon: canonService,
    worldview: worldviewService,
    confirmation: confirmationService,
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    onDispose: (dispose) => ctx.effect(() => dispose),
  });
  ctx.provide('novelTextEdit', textEditService);
  const workspaceService = createWorkspaceEditorService(
    characterService, worldviewService, outlineService, relationshipService,
    stateService, canonService, confirmationService, projectService, uploadService, textService, textEditService,
  );
  // The DSH gateway dispatches strict descriptors only to services carrying the
  // `typertRemote` binding; attach it before providing (design §0.1.2).
  ctx.provide(NOVEL_WORKSPACE_NAMESPACE, bindRemote(workspaceService, NOVEL_WORKSPACE_NAMESPACE, NOVEL_WORKSPACE_NAMESPACE));
  // 对话创作入口：Agent 工具层包装既有 Host 服务（novel_* 工具），经 DSH `tools`
  // 注册表暴露给会话。注册与撤销都归属当前 Fiber；`tools` 服务缺席时静默跳过
  // （与 typert 注册同一模式）。config.agentTools === false 可显式关闭。
  const agentService = createNovelAgentService({
    project: projectService,
    characters: characterService,
    worldview: worldviewService,
    outline: outlineService,
    relationship: relationshipService,
    state: stateService,
    canon: canonService,
    style: styleService,
    rules: ruleService,
    knowledge: knowledgeService,
    text: textService,
    continuation: continuationService,
    inspiration: inspirationService,
    confirmation: confirmationService,
    resolveSettings: async () => resolveA2GenerationConfig(await settingsIndex.load()).settings,
    workbenchSettings: workbenchSettingsService,
  });
  ctx.provide('novelAgent', agentService);
  if (config.agentTools !== false) {
    // `tools` 注册表由宿主提供，可能晚于本插件激活：用 inject 懒注册，tools
    // 可用/卸载时回调自动重跑；每次运行都以 ctx.effect 归属注册生命周期。
    ctx.inject(['tools'], (toolsCtx) => {
      toolsCtx.effect(() => registerNovelAgentTools(toolsCtx, agentService));
    });
  }
  const typert = ctx.get('typert', false);
  if (typert !== undefined) {
    ctx.effect(() => typert.register(hostContribution));
  }
}
