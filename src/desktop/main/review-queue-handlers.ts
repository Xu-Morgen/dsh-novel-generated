import type { IpcHandler, IpcInvocationContext } from '../../app/ipc-registry.js';
import type { DesktopPaths } from '../../app/paths.js';
import { createBookCompletionService, type NovelBookCompletionService } from '../../host/book-completion-service.js';
import { createQueueService, type QueueService } from '../../host/queue-service.js';
import { createReferenceAuditService, type NovelReferenceAuditService } from '../../host/reference-audit-service.js';
import { createReferenceCorrectionService, type NovelReferenceCorrectionService } from '../../host/reference-correction-service.js';
import { createReviewRepairWorkflow, type ReviewRepairWorkflow } from '../../host/review-repair-workflow.js';
import { createReviewService, type NovelReviewService } from '../../host/review-service.js';
import type { NovelCharacterService } from '../../host/character-service.js';
import type { NovelCanonService } from '../../host/canon-service.js';
import type { NovelConfirmationService } from '../../host/confirmation-service.js';
import type { NovelKnowledgeService } from '../../host/knowledge-service.js';
import type { NovelOutlineService } from '../../host/outline-service.js';
import type { NovelRelationshipService } from '../../host/relationship-service.js';
import type { NovelRuleService } from '../../host/rule-service.js';
import type { NovelStyleService } from '../../host/style-service.js';
import type { GenerationSettings } from '../../llm/port/index.js';
import type { DesktopC5HandlerDependencies, DesktopC5Services } from './c5-handlers.js';

export interface DesktopReviewQueueHandlerDependencies extends Pick<DesktopC5HandlerDependencies, 'paths' | 'llm' | 'resolveGenerationSettings' | 'onDispose'> {
  readonly c5: DesktopC5Services;
  readonly characters: NovelCharacterService;
  readonly canon: NovelCanonService;
  readonly confirmation: NovelConfirmationService;
  readonly knowledge: NovelKnowledgeService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
}

export interface DesktopReviewQueueServices {
  readonly review: NovelReviewService;
  readonly repair: ReviewRepairWorkflow;
  readonly bookCompletion: NovelBookCompletionService;
  readonly queue: QueueService;
  readonly referenceAudit: NovelReferenceAuditService;
  readonly referenceCorrection: NovelReferenceCorrectionService;
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

/**
 * I178 Main owner for review, repair, reference correction, and the
 * recoverable generation queue. The handlers expose only bounded projections;
 * candidates, journals, and the single-write lane stay in Host services.
 */
export function createDesktopReviewQueueHandlers(deps: DesktopReviewQueueHandlerDependencies): ReadonlyMap<string, IpcHandler> {
  const { c5, paths, characters, canon, confirmation, knowledge, outline, relationship, rules, style } = deps;
  const resolveSettings = deps.resolveGenerationSettings ?? c5.resolveSettings;
  const review = createReviewService({
    llm: deps.llm,
    projectsRoot: paths.libraryRoot,
    text: c5.text,
    rules,
    canon,
    knowledge,
    relationship,
    style,
    consistency: c5.consistency,
    knowledgeLeak: c5.knowledgeLeak,
    relationshipStyle: c5.relationshipStyle,
    resolveSettings,
    onDispose: deps.onDispose,
  });
  const repair = createReviewRepairWorkflow({ review, text: c5.text, writing: c5.writing });
  const bookCompletion = createBookCompletionService({
    text: c5.text,
    outline,
    binding: c5.binding,
    confirmation,
    review,
    writing: c5.writing,
  });
  const queue = createQueueService({
    projectsRoot: paths.libraryRoot,
    candidate: c5.candidate,
    writing: c5.writing,
    text: c5.text,
    outline,
    sceneOutlineBinding: c5.binding,
    resolveSettings,
    onDispose: deps.onDispose,
  });
  const referenceAudit = createReferenceAuditService(paths.libraryRoot, deps.onDispose);
  const referenceCorrection = createReferenceCorrectionService({
    llm: deps.llm,
    characters,
    relationship,
    knowledge,
    canon,
    confirmation,
    audit: referenceAudit,
    onDispose: deps.onDispose,
  });

  const map = new Map<string, IpcHandler>();

  map.set('novel-creation-tool/novelReview/scan', async (projectId, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'review.scan', () => review.scan(projectId as string, settings, invocation?.signal));
  });
  map.set('novel-creation-tool/novelReview/adjudicate', async (projectId, input, context) => {
    const invocation = contextOf(context);
    const value = input as { decision: Parameters<typeof review.adjudicate>[1]; issueIds: readonly string[] };
    return withProgress(invocation, 'review.adjudicate', () => review.adjudicate(projectId as string, value.decision, value.issueIds, invocation?.signal));
  });
  map.set('novel-creation-tool/novelReview/records', (projectId) => review.records(projectId as string));
  map.set('novel-creation-tool/novelReview/bookReadiness', (projectId, page) => bookCompletion.readiness(projectId as string, page as Parameters<typeof bookCompletion.readiness>[1]));
  map.set('novel-creation-tool/novelReview/bookScan', async (projectId, page, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'review.bookScan', () => bookCompletion.scan(projectId as string, page as Parameters<typeof bookCompletion.scan>[1], settings, invocation?.signal));
  });

  map.set('novel-creation-tool/novelReviewRepair/propose', async (projectId, input, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'reviewRepair.propose', () => repair.propose(projectId as string, input as Parameters<typeof repair.propose>[1], settings === undefined ? undefined : settings as GenerationSettings, invocation?.signal));
  });

  map.set('novel-creation-tool/novelQueue/status', (projectId) => queue.status(projectId as string));
  map.set('novel-creation-tool/novelQueue/start', async (projectId, input, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.start', () => queue.start(projectId as string, input as Parameters<typeof queue.start>[1]));
  });
  map.set('novel-creation-tool/novelQueue/startAt', async (projectId, input, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.startAt', () => queue.startAt(projectId as string, input as Parameters<typeof queue.startAt>[1]));
  });
  map.set('novel-creation-tool/novelQueue/pause', async (projectId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.pause', () => queue.pause(projectId as string));
  });
  map.set('novel-creation-tool/novelQueue/resume', async (projectId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.resume', () => queue.resume(projectId as string));
  });
  map.set('novel-creation-tool/novelQueue/cancel', async (projectId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.cancel', () => queue.cancel(projectId as string));
  });
  map.set('novel-creation-tool/novelQueue/retry', async (projectId, taskId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.retry', () => queue.retry(projectId as string, taskId as string));
  });
  map.set('novel-creation-tool/novelQueue/cancelTask', async (projectId, taskId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.cancelTask', () => queue.cancelTask(projectId as string, taskId as string));
  });
  map.set('novel-creation-tool/novelQueue/recover', async (projectId, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'queue.recover', () => queue.recover(projectId as string));
  });

  map.set('novel-creation-tool/novelReferenceAudit/list', (projectId, input) => referenceAudit.list(projectId as string, input as Parameters<typeof referenceAudit.list>[1]));
  map.set('novel-creation-tool/novelReferenceCorrection/propose', async (projectId, input, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'referenceCorrection.propose', async () => referenceCorrection.propose(projectId as string, input as Parameters<typeof referenceCorrection.propose>[1], settings === undefined ? await resolveSettings() : settings as GenerationSettings, invocation?.signal));
  });
  map.set('novel-creation-tool/novelReferenceCorrection/accept', (projectId, proposalId) => referenceCorrection.accept(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelReferenceCorrection/reject', (projectId, proposalId) => referenceCorrection.reject(projectId as string, proposalId as string));
  map.set('novel-creation-tool/novelReferenceCorrection/pending', (projectId) => referenceCorrection.pending(projectId as string));

  return map;
}
