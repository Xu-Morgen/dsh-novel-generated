import type { IpcHandler, IpcInvocationContext } from '../../app/ipc-registry.js';
import type { DesktopPaths } from '../../app/paths.js';
import { resolveA2GenerationConfig, SettingsIndex } from '../../core/settings-index/index.js';
import { projectChapterList, toChapterReadResult, toSceneReadResult } from '../../core/text/projection.js';
import type { GenerationSettings } from '../../llm/port/index.js';
import { createBranchService } from '../../host/branch-service.js';
import { createConsistencyDetectionService, type NovelConsistencyDetectionService } from '../../host/consistency-detection-service.js';
import { createFinalizationCoordinator, type NovelFinalizationCoordinator } from '../../host/finalization-coordinator.js';
import { createFinalizationPlanBuilder, type NovelFinalizationPlanBuilder } from '../../host/finalization-plan-builder.js';
import { createHostUploadService } from '../../host/upload-service.js';
import { createKnowledgeLeakDetectionService, type NovelKnowledgeLeakDetectionService } from '../../host/knowledge-leak-detection-service.js';
import { createNextSceneContextBuilder } from '../../host/writing-context.js';
import { createOutlineGenerationBaselineService } from '../../host/outline-generation-baseline-service.js';
import { createOutlineReconciliationPlannerService, type NovelOutlineReconciliationPlannerService } from '../../host/outline-reconciliation-planner-service.js';
import { createOutlineReconciliationService, type NovelOutlineReconciliationService } from '../../host/outline-reconciliation-service.js';
import { createSceneOutlineBindingService, type NovelSceneOutlineBindingService } from '../../host/scene-outline-binding-service.js';
import { createTextChangeImpactService } from '../../host/text-change-impact-service.js';
import { createTextDeletionService, type NovelTextDeletionService } from '../../host/text-deletion-service.js';
import { createTextEditService, type NovelTextEditService } from '../../host/text-edit-service.js';
import { createTextService, type NovelTextServiceBundle } from '../../host/text-service.js';
import { createTimelineService } from '../../host/timeline-service.js';
import { createWritingAdjudicationService, type NovelWritingAdjudicationService } from '../../host/writing-adjudication-service.js';
import { createWritingCandidateService, type NovelWritingCandidateService } from '../../host/candidate-service.js';
import { createWorkspaceEditorService, type WorkspaceEditorService } from '../../host/workspace-service.js';
import { createRelationshipStyleDetectionService, type NovelRelationshipStyleDetectionService } from '../../host/relationship-style-detection-service.js';
import { toChapterMutationView, toSceneMutationView } from '../../host/text-mutation-adapter.js';
import type { NovelCanonService } from '../../host/canon-service.js';
import type { NovelCharacterService } from '../../host/character-service.js';
import type { NovelConfirmationService } from '../../host/confirmation-service.js';
import type { NovelKnowledgeService } from '../../host/knowledge-service.js';
import type { NovelOutlineService } from '../../host/outline-service.js';
import type { NovelProjectService } from '../../host/project-service.js';
import type { NovelRelationshipService } from '../../host/relationship-service.js';
import type { NovelRuleService } from '../../host/rule-service.js';
import type { NovelStyleService } from '../../host/style-service.js';
import type { NovelStateService } from '../../host/state-service.js';
import type { NovelWorldviewService } from '../../host/worldview-service.js';
import type { NovelWorkbenchSettingsService } from '../../host/workbench-settings-service.js';

export interface DesktopC5HandlerDependencies {
  readonly paths: DesktopPaths;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly state: NovelStateService;
  readonly canon: NovelCanonService;
  readonly confirmation: NovelConfirmationService;
  readonly projects: NovelProjectService;
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
  readonly knowledge: NovelKnowledgeService;
  readonly workbenchSettings: NovelWorkbenchSettingsService;
  /** Main-only LLM route; no provider client or credential enters this module's result values. */
  readonly llm?: unknown;
  readonly resolveGenerationSettings?: () => Promise<GenerationSettings>;
  readonly onDispose?: (dispose: () => void) => void;
  /** I178 reuses these Main-owned C5 services for review, repair, and queue. */
  readonly onServices?: (services: DesktopC5Services) => void;
}

/**
 * Main-owned C5 service bundle shared by every later desktop migration slice.
 * A single bundle keeps TextRepository, binding, writing adjudication, and the
 * candidate/recovery owners aligned (design §0.1.2, §14.9).
 */
export interface DesktopC5Services {
  readonly resolveSettings: () => Promise<GenerationSettings>;
  readonly text: NovelTextServiceBundle;
  /** I181: the same context owner used by desktop writing and assistant commands. */
  readonly context: import('../../host/writing-context.js').NextSceneContextProvider;
  readonly binding: NovelSceneOutlineBindingService;
  readonly baseline: import('../../host/outline-generation-baseline-service.js').NovelOutlineGenerationBaselineService;
  readonly timeline: import('../../host/timeline-service.js').NovelTimelineService;
  readonly textEdit: NovelTextEditService;
  readonly writing: NovelWritingAdjudicationService;
  readonly candidate: NovelWritingCandidateService;
  readonly consistency: NovelConsistencyDetectionService;
  readonly knowledgeLeak: NovelKnowledgeLeakDetectionService;
  readonly relationshipStyle: NovelRelationshipStyleDetectionService;
  readonly textDeletion: NovelTextDeletionService;
  readonly impact: import('../../host/text-change-impact-service.js').NovelTextChangeImpactService;
  readonly reconciliationPlanner: NovelOutlineReconciliationPlannerService;
  readonly reconciliation: NovelOutlineReconciliationService;
  readonly finalizationPlanBuilder: NovelFinalizationPlanBuilder;
  readonly finalization: NovelFinalizationCoordinator;
  readonly branch: import('../../host/branch-service.js').NovelBranchService;
  readonly workspace: WorkspaceEditorService;
}

function contextOf(value: unknown): IpcInvocationContext | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const candidate = value as Partial<IpcInvocationContext>;
  return typeof candidate.reportProgress === 'function' && candidate.signal instanceof AbortSignal ? candidate as IpcInvocationContext : undefined;
}

async function withProgress<T>(context: IpcInvocationContext | undefined, phase: string, operation: () => Promise<T>): Promise<T> {
  context?.reportProgress({ phase, status: 'running' });
  try {
    const result = await operation();
    context?.reportProgress({ phase, status: 'complete' });
    return result;
  } catch (cause) {
    context?.reportProgress({ phase, status: context?.signal.aborted ? 'cancelled' : 'failed' });
    throw cause;
  }
}

/**
 * I177 Main composition for the C5 workbench.
 *
 * All returned handlers are thin owner adapters: TextRepository, candidate
 * sessions, ConfirmationGate, structural writers, and finalization UoW remain
 * in Main/Host services. The map only adds the canonical IPC argument and
 * progress/cancellation seam (design §0.1.2, §14.9).
 */
export function createDesktopC5Handlers(deps: DesktopC5HandlerDependencies): ReadonlyMap<string, IpcHandler> {
  const { paths, characters, worldview, outline, relationship, state, canon, confirmation, projects, rules, style, knowledge } = deps;
  const resolveSettings = deps.resolveGenerationSettings ?? (async () => resolveA2GenerationConfig(await new SettingsIndex(paths.settingsRoot).load()).settings);
  const text = createTextService(paths.libraryRoot);
  const binding = createSceneOutlineBindingService(text, outline, paths.libraryRoot);
  const baseline = createOutlineGenerationBaselineService({ text, outline, binding }, paths.libraryRoot);
  const timeline = createTimelineService(outline, paths.libraryRoot);
  const textEdit = createTextEditService({
    llm: deps.llm,
    projectsRoot: paths.libraryRoot,
    state,
    relationship,
    knowledge,
    canon,
    worldview,
    confirmation,
    sceneOutlineBinding: binding,
    outlineGenerationBaseline: baseline,
    resolveSettings,
    onDispose: deps.onDispose,
  });
  const nextSceneContext = createNextSceneContextBuilder({
    outline,
    characters,
    worldview,
    relationship,
    state,
    canon,
    style,
    rules,
    knowledge,
    text,
    textFingerprint: (projectId) => text.projectFingerprint(projectId),
    sceneOutlineBinding: binding,
    outlineGenerationBaseline: baseline,
    timeline,
    workbenchSettings: deps.workbenchSettings,
  });
  const consistency = createConsistencyDetectionService(deps.llm, deps.onDispose);
  const knowledgeLeak = createKnowledgeLeakDetectionService(deps.llm, deps.onDispose);
  const relationshipStyle = createRelationshipStyleDetectionService(deps.llm, deps.onDispose);
  const writing = createWritingAdjudicationService({
    llm: deps.llm,
    projectsRoot: paths.libraryRoot,
    context: nextSceneContext,
    sceneOutlineBinding: binding,
    textMutation: text,
    state,
    relationship,
    knowledge,
    canon,
    worldview,
    confirmation,
    outlineGenerationBaseline: baseline,
    rules,
    style,
    consistency,
    knowledgeLeak,
    relationshipStyle,
    resolveSettings,
    onDispose: deps.onDispose,
  });
  const candidate = createWritingCandidateService({ llm: deps.llm, projectsRoot: paths.libraryRoot, onDispose: deps.onDispose });
  const textDeletion = createTextDeletionService({ text, binding, confirmation, writing });
  const impact = createTextChangeImpactService({ llm: deps.llm, text, outline, binding, baseline, onDispose: deps.onDispose });
  const reconciliationPlanner = createOutlineReconciliationPlannerService({ llm: deps.llm, text, outline, binding, baseline, onDispose: deps.onDispose });
  const reconciliation = createOutlineReconciliationService({ planner: reconciliationPlanner, text, outline, binding, baseline, confirmation, onDispose: deps.onDispose });
  const finalizationPlanBuilder = createFinalizationPlanBuilder({
    writing: {
      adoptedDraft: (candidateId) => writing.adoptedDraft!(candidateId),
      prepareFinalizationStructuralPreview: (candidateId, source, sourceHash, generationBaseline, settings, signal) => writing.prepareFinalizationStructuralPreview!(candidateId, source, sourceHash, generationBaseline, settings, signal),
    },
    text,
    outline,
    binding,
    baseline,
    impact,
    reconciliation: reconciliationPlanner,
    onDispose: deps.onDispose,
  });
  const finalization = createFinalizationCoordinator({
    planBuilder: finalizationPlanBuilder,
    text,
    state,
    relationship,
    knowledge,
    canon,
    worldview,
    outline,
    binding,
    baseline,
    reconciliation,
    confirmation,
    onDispose: deps.onDispose,
  });
  const branch = createBranchService(paths.libraryRoot);
  const uploadDisposer = deps.onDispose === undefined ? undefined : (dispose: () => void | Promise<void>): void => {
    deps.onDispose?.(() => { void dispose(); });
  };
  const upload = createHostUploadService(uploadDisposer ?? (() => undefined));
  const workspace = createWorkspaceEditorService({ characters, worldview, outline, relationship, state, canon, confirmation, projects, upload, text, textEdit });
  const services: DesktopC5Services = Object.freeze({ resolveSettings, text, context: nextSceneContext, binding, baseline, timeline, textEdit, writing, candidate, consistency, knowledgeLeak, relationshipStyle, textDeletion, impact, reconciliationPlanner, reconciliation, finalizationPlanBuilder, finalization, branch, workspace });
  deps.onServices?.(services);
  const mutation = {
    async fingerprint(projectId: string) { await text.open(projectId); return { fingerprint: await text.projectFingerprint(projectId) }; },
    async chapterCreate(projectId: string, input: Parameters<typeof text.createChapterMutation>[1]) { await text.open(projectId); const result = await text.createChapterMutation(projectId, input); return { chapter: toChapterMutationView(result.chapter), fingerprint: result.fingerprint }; },
    async chapterUpdate(projectId: string, input: Parameters<typeof text.updateChapterMutation>[1]) { await text.open(projectId); const result = await text.updateChapterMutation(projectId, input); return { chapter: toChapterMutationView(result.chapter), fingerprint: result.fingerprint }; },
    async sceneCreate(projectId: string, input: Parameters<typeof text.createSceneMutation>[1]) { await text.open(projectId); const result = await text.createSceneMutation(projectId, input); return { chapterId: input.chapterId, scene: toSceneMutationView(result.scene), fingerprint: result.fingerprint }; },
    async sceneUpdate(projectId: string, input: Parameters<typeof text.updateSceneMutation>[1]) { await text.open(projectId); const result = await text.updateSceneMutation(projectId, input); return { chapterId: input.chapterId, scene: toSceneMutationView(result.scene), fingerprint: result.fingerprint }; },
    async reorder(projectId: string, input: Parameters<typeof text.reorderProject>[1]) { await text.open(projectId); const result = await text.reorderProject(projectId, input); return { chapters: result.chapters.map(toChapterMutationView), fingerprint: result.fingerprint }; },
  };
  const openText = (projectId: string): Promise<void> => text.open(projectId);
  const openWriting = (projectId: string): Promise<void> => writing.open(projectId);
  const openBranch = (projectId: string): Promise<void> => branch.open(projectId);
  const writingSettings = async (settings: unknown): Promise<GenerationSettings> => settings === undefined ? resolveSettings() : settings as GenerationSettings;

  const map = new Map<string, IpcHandler>();
  map.set('novel-creation-tool/novelWorkspace/chapterList', (projectId) => workspace.chapterList(projectId as string));
  map.set('novel-creation-tool/novelWorkspace/chapterRead', (projectId, chapterId) => workspace.chapterRead(projectId as string, chapterId as string));
  map.set('novel-creation-tool/novelWorkspace/sceneRead', (projectId, chapterId, sceneId) => workspace.sceneRead(projectId as string, chapterId as string, sceneId as string));
  map.set('novel-creation-tool/novelWorkspace/sceneEdit', (projectId, chapterId, sceneId, range, replacement, baseHash) => workspace.sceneEdit(projectId as string, chapterId as string, sceneId as string, range as Parameters<WorkspaceEditorService['sceneEdit']>[3], replacement as string, baseHash as string | undefined));
  map.set('novel-creation-tool/novelWorkspace/sceneReparsePropose', (projectId, chapterId, sceneId, range, replacement, baseHash) => workspace.sceneReparsePropose(projectId as string, chapterId as string, sceneId as string, range as Parameters<WorkspaceEditorService['sceneReparsePropose']>[3], replacement as string, baseHash as string | undefined));
  map.set('novel-creation-tool/novelWorkspace/sceneReparsePreview', async (projectId, chapterId, sceneId, range, replacement, baseHash, context) => {
    const invocation = contextOf(context);
    await textEdit.open(projectId as string);
    return textEdit.reparsePreview(projectId as string, chapterId as string, sceneId as string, range as Parameters<NovelTextEditService['reparsePreview']>[3], replacement as string, baseHash as string | undefined, invocation?.signal);
  });
  map.set('novel-creation-tool/novelWorkspace/sceneReparseAccept', (projectId, chapterId, sceneId, range, replacement, proposalId, baseHash) => workspace.sceneReparseAccept(projectId as string, chapterId as string, sceneId as string, range as Parameters<WorkspaceEditorService['sceneReparseAccept']>[3], replacement as string, proposalId as string, baseHash as string | undefined));
  map.set('novel-creation-tool/novelWorkspace/sceneReparseReject', (projectId, proposalId) => workspace.sceneReparseReject(projectId as string, proposalId as string));

  map.set('novel-creation-tool/novelText/fingerprint', (projectId) => mutation.fingerprint(projectId as string));
  map.set('novel-creation-tool/novelText/chapterCreate', (projectId, input) => mutation.chapterCreate(projectId as string, input as Parameters<typeof text.createChapterMutation>[1]));
  map.set('novel-creation-tool/novelText/chapterUpdate', (projectId, input) => mutation.chapterUpdate(projectId as string, input as Parameters<typeof text.updateChapterMutation>[1]));
  map.set('novel-creation-tool/novelText/sceneCreate', (projectId, input) => mutation.sceneCreate(projectId as string, input as Parameters<typeof text.createSceneMutation>[1]));
  map.set('novel-creation-tool/novelText/sceneUpdate', (projectId, input) => mutation.sceneUpdate(projectId as string, input as Parameters<typeof text.updateSceneMutation>[1]));
  map.set('novel-creation-tool/novelText/reorder', (projectId, input) => mutation.reorder(projectId as string, input as Parameters<typeof text.reorderProject>[1]));

  map.set('novel-creation-tool/novelBranches/list', async (projectId, chapterId, sceneId) => { await openBranch(projectId as string); return branch.listBranches(projectId as string, chapterId as string, sceneId as string); });
  map.set('novel-creation-tool/novelBranches/read', async (projectId, chapterId, sceneId, branchId) => { await openBranch(projectId as string); return branch.readBranch(projectId as string, chapterId as string, sceneId as string, branchId as string); });
  map.set('novel-creation-tool/novelBranches/save', async (projectId, chapterId, sceneId, label) => { await openBranch(projectId as string); return branch.saveBranch(projectId as string, chapterId as string, sceneId as string, label as string); });
  map.set('novel-creation-tool/novelBranches/choose', async (projectId, chapterId, sceneId, branchId) => { await openBranch(projectId as string); return branch.chooseBranch(projectId as string, chapterId as string, sceneId as string, branchId as string); });
  map.set('novel-creation-tool/novelBranches/diff', async (projectId, chapterId, sceneId, branchId, toBranchId) => { await openBranch(projectId as string); return branch.diffBranches(projectId as string, chapterId as string, sceneId as string, branchId as string, toBranchId as string | undefined); });
  map.set('novel-creation-tool/novelBranches/aggregate', async (projectId) => { await openBranch(projectId as string); return branch.aggregate(projectId as string); });
  map.set('novel-creation-tool/novelBranches/chooseFresh', async (projectId, chapterId, sceneId, branchId, sourceHash) => { await openBranch(projectId as string); return branch.chooseFresh(projectId as string, chapterId as string, sceneId as string, branchId as string, sourceHash as string); });

  map.set('novel-creation-tool/novelSceneOutlineBinding/read', async (projectId) => { await openText(projectId as string); return binding.read(projectId as string); });
  map.set('novel-creation-tool/novelSceneOutlineBinding/save', async (projectId, input) => { await openText(projectId as string); return binding.save(projectId as string, input as Parameters<NovelSceneOutlineBindingService['save']>[1]); });
  map.set('novel-creation-tool/novelSceneOutlineBinding/rebind', async (projectId, input) => { await openText(projectId as string); return binding.rebind(projectId as string, input as Parameters<NovelSceneOutlineBindingService['rebind']>[1]); });
  map.set('novel-creation-tool/novelSceneOutlineBinding/unbind', async (projectId, input) => { await openText(projectId as string); return binding.unbind(projectId as string, input as Parameters<NovelSceneOutlineBindingService['unbind']>[1]); });
  map.set('novel-creation-tool/novelSceneOutlineBinding/impact', async (projectId, input) => { await openText(projectId as string); return binding.impact(projectId as string, input as Parameters<NovelSceneOutlineBindingService['impact']>[1]); });

  map.set('novel-creation-tool/novelTextDeletion/impact', async (projectId, target) => { await openText(projectId as string); await openWriting(projectId as string); return textDeletion.impact(projectId as string, target as Parameters<NovelTextDeletionService['impact']>[1]); });
  map.set('novel-creation-tool/novelTextDeletion/propose', async (projectId, target, expectedImpactFingerprint) => { await openText(projectId as string); await openWriting(projectId as string); return textDeletion.propose(projectId as string, { target: target as Parameters<NovelTextDeletionService['propose']>[1]['target'], expectedImpactFingerprint: expectedImpactFingerprint as string }); });
  map.set('novel-creation-tool/novelTextDeletion/apply', async (projectId, proposalId) => { await openText(projectId as string); await openWriting(projectId as string); return textDeletion.apply(projectId as string, proposalId as string); });
  map.set('novel-creation-tool/novelTextDeletion/reject', (projectId, proposalId) => textDeletion.reject(projectId as string, proposalId as string));

  map.set('novel-creation-tool/novelWriting/propose', async (projectId, input, settings, context) => {
    const invocation = contextOf(context);
    await openWriting(projectId as string);
    return withProgress(invocation, 'writing.propose', async () => writing.propose(projectId as string, input as Parameters<NovelWritingAdjudicationService['propose']>[1], await writingSettings(settings), invocation?.signal));
  });
  map.set('novel-creation-tool/novelWriting/proposeAt', async (projectId, input, settings, context) => {
    const invocation = contextOf(context);
    await openWriting(projectId as string);
    return withProgress(invocation, 'writing.proposeAt', async () => writing.proposeAt(projectId as string, input as Parameters<NovelWritingAdjudicationService['proposeAt']>[1], await writingSettings(settings), invocation?.signal));
  });
  map.set('novel-creation-tool/novelWriting/preview', (candidateId, context) => { const invocation = contextOf(context); return withProgress(invocation, 'writing.preview', () => writing.preview(candidateId as string, invocation?.signal)); });
  map.set('novel-creation-tool/novelWriting/previewLayers', (candidateId, context) => { const invocation = contextOf(context); return withProgress(invocation, 'writing.previewLayers', () => writing.previewLayers(candidateId as string, invocation?.signal)); });
  map.set('novel-creation-tool/novelWriting/adoptDraft', (candidateId, context) => { const invocation = contextOf(context); return withProgress(invocation, 'writing.adoptDraft', () => writing.adoptDraft!(candidateId as string, invocation?.signal)); });
  map.set('novel-creation-tool/novelWriting/adjudicate', async (candidateId, decision, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'writing.adjudicate', async () => writing.adjudicate(candidateId as string, decision as 'accept' | 'reject' | 'rewrite', await writingSettings(settings), invocation?.signal));
  });
  map.set('novel-creation-tool/novelWriting/prepareFinalizationPlan', async (projectId, input, settings, context) => {
    const invocation = contextOf(context);
    await openWriting(projectId as string);
    return withProgress(invocation, 'writing.prepareFinalizationPlan', async () => finalizationPlanBuilder.prepare(projectId as string, input as Parameters<NovelFinalizationPlanBuilder['prepare']>[1], await writingSettings(settings), invocation?.signal));
  });
  map.set('novel-creation-tool/novelWriting/readFinalizationPlan', (projectId, planId) => finalizationPlanBuilder.read(projectId as string, planId as string));
  map.set('novel-creation-tool/novelWriting/cancelFinalizationPlan', (projectId, planId) => finalizationPlanBuilder.cancel(projectId as string, planId as string));
  map.set('novel-creation-tool/novelWriting/proposeFinalization', (projectId, input) => finalization.propose(projectId as string, input as Parameters<NovelFinalizationCoordinator['propose']>[1]));
  map.set('novel-creation-tool/novelWriting/acceptFinalization', (projectId, proposalId) => finalization.accept(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelWriting/rejectFinalization', (projectId, proposalId) => finalization.reject(projectId as string, proposalId as string));

  map.set('novel-creation-tool/novelOutlineReconciliation/prepare', async (projectId, input, settings, context) => { const invocation = contextOf(context); await openText(projectId as string); return withProgress(invocation, 'outlineReconciliation.prepare', async () => reconciliationPlanner.prepare(projectId as string, input as Parameters<NovelOutlineReconciliationPlannerService['prepare']>[1], await writingSettings(settings), invocation?.signal)); });
  map.set('novel-creation-tool/novelOutlineReconciliation/regenerateOne', async (projectId, input, settings, context) => { const invocation = contextOf(context); await openText(projectId as string); return withProgress(invocation, 'outlineReconciliation.regenerateOne', async () => reconciliationPlanner.regenerateOne(projectId as string, input as Parameters<NovelOutlineReconciliationPlannerService['regenerateOne']>[1], await writingSettings(settings), invocation?.signal)); });
  map.set('novel-creation-tool/novelOutlineReconciliation/read', (projectId, planId) => reconciliationPlanner.read(projectId as string, planId as string));
  map.set('novel-creation-tool/novelOutlineReconciliation/cancel', (projectId, planId) => reconciliationPlanner.cancel(projectId as string, planId as string));
  map.set('novel-creation-tool/novelOutlineReconciliation/propose', (projectId, input) => reconciliation.propose(projectId as string, input as Parameters<NovelOutlineReconciliationService['propose']>[1]));
  map.set('novel-creation-tool/novelOutlineReconciliation/accept', (projectId, proposalId) => reconciliation.accept(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelOutlineReconciliation/reject', (projectId, proposalId) => reconciliation.reject(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelOutlineReconciliation/finalize', (projectId, input) => reconciliation.finalize(projectId as string, input as Parameters<NovelOutlineReconciliationService['finalize']>[1]));
  map.set('novel-creation-tool/novelOutlineReconciliation/continue', (projectId, input) => reconciliation.continue(projectId as string, input as Parameters<NovelOutlineReconciliationService['continue']>[1]));

  return map;
}
