import { mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import { createLayerApplier, type LayerApplier, type Owners as LayerOwners } from './onboarding-adjudication/apply-layers.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { ConfirmationProposalInput } from '../core/schema/confirm.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import {
  narrativeImportPlanFileSchema,
  narrativeImportPlanIdentitySchema,
  narrativeImportPlanInputSchema,
  narrativeImportPlanSchema,
  NARRATIVE_IMPORT_APPLY_ORDER,
  type NarrativeImportPlan,
  type NarrativeImportPlanIdentity,
  type NarrativeImportPlanInput,
  type NarrativeImportStage,
} from '../core/schema/narrative-import-plan.js';
import { publicAtStartCanonCandidateSchema } from '../core/schema/narrative-visibility.js';
import { knowledgeEntrySchema } from '../core/schema/knowledge.js';
import type { OnboardingAcceptedLayer, OnboardingLayerKey } from '../core/schema/onboarding.js';

const PLAN_FILE = 'narrative-import-plans.yaml';
const PLAN_PROPOSAL_KIND = 'narrative-import-plan';

/** Existing layer owners plus C3 and the sole I11 ConfirmationGate owner. */
export interface NarrativeImportPlanOwners extends LayerOwners {
  knowledge: NovelKnowledgeService;
  confirmation: NovelConfirmationService;
}

export interface NarrativeImportPlanCoordinator {
  propose(input: NarrativeImportPlanInput): Promise<NarrativeImportPlan>;
  read(input: NarrativeImportPlanIdentity): Promise<NarrativeImportPlan>;
  accept(input: NarrativeImportPlanIdentity): Promise<NarrativeImportPlan>;
  reject(input: NarrativeImportPlanIdentity): Promise<NarrativeImportPlan>;
  recover(input: NarrativeImportPlanIdentity): Promise<NarrativeImportPlan>;
  dispose(): void;
}

function withGeneratedProtagonist(input: NarrativeImportPlanInput): NarrativeImportPlanInput {
  const candidate = input.package.outline.protagonistCandidate;
  if (candidate === undefined) return input;
  const existing = input.package.characters.candidates.find((character) => character.id === candidate.id);
  if (existing !== undefined) {
    if (existing.kind !== 'protagonist' || existing.name !== candidate.name) {
      throw new Error(`Generated protagonist conflicts with character candidate: ${candidate.id}`);
    }
    return input;
  }
  return narrativeImportPlanInputSchema.parse({
    ...input,
    package: {
      ...input.package,
      characters: {
        ...input.package.characters,
        candidates: [{
          id: candidate.id,
          name: candidate.name,
          aliases: [],
          kind: 'protagonist',
          personality: '',
          background: candidate.premise,
          motivation: '',
          goals: [],
          flaws: [],
          abilities: [],
          speechStyle: '',
          staticTraits: [],
          arc: { startingPoint: candidate.premise, desiredEnd: '', keyBeats: [] },
          relationships: [],
          knowledgeIds: [],
        }, ...input.package.characters.candidates],
      },
    },
  });
}

/**
 * I148 is the single preview/confirmation/application owner for a new empty
 * project. It reuses the existing six layer applier and adds C3 after the
 * stage-19 candidates; every committed stage is checkpointed for recovery.
 */
export function createNarrativeImportPlanCoordinator(
  projectsRoot: string | undefined,
  owners: NarrativeImportPlanOwners,
  onDispose?: (dispose: () => void) => void,
): NarrativeImportPlanCoordinator {
  const root = projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const applier = createLayerApplier(owners);
  const tails = new Map<string, Promise<unknown>>();
  let disposed = false;
  const ensureActive = (): void => { if (disposed) throw new Error('Narrative import plan coordinator is disposed'); };
  const serialize = async <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const prior = tails.get(projectId) ?? Promise.resolve();
    const run = prior.then(operation, operation);
    tails.set(projectId, run.catch(() => undefined));
    return run;
  };
  const pathFor = (projectId: string): string => join(projectDirectory(root, validateProjectId(projectId)), PLAN_FILE);
  const readFile = async (projectId: string): Promise<NarrativeImportPlan[]> => {
    try {
      const parsed = narrativeImportPlanFileSchema.parse(await readYaml<unknown>(pathFor(projectId)));
      return parsed.plans.map((plan) => structuredClone(plan));
    } catch (error) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return [];
      throw new Error(`Invalid narrative import plan document for ${projectId}`, { cause: error });
    }
  };
  const writeFile = async (projectId: string, plans: readonly NarrativeImportPlan[]): Promise<void> => {
    const target = pathFor(projectId);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeYaml(temporary, { plans });
    await rename(temporary, target);
  };
  const find = async (identity: NarrativeImportPlanIdentity): Promise<{ plan: NarrativeImportPlan; plans: NarrativeImportPlan[] }> => {
    const parsed = narrativeImportPlanIdentitySchema.parse(identity);
    const plans = await readFile(parsed.projectId);
    const plan = plans.find((candidate) => candidate.planId === parsed.planId);
    if (plan === undefined) throw new Error(`Unknown narrative import plan: ${parsed.planId}`);
    if (plan.projectId !== parsed.projectId || plan.importSessionId !== parsed.importSessionId) throw new Error('Narrative import plan belongs to another session');
    if (plan.sourceHash !== parsed.sourceHash) throw new Error('Narrative import plan source hash mismatch');
    return { plan, plans };
  };
  const persistPlan = async (plan: NarrativeImportPlan, plans?: NarrativeImportPlan[]): Promise<NarrativeImportPlan> => {
    const current = plans ?? await readFile(plan.projectId);
    const index = current.findIndex((candidate) => candidate.planId === plan.planId);
    const next = [...current];
    if (index === -1) next.push(plan); else next[index] = plan;
    await writeFile(plan.projectId, next);
    return structuredClone(plan);
  };
  const readKnowledge = async (projectId: string) => {
    try { return await owners.knowledge.read(projectId); }
    catch (error) {
      if ((error as Error).cause && ((error as Error).cause as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], states: [] };
      throw error;
    }
  };
  const isEmpty = async (projectId: string): Promise<boolean> => {
    const [characters, worldview, relationships, outline, canon, knowledge] = await Promise.all([
      owners.characters.list(projectId), owners.worldview.list(projectId), owners.relationship.read(projectId),
      owners.outline.readiness(projectId), Promise.resolve(owners.canon.query(projectId)), readKnowledge(projectId),
    ]);
    return characters.length === 0 && worldview.length === 0 && relationships.length === 0 && outline === 'uninitialized' && canon.length === 0 && knowledge.entries.length === 0;
  };
  const ensureEmpty = async (projectId: string): Promise<void> => {
    if (!await isEmpty(projectId)) throw new Error('Narrative import plan requires a new empty project');
  };
  const acceptedLayers = (plan: NarrativeImportPlan): ReadonlyMap<OnboardingLayerKey, OnboardingAcceptedLayer> => {
    const value = plan.package;
    const canonCandidates = value.canon.candidates.map(({ evidenceParagraphIds: _evidence, ...candidate }) => publicAtStartCanonCandidateSchema.omit({ evidenceParagraphIds: true }).parse(candidate));
    return new Map<OnboardingLayerKey, OnboardingAcceptedLayer>([
      ['characters', { layer: 'characters', proposalId: plan.confirmationId, confidence: value.characters.confidence, candidates: value.characters.candidates.map(toJsonCandidate) }],
      ['worldview', { layer: 'worldview', proposalId: plan.confirmationId, confidence: value.worldview.confidence, candidates: value.worldview.candidates.map(toJsonCandidate) }],
      ['outline', { layer: 'outline', proposalId: plan.confirmationId, confidence: value.outline.confidence, candidates: [toJsonCandidate(value.outline.outline)] }],
      ['state', { layer: 'state', proposalId: plan.confirmationId, confidence: value.state.confidence, candidates: value.state.candidates.map(toJsonCandidate) }],
      ['canon', { layer: 'canon', proposalId: plan.confirmationId, confidence: value.canon.confidence, candidates: canonCandidates.map(toJsonCandidate) }],
      ['relationship', { layer: 'relationship', proposalId: plan.confirmationId, confidence: value.relationship.confidence, candidates: value.relationship.candidates.map(toJsonCandidate) }],
    ]);
  };
  const preflight = async (plan: NarrativeImportPlan): Promise<void> => {
    const existing = await applier.existingCharacters(plan.projectId);
    const failed = await applier.preflightAccepted(plan.projectId, acceptedLayers(plan), existing);
    if (failed.size > 0) throw new Error(`Narrative import plan preflight failed: ${[...failed.entries()].map(([stage, message]) => `${stage}: ${message}`).join('; ')}`);
    const entryIds = new Set<string>();
    for (const entry of plan.package.knowledge.entries) {
      if (entryIds.has(entry.id)) throw new Error(`Duplicate C3 candidate: ${entry.id}`);
      entryIds.add(entry.id);
    }
  };
  const apply = async (plan: NarrativeImportPlan): Promise<NarrativeImportPlan> => {
    let current = structuredClone(plan);
    try {
      await preflight(current);
      const existing = await applier.existingCharacters(current.projectId);
      const layers = acceptedLayers(current);
      for (const stage of currentStageOrder()) {
        if (current.committedStages.includes(stage)) continue;
        if (stage === 'knowledge') {
          const entries = current.package.knowledge.entries.map(({ evidenceParagraphIds: _evidence, ...entry }) => knowledgeEntrySchema.parse({ ...entry, version: 1 }));
          await owners.knowledge.saveAll(current.projectId, entries, current.package.knowledge.states);
        } else {
          await applier.applyLayer(stage, layers.get(stage as OnboardingLayerKey)!, current.projectId, existing);
        }
        current.committedStages = [...current.committedStages, stage];
        current = narrativeImportPlanSchema.parse(current);
        await persistPlan(current);
      }
      current.status = 'applied';
      return persistPlan(narrativeImportPlanSchema.parse(current));
    } catch (error) {
      current.status = 'partial-failure';
      current.errors = [...current.errors, error instanceof Error ? error.message : 'Narrative import plan application failed'];
      return persistPlan(narrativeImportPlanSchema.parse(current));
    }
  };
  const service: NarrativeImportPlanCoordinator = {
    propose(rawInput) {
      ensureActive();
      return serialize(rawInput.projectId, async () => {
        const input = withGeneratedProtagonist(narrativeImportPlanInputSchema.parse(rawInput));
        await ensureEmpty(input.projectId);
        const plans = await readFile(input.projectId);
        const provisionalId = `narrative-import-plan-${plans.length + 1}`;
        const confirmationId = `narrative-import-confirmation-${plans.length + 1}`;
        const plan = narrativeImportPlanSchema.parse({ ...input, planId: provisionalId, confirmationId, status: 'pending', committedStages: [], errors: [] });
        await preflight(plan);
        const proposal = await owners.confirmation.propose(input.projectId, { id: confirmationId, kind: PLAN_PROPOSAL_KIND, payload: toJsonValue({ planId: provisionalId, importSessionId: input.importSessionId, sourceHash: input.sourceHash, package: input.package }) });
        if (proposal.status !== 'pending') throw new Error(`Narrative import plan requires pending ConfirmationGate: ${proposal.status}`);
        return persistPlan(plan, plans);
      });
    },
    read(rawInput) {
      ensureActive();
      return serialize(rawInput.projectId, async () => (await find(rawInput)).plan);
    },
    accept(rawInput) {
      ensureActive();
      return serialize(rawInput.projectId, async () => {
        const found = await find(rawInput);
        if (found.plan.status === 'applied') return found.plan;
        if (found.plan.status === 'rejected' || found.plan.status === 'stale') throw new Error(`Narrative import plan is ${found.plan.status}`);
        if (found.plan.status === 'pending') {
          if (!await isEmpty(found.plan.projectId)) {
            return persistPlan({ ...found.plan, status: 'stale' }, found.plans);
          }
          const decision = owners.confirmation.get(found.plan.projectId, found.plan.confirmationId);
          if (decision.status === 'pending') {
            const accepted = await owners.confirmation.accept(found.plan.projectId, found.plan.confirmationId);
            if (accepted.status !== 'accepted') throw new Error(`Narrative import plan was not accepted: ${accepted.status}`);
          } else if (decision.status !== 'accepted') throw new Error(`Narrative import plan ConfirmationGate is ${decision.status}`);
          const acceptedPlan = await persistPlan({ ...found.plan, status: 'accepted' }, found.plans);
          return apply(acceptedPlan);
        }
        const decision = owners.confirmation.get(found.plan.projectId, found.plan.confirmationId);
        if (decision.status !== 'accepted') throw new Error(`Narrative import plan requires accepted ConfirmationGate: ${decision.status}`);
        return apply(found.plan);
      });
    },
    reject(rawInput) {
      ensureActive();
      return serialize(rawInput.projectId, async () => {
        const found = await find(rawInput);
        if (found.plan.status === 'rejected') return found.plan;
        if (found.plan.status !== 'pending') throw new Error(`Narrative import plan is ${found.plan.status}`);
        const decision = owners.confirmation.get(found.plan.projectId, found.plan.confirmationId);
        if (decision.status === 'pending') await owners.confirmation.reject(found.plan.projectId, found.plan.confirmationId);
        else if (decision.status !== 'rejected') throw new Error(`Narrative import plan ConfirmationGate is ${decision.status}`);
        return persistPlan({ ...found.plan, status: 'rejected' }, found.plans);
      });
    },
    recover(rawInput) {
      ensureActive();
      return serialize(rawInput.projectId, async () => {
        const found = await find(rawInput);
        if (found.plan.status !== 'partial-failure' && found.plan.status !== 'pending-recovery') throw new Error('Narrative import plan is not recoverable');
        const decision = owners.confirmation.get(found.plan.projectId, found.plan.confirmationId);
        if (decision.status !== 'accepted') throw new Error(`Narrative import plan requires accepted ConfirmationGate: ${decision.status}`);
        return apply({ ...found.plan, status: 'accepted' });
      });
    },
    dispose() { disposed = true; tails.clear(); },
  };
  onDispose?.(() => service.dispose());
  return Object.freeze(service);
}

function currentStageOrder(): readonly NarrativeImportStage[] {
  return NARRATIVE_IMPORT_APPLY_ORDER;
}

function toJsonCandidate(value: object): OnboardingAcceptedLayer['candidates'][number] {
  return toJsonValue(value) as OnboardingAcceptedLayer['candidates'][number];
}

function toJsonValue(value: object): ConfirmationProposalInput['payload'] {
  return JSON.parse(JSON.stringify(value)) as ConfirmationProposalInput['payload'];
}
