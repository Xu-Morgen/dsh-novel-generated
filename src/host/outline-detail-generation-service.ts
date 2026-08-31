import { createHash } from 'node:crypto';
import { outlineContentFingerprint } from '../core/outline/index.js';
import {
  outlineDetailGenerationAcceptResultSchema,
  outlineDetailGenerationCandidateInputSchema,
  outlineDetailGenerationCandidateSchema,
  outlineDetailGenerationCancelResultSchema,
  outlineDetailGenerationEditInputSchema,
  outlineDetailGenerationGatePayloadSchema,
  outlineDetailGenerationGenerateInputSchema,
  outlineDetailGenerationItemSchema,
  outlineDetailGenerationProposeResultSchema,
  outlineDetailGenerationRegenerateInputSchema,
  outlineDetailGenerationRejectResultSchema,
  outlineDetailGenerationSkipInputSchema,
  type OutlineDetailGenerationAcceptResult,
  type OutlineDetailGenerationCandidate,
  type OutlineDetailGenerationGatePayload,
  type OutlineDetailGenerationItem,
} from '../core/schema/outline-detail-generation.js';
import type { DetailBeat, Outline } from '../core/schema/outline.js';
import type { OutlineGenerationScopeResult } from '../core/schema/outline-generation-scope.js';
import { generateOutlineDetailBeats } from '../llm/analyze/outline-detail-generation.js';
import type { GenerationSettings, LlmBackend } from '../llm/port/index.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelOutlineGenerationScopeService } from './outline-generation-scope-service.js';
import type { NovelOutlineService } from './outline-service.js';

const PROPOSAL_KIND = 'outline-detail-generation.apply';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function generatedId(projectId: string, b5ContentFingerprint: string, beatId: string, index: number, value: unknown): string {
  return `odg-${fingerprint({ projectId, b5ContentFingerprint, beatId, index, value }).slice(0, 60)}`;
}

function proposalId(candidateId: string, candidateFingerprint: string): string {
  return `odg-p-${fingerprint({ candidateId, candidateFingerprint }).slice(0, 58)}`;
}

function detailFields(value: DetailBeat) {
  return { title: value.title, summary: value.summary, pov: value.pov, wordTarget: value.wordTarget, points: [...value.points] };
}

function beatLocation(outline: Outline, beatId: string): { actId: string; beat: Outline['acts'][number]['beats'][number] } {
  for (const act of outline.acts) {
    const beat = act.beats.find((item) => item.id === beatId);
    if (beat !== undefined) return { actId: act.id, beat };
  }
  throw new Error(`Unknown outline beat: ${beatId}`);
}

function scopeTargetMap(scope: OutlineGenerationScopeResult): Map<string, OutlineGenerationScopeResult['targets'][number]> {
  return new Map(scope.targets.map((target) => [target.beatId, target]));
}

function candidateItemsForScope(
  projectId: string,
  scope: OutlineGenerationScopeResult,
  outline: Outline,
  generatedByBeat: ReadonlyMap<string, readonly DetailBeat[]>,
): OutlineDetailGenerationItem[] {
  const items: OutlineDetailGenerationItem[] = [];
  for (const target of scope.targets) {
    const location = beatLocation(outline, target.beatId);
    for (const card of target.cards) {
      const current = location.beat.detailBeats.find((item) => item.id === card.detailBeatId);
      if (current === undefined) throw new Error(`Scope detail beat is stale: ${card.detailBeatId}`);
      items.push(outlineDetailGenerationItemSchema.parse({
        actId: target.actId, beatId: target.beatId, detailBeatId: card.detailBeatId, position: card.detailBeatIndex,
        origin: 'existing', before: structuredClone(current), after: structuredClone(current), choice: 'keep', rationale: '已有细纲默认保持不变。',
      }));
    }
    const generated = generatedByBeat.get(target.beatId) ?? [];
    generated.forEach((value, index) => {
      items.push(outlineDetailGenerationItemSchema.parse({
        actId: target.actId, beatId: target.beatId, detailBeatId: value.id, position: target.cards.length + index,
        origin: 'generated', after: structuredClone(value), choice: 'keep', rationale: '补齐范围内缺失细纲。',
      }));
    });
  }
  return items;
}

function candidateWithRevision(candidate: OutlineDetailGenerationCandidate, patch: Partial<OutlineDetailGenerationCandidate>): OutlineDetailGenerationCandidate {
  return outlineDetailGenerationCandidateSchema.parse({ ...candidate, ...patch, revision: candidate.revision + 1, updatedAt: new Date().toISOString() });
}

export interface NovelOutlineDetailGenerationService {
  generate(projectId: string, input: Parameters<typeof outlineDetailGenerationGenerateInputSchema.parse>[0], settings?: GenerationSettings, signal?: AbortSignal): Promise<OutlineDetailGenerationCandidate>;
  read(projectId: string, candidateId: string): Promise<OutlineDetailGenerationCandidate>;
  edit(projectId: string, input: Parameters<typeof outlineDetailGenerationEditInputSchema.parse>[0]): Promise<OutlineDetailGenerationCandidate>;
  regenerate(projectId: string, input: Parameters<typeof outlineDetailGenerationRegenerateInputSchema.parse>[0], settings?: GenerationSettings, signal?: AbortSignal): Promise<OutlineDetailGenerationCandidate>;
  skip(projectId: string, input: Parameters<typeof outlineDetailGenerationSkipInputSchema.parse>[0]): Promise<OutlineDetailGenerationCandidate>;
  propose(projectId: string, input: Parameters<typeof outlineDetailGenerationCandidateInputSchema.parse>[0]): Promise<ReturnType<typeof outlineDetailGenerationProposeResultSchema.parse>>;
  accept(projectId: string, proposalId: string): Promise<OutlineDetailGenerationAcceptResult>;
  reject(projectId: string, proposalId: string): Promise<ReturnType<typeof outlineDetailGenerationRejectResultSchema.parse>>;
  cancel(projectId: string, candidateId: string): Promise<ReturnType<typeof outlineDetailGenerationCancelResultSchema.parse>>;
}

/**
 * I134 candidate owner. LLM output is held in a bounded session and can only
 * become B5 after one I11 proposal is accepted; no whole-outline replacement
 * or background generation is exposed (design §14.14.2 / R18-12b).
 */
export function createOutlineDetailGenerationService(deps: {
  readonly llm: unknown;
  readonly scope: NovelOutlineGenerationScopeService;
  readonly outline: Pick<NovelOutlineService, 'read' | 'contentFingerprint' | 'save'>;
  readonly confirmation: NovelConfirmationService;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelOutlineDetailGenerationService {
  const backend = deps.llm as LlmBackend | undefined;
  const sessions = new Map<string, OutlineDetailGenerationCandidate>();
  const applied = new Map<string, OutlineDetailGenerationAcceptResult>();
  const lanes = new Map<string, Promise<unknown>>();
  const run = <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = lanes.get(projectId) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    lanes.set(projectId, current.catch(() => undefined));
    return current;
  };
  const cleanup = () => { sessions.clear(); applied.clear(); lanes.clear(); };
  deps.onDispose?.(cleanup);

  const gateCandidate = (projectId: string, candidateId: string): OutlineDetailGenerationCandidate | undefined => {
    for (const record of deps.confirmation.list(projectId)) {
      if (record.kind !== PROPOSAL_KIND) continue;
      try {
        const payload = outlineDetailGenerationGatePayloadSchema.parse(record.payload);
        if (payload.projectId === projectId && payload.candidateId === candidateId) return payload.candidate;
      } catch { /* unrelated opaque Gate records are ignored */ }
    }
    return undefined;
  };

  const candidateFor = (projectId: string, candidateId: string): OutlineDetailGenerationCandidate => {
    const candidate = sessions.get(candidateId) ?? gateCandidate(projectId, candidateId);
    if (candidate === undefined || candidate.projectId !== projectId) throw new Error(`Unknown outline detail candidate: ${candidateId}`);
    return candidate;
  };

  const freshScope = async (projectId: string, candidate: OutlineDetailGenerationCandidate): Promise<{ scope: OutlineGenerationScopeResult; outline: Outline }> => {
    const scope = await deps.scope.resolve(projectId, candidate.scope);
    if (scope.readiness === 'cannot-generate') throw new Error(`Outline detail generation scope is unavailable: ${scope.blockReason}`);
    if (scope.b5ContentFingerprint !== candidate.b5ContentFingerprint || fingerprint(scope) !== candidate.scopeFingerprint) throw new Error('Stale outline detail generation candidate');
    const outline = await deps.outline.read(projectId);
    if (outlineContentFingerprint(outline) !== candidate.b5ContentFingerprint) throw new Error('Stale outline detail generation B5');
    return { scope, outline };
  };

  const validateCandidate = (candidate: OutlineDetailGenerationCandidate, scope: OutlineGenerationScopeResult, outline: Outline): void => {
    const targets = scopeTargetMap(scope);
    const expectedExisting = new Set(scope.targets.flatMap((target) => target.cards.map((card) => card.detailBeatId)));
    const seen = new Set<string>();
    const itemsByBeat = new Map<string, OutlineDetailGenerationItem[]>();
    for (const item of candidate.items) {
      if (seen.has(item.detailBeatId)) throw new Error(`Duplicate outline detail candidate item: ${item.detailBeatId}`);
      seen.add(item.detailBeatId);
      const target = targets.get(item.beatId);
      if (target === undefined || target.actId !== item.actId) throw new Error(`Outline detail candidate is outside the frozen scope: ${item.detailBeatId}`);
      if (item.origin === 'existing' && !expectedExisting.has(item.detailBeatId)) throw new Error(`Outline detail candidate references unknown existing card: ${item.detailBeatId}`);
      if (item.origin === 'generated' && target.cards.length !== 0) throw new Error(`Generated detail candidate cannot replace an existing beat: ${item.beatId}`);
      const values = itemsByBeat.get(item.beatId) ?? [];
      values.push(item);
      itemsByBeat.set(item.beatId, values);
    }
    for (const target of scope.targets) {
      const beatItems = itemsByBeat.get(target.beatId) ?? [];
      if (target.cards.some((card) => !beatItems.some((item) => item.detailBeatId === card.detailBeatId))) throw new Error(`Candidate omitted existing card in scope: ${target.beatId}`);
      if (target.cards.length === 0 && !beatItems.some((item) => item.origin === 'generated')) throw new Error(`Candidate omitted generated cards for beat: ${target.beatId}`);
    }
    if (candidate.generatedDetailBeatCount > scope.mutationBudget.maxNewDetailBeats) throw new Error('Outline detail candidate exceeds mutation budget');
    const outlineIds = new Set(outline.acts.flatMap((act) => act.beats.flatMap((beat) => beat.detailBeats.map((card) => card.id))));
    for (const item of candidate.items) {
      if (item.origin === 'generated' && outlineIds.has(item.detailBeatId)) throw new Error(`Generated detail candidate id already exists: ${item.detailBeatId}`);
    }
  };

  const applyCandidate = (candidate: OutlineDetailGenerationCandidate, scope: OutlineGenerationScopeResult, outline: Outline): Outline => {
    validateCandidate(candidate, scope, outline);
    const itemsByBeat = new Map<string, OutlineDetailGenerationItem[]>();
    for (const item of candidate.items) itemsByBeat.set(item.beatId, [...(itemsByBeat.get(item.beatId) ?? []), item]);
    const targetBeatIds = new Set(scope.targets.map((target) => target.beatId));
    return {
      ...outline,
      acts: outline.acts.map((act) => ({
        ...act,
        beats: act.beats.map((beat) => {
          if (!targetBeatIds.has(beat.id)) return beat;
          const items = itemsByBeat.get(beat.id) ?? [];
          const existing = new Map(beat.detailBeats.map((card) => [card.id, card]));
          for (const item of items) {
            if (item.origin === 'existing') {
              const current = existing.get(item.detailBeatId);
              if (current === undefined || JSON.stringify(current) !== JSON.stringify(item.before)) throw new Error(`Outline detail candidate is stale at card: ${item.detailBeatId}`);
              existing.set(item.detailBeatId, item.choice === 'edit' || item.choice === 'regenerate' ? item.after : item.before!);
            } else if (item.choice !== 'skip') {
              if (existing.has(item.detailBeatId)) throw new Error(`Generated detail candidate collides at card: ${item.detailBeatId}`);
              existing.set(item.detailBeatId, item.after);
            }
          }
          const nextCards = beat.detailBeats.filter((card) => existing.has(card.id)).map((card) => existing.get(card.id)!);
          for (const item of items.filter((value) => value.origin === 'generated' && value.choice !== 'skip')) nextCards.push(existing.get(item.detailBeatId)!);
          return { ...beat, detailBeats: nextCards };
        }),
      })),
    };
  };

  const service: NovelOutlineDetailGenerationService = {
    async generate(projectId, rawInput, settings, signal) {
      if (settings === undefined) throw new Error('Outline detail generation settings are unavailable');
      const input = outlineDetailGenerationGenerateInputSchema.parse(rawInput);
      const scope = await deps.scope.resolve(projectId, input.scope);
      if (scope.readiness === 'cannot-generate') throw new Error(`Outline detail generation scope is unavailable: ${scope.blockReason}`);
      const outline = await deps.outline.read(projectId);
      if (outlineContentFingerprint(outline) !== scope.b5ContentFingerprint) throw new Error('Stale outline detail generation B5');
      const generatedByBeat = new Map<string, DetailBeat[]>();
      const rationales: string[] = [];
      let generatedCount = 0;
      for (const target of scope.targets) {
        if (target.cards.length > 0) continue;
        const location = beatLocation(outline, target.beatId);
        const generated = await generateOutlineDetailBeats(backend, {
          mode: 'fill-missing', actId: target.actId, beatId: target.beatId,
          beatTitle: location.beat.title, beatDescription: location.beat.description,
        }, settings, signal);
        if (generatedCount + generated.detailBeats.length > scope.mutationBudget.maxNewDetailBeats) throw new Error('Generated detail beats exceed scope mutation budget');
        const values = generated.detailBeats.map((fields, index) => ({ ...fields, id: generatedId(projectId, scope.b5ContentFingerprint, target.beatId, index, fields), status: 'planned' as const }));
        generatedByBeat.set(target.beatId, values);
        generatedCount += values.length;
        rationales.push(generated.rationale);
      }
      const items = candidateItemsForScope(projectId, scope, outline, generatedByBeat);
      const scopeFingerprint = fingerprint(scope);
      const candidateId = `odg-${fingerprint({ projectId, scopeFingerprint, items }).slice(0, 60)}`;
      const now = new Date().toISOString();
      const candidate = outlineDetailGenerationCandidateSchema.parse({
        candidateId, projectId, scope: input.scope, scopeFingerprint, b5ContentFingerprint: scope.b5ContentFingerprint,
        items, generatedDetailBeatCount: generatedCount, revision: 1, status: 'ready',
        rationale: rationales.length === 0 ? '已有细纲默认保持不变；如需覆盖，请逐卡发起重生成。' : rationales.join('\n'), createdAt: now, updatedAt: now,
      });
      validateCandidate(candidate, scope, outline);
      sessions.set(candidateId, candidate);
      return candidate;
    },
    async read(projectId, candidateId) { return candidateFor(projectId, outlineDetailGenerationCandidateInputSchema.parse({ candidateId }).candidateId); },
    async edit(projectId, rawInput) {
      const input = outlineDetailGenerationEditInputSchema.parse(rawInput);
      return run(projectId, async () => {
        const candidate = candidateFor(projectId, input.candidateId);
        await freshScope(projectId, candidate);
        const item = candidate.items.find((value) => value.detailBeatId === input.detailBeatId);
        if (item === undefined) throw new Error(`Unknown outline detail candidate item: ${input.detailBeatId}`);
        if (input.value.id !== item.detailBeatId || input.value.status !== 'planned') throw new Error('Edited detail beat must preserve candidate identity and planned status');
        const updated = candidateWithRevision(candidate, { items: candidate.items.map((value) => value.detailBeatId === input.detailBeatId ? { ...value, after: structuredClone(input.value), choice: 'edit' as const } : value) });
        sessions.set(updated.candidateId, updated);
        return updated;
      });
    },
    async regenerate(projectId, rawInput, settings, signal) {
      if (settings === undefined) throw new Error('Outline detail regeneration settings are unavailable');
      const input = outlineDetailGenerationRegenerateInputSchema.parse(rawInput);
      return run(projectId, async () => {
        const candidate = candidateFor(projectId, input.candidateId);
        const fresh = await freshScope(projectId, candidate);
        const item = candidate.items.find((value) => value.detailBeatId === input.detailBeatId);
        if (item === undefined || item.origin !== 'existing' || item.before === undefined) throw new Error(`Only an existing scoped card can be regenerated: ${input.detailBeatId}`);
        const location = beatLocation(fresh.outline, item.beatId);
        const generated = await generateOutlineDetailBeats(backend, {
          mode: 'regenerate-existing', actId: item.actId, beatId: item.beatId,
          beatTitle: location.beat.title, beatDescription: location.beat.description, existing: detailFields(item.before),
        }, settings, signal);
        const after = { ...generated.detailBeats[0], id: item.detailBeatId, status: 'planned' as const };
        const updated = candidateWithRevision(candidate, { items: candidate.items.map((value) => value.detailBeatId === item.detailBeatId ? { ...value, after, choice: 'regenerate' as const, rationale: generated.rationale } : value) });
        sessions.set(updated.candidateId, updated);
        return updated;
      });
    },
    async skip(projectId, rawInput) {
      const input = outlineDetailGenerationSkipInputSchema.parse(rawInput);
      return run(projectId, async () => {
        const candidate = candidateFor(projectId, input.candidateId);
        await freshScope(projectId, candidate);
        if (!candidate.items.some((value) => value.detailBeatId === input.detailBeatId)) throw new Error(`Unknown outline detail candidate item: ${input.detailBeatId}`);
        const updated = candidateWithRevision(candidate, { items: candidate.items.map((value) => value.detailBeatId === input.detailBeatId ? { ...value, choice: 'skip' as const } : value) });
        sessions.set(updated.candidateId, updated);
        return updated;
      });
    },
    async propose(projectId, rawInput) {
      return run(projectId, async () => {
        const input = outlineDetailGenerationCandidateInputSchema.parse(rawInput);
        const candidate = candidateFor(projectId, input.candidateId);
        const fresh = await freshScope(projectId, candidate);
        validateCandidate(candidate, fresh.scope, fresh.outline);
        const expectedOutline = applyCandidate(candidate, fresh.scope, fresh.outline);
        const candidateFingerprint = fingerprint(candidate);
        const id = proposalId(candidate.candidateId, candidateFingerprint);
        const payload = outlineDetailGenerationGatePayloadSchema.parse({
          projectId, candidateId: candidate.candidateId, proposalId: id, candidateFingerprint,
          b5ContentFingerprint: candidate.b5ContentFingerprint, expectedB5ContentFingerprint: outlineContentFingerprint(expectedOutline), candidate,
          decisions: candidate.items.map((item) => ({ detailBeatId: item.detailBeatId, choice: item.choice })),
        });
        try {
          const existing = deps.confirmation.get(projectId, id);
          const existingPayload = outlineDetailGenerationGatePayloadSchema.parse(existing.payload);
          if (existing.kind !== PROPOSAL_KIND || JSON.stringify(existingPayload) !== JSON.stringify(payload)) throw new Error('Outline detail proposal id collision');
        } catch (cause) {
          if (!(cause instanceof Error) || !cause.message.startsWith('Unknown confirmation:')) throw cause;
          await deps.confirmation.propose(projectId, { id, kind: PROPOSAL_KIND, payload });
        }
        return outlineDetailGenerationProposeResultSchema.parse({ projectId, candidateId: candidate.candidateId, proposalId: id, status: 'pending' });
      });
    },
    async accept(projectId, proposalIdValue) {
      return run(projectId, async () => {
        const record = deps.confirmation.get(projectId, proposalIdValue);
        if (record.kind !== PROPOSAL_KIND) throw new Error(`Confirmation is not an outline detail generation proposal: ${proposalIdValue}`);
        const payload: OutlineDetailGenerationGatePayload = outlineDetailGenerationGatePayloadSchema.parse(record.payload);
        if (payload.projectId !== projectId || payload.proposalId !== proposalIdValue) throw new Error('Outline detail generation confirmation project/id mismatch');
        if (fingerprint(payload.candidate) !== payload.candidateFingerprint) throw new Error('Outline detail generation candidate fingerprint is inconsistent');
        const cached = applied.get(proposalIdValue);
        if (cached !== undefined) return outlineDetailGenerationAcceptResultSchema.parse({ ...cached, status: 'already-accepted' });
        const expectedAfter = payload.expectedB5ContentFingerprint;
        const currentBefore = await deps.outline.read(projectId);
        const currentBeforeFingerprint = outlineContentFingerprint(currentBefore);
        if (currentBeforeFingerprint !== expectedAfter && currentBeforeFingerprint !== payload.b5ContentFingerprint) throw new Error('Stale outline detail generation B5 before apply');
        const first = currentBeforeFingerprint === payload.b5ContentFingerprint ? await freshScope(projectId, payload.candidate) : undefined;
        const desired = first === undefined ? undefined : applyCandidate(payload.candidate, first.scope, first.outline);
        if (desired !== undefined && outlineContentFingerprint(desired) !== expectedAfter) throw new Error('Outline detail generation expected B5 fingerprint is inconsistent');
        if (record.status === 'pending') await deps.confirmation.accept(projectId, proposalIdValue);
        if (currentBeforeFingerprint === expectedAfter) {
          const result = outlineDetailGenerationAcceptResultSchema.parse({
            projectId, candidateId: payload.candidateId, proposalId: proposalIdValue, status: record.status === 'accepted' ? 'already-accepted' : 'accepted',
            appliedDetailBeatIds: payload.decisions.filter((decision) => decision.choice !== 'skip').map((decision) => decision.detailBeatId),
            skippedDetailBeatIds: payload.decisions.filter((decision) => decision.choice === 'skip').map((decision) => decision.detailBeatId), b5ContentFingerprint: expectedAfter,
          });
          applied.set(proposalIdValue, result);
          return result;
        }
        const current = await deps.outline.read(projectId);
        const currentFingerprint = outlineContentFingerprint(current);
        if (currentFingerprint !== payload.b5ContentFingerprint && currentFingerprint !== expectedAfter) throw new Error('Stale outline detail generation B5 before apply');
        let appliedIds: string[] = [];
        const skippedIds = payload.decisions.filter((decision) => decision.choice === 'skip').map((decision) => decision.detailBeatId);
        if (currentFingerprint === payload.b5ContentFingerprint) {
          const currentScope = await deps.scope.resolve(projectId, payload.candidate.scope);
          if (currentScope.b5ContentFingerprint !== payload.b5ContentFingerprint || fingerprint(currentScope) !== payload.candidate.scopeFingerprint) throw new Error('Stale outline detail generation scope before apply');
          const currentDesired = applyCandidate(payload.candidate, currentScope, current);
          appliedIds = payload.decisions.filter((decision) => decision.choice !== 'skip').map((decision) => decision.detailBeatId);
          if (outlineContentFingerprint(currentDesired) !== payload.expectedB5ContentFingerprint) throw new Error('Outline detail generation result fingerprint drifted');
          if (currentFingerprint !== payload.expectedB5ContentFingerprint) await deps.outline.save(projectId, currentDesired);
        }
        const result = outlineDetailGenerationAcceptResultSchema.parse({
          projectId, candidateId: payload.candidateId, proposalId: proposalIdValue,
          status: record.status === 'accepted' ? 'already-accepted' : 'accepted',
          appliedDetailBeatIds: appliedIds, skippedDetailBeatIds: skippedIds, b5ContentFingerprint: expectedAfter,
        });
        applied.set(proposalIdValue, result);
        return result;
      });
    },
    async reject(projectId, proposalIdValue) {
      return run(projectId, async () => {
        const record = deps.confirmation.get(projectId, proposalIdValue);
        if (record.kind !== PROPOSAL_KIND) throw new Error(`Confirmation is not an outline detail generation proposal: ${proposalIdValue}`);
        const payload = outlineDetailGenerationGatePayloadSchema.parse(record.payload);
        if (record.status === 'accepted') throw new Error(`Cannot reject accepted outline detail proposal: ${proposalIdValue}`);
        const resolved = record.status === 'pending' ? await deps.confirmation.reject(projectId, proposalIdValue) : record;
        return outlineDetailGenerationRejectResultSchema.parse({ projectId, candidateId: payload.candidateId, proposalId: proposalIdValue, status: resolved.status === 'rejected' && record.status === 'rejected' ? 'already-rejected' : 'rejected' });
      });
    },
    async cancel(projectId, candidateId) {
      return run(projectId, async () => {
        const input = outlineDetailGenerationCandidateInputSchema.parse({ candidateId });
        candidateFor(projectId, input.candidateId);
        sessions.delete(input.candidateId);
        return outlineDetailGenerationCancelResultSchema.parse({ projectId, candidateId: input.candidateId, status: 'cancelled' });
      });
    },
  };
  return Object.freeze(service);
}
