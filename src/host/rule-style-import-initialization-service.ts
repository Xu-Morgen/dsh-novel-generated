import { createHash } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectDirectory } from '../core/io/path.js';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import {
  ruleStyleImportCandidateSchema,
  ruleStyleImportCheckpointFileSchema,
  ruleStyleImportCheckpointSchema,
  ruleStyleImportDecisionInputSchema,
  ruleStyleImportIdentitySchema,
  ruleStyleImportProjectionSchema,
  ruleStyleImportProposeInputSchema,
  type RuleStyleImportCandidate,
  type RuleStyleImportCheckpoint,
  type RuleStyleImportDecisionInput,
  type RuleStyleImportIdentity,
  type RuleStyleImportProjection,
  type RuleStyleImportProposeInput,
} from '../core/schema/rule-style-import-initialization.js';
import { analyzeRuleStyleImport } from '../llm/analyze/rule-style-import-initialization.js';
import { asLlmBackend, type GenerationSettings, type LlmBackend } from '../llm/port/index.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelImportInterpretationAnalysisService } from './import-interpretation-analysis-service.js';
import type { NovelImportInterpretationSessionService } from './import-interpretation-session-service.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelStyleService } from './style-service.js';

export const RULE_STYLE_IMPORT_CHECKPOINT_FILE = '.rule-style-import-initialization.yaml';
const PROPOSAL_KIND = 'rule-style-import-initialization';

export interface RuleStyleImportInitializationDeps {
  sessions: NovelImportInterpretationSessionService;
  analysis: NovelImportInterpretationAnalysisService;
  confirmation: NovelConfirmationService;
  rules: NovelRuleService;
  style: NovelStyleService;
  isProjectEmpty(projectId: string): Promise<boolean>;
}

/** I151 Host owner for the first-import one-shot task and its I11 lineage. */
export interface RuleStyleImportInitializationService {
  begin(input: RuleStyleImportIdentity, settings: GenerationSettings): Promise<RuleStyleImportProjection>;
  status(input: RuleStyleImportIdentity): Promise<RuleStyleImportProjection>;
  result(input: RuleStyleImportIdentity): Promise<RuleStyleImportProjection>;
  propose(input: RuleStyleImportProposeInput): Promise<RuleStyleImportProjection>;
  accept(input: RuleStyleImportDecisionInput): Promise<RuleStyleImportProjection>;
  reject(input: RuleStyleImportDecisionInput): Promise<RuleStyleImportProjection>;
  cancel(input: RuleStyleImportIdentity): Promise<RuleStyleImportProjection>;
  dispose(): void;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function ruleStyleImportCandidateFingerprint(candidate: RuleStyleImportCandidate): string {
  return createHash('sha256').update(canonical(ruleStyleImportCandidateSchema.parse(candidate)), 'utf8').digest('hex');
}

function now(): string { return new Date().toISOString(); }
function projection(checkpoint: RuleStyleImportCheckpoint): RuleStyleImportProjection {
  const { sourceText: _sourceText, intent: _intent, ...publicValue } = checkpoint;
  return ruleStyleImportProjectionSchema.parse(publicValue);
}
function assertIdentity(checkpoint: RuleStyleImportCheckpoint, identity: RuleStyleImportIdentity): void {
  if (checkpoint.projectId !== identity.projectId) throw new Error('Rule/style import initialization belongs to another project');
  if (checkpoint.importSessionId !== identity.importSessionId) throw new Error('Rule/style import initialization belongs to another import session');
  if (checkpoint.sourceHash !== identity.sourceHash) throw new Error('Rule/style import initialization source hash mismatch');
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export function createRuleStyleImportInitializationService(
  llm: unknown,
  projectsRoot: string | undefined,
  deps: RuleStyleImportInitializationDeps,
  onDispose?: (dispose: () => void) => void,
  onBackgroundError: (error: unknown, importSessionId: string) => void = () => undefined,
): RuleStyleImportInitializationService {
  const backend: LlmBackend | undefined = asLlmBackend(llm);
  const root = projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const tails = new Map<string, Promise<unknown>>();
  const controllers = new Map<string, AbortController>();
  let disposed = false;
  const ensureActive = (): void => { if (disposed) throw new Error('Rule/style import initialization service is disposed'); };
  const pathFor = (projectId: string): string => join(projectDirectory(root, projectId), RULE_STYLE_IMPORT_CHECKPOINT_FILE);
  const serialize = async <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const prior = tails.get(projectId) ?? Promise.resolve();
    const run = prior.then(operation, operation);
    tails.set(projectId, run.catch(() => undefined));
    return run;
  };
  const readCheckpoint = async (projectId: string): Promise<RuleStyleImportCheckpoint | undefined> => {
    try { return ruleStyleImportCheckpointFileSchema.parse(await readYaml<unknown>(pathFor(projectId))).checkpoint; }
    catch (error) { if (isMissing(error)) return undefined; throw new Error(`Invalid rule/style import checkpoint for ${projectId}`, { cause: error }); }
  };
  const persist = async (checkpoint: RuleStyleImportCheckpoint): Promise<RuleStyleImportCheckpoint> => {
    const parsed = ruleStyleImportCheckpointSchema.parse(checkpoint);
    const target = pathFor(parsed.projectId);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    try { await writeYaml(temporary, { checkpoint: parsed }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => undefined); }
    return structuredClone(parsed);
  };
  const requireCheckpoint = async (identity: RuleStyleImportIdentity): Promise<RuleStyleImportCheckpoint> => {
    const checkpoint = await readCheckpoint(identity.projectId);
    if (checkpoint === undefined) throw new Error('Unknown rule/style import initialization');
    assertIdentity(checkpoint, identity);
    return checkpoint;
  };
  const ensureLayerOwnersOpen = async (projectId: string): Promise<void> => {
    await Promise.all([deps.rules.open(projectId), deps.style.open(projectId)]);
  };
  const ensureEmpty = async (projectId: string): Promise<void> => {
    await ensureLayerOwnersOpen(projectId);
    if (!await deps.isProjectEmpty(projectId)) throw new Error('Rule/style import initialization requires a new empty project');
    if ((await deps.rules.list(projectId)).length > 0) throw new Error('Rule/style import initialization requires empty B1');
    if (await deps.style.isInitialized(projectId)) throw new Error('Rule/style import initialization requires empty B4');
  };
  const launch = (checkpoint: RuleStyleImportCheckpoint, settings: GenerationSettings): void => {
    if (controllers.has(checkpoint.projectId)) return;
    const controller = new AbortController();
    controllers.set(checkpoint.projectId, controller);
    void (async () => {
      try {
        await serialize(checkpoint.projectId, async () => { await persist({ ...checkpoint, status: 'running', error: undefined, updatedAt: now() }); });
        const candidate = await analyzeRuleStyleImport(backend, { sourceText: checkpoint.sourceText, intent: checkpoint.intent }, settings, controller.signal);
        await serialize(checkpoint.projectId, async () => {
          const current = await requireCheckpoint(checkpoint);
          if (current.status === 'cancelled') return;
          await persist({ ...current, status: 'succeeded', candidate, candidateFingerprint: ruleStyleImportCandidateFingerprint(candidate), error: undefined, updatedAt: now() });
        });
      } catch (error) {
        await serialize(checkpoint.projectId, async () => {
          const current = await requireCheckpoint(checkpoint).catch(() => checkpoint);
          await persist({ ...current, status: controller.signal.aborted ? 'cancelled' : 'failed', error: controller.signal.aborted ? 'Rule/style import initialization cancelled' : (error instanceof Error ? error.message : 'Rule/style import initialization failed'), updatedAt: now() });
        }).catch(() => undefined);
        if (!controller.signal.aborted) onBackgroundError(error, checkpoint.importSessionId);
      } finally { controllers.delete(checkpoint.projectId); }
    })();
  };
  const service: RuleStyleImportInitializationService = {
    begin(rawInput, settings) {
      ensureActive();
      const identity = ruleStyleImportIdentitySchema.parse(rawInput);
      return serialize(identity.projectId, async () => {
        ensureActive();
        const existing = await readCheckpoint(identity.projectId);
        if (existing !== undefined) {
          assertIdentity(existing, identity);
          if ((existing.status === 'failed' || existing.status === 'cancelled') && !controllers.has(identity.projectId)) launch(existing, settings);
          return projection(existing);
        }
        const session = await deps.sessions.firstConfirmed(identity);
        await ensureEmpty(identity.projectId);
        const sourceText = deps.analysis.source(identity);
        const createdAt = now();
        const checkpoint = await persist({ ...identity, sourceText, intent: session.intent, status: 'queued', createdAt, updatedAt: createdAt });
        launch(checkpoint, settings);
        return projection(checkpoint);
      });
    },
    status(rawInput) {
      ensureActive();
      const identity = ruleStyleImportIdentitySchema.parse(rawInput);
      return serialize(identity.projectId, async () => projection(await requireCheckpoint(identity)));
    },
    result(rawInput) {
      ensureActive();
      const identity = ruleStyleImportIdentitySchema.parse(rawInput);
      return serialize(identity.projectId, async () => {
        const checkpoint = await requireCheckpoint(identity);
        if (checkpoint.status === 'failed') throw new Error(checkpoint.error ?? 'Rule/style import initialization failed');
        if (checkpoint.status === 'cancelled') throw new Error('Rule/style import initialization cancelled');
        if (checkpoint.candidate === undefined) throw new Error(`Rule/style import initialization is not complete: ${checkpoint.status}`);
        return projection(checkpoint);
      });
    },
    propose(rawInput) {
      ensureActive();
      const input = ruleStyleImportProposeInputSchema.parse(rawInput);
      return serialize(input.projectId, async () => {
        const current = await requireCheckpoint(input);
        if (current.candidateFingerprint !== input.expectedFingerprint) throw new Error('Rule/style import candidate is stale');
        if (current.status === 'proposed') {
          if (ruleStyleImportCandidateFingerprint(input.candidate) !== current.candidateFingerprint) throw new Error('Rule/style import proposal already frozen');
          return projection(current);
        }
        if (current.status !== 'succeeded') throw new Error(`Cannot propose ${current.status} rule/style import initialization`);
        await deps.sessions.firstConfirmed(input);
        await ensureEmpty(input.projectId);
        const candidate = ruleStyleImportCandidateSchema.parse(input.candidate);
        const candidateFingerprint = ruleStyleImportCandidateFingerprint(candidate);
        const confirmationId = `rule-style-import-${input.importSessionId}`;
        const gate = await deps.confirmation.propose(input.projectId, { id: confirmationId, kind: PROPOSAL_KIND, payload: { importSessionId: input.importSessionId, sourceHash: input.sourceHash, candidateFingerprint, candidate } });
        if (gate.status !== 'pending') throw new Error(`Rule/style import ConfirmationGate is ${gate.status}`);
        return projection(await persist({ ...current, status: 'proposed', candidate, candidateFingerprint, confirmationId, updatedAt: now() }));
      });
    },
    accept(rawInput) {
      ensureActive();
      const input = ruleStyleImportDecisionInputSchema.parse(rawInput);
      return serialize(input.projectId, async () => {
        let current = await requireCheckpoint(input);
        if (current.status === 'applied') return projection(current);
        if (current.status !== 'proposed' && current.status !== 'applying') throw new Error(`Cannot accept ${current.status} rule/style import initialization`);
        if (current.candidateFingerprint !== input.expectedFingerprint || current.candidate === undefined || current.confirmationId === undefined) throw new Error('Rule/style import candidate is stale');
        await deps.sessions.firstConfirmed(input);
        if (current.status === 'proposed') {
          await ensureEmpty(input.projectId);
          const gate = deps.confirmation.get(input.projectId, current.confirmationId);
          if (gate.status === 'pending') await deps.confirmation.accept(input.projectId, current.confirmationId);
          else if (gate.status !== 'accepted') throw new Error(`Rule/style import ConfirmationGate is ${gate.status}`);
          current = await persist({ ...current, status: 'applying', updatedAt: now() });
        }
        const candidate = current.candidate;
        if (candidate === undefined) throw new Error('Rule/style import candidate is unavailable');
        const createdRuleIds = candidate.rules.map((rule) => rule.id);
        let styleWritten = false;
        try {
          await deps.style.initialize(input.projectId, candidate.style);
          styleWritten = true;
          await deps.rules.initialize(input.projectId, candidate.rules);
          return projection(await persist({ ...current, status: 'applied', error: undefined, updatedAt: now() }));
        } catch (error) {
          await deps.rules.clearInitialization(input.projectId, createdRuleIds).catch(() => undefined);
          if (styleWritten) await deps.style.clearInitialization(input.projectId, candidate.style.id).catch(() => undefined);
          const failed = await persist({ ...current, status: 'failed', error: error instanceof Error ? error.message : 'Rule/style import apply failed', updatedAt: now() });
          throw new Error(failed.error, { cause: error });
        }
      });
    },
    reject(rawInput) {
      ensureActive();
      const input = ruleStyleImportDecisionInputSchema.parse(rawInput);
      return serialize(input.projectId, async () => {
        const current = await requireCheckpoint(input);
        if (current.status === 'rejected') return projection(current);
        if (current.status !== 'proposed' || current.confirmationId === undefined || current.candidateFingerprint !== input.expectedFingerprint) throw new Error('Rule/style import proposal is stale or not pending');
        const gate = deps.confirmation.get(input.projectId, current.confirmationId);
        if (gate.status === 'pending') await deps.confirmation.reject(input.projectId, current.confirmationId);
        else if (gate.status !== 'rejected') throw new Error(`Rule/style import ConfirmationGate is ${gate.status}`);
        return projection(await persist({ ...current, status: 'rejected', updatedAt: now() }));
      });
    },
    cancel(rawInput) {
      ensureActive();
      const identity = ruleStyleImportIdentitySchema.parse(rawInput);
      return serialize(identity.projectId, async () => {
        const current = await requireCheckpoint(identity);
        if (current.status !== 'queued' && current.status !== 'running') return projection(current);
        controllers.get(identity.projectId)?.abort();
        return projection(await persist({ ...current, status: 'cancelled', error: 'Rule/style import initialization cancelled', updatedAt: now() }));
      });
    },
    dispose() { if (disposed) return; disposed = true; for (const controller of controllers.values()) controller.abort(); controllers.clear(); tails.clear(); },
  };
  onDispose?.(() => service.dispose());
  return Object.freeze(service);
}
