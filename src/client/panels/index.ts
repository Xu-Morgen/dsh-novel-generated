/**
 * I83 面板注册表（架构审查 §4.1 / §9 #5）：`viewPanel` 的 16 分支 if 链收敛为
 * 「视图 → 渲染器」注册表，六层视图经 `contentArea` 兜底分发。DOM 契约与
 * `data-novel-view-panel` / `data-novel-content` data 锚点完全保持（I46–I72 的
 * client.test.ts 行为锚点不变；重构纪律 §16-2 行为等价）。
 *
 * 不变式：
 * - 注册表只做视图分发，不持有领域真相；每个面板渲染器仍是纯函数。
 * - 层视图（characters/worldview/outline/relationship/state/canon）不在注册表，
 *   统一落 `renderLayerPanel` → `contentArea`（与原 if 链 fallback 等价）。
 * - 新增面板 = 在注册表追加一条渲染器，不再改 `viewPanel` 本体。
 */
import type { LayerId } from '../shared.js';
import { LAYERS, type El, type WorkspaceNamespace } from '../shared.js';
import { characterLayer as renderCharacterLayer } from '../layers/characters.js';
import { worldviewLayer as renderWorldviewLayer } from '../layers/worldview.js';
import { relationshipLayer as renderRelationshipLayer } from '../layers/relationship.js';
import { stateLayer as renderStateLayer } from '../layers/state.js';
import { canonLayer as renderCanonLayer } from '../layers/canon.js';
import { outlineLayer as renderOutlineLayer } from '../layers/outline.js';
import type { OutlineDetailGenerationView } from '../layers/outline-detail-generation.js';
import { chaptersPanel, type ChaptersLayerState } from '../layers/chapters.js';
import { reviewPanel } from '../layers/review.js';
import { queuePanel } from '../layers/queue.js';
import { knowledgePanel } from '../layers/knowledge.js';
import { ruleStylePanel } from '../layers/rule-style.js';
import { progressPanel } from '../layers/progress.js';
import { importExportPanel } from '../layers/import-export.js';
import { searchPanel } from '../layers/search.js';
import { statisticsPanel } from '../layers/statistics.js';
import { timelinePanel } from '../layers/timeline.js';
import { workflowPanel } from '../layers/workflow.js';
import type { WorkflowStageId, WorkflowState } from '../workflow.js';
import { referenceReviewPanel } from '../layers/reference-review.js';
import type { EntityOption } from '../entity-selectors.js';
import { llmSettingsPanel, type LlmConfigDraftShape, type LlmConfigNamespace, type LlmConfigViewShape } from '../settings.js';
import { workbenchSettingsPanel, type WorkbenchSettingsDraftShape, type WorkbenchSettingsNamespace, type WorkbenchSettingsViewShape } from '../workbench-settings.js';
import type { LayerData, WorkbenchNamespaces, WorkbenchOps, WorkbenchViewStates } from '../store/types.js';
import type { WorkbenchViewId } from '../nav.js';

/** LLM 设置面板渲染期 props（I82 打包收敛后由 workbenchView 下发）。 */
export interface LlmSettingsPanelProps {
  view: LlmConfigViewShape | undefined;
  draft: LlmConfigDraftShape;
  namespace: LlmConfigNamespace | undefined;
  mutate(patch: Partial<LlmConfigDraftShape>): void;
  save(): void;
}

/** 创作设置面板渲染期 props。 */
export interface WorkbenchSettingsPanelProps {
  view: WorkbenchSettingsViewShape | undefined;
  draft: WorkbenchSettingsDraftShape;
  namespace: WorkbenchSettingsNamespace | undefined;
  mutate(patch: Partial<WorkbenchSettingsDraftShape>): void;
  save(): void;
  projectId: string | undefined;
  openFolder(): void;
}

/** 面板注册表渲染上下文：viewPanel 收敛后的单一切片（I82 的 ns/states 打包延续）。 */
export interface PanelViewProps {
  h: El;
  /** 当前激活视图；层视图不在注册表，落 contentArea 兜底。 */
  view: WorkbenchViewId;
  projectId: string;
  projectName: string;
  ns: WorkbenchNamespaces;
  states: WorkbenchViewStates;
  ops: WorkbenchOps;
  sourceEntry: unknown;
  review: unknown;
  settings: LlmSettingsPanelProps | undefined;
  creationSettings: WorkbenchSettingsPanelProps | undefined;
  workflow: WorkflowState;
  openWorkflowStage(stage: WorkflowStageId): void;
}

type PanelRenderer = (props: PanelViewProps) => unknown;

/**
 * 视图 → 渲染器注册表。键为稳定视图 id（I58 任务导航，design §14.8 / R12-5）；
 * 每个渲染器只消费自己需要的切片，`data-novel-view-panel` 锚点与面板行为
 * 与原 viewPanel 分支逐字一致。
 */
const PANEL_REGISTRY: Record<string, PanelRenderer> = {
  workflow: ({ h, workflow, projectName, openWorkflowStage }) => h('div', { 'data-novel-view-panel': 'workflow' }, workflowPanel(h, { state: workflow, projectName, openStage: openWorkflowStage })),
  settings: ({ h, settings }) => h('div', { 'data-novel-view-panel': 'settings' }, settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null),
  creationSettings: ({ h, creationSettings }) => h('div', { 'data-novel-view-panel': 'creationSettings' }, creationSettings !== undefined ? workbenchSettingsPanel(h, creationSettings.namespace, creationSettings.draft, creationSettings.mutate, creationSettings.save, creationSettings.projectId, creationSettings.openFolder) : null),
  onboarding: ({ h, sourceEntry, review }) => h('div', { className: 'nv-onboarding-stack', 'data-novel-onboarding-tab': '', 'data-novel-view-panel': 'onboarding' }, sourceEntry, review),
  // I60：正文视图（写作组 C5）—— 章节树/场景列表/正文只读面板（R13-1）+ I63 候选审阅。
  chapters: ({ h, projectId, ns, states, ops }) => {
    const { workspace, writing, branchNamespace } = ns;
    const { chapters } = states;
    const characters = states.layers.characters.list.map((character) => ({ id: character.id, label: character.name || '未命名角色' }));
    const detailBeats = states.layers.outlineEditor.draft.acts.flatMap((act) => act.beats.flatMap((beat) => beat.detailBeats.map((card) => ({ id: card.id, label: `${act.title || '未命名幕'} / ${beat.title || '未命名节'} / ${card.title || '未命名场景卡'}` }))));
    return h('div', { 'data-novel-view-panel': 'chapters' }, chaptersPanel(h, projectId, workspace, writing, branchNamespace, chapters, ops.chapters, { characters, detailBeats }));
  },
  // I64：一致性审校中心（写作组）—— 五类问题统一投影 + 刷新/过滤 + 显式裁决（R13-5）。
  review: ({ h, projectId, ns, states, ops }) => {
    const { reviewNamespace } = ns;
    const { review: reviewState, referenceReview: referenceReviewState } = states;
    return h('div', { 'data-novel-view-panel': 'review' }, reviewPanel(h, projectId, reviewNamespace, reviewState, ops.review, ops.router), referenceReviewPanel(h, projectId, ns.referenceAuditNamespace, ns.referenceCorrectionNamespace, referenceReviewState, ops.referenceReview));
  },
  // I65：生成队列（写作组）—— 场景卡范围/配置 + 暂停/继续/取消 + 任务列表（R13-6）。
  queue: ({ h, projectId, ns, states, ops }) => {
    const { queueNamespace, workspace } = ns;
    const { queue: queueState } = states;
    return h('div', { 'data-novel-view-panel': 'queue' }, queuePanel(h, projectId, queueNamespace, workspace, queueState, ops.queue));
  },
  // I66：知情与揭示（连续性组）—— 事实/角色双视图 + 揭示/holder Gate 提案（R14-1）。
  knowledge: ({ h, projectId, ns, states, ops }) => {
    const { knowledgeNamespace } = ns;
    const { knowledge: knowledgeState } = states;
    return h('div', { 'data-novel-view-panel': 'knowledge' }, knowledgePanel(h, projectId, knowledgeNamespace, knowledgeState, ops.knowledge, ops.router));
  },
  // I67：规则与文风（策划组）—— B1 规则 + B4 风格档案表单（R14-2）。
  ruleStyle: ({ h, projectId, ns, states, ops }) => {
    const { ruleStyleNamespace } = ns;
    const { ruleStyle: ruleStyleState } = states;
    return h('div', { 'data-novel-view-panel': 'ruleStyle' }, ruleStylePanel(h, projectId, ruleStyleNamespace, ruleStyleState, ops.ruleStyle));
  },
  // I68：进度与灵感（写作组）—— C6 执行态进度/偏差 + 灵感方向 Gate 落地（R14-3）。
  progress: ({ h, projectId, ns, states, ops }) => {
    const { progressNamespace } = ns;
    const { progress: progressState } = states;
    return h('div', { 'data-novel-view-panel': 'progress' }, progressPanel(h, projectId, progressNamespace, progressState, ops.progress));
  },
  // I69：导入导出与备份（作品设置组）—— 项目包/纯文本导出 + round-trip 恢复 + 导入预览（R14-4）。
  importExport: ({ h, projectId, ns, states, ops }) => {
    const { importExportNamespace } = ns;
    const { importExport: importExportState } = states;
    return h('div', { 'data-novel-view-panel': 'importExport' }, importExportPanel(h, projectId, importExportNamespace, importExportState, ops.importExport));
  },
  // I71：全局搜索与上下文追踪（写作组）—— 跨六层关键词检索 + 实体引用 + 结果跳转 + 索引重建/删除（R14-6）。
  search: ({ h, projectId, ns, states, ops }) => {
    const { searchNamespace } = ns;
    const { search: searchState } = states;
    const references: EntityOption[] = [
      ...states.layers.characters.list.map((entry) => ({ id: entry.id, label: `角色：${entry.name || '未命名'}` })),
      ...states.layers.worldview.list.map((entry) => ({ id: entry.id, label: `世界观：${entry.title || '未命名'}` })),
      ...(states.knowledge.projection?.entries ?? []).map((entry) => ({ id: entry.id, label: `信息：${entry.fact || '未命名'}` })),
    ];
    const characters = states.layers.characters.list.map((entry) => ({ id: entry.id, label: entry.name || '未命名角色' }));
    return h('div', { 'data-novel-view-panel': 'search' }, searchPanel(h, projectId, searchNamespace, searchState, ops.search, characters, references));
  },
  // I72：写作进度面板（写作组）—— 可重建派生统计：章节字数/目标完成度/场景卡状态/POV 分布/任务历史（R14-7）。
  statistics: ({ h, projectId, ns, states, ops }) => {
    const { statisticsNamespace } = ns;
    const { statistics: statisticsState } = states;
    const characters = states.layers.characters.list.map((entry) => ({ id: entry.id, label: entry.name || '未命名角色' }));
    return h('div', { 'data-novel-view-panel': 'statistics' }, statisticsPanel(h, projectId, statisticsNamespace, statisticsState, ops.statistics, characters));
  },
  // 方案 A：剧情时间线（策划组）—— 从 B5 自建有序剧情时间轴；节点可安排揭示
  // 信息与关系建立时机，手动选择当前节点并编辑保存（design §8 相关角色对）。
  timeline: ({ h, projectId, ns, states, ops }) => {
    const { timelineNamespace } = ns;
    const { timeline: timelineState } = states;
    const names = new Map(states.layers.characters.list.map((character) => [character.id, character.name]));
    const relationshipOptions: EntityOption[] = states.layers.relationship.list.map((relationship) => ({ id: relationship.id, label: `${names.get(relationship.from) ?? '引用已缺失'} ↔ ${names.get(relationship.to) ?? '引用已缺失'}` }));
    const knowledgeOptions: EntityOption[] = (states.knowledge.projection?.entries ?? []).map((entry) => ({ id: entry.id, label: entry.fact || '未命名信息' }));
    return h('div', { 'data-novel-view-panel': 'timeline' }, timelinePanel(h, projectId, timelineNamespace, timelineState, ops.timeline, relationshipOptions, knowledgeOptions, ops.router));
  },
};

/** 单层空态占位（仅兜底，I49 起六层均有真实面板）。 */
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

/**
 * 内容区：按激活层渲染真表单（I47/I48/I49），仅兜底空态。
 * I48 B5 大纲结构化编辑器（design §5.7 / R10-5）：所有读写只经 Host
 * `outlineRead`/`outlineSave`/`outlineBeatCards`，Client 不拥有领域校验。
 */
function contentArea(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, activeLayer: LayerId, layers: LayerData, chapters: ChaptersLayerState, ops: WorkbenchOps, detailGeneration?: OutlineDetailGenerationView): unknown {
  const layer = LAYERS.find((item) => item.id === activeLayer) ?? LAYERS[0];
  if (layer.id === 'characters') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderCharacterLayer(h, projectId, workspace, layers.characters, layers.characterEditor, ops.characters, ops.router));
  }
  if (layer.id === 'worldview') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderWorldviewLayer(h, projectId, workspace, layers.worldview, layers.worldEditor, ops.worldview, layers.worldview.list.map((entry) => ({ id: entry.id, label: entry.title || '未命名条目' }))));
  }
  if (layer.id === 'outline') {
    const selectedAct = layers.outlineEditor.draft.acts.find((act) => act.id === layers.outlineEditor.selectedActId);
    const selectedBeat = selectedAct?.beats.find((beat) => beat.id === layers.outlineEditor.selectedBeatId);
    const selectedChapter = chapters.list.find((chapter) => chapter.id === chapters.selectedChapterId);
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderOutlineLayer(h, projectId, workspace, layers.outline, layers.outlineEditor, ops.outline, layers.characters.list.map((character) => ({ id: character.id, label: character.name || '未命名角色' })), ops.router, detailGeneration === undefined ? undefined : {
        ...detailGeneration,
        outlineDirty: layers.outlineEditor.dirty,
        selectedAct: selectedAct === undefined ? undefined : { id: selectedAct.id, label: selectedAct.title || '未命名幕' },
        selectedBeat: selectedBeat === undefined ? undefined : { id: selectedBeat.id, label: selectedBeat.title || '未命名节' },
        selectedChapter: selectedChapter === undefined ? undefined : { id: selectedChapter.id, label: selectedChapter.title || '未命名章节' },
        characterOptions: layers.characters.list.map((character) => ({ id: character.id, label: character.name || '未命名角色' })),
      }));
  }
  if (layer.id === 'relationship') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      // 关系 from/to 以 B3 角色 id 持久化；显示时 join 角色名（改名不换 id，见
      // CharacterRepository.update），未知 id 回退显示 id 本身。
      renderRelationshipLayer(h, projectId, workspace, layers.characters.list, layers.relationship, layers.relationshipEditor, ops.relationship, layers.canon.events.map((event) => ({ id: event.id, label: event.summary || '未命名事件' })), ops.router));
  }
  if (layer.id === 'state') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderStateLayer(h, projectId, workspace, layers.state, layers.stateEditor, ops.state));
  }
  if (layer.id === 'canon') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderCanonLayer(h, projectId, workspace, layers.canon, layers.canonEditor, ops.canon));
  }
  return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' }, emptyState(h, layer));
}

/** 层视图兜底：注册表外的工作台视图（六层）经 contentArea 分发。 */
function renderLayerPanel(props: PanelViewProps): unknown {
  const { h, view, projectId, ns, states, ops } = props;
  const { workspace } = ns;
  const { layers } = states;
  return h('div', { 'data-novel-view-panel': view }, contentArea(h, projectId, workspace, view as LayerId, layers, states.chapters, ops, {
    namespace: ns.outlineDetailGeneration,
    state: states.outlineDetailGeneration,
    ops: ops.outlineDetailGeneration,
  }));
}

/**
 * I58 视图分发（design §14.8 / R12-5）：按稳定 activeView 渲染对应面板，
 * 每个内容区携带 `data-novel-view-panel` data 锚点。非层视图（LLM 设置 /
 * 创作设置 / 六层初始化审阅 / I60 正文）与层视图互斥，由单一视图状态决定。
 * I83：分发经 PANEL_REGISTRY 注册表完成，形参打包面（ns/states）不变。
 */
export function viewPanel(
  h: El,
  activeView: WorkbenchViewId,
  projectId: string,
  projectName: string,
  ns: WorkbenchNamespaces,
  states: WorkbenchViewStates,
  ops: WorkbenchOps,
  sourceEntry: unknown,
  review: unknown,
  settings: LlmSettingsPanelProps | undefined,
  creationSettings: WorkbenchSettingsPanelProps | undefined,
  workflow: WorkflowState,
  openWorkflowStage: (stage: WorkflowStageId) => void,
): unknown {
  const render = PANEL_REGISTRY[activeView] ?? renderLayerPanel;
  return render({ h, view: activeView, projectId, projectName, ns, states, ops, sourceEntry, review, settings, creationSettings, workflow, openWorkflowStage });
}
