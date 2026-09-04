import type { IpcHandler, IpcInvocationContext } from '../../app/ipc-registry.js';
import type { DesktopPaths } from '../../app/paths.js';
import { createInspirationService } from '../../host/inspiration-service.js';
import { createNovelPortabilityService } from '../../host/import-export-service.js';
import { createManuscriptCompiler } from '../../host/manuscript-compiler.js';
import { createProgressInspirationService } from '../../host/progress-inspiration-service.js';
import { createSearchService } from '../../host/search-service.js';
import { createStatisticsService, type NovelStatisticsService } from '../../host/statistics-service.js';
import type { NovelCanonService } from '../../host/canon-service.js';
import type { NovelCharacterService } from '../../host/character-service.js';
import type { NovelConfirmationService } from '../../host/confirmation-service.js';
import type { NovelKnowledgeService } from '../../host/knowledge-service.js';
import type { NovelOutlineService } from '../../host/outline-service.js';
import type { NovelRelationshipService } from '../../host/relationship-service.js';
import type { NovelRuleService } from '../../host/rule-service.js';
import type { NovelStyleService } from '../../host/style-service.js';
import type { NovelWorldviewService } from '../../host/worldview-service.js';
import type { DesktopC5Services } from './c5-handlers.js';
import type { DesktopReviewQueueServices } from './review-queue-handlers.js';

export interface DesktopAuthorWorkflowHandlerDependencies {
  readonly paths: DesktopPaths;
  readonly c5: DesktopC5Services;
  readonly reviewQueue: DesktopReviewQueueServices;
  readonly llm?: unknown;
  readonly onDispose?: (dispose: () => void) => void;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly canon: NovelCanonService;
  readonly confirmation: NovelConfirmationService;
  readonly knowledge: NovelKnowledgeService;
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
}

function contextOf(value: unknown): IpcInvocationContext | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const candidate = value as Partial<IpcInvocationContext>;
  return typeof candidate.reportProgress === 'function' && candidate.signal instanceof AbortSignal
    ? candidate as IpcInvocationContext
    : undefined;
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

function sceneCardsWireAdapter(service: NovelStatisticsService) {
  return (projectId: string, actId?: unknown, beatId?: unknown, status?: unknown, limit?: unknown) => service.sceneCards(projectId, {
    ...(actId !== undefined && actId !== null ? { actId: String(actId) } : {}),
    ...(beatId !== undefined && beatId !== null ? { beatId: String(beatId) } : {}),
    ...(status !== undefined && status !== null ? { status: String(status) as 'planned' | 'writing' | 'done' } : {}),
    ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
  });
}

function tasksWireAdapter(service: NovelStatisticsService) {
  return (projectId: string, status?: unknown, limit?: unknown) => service.tasks(projectId, {
    ...(status !== undefined && status !== null ? { status: String(status) as 'queued' | 'running' | 'candidate-ready' | 'failed' | 'cancelled' | 'completed' } : {}),
    ...(limit !== undefined && limit !== null ? { limit: Number(limit) } : {}),
  });
}

/**
 * I180 Main owner for the remaining author-facing projections and portability.
 * Search/statistics/timeline/progress all reuse the already composed C5 and
 * queue owners; Renderer receives only their strict, bounded wire projections.
 * Export compilation is also kept here so no browser download or manuscript
 * assembly becomes a second source-of-truth owner (design §0.1.2, §14.32.3).
 */
export function createDesktopAuthorWorkflowHandlers(
  deps: DesktopAuthorWorkflowHandlerDependencies,
): ReadonlyMap<string, IpcHandler> {
  const inspiration = createInspirationService(deps.llm, deps.onDispose);
  const progress = createProgressInspirationService({
    outline: deps.outline,
    confirmation: deps.confirmation,
    inspiration,
    projectsRoot: deps.paths.libraryRoot,
    onDispose: deps.onDispose,
  });
  const search = createSearchService({
    projectsRoot: deps.paths.libraryRoot,
    text: deps.c5.text,
    characters: deps.characters,
    worldview: deps.worldview,
    outline: deps.outline,
    canon: deps.canon,
    knowledge: deps.knowledge,
  });
  const statistics = createStatisticsService({
    projectsRoot: deps.paths.libraryRoot,
    text: deps.c5.text,
    outline: deps.outline,
    sceneOutlineBinding: deps.c5.binding,
    queue: deps.reviewQueue.queue,
  });
  const compiler = createManuscriptCompiler({ text: deps.c5.text, completion: deps.reviewQueue.bookCompletion });
  const portability = createNovelPortabilityService(deps.paths.libraryRoot, compiler);

  const openSearch = async (projectId: string): Promise<void> => {
    // Project lifecycle intentionally classifies C3 separately; search is the
    // first remaining consumer that needs the repository opened for reads.
    await deps.c5.text.open(projectId);
    await deps.knowledge.open(projectId);
    await search.open(projectId);
  };
  const openStatistics = async (projectId: string): Promise<void> => {
    await deps.c5.text.open(projectId);
    await statistics.open(projectId);
  };
  const map = new Map<string, IpcHandler>();

  map.set('novel-creation-tool/novelOutlineProgress/projection', (projectId) => progress.projection(projectId as string));
  map.set('novel-creation-tool/novelOutlineProgress/recordDeviation', (projectId, input) => progress.recordDeviation(projectId as string, input as Parameters<typeof progress.recordDeviation>[1]));
  map.set('novel-creation-tool/novelOutlineProgress/reconcileDeviation', (projectId, deviationId) => progress.reconcileDeviation(projectId as string, deviationId as string));
  map.set('novel-creation-tool/novelOutlineProgress/inspire', (projectId, prompt, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'progress.inspire', () => progress.inspire(projectId as string, prompt as string | undefined, invocation?.signal));
  });
  map.set('novel-creation-tool/novelOutlineProgress/select', (projectId, input) => progress.select(projectId as string, input as Parameters<typeof progress.select>[1]));
  map.set('novel-creation-tool/novelOutlineProgress/apply', (projectId, proposalId) => progress.apply(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelOutlineProgress/reject', (projectId, proposalId) => progress.reject(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelOutlineProgress/pending', (projectId) => progress.pending(projectId as string));
  map.set('novel-creation-tool/novelOutlineProgress/audit', (projectId) => progress.audit(projectId as string));

  map.set('novel-creation-tool/novelImportExport/exportArchive', (projectId, mode) => portability.exportArchive(projectId as string, mode as Parameters<typeof portability.exportArchive>[1]));
  map.set('novel-creation-tool/novelImportExport/exportText', (projectId, format) => portability.exportText(projectId as string, format as Parameters<typeof portability.exportText>[1]));
  map.set('novel-creation-tool/novelImportExport/restore', (projectId, raw) => portability.restore(projectId as string, raw as string));
  map.set('novel-creation-tool/novelImportExport/compileManuscript', (projectId, input) => portability.compileManuscript(projectId as string, input as Parameters<typeof portability.compileManuscript>[1]));

  map.set('novel-creation-tool/novelSearch/build', (projectId) => openSearch(projectId as string).then(() => search.build(projectId as string)));
  map.set('novel-creation-tool/novelSearch/drop', (projectId) => openSearch(projectId as string).then(() => search.drop(projectId as string)));
  map.set('novel-creation-tool/novelSearch/stats', (projectId) => openSearch(projectId as string).then(() => search.stats(projectId as string)));
  map.set('novel-creation-tool/novelSearch/search', (projectId, query, pov) => openSearch(projectId as string).then(() => search.search(projectId as string, query as string, pov as string | undefined)));
  map.set('novel-creation-tool/novelSearch/references', (projectId, key, pov) => openSearch(projectId as string).then(() => search.references(projectId as string, key as string, pov as string | undefined)));

  map.set('novel-creation-tool/novelStatistics/rebuild', (projectId) => openStatistics(projectId as string).then(() => statistics.build(projectId as string)));
  map.set('novel-creation-tool/novelStatistics/drop', (projectId) => openStatistics(projectId as string).then(() => statistics.drop(projectId as string)));
  map.set('novel-creation-tool/novelStatistics/stats', (projectId) => openStatistics(projectId as string).then(() => statistics.stats(projectId as string)));
  map.set('novel-creation-tool/novelStatistics/overview', (projectId) => openStatistics(projectId as string).then(() => statistics.overview(projectId as string)));
  map.set('novel-creation-tool/novelStatistics/chapterDetail', (projectId, chapterId) => openStatistics(projectId as string).then(() => statistics.chapterDetail(projectId as string, chapterId as string)));
  map.set('novel-creation-tool/novelStatistics/sceneCards', (projectId, actId, beatId, status, limit) => openStatistics(projectId as string).then(() => sceneCardsWireAdapter(statistics)(projectId as string, actId, beatId, status, limit)));
  map.set('novel-creation-tool/novelStatistics/tasks', (projectId, status, limit) => openStatistics(projectId as string).then(() => tasksWireAdapter(statistics)(projectId as string, status, limit)));

  map.set('novel-creation-tool/novelTimeline/read', (projectId) => deps.c5.timeline.read(projectId as string));
  map.set('novel-creation-tool/novelTimeline/ensureFromOutline', (projectId) => deps.c5.timeline.ensureFromOutline(projectId as string));
  map.set('novel-creation-tool/novelTimeline/setCurrentNode', (projectId, nodeId) => deps.c5.timeline.setCurrentNode(projectId as string, (nodeId as string | undefined) ?? null));
  map.set('novel-creation-tool/novelTimeline/save', (projectId, input) => deps.c5.timeline.save(projectId as string, input as Parameters<typeof deps.c5.timeline.save>[1]));

  return map;
}
