import { ensureImportedProgress } from './import-progress.js';
import { IpcHandlerRejection, ruleStyleHandlerRejection } from '../../app/ipc-handler-rejection.js';
import { NarrativeAdaptationFormatError } from '../../llm/analyze/narrative-adaptation.js';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

import type { IpcHandler, IpcInvocationContext } from '../../app/ipc-registry.js';
import type { DesktopPaths } from '../../app/paths.js';
import type { SelectedDocxResult } from '../../core/schema/upload.js';
import type { GenerationSettings } from '../../llm/port/index.js';
import { createOnboardingAnalyzerService } from '../../host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService } from '../../host/onboarding-adjudication-service.js';
import { createImportExportService } from '../../host/import-export-service.js';
import { createImportInterpretationAnalysisService, type NovelImportInterpretationAnalysisService } from '../../host/import-interpretation-analysis-service.js';
import { createImportInterpretationSessionService, type NovelImportInterpretationSessionService } from '../../host/import-interpretation-session-service.js';
import { createNarrativeAdaptationService, type NarrativeAdaptationService } from '../../host/narrative-adaptation-service.js';
import { createNarrativeImportPlanCoordinator, type NarrativeImportPlanCoordinator } from '../../host/narrative-import-plan-coordinator.js';
import { createNarrativeRevealPlanner, type NarrativeRevealPlanner } from '../../host/narrative-reveal-planner-service.js';
import { createRuleStyleImportInitializationService, type RuleStyleImportInitializationService } from '../../host/rule-style-import-initialization-service.js';
import type { NovelCharacterService } from '../../host/character-service.js';
import type { NovelCanonService } from '../../host/canon-service.js';
import type { NovelConfirmationService } from '../../host/confirmation-service.js';
import type { NovelKnowledgeService } from '../../host/knowledge-service.js';
import type { NovelOutlineService } from '../../host/outline-service.js';
import type { NovelRelationshipService } from '../../host/relationship-service.js';
import type { NovelRuleService } from '../../host/rule-service.js';
import type { NovelStyleService } from '../../host/style-service.js';
import type { ImportPreviewInput } from '../../host/import-export-service.js';
import type { DesktopC5HandlerDependencies, DesktopC5Services } from './c5-handlers.js';

const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 64 * 1024;

export interface DesktopSourceImportHandlerDependencies extends Pick<DesktopC5HandlerDependencies, 'paths' | 'llm' | 'resolveGenerationSettings' | 'onDispose'> {
  readonly c5: DesktopC5Services;
  readonly characters: NovelCharacterService;
  readonly worldview: import('../../host/worldview-service.js').NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly state: import('../../host/state-service.js').NovelStateService;
  readonly canon: NovelCanonService;
  readonly confirmation: NovelConfirmationService;
  readonly knowledge: NovelKnowledgeService;
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
  /** Main-only OS chooser. Its path is consumed in this module and never returned. */
  readonly selectDocxFile?: () => Promise<string | undefined>;
}

export interface DesktopSourceImportServices {
  readonly session: NovelImportInterpretationSessionService;
  readonly analysis: NovelImportInterpretationAnalysisService;
  readonly initialization: RuleStyleImportInitializationService;
  readonly adaptation: NarrativeAdaptationService;
  readonly reveal: NarrativeRevealPlanner;
  readonly plan: NarrativeImportPlanCoordinator;
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

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && error.cause !== undefined
    && typeof error.cause === 'object'
    && error.cause !== null
    && 'code' in error.cause
    && (error.cause as { code?: unknown }).code === 'ENOENT';
}

/**
 * Main-only controlled DOCX chooser. The OS path is an implementation detail:
 * Main validates/stat-reads it, streams bytes through the existing Host upload
 * service, and returns only `SelectedDocxResult` (design §0.1.2 / §14.32.3).
 */
async function selectAndUploadDocx(
  deps: DesktopSourceImportHandlerDependencies,
): Promise<SelectedDocxResult> {
  if (deps.selectDocxFile === undefined) throw new Error('DOCX file chooser is unavailable');
  const selectedPath = await deps.selectDocxFile();
  if (selectedPath === undefined) return null;

  const fileName = basename(selectedPath);
  if (!/^[^/\\\u0000]+\.docx$/i.test(fileName)) throw new Error('Only .docx files are supported');
  const metadata = await stat(selectedPath);
  if (!metadata.isFile()) throw new Error('Selected DOCX is not a regular file');
  if (metadata.size <= 0) throw new Error('Selected DOCX is empty');
  if (metadata.size > MAX_DOCX_BYTES) throw new Error('Selected DOCX exceeds the 10 MiB upload limit');

  const bytes = await readFile(selectedPath);
  if (bytes.length !== metadata.size) throw new Error('Selected DOCX changed while it was being read');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const started = await deps.c5.workspace.uploadStart({ fileName, size: bytes.length, sha256 });
  const uploadId = started.uploadId;
  try {
    const chunkSize = started.chunkSize || DEFAULT_CHUNK_BYTES;
    const total = Math.ceil(bytes.length / chunkSize);
    for (let index = started.nextIndex; index < total; index += 1) {
      const chunk = bytes.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, bytes.length));
      await deps.c5.workspace.uploadChunk(uploadId, index, chunk.toString('base64'));
    }
    const finalized = await deps.c5.workspace.uploadFinalize(uploadId);
    return { ...finalized, uploadId };
  } catch (cause) {
    await deps.c5.workspace.uploadCancel(uploadId).catch(() => undefined);
    throw cause;
  }
}

/**
 * I179 Main composition for text/DOCX source entry and semantic review.
 * Existing Host services remain the owners of source ranges, session identity,
 * analysis, first-import B1/B4 gating, and all candidate/application seams;
 * before author confirmation no C3/C4/POV write is reachable (R19/R22/R24).
 */
export function createDesktopSourceImportHandlers(
  deps: DesktopSourceImportHandlerDependencies,
): ReadonlyMap<string, IpcHandler> {
  const { paths, c5, characters, worldview, outline, relationship, state, canon, confirmation, knowledge, rules, style } = deps;
  const resolveSettings = deps.resolveGenerationSettings ?? c5.resolveSettings;
  const importExport = createImportExportService(paths.libraryRoot);
  const session = createImportInterpretationSessionService(paths.libraryRoot, deps.onDispose);
  const analysis = createImportInterpretationAnalysisService(deps.llm, deps.onDispose);
  const initialization = createRuleStyleImportInitializationService(deps.llm, paths.libraryRoot, {
    sessions: session,
    analysis,
    confirmation,
    rules,
    style,
    async isProjectEmpty(projectId) {
      const readKnowledge = async () => {
        await knowledge.open(projectId);
        try { return await knowledge.read(projectId); }
        catch (error) { if (isMissing(error)) return { entries: [], states: [] }; throw error; }
      };
      const [characterList, worldviewList, relationships, outlineStatus, canonEvents, knowledgeDocument] = await Promise.all([
        characters.list(projectId), worldview.list(projectId), relationship.read(projectId),
        outline.readiness(projectId), Promise.resolve(canon.query(projectId)), readKnowledge(),
      ]);
      return characterList.length === 0
        && worldviewList.length === 0
        && relationships.length === 0
        && outlineStatus === 'uninitialized'
        && canonEvents.length === 0
        && knowledgeDocument.entries.length === 0;
    },
  }, deps.onDispose);
  const adaptation = createNarrativeAdaptationService(deps.llm, deps.onDispose);
  const reveal = createNarrativeRevealPlanner(deps.llm, deps.onDispose);
  const plan = createNarrativeImportPlanCoordinator(paths.libraryRoot, {
    characters, worldview, outline, relationship, state, canon, knowledge, confirmation,
  }, deps.onDispose);

  // I194 / §14.15: reuse the I52 candidate owner; POV import consumes only its foundation layers.
  const analyzer = createOnboardingAnalyzerService(deps.llm, deps.onDispose, () => {});
  const onboarding = createOnboardingAdjudicationService({ characters, worldview, outline, relationship, state, canon, confirmation }, {
    getResult: (id) => analyzer.getResult(id),
    async regenerate(id, layer, settings) { return { layers: (await analyzer.regenerate(id, layer, settings ?? await resolveSettings())).layers }; },
  });

  const map = new Map<string, IpcHandler>();
  map.set('novel-creation-tool/novelOnboardingAnalyzer/begin', async (input, settings) => analyzer.begin(input as Parameters<typeof analyzer.begin>[0], settings ?? await resolveSettings()));
  map.set('novel-creation-tool/novelOnboardingAnalyzer/start', async (input, settings, context) => analyzer.start(input as Parameters<typeof analyzer.start>[0], settings ?? await resolveSettings(), contextOf(context)?.signal));
  map.set('novel-creation-tool/novelOnboardingAnalyzer/status', (id) => analyzer.status(id as string));
  map.set('novel-creation-tool/novelOnboardingAnalyzer/result', (id) => analyzer.result(id as string));
  map.set('novel-creation-tool/novelOnboardingAnalyzer/cancel', (id) => analyzer.cancel(id as string));
  map.set('novel-creation-tool/novelOnboarding/adjudicate', (input, settings) => onboarding.adjudicate(input as Parameters<typeof onboarding.adjudicate>[0], settings));
  map.set('novel-creation-tool/novelOnboarding/acceptedLayers', (id) => onboarding.acceptedLayers(id as string));
  map.set('novel-creation-tool/novelOnboarding/finalApply', async (input) => {
    const result = await onboarding.finalApply(input as Parameters<typeof onboarding.finalApply>[0]);
    if (!result.retryable && result.blockedLayers.length === 0 && result.pendingLayers.length === 0) {
      // Ordinary I52 has no C3 fact candidates. New roles begin with no knowledge;
      // existing entries and states are retained through the monotonic C3 owner.
      await knowledge.open(result.projectId);
      const document = await knowledge.read(result.projectId);
      const importedCharacters = await characters.list(result.projectId);
      const knownIds = new Set(document.states.map(item => item.characterId));
      const missing = importedCharacters.filter(character => !knownIds.has(character.id));
      if (missing.length) await knowledge.saveAll(result.projectId, document.entries, [...document.states, ...missing.map(character => ({ characterId: character.id, knows: [] }))]);
      if (result.appliedLayers.includes('outline')) { await ensureImportedProgress(outline, result.projectId); await c5.timeline.ensureFromOutline(result.projectId); }
    }
    return result;
  });
  map.set('novel-creation-tool/novelWorkspace/selectDocx', () => selectAndUploadDocx(deps));
  map.set('novel-creation-tool/novelWorkspace/uploadStart', (input) => c5.workspace.uploadStart(input as Parameters<typeof c5.workspace.uploadStart>[0]));
  map.set('novel-creation-tool/novelWorkspace/uploadChunk', (uploadId, index, base64) => c5.workspace.uploadChunk(uploadId as string, index as number, base64 as string));
  map.set('novel-creation-tool/novelWorkspace/uploadFinalize', (uploadId) => c5.workspace.uploadFinalize(uploadId as string));
  map.set('novel-creation-tool/novelWorkspace/uploadCancel', async (uploadId) => { await c5.workspace.uploadCancel(uploadId as string); return { ok: true }; });

  map.set('novel-creation-tool/novelImportExport/importPreview', (projectId, input) => importExport.importPreview(projectId as string, input as ImportPreviewInput));
  map.set('novel-creation-tool/novelImportExport/normalizeSource', (projectId, input) => importExport.normalizeSource(projectId as string, input as ImportPreviewInput));

  map.set('novel-creation-tool/novelImportInterpretation/create', (input) => session.create(input as Parameters<typeof session.create>[0]));
  map.set('novel-creation-tool/novelImportInterpretation/read', (input) => session.read(input as Parameters<typeof session.read>[0]));
  map.set('novel-creation-tool/novelImportInterpretation/confirm', (input) => session.confirm(input as Parameters<typeof session.confirm>[0]));
  map.set('novel-creation-tool/novelImportInterpretation/discard', (input) => session.discard(input as Parameters<typeof session.discard>[0]));

  map.set('novel-creation-tool/novelImportInterpretationAnalysis/begin', async (input, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'importInterpretationAnalysis.begin', async () => analysis.begin(input as Parameters<typeof analysis.begin>[0], settings === undefined ? await resolveSettings() : settings as GenerationSettings));
  });
  map.set('novel-creation-tool/novelImportInterpretationAnalysis/status', (input) => analysis.status(input as Parameters<typeof analysis.status>[0]));
  map.set('novel-creation-tool/novelImportInterpretationAnalysis/cancel', (input) => analysis.cancel(input as Parameters<typeof analysis.cancel>[0]));
  map.set('novel-creation-tool/novelImportInterpretationAnalysis/result', (input) => analysis.result(input as Parameters<typeof analysis.result>[0]));

  map.set('novel-creation-tool/novelRuleStyleImportInitialization/begin', async (input, settings, context) => {
    try {
      const invocation = contextOf(context);
      const identity = input as Parameters<typeof initialization.begin>[0];
      invocation?.reportProgress({ phase: 'ruleStyleImportInitialization.begin', status: 'running', streamPhase: 'checking-config', receivedCharacters: 0, latestText: '' });
      let generationSettings: GenerationSettings;
      try {
        generationSettings = settings === undefined ? await resolveSettings() : settings as GenerationSettings;
      } catch {
        const message = 'AI 配置不可用。请在“AI 设置”中填写服务地址、模型名称和 API Key 后重试。';
        invocation?.reportProgress({ phase: 'ruleStyleImportInitialization.begin', status: 'failed', streamPhase: 'checking-config', receivedCharacters: 0, latestText: message });
        return await initialization.configurationFailure(identity, message);
      }
      return await withProgress(invocation, 'ruleStyleImportInitialization.begin', async () => initialization.begin(identity, generationSettings, {
        waitForCompletion: invocation !== undefined,
        onProgress: (progress) => invocation?.reportProgress({ phase: 'ruleStyleImportInitialization.begin', status: 'running', streamPhase: progress.phase, receivedCharacters: progress.receivedCharacters, latestText: progress.latestText }),
      }));
    } catch (cause) { throw ruleStyleHandlerRejection(cause); }
  });
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/status', (input) => initialization.status(input as Parameters<typeof initialization.status>[0]));
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/result', (input) => initialization.result(input as Parameters<typeof initialization.result>[0]));
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/propose', (input) => initialization.propose(input as Parameters<typeof initialization.propose>[0]));
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/accept', (input) => initialization.accept(input as Parameters<typeof initialization.accept>[0]));
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/reject', (input) => initialization.reject(input as Parameters<typeof initialization.reject>[0]));
  map.set('novel-creation-tool/novelRuleStyleImportInitialization/cancel', (input) => initialization.cancel(input as Parameters<typeof initialization.cancel>[0]));

  map.set('novel-creation-tool/novelNarrativeAdaptation/begin', async (input, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'narrativeAdaptation.begin', async () => adaptation.begin(input as Parameters<typeof adaptation.begin>[0], settings === undefined ? await resolveSettings() : settings as GenerationSettings));
  });
  map.set('novel-creation-tool/novelNarrativeAdaptation/status', (input) => adaptation.status(input as Parameters<typeof adaptation.status>[0]));
  map.set('novel-creation-tool/novelNarrativeAdaptation/cancel', (input) => adaptation.cancel(input as Parameters<typeof adaptation.cancel>[0]));
  map.set('novel-creation-tool/novelNarrativeAdaptation/result', (input) => {
    try { return adaptation.result(input as Parameters<typeof adaptation.result>[0]); }
    catch (cause) {
      // I200: fixed diagnostic only; Zod messages may contain model text or secrets.
      if (cause instanceof NarrativeAdaptationFormatError) throw new IpcHandlerRejection('narrative-output-invalid');
      throw cause;
    }
  });

  map.set('novel-creation-tool/novelNarrativeReveal/begin', async (input, settings, context) => {
    const invocation = contextOf(context);
    return withProgress(invocation, 'narrativeReveal.begin', async () => reveal.begin(input as Parameters<typeof reveal.begin>[0], settings === undefined ? await resolveSettings() : settings as GenerationSettings));
  });
  map.set('novel-creation-tool/novelNarrativeReveal/status', (input) => reveal.status(input as Parameters<typeof reveal.status>[0]));
  map.set('novel-creation-tool/novelNarrativeReveal/cancel', (input) => reveal.cancel(input as Parameters<typeof reveal.cancel>[0]));
  map.set('novel-creation-tool/novelNarrativeReveal/result', (input) => reveal.result(input as Parameters<typeof reveal.result>[0]));

  map.set('novel-creation-tool/novelNarrativeImportPlan/propose', (input) => plan.propose(input as Parameters<typeof plan.propose>[0]));
  map.set('novel-creation-tool/novelNarrativeImportPlan/read', (input) => plan.read(input as Parameters<typeof plan.read>[0]));
  map.set('novel-creation-tool/novelNarrativeImportPlan/accept', async (input) => { const result = await plan.accept(input as Parameters<typeof plan.accept>[0]); if (result.status === 'applied') await ensureImportedProgress(outline, result.projectId); return result; });
  map.set('novel-creation-tool/novelNarrativeImportPlan/reject', (input) => plan.reject(input as Parameters<typeof plan.reject>[0]));
  map.set('novel-creation-tool/novelNarrativeImportPlan/recover', async (input) => { const result = await plan.recover(input as Parameters<typeof plan.recover>[0]); if (result.status === 'applied') await ensureImportedProgress(outline, result.projectId); return result; });

  return map;
}
