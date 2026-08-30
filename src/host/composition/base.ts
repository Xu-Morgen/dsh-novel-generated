import { createCanonService } from '../canon-service.js';
import { createCharacterService } from '../character-service.js';
import { createConfirmationService } from '../confirmation-service.js';
import { createProjectService } from '../project-service.js';
import { createRuleService } from '../rule-service.js';
import { createStateService } from '../state-service.js';
import { createStyleService } from '../style-service.js';
import { createTextService } from '../text-service.js';
import { createTextMutationRemote } from '../text-mutation-adapter.js';
import { createSceneOutlineBindingService } from '../scene-outline-binding-service.js';
import { createSceneOutlineBindingRemote } from '../scene-outline-binding-adapter.js';
import { createWorldviewService } from '../worldview-service.js';
import { createOutlineService } from '../outline-service.js';
import { createRelationshipService } from '../relationship-service.js';
import { createKnowledgeService } from '../knowledge-service.js';
import { createGenerationService } from '../generation-service.js';
import { createStoryGenerationService } from '../story-generation-service.js';
import { createSettingsService } from '../settings-service.js';
import { createStoryLifecycleService } from '../story-lifecycle-service.js';
import { createConsistencyDetectionService } from '../consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from '../knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from '../relationship-style-detection-service.js';
import { createStateParserService } from '../state-parser-service.js';
import { createRelationshipParserService } from '../relationship-parser-service.js';
import { createKnowledgeParserService } from '../knowledge-parser-service.js';
import { createWorldviewParserService } from '../worldview-parser-service.js';
import { createExtensionService } from '../extension-service.js';
import { createSplitAgentService } from '../split-agent-service.js';
import { createClassifierService } from '../classifier-service.js';
import { createLocalizedEditService as createRangeEditService } from '../edit-service.js';
import { createChapterWritingService } from '../chapter-writing-service.js';
import { createInspirationService } from '../inspiration-service.js';
import { createHostUploadService } from '../upload-service.js';
import { createLlmConfigService } from '../llm-config-service.js';
import { createWorkbenchSettingsService } from '../workbench-settings-service.js';
import { SettingsIndex, A2_SETTINGS_FILE, resolveA2GenerationConfig } from '../../core/settings-index/index.js';
import type { GenerationSettings } from '../../llm/port/index.js';
import type { LlmConfigSaveInput } from '../../core/schema/llm-config.js';
import type { WorkbenchSettingsSaveInput } from '../../core/schema/workbench-settings.js';
import { defineRemote } from '../remote/shared.js';
import { llmConfigInvocations } from '../remote/llm-config.js';
import { workbenchSettingsInvocations } from '../remote/workbench-settings.js';
import { NOVEL_PROBE_NAMESPACE, probeData } from '../../remote.js';
import type { BaseServices, CompositionBase } from './types.js';

/**
 * I89 组合根分段（一）：基础服务（review v2.0 §3.4 / 计划 §18 I89）。
 *
 * 装配领域层基础服务（B3/B2/B5/C1/C2/C4/C3/C5/B1/B4）、Host 只读面、检测/解析
 * 服务、文件导入/导出/拆分、上传与 A2 设置解析，并注册它们的 `novel*` 服务。
 * 本段不触碰管理面/编排面；`CompositionBase` 由 apply 提供（Fiber 归属与 logger）。
 */
export function assembleBaseServices(base: CompositionBase): BaseServices {
  const { ctx, projectsRoot, onFiberDispose, config } = base;
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
  // I104：descriptor.service 固定为 novelText，故 wire aliases 与既有 Host
  // domain API 必须共存于同一个 gateway receiver（不能另挂 service key）。
  ctx.provide('novelText', createTextMutationRemote(textService));
  const sceneOutlineBindingService = createSceneOutlineBindingService(textService, outlineService, projectsRoot);
  ctx.provide('novelSceneOutlineBinding', createSceneOutlineBindingRemote(sceneOutlineBindingService));
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
  ctx.provide('novelGeneration', createGenerationService(llm, onFiberDispose));
  ctx.provide('novelSettings', createSettingsService(llm, config.settingsRoot, credentials, onFiberDispose));
  ctx.provide('novelExtension', createExtensionService(llm, projectsRoot, onFiberDispose));
  ctx.provide('novelStoryGeneration', createStoryGenerationService(llm, onFiberDispose));
  ctx.provide('novelStoryLifecycle', createStoryLifecycleService(llm, projectsRoot, onFiberDispose));
  // I75：探测器先绑定局部变量再 provide，写作/审校编排直接引用局部变量，
  // 消除 6 处 `ctx.get(...) as never`（含审查 §3.3 的 3 处零成本项）。
  const consistencyDetectionService = createConsistencyDetectionService(llm, onFiberDispose);
  ctx.provide('novelConsistencyDetection', consistencyDetectionService);
  const knowledgeLeakDetectionService = createKnowledgeLeakDetectionService(llm, onFiberDispose);
  ctx.provide('novelKnowledgeLeakDetection', knowledgeLeakDetectionService);
  const relationshipStyleDetectionService = createRelationshipStyleDetectionService(llm, onFiberDispose);
  ctx.provide('novelRelationshipStyleDetection', relationshipStyleDetectionService);
  ctx.provide('novelStateParser', createStateParserService(llm, onFiberDispose));
  ctx.provide('novelRelationshipParser', createRelationshipParserService(llm, onFiberDispose));
  ctx.provide('novelKnowledgeParser', createKnowledgeParserService(llm, onFiberDispose));
  ctx.provide('novelWorldviewParser', createWorldviewParserService(llm, onFiberDispose));
  ctx.provide('novelSplitAgent', createSplitAgentService(llm, onFiberDispose));
  ctx.provide('novelClassifier', createClassifierService(llm, projectsRoot, onFiberDispose));
  const rangeEditService = createRangeEditService(llm, projectsRoot, onFiberDispose);
  ctx.provide('novelLocalizedEdit', rangeEditService);
  ctx.provide('novelChapterWriting', createChapterWritingService(llm, projectsRoot, onFiberDispose));
  const inspirationService = createInspirationService(llm, onFiberDispose);
  ctx.provide('novelInspiration', inspirationService);
  const uploadService = createHostUploadService(onFiberDispose);
  const llmConfigService = createLlmConfigService(undefined, config.settingsRoot);
  // I91：defineRemote 第 5 参传 descriptor（仅类型面）—— call 闭包与 descriptor
  // 派生形状逐位对齐，方法签名变更在接线层即报编译错（review v2.0 §3.1）。
  ctx.provide('novelLlmConfig', defineRemote('novelLlmConfig', 'novelLlmConfig', llmConfigService, [
    { method: 'load', call: () => llmConfigService.load() },
    { method: 'save', call: (input: LlmConfigSaveInput) => llmConfigService.save(input) },
  ], llmConfigInvocations));
  // 创作台通用设置：目标字数 + 内容不足时是否询问 + 打开作品落地文件夹（Host 侧持久化）。
  const workbenchSettingsService = createWorkbenchSettingsService(config.settingsRoot, projectsRoot);
  ctx.provide('novelWorkbenchSettings', defineRemote('novelWorkbenchSettings', 'novelWorkbenchSettings', workbenchSettingsService, [
    { method: 'load', call: () => workbenchSettingsService.load() },
    { method: 'save', call: (input: WorkbenchSettingsSaveInput) => workbenchSettingsService.save(input) },
    { method: 'openProjectFolder', call: (projectId: string) => workbenchSettingsService.openProjectFolder(projectId) },
  ], workbenchSettingsInvocations));
  // The wire marks `settings` optional (`acceptsUndefined`), and the Client has
  // no generation settings of its own — so when the caller omits them, resolve
  // them from the plugin's persisted A2 config (I31 `novelSettings` owner).
  const settingsIndex = new SettingsIndex(config.settingsRoot);
  // I75：`resolveA2GenerationConfig(await settingsIndex.load()).settings` 收敛为单一
  // 闭包（原 6 次重复，见架构审查 §8#3）；analyzer 的包装负责缺失配置的可操作报错。
  const resolveGenerationSettings = async (): Promise<GenerationSettings> => {
    const a2Config = await settingsIndex.load();
    return resolveA2GenerationConfig(a2Config).settings;
  };
  const resolveAnalyzerSettings = async (settings: unknown): Promise<unknown> => {
    if (settings !== undefined) return settings;
    try {
      return await resolveGenerationSettings();
    } catch (cause) {
      throw new Error(
        `生成设置未配置：缺少 generation settings（modelRef/credentialRef），且 ${settingsIndex.root}/${A2_SETTINGS_FILE} 不存在或无效`,
        { cause },
      );
    }
  };
  // I2 public Remote probe: provide the service, then register its Typert
  // contribution when the registry is available (full DSH Host composition).
  ctx.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
  return {
    logger: base.logger,
    resolveGenerationSettings,
    resolveAnalyzerSettings,
    settingsIndex,
    characterService,
    worldviewService,
    outlineService,
    relationshipService,
    stateService,
    canonService,
    confirmationService,
    projectService,
    textService,
    sceneOutlineBindingService,
    ruleService,
    styleService,
    knowledgeService,
    llm,
    uploadService,
    llmConfigService,
    workbenchSettingsService,
    inspirationService,
    consistencyDetectionService,
    knowledgeLeakDetectionService,
    relationshipStyleDetectionService,
  };
}
