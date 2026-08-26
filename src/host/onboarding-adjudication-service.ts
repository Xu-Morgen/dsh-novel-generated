import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type {
  OnboardingAcceptedLayer,
  OnboardingAdjudicateInput,
  OnboardingApplyResult,
  OnboardingFinalApplyInput,
  OnboardingLayerKey,
  OnboardingLayerProposalPayload,
  OnboardingLayers,
} from '../core/schema/onboarding.js';
import {
  onboardingAdjudicateInputSchema,
  onboardingApplyResultSchema,
  onboardingCanonLayerSchema,
  onboardingCharacterLayerSchema,
  onboardingFinalApplyInputSchema,
  onboardingOutlineLayerSchema,
  onboardingRelationshipLayerSchema,
  onboardingStateLayerSchema,
  onboardingWorldviewLayerSchema,
  ONBOARDING_LAYER_KEYS,
} from '../core/schema/onboarding.js';
import { topologicalWorldviewOrder, APPLY_ORDER } from '../core/onboarding/apply.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { CharacterCoreInput } from '../core/schema/characters.js';
import type { WorldEntryInput } from '../core/schema/worldview.js';
import type { OutlineInput } from '../core/schema/outline.js';
import type { RelationshipInput } from '../core/schema/relationship.js';
import type { WorldState } from '../core/schema/state.js';
import type { CanonEventInput } from '../core/schema/canon.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';

/**
 * I53 Host facade: six-layer review, per-layer adjudication and idempotent
 * landing (design §14.7.4 / R11-4).
 *
 * Every operation is bound to the immutable `projectId / onboardingSessionId /
 * sourceHash` triple; every durable decision is an I11 Gate proposal. This
 * facade is the only component that maps the four user verdicts onto that Gate:
 *
 *   accept      → ensure an active proposal exists, then resolve it `accepted`.
 *                 An empty candidate layer (no candidates) is NOT acceptable:
 *                 the user must regenerate it or skip it explicitly (I56/R12-3).
 *   edit        → reject the current proposal, then propose a successor
 *                 carrying `{ replacesId, mode:'edited', value }` where `value`
 *                 is EXACTLY the user-validated `editedValue` from the Remote
 *                 payload — the Host never falls back to the original candidate
 *                 (I56/R12-3). The value is validated against the layer's
 *                 onboarding schema (and the B3 forced-empty contract) and must
 *                 be non-empty; the successor is accepted immediately.
 *   regenerate  → reject the current proposal, then re-run exactly one layer
 *                 through the analyzer and propose a successor carrying
 *                 `{ replacesId, mode:'regenerated', value, feedback }`. The
 *                 successor stays pending: the fresh LLM output is a NEW value
 *                 the user must re-review (pending ≠ skip).
 *   skip        → reject the current proposal and build NO successor.
 *
 * `finalApply` refuses to run while any layer holds a pending proposal, then
 * applies the accepted subset strictly B3 → B2 → B5 → C2 → C4 → C1 through the
 * existing Domain Services. Each layer is its own failure domain: a blocked
 * layer never rolls back an independent applied layer; a retry only continues
 * unfinished layers (no compensating data deletion), and repeated apply of an
 * already-applied layer is idempotent by domain-identity (create/append reject
 * duplicate ids; state re-application converges). An accepted layer whose
 * value holds no candidates fails closed at apply too (I56/R12-3).
 */

export interface NovelOnboardingAdjudicationService {
  /** Apply one user verdict for one layer; returns the terminal (or new pending) proposal record. */
  adjudicate(input: OnboardingAdjudicateInput, settings?: unknown): Promise<ConfirmationRecord>;
  /** The accepted layers (accepted Gate records) for a session. */
  acceptedLayers(onboardingSessionId: string): OnboardingAcceptedLayer[];
  /** Apply every accepted layer in fixed order; each layer is its own failure domain. */
  finalApply(input: OnboardingFinalApplyInput): Promise<OnboardingApplyResult>;
}

/** Read surface the analyzer service exposes so adjudication can load a session. */
export interface OnboardingLayerSource {
  getResult(onboardingSessionId: string): { projectId: string; onboardingSessionId: string; sourceHash: string; layers: OnboardingLayers } | undefined;
  /** Re-run one layer and return a fresh bound result (used by `regenerate`). */
  regenerate(onboardingSessionId: string, layer: OnboardingLayerKey, settings?: unknown): Promise<{ layers: OnboardingLayers }>;
}

interface Owners {
  characters: NovelCharacterService;
  worldview: NovelWorldviewService;
  outline: NovelOutlineService;
  relationship: NovelRelationshipService;
  state: NovelStateService;
  canon: NovelCanonService;
  confirmation: NovelConfirmationService;
}

interface SessionState {
  projectId: string;
  onboardingSessionId: string;
  sourceHash: string;
  layers: OnboardingLayers;
  /** Active proposal id per layer, including the rejected record for an explicit skip. */
  proposalByLayer: Map<OnboardingLayerKey, string>;
  /** Only an explicit user rejection with no successor counts as skipped. */
  skippedLayers: Set<OnboardingLayerKey>;
}

const PROPOSAL_KIND = 'onboarding-layer';

export function createOnboardingAdjudicationService(
  owners: Owners,
  layerSource: OnboardingLayerSource | undefined,
): NovelOnboardingAdjudicationService {
  const sessions = new Map<string, SessionState>();

  const loadSession = (onboardingSessionId: string): SessionState => {
    const existing = sessions.get(onboardingSessionId);
    if (existing) return existing;
    if (!layerSource) throw new Error('Onboarding analyzer source is unavailable');
    const result = layerSource.getResult(onboardingSessionId);
    if (!result) throw new Error(`Unknown onboarding session: ${onboardingSessionId}`);
    const session: SessionState = {
      projectId: result.projectId,
      onboardingSessionId: result.onboardingSessionId,
      sourceHash: result.sourceHash,
      layers: result.layers,
      proposalByLayer: new Map(),
      skippedLayers: new Set(),
    };
    sessions.set(onboardingSessionId, session);
    return session;
  };

  const assertBinding = (session: SessionState, projectId: string, sourceHash: string): void => {
    if (session.projectId !== projectId || session.sourceHash !== sourceHash) {
      throw new Error('Onboarding binding mismatch: project/session/sourceHash must match exactly');
    }
  };

  const layerValue = (layers: OnboardingLayers, layer: OnboardingLayerKey): unknown => layers[layer];

  const propose = (session: SessionState, layer: OnboardingLayerKey, value: unknown, lineage?: { replacesId: string | null; mode: 'edited' | 'regenerated'; feedback?: string }): Promise<ConfirmationRecord> => {
    const payload: OnboardingLayerProposalPayload & { replacesId?: string | null; mode?: string; feedback?: string } = {
      version: 1,
      provenance: { projectId: session.projectId, onboardingSessionId: session.onboardingSessionId, sourceHash: session.sourceHash, layer, schemaVersion: 1 },
      value: JSON.parse(JSON.stringify(value)) as OnboardingLayerProposalPayload['value'],
    };
    if (lineage) { payload.replacesId = lineage.replacesId; payload.mode = lineage.mode; if (lineage.feedback !== undefined) payload.feedback = lineage.feedback; }
    return owners.confirmation.propose(session.projectId, { id: randomUUID(), kind: PROPOSAL_KIND, payload });
  };

  const adjudicate = async (input: OnboardingAdjudicateInput, settings?: unknown): Promise<ConfirmationRecord> => {
    const parsed = onboardingAdjudicateInputSchema.parse(input);
    const session = loadSession(parsed.onboardingSessionId);
    assertBinding(session, parsed.projectId, parsed.sourceHash);
    const layer = parsed.layer as OnboardingLayerKey;
    const priorId = session.proposalByLayer.get(layer);

    if (parsed.decision === 'skip') {
      let proposalId = priorId;
      if (proposalId === undefined) {
        const created = await propose(session, layer, layerValue(session.layers, layer));
        proposalId = created.id;
      }
      const record = owners.confirmation.get(session.projectId, proposalId);
      if (record.status === 'pending') await owners.confirmation.reject(session.projectId, proposalId);
      session.proposalByLayer.set(layer, proposalId);
      session.skippedLayers.add(layer);
      // Explicit skip is a durable I11 rejection with no successor.
      return owners.confirmation.get(session.projectId, proposalId);
    }

    if (parsed.decision === 'accept') {
      // 空候选不能「接受」：没有可授权的候选，用户必须重生成或显式跳过（I56/R12-3）。
      const value = layerValue(session.layers, layer);
      assertCandidateable(layer, value, '接受');
      let proposalId = priorId;
      if (proposalId === undefined) {
        const created = await propose(session, layer, value);
        proposalId = created.id;
      }
      return owners.confirmation.accept(session.projectId, proposalId).then((record) => {
        session.proposalByLayer.set(layer, proposalId!);
        session.skippedLayers.delete(layer);
        return record;
      });
    }

    if (parsed.decision === 'edit') {
      // 「修改后接受」必须提交真实 editedValue；Host 精确采用用户值，绝不回退
      // 写原候选（I56/R12-3，schema 层已强制 edit 必带 editedValue）。
      const edited = assertCandidateable(layer, parsed.editedValue, '修改后接受');
      if (priorId !== undefined) {
        const record = owners.confirmation.get(session.projectId, priorId);
        if (record.status === 'pending') await owners.confirmation.reject(session.projectId, priorId);
      }
      const successor = await propose(session, layer, edited, { replacesId: priorId ?? null, mode: 'edited' });
      session.proposalByLayer.set(layer, successor.id);
      session.skippedLayers.delete(layer);
      // 「手动修改后接受」: the edited, user-validated value is accepted now.
      return owners.confirmation.accept(session.projectId, successor.id);
    }

    // regenerate: reject current, re-run the one layer, propose a pending successor.
    if (priorId !== undefined) {
      const record = owners.confirmation.get(session.projectId, priorId);
      if (record.status === 'pending') await owners.confirmation.reject(session.projectId, priorId);
    }
    const regeneratedLayers = await regenerateLayer(layerSource, session, layer, settings);
    session.layers = regeneratedLayers.layers;
    const successor = await propose(session, layer, layerValue(session.layers, layer), { replacesId: priorId ?? null, mode: 'regenerated', feedback: parsed.feedback });
    session.proposalByLayer.set(layer, successor.id);
    session.skippedLayers.delete(layer);
    return successor;
  };

  const acceptedLayers = (onboardingSessionId: string): OnboardingAcceptedLayer[] => {
    const session = loadSession(onboardingSessionId);
    const accepted: OnboardingAcceptedLayer[] = [];
    for (const layer of ONBOARDING_LAYER_KEYS) {
      const proposalId = session.proposalByLayer.get(layer);
      if (proposalId === undefined) continue;
      const record = owners.confirmation.get(session.projectId, proposalId);
      if (record.status !== 'accepted') continue;
      const payload = record.payload as { value?: unknown };
      const value = payload.value ?? layerValue(session.layers, layer);
      accepted.push({
        layer,
        proposalId,
        confidence: (session.layers[layer] as { confidence: OnboardingAcceptedLayer['confidence'] }).confidence,
        candidates: toCandidateJson(value),
      });
    }
    return accepted;
  };

  const finalApply = async (input: OnboardingFinalApplyInput): Promise<OnboardingApplyResult> => {
    const parsed = onboardingFinalApplyInputSchema.parse(input);
    const session = loadSession(parsed.onboardingSessionId);
    assertBinding(session, parsed.projectId, parsed.sourceHash);

    const appliedLayers: OnboardingLayerKey[] = [];
    const skippedLayers: OnboardingLayerKey[] = [];
    const blockedLayers: OnboardingLayerKey[] = [];
    const pendingLayers: OnboardingLayerKey[] = [];
    const errors: string[] = [];

    // pending ≠ skip: any pending proposal blocks first apply.
    for (const layer of ONBOARDING_LAYER_KEYS) {
      const proposalId = session.proposalByLayer.get(layer);
      if (proposalId === undefined) {
        if (!session.skippedLayers.has(layer)) pendingLayers.push(layer);
        continue;
      }
      if (owners.confirmation.get(session.projectId, proposalId).status === 'pending') pendingLayers.push(layer);
    }
    if (pendingLayers.length > 0) {
      return onboardingApplyResultSchema.parse({
        projectId: parsed.projectId, onboardingSessionId: parsed.onboardingSessionId,
        appliedLayers, skippedLayers, blockedLayers, pendingLayers, retryable: false,
        errors: [`Pending layers block apply: ${pendingLayers.join(', ')}`],
      });
    }

    const accepted = acceptedLayers(parsed.onboardingSessionId);
    const byLayer = new Map<OnboardingLayerKey, OnboardingAcceptedLayer>(accepted.map((a) => [a.layer, a]));
    for (const layer of ONBOARDING_LAYER_KEYS) {
      // A layer is explicitly skipped when it has no accepted proposal AND no
      // active (pending) proposal — i.e. the user skipped or never proposed it.
      if (byLayer.has(layer)) continue;
      skippedLayers.push(layer);
    }

    // Fail closed: an accepted layer with no candidates has nothing to land
    // (I56/R12-3 空候选阻止 apply). Normal adjudication already blocks accept/
    // edit on empty layers; this guards any legacy/buggy accepted record.
    for (const [layer, item] of byLayer) {
      if (item.candidates.length === 0) {
        blockedLayers.push(layer);
        errors.push(`${layer}: accepted layer has no candidates — nothing to apply`);
      }
    }

    const existingCharacterIds = await existingCharacters(owners.characters, parsed.projectId);
    // Full preflight is read-only: it classifies bad layers (and their
    // dependents) before the first Domain Service write, per design §14.7.4.
    const preflight = await preflightAccepted(owners, parsed.projectId, byLayer, existingCharacterIds);
    for (const [layer, message] of preflight) {
      blockedLayers.push(layer);
      errors.push(`${layer}: ${message}`);
    }
    const failed = new Set<OnboardingLayerKey>(blockedLayers);

    for (const layer of APPLY_ORDER) {
      const item = byLayer.get(layer);
      if (!item || failed.has(layer)) continue;
      if (isDependentOnFailedLayer(layer, failed)) {
        failed.add(layer);
        blockedLayers.push(layer);
        errors.push(`${layer}: blocked by an earlier failed prerequisite layer`);
        continue;
      }
      try {
        await applyLayer(layer, item, owners, parsed.projectId, session.layers, existingCharacterIds, appliedLayers);
        appliedLayers.push(layer);
      } catch (cause) {
        failed.add(layer);
        blockedLayers.push(layer);
        errors.push(`${layer}: ${(cause as Error).message}`);
      }
    }

    return onboardingApplyResultSchema.parse({
      projectId: parsed.projectId, onboardingSessionId: parsed.onboardingSessionId,
      appliedLayers, skippedLayers, blockedLayers, pendingLayers,
      retryable: blockedLayers.length > 0, errors,
    });
  };

  return Object.freeze({ adjudicate, acceptedLayers, finalApply });
}

async function regenerateLayer(
  layerSource: OnboardingLayerSource | undefined,
  session: SessionState,
  layer: OnboardingLayerKey,
  settings?: unknown,
): Promise<{ layers: OnboardingLayers }> {
  if (!layerSource) throw new Error('Onboarding analyzer source is unavailable for regeneration');
  return layerSource.regenerate(session.onboardingSessionId, layer, settings);
}

/** Per-layer onboarding value schema, keyed by layer (edited values must reuse
 * the exact analyzer contract — no second layer model, design §14.7.3). */
const LAYER_VALUE_SCHEMAS: Record<OnboardingLayerKey, z.ZodType<OnboardingLayers[OnboardingLayerKey]>> = {
  characters: onboardingCharacterLayerSchema,
  worldview: onboardingWorldviewLayerSchema,
  outline: onboardingOutlineLayerSchema,
  relationship: onboardingRelationshipLayerSchema,
  state: onboardingStateLayerSchema,
  canon: onboardingCanonLayerSchema,
};

const LAYER_DISPLAY: Record<OnboardingLayerKey, string> = {
  characters: '角色（B3）',
  worldview: '世界观（B2）',
  outline: '大纲（B5）',
  relationship: '关系（C1）',
  state: '状态（C2）',
  canon: '正史（C4）',
};

/**
 * I56/R12-3 adjudication gate: a value may only be accepted (or edited) when it
 * parses against the layer's onboarding schema, carries at least one candidate
 * (空候选阻止裁决), and honours the B3 forced-empty contract (design §14.7.3:
 * `relationships` / `knowledgeIds` / `arc.keyBeats` stay empty, including for
 * manually edited proposals). Returns the parsed canonical value.
 */
export function assertCandidateable(layer: OnboardingLayerKey, value: unknown, verdict: string): OnboardingLayers[OnboardingLayerKey] {
  const parsed = LAYER_VALUE_SCHEMAS[layer].safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`${LAYER_DISPLAY[layer]}「${verdict}」的候选值不符合层契约${issues.length > 0 ? `（前 ${issues.length} 项：${issues.join('；')}）` : ''}；请修正候选值后重试，或整层重生成/显式跳过。`);
  }
  if (parsed.data.candidates.length === 0) {
    throw new Error(`${LAYER_DISPLAY[layer]}无候选，不能${verdict}；请整层重生成或显式跳过（空候选阻止裁决）。`);
  }
  if (layer === 'characters') {
    const candidates = parsed.data.candidates as OnboardingLayers['characters']['candidates'];
    for (const candidate of candidates) {
      if (candidate.relationships.length !== 0 || candidate.knowledgeIds.length !== 0 || candidate.arc.keyBeats.length !== 0) {
        throw new Error(`B3 角色 ${candidate.id} 必须保持 relationships/knowledgeIds/arc.keyBeats 为空（初始化合同 §14.7.3）。`);
      }
    }
  }
  return parsed.data;
}

function toCandidateJson(value: unknown): OnboardingAcceptedLayer['candidates'] {
  const wrapper = value as { candidates?: unknown[] };
  if (!wrapper || !Array.isArray(wrapper.candidates)) return [];
  return wrapper.candidates.map((candidate) => JSON.parse(JSON.stringify(candidate)) as unknown) as OnboardingAcceptedLayer['candidates'];
}

async function preflightAccepted(
  owners: Owners,
  projectId: string,
  byLayer: Map<OnboardingLayerKey, OnboardingAcceptedLayer>,
  existingCharacterIds: Set<string>,
): Promise<Map<OnboardingLayerKey, string>> {
  const failed = new Map<OnboardingLayerKey, string>();
  const acceptedCharacters = byLayer.get('characters')?.candidates ?? [];
  const characterIds = new Set([...existingCharacterIds, ...acceptedCharacters.map((candidate) => String((candidate as { id?: unknown }).id ?? ''))]);
  const b3 = byLayer.get('characters');
  if (b3) {
    for (const raw of b3.candidates) {
      const candidate = raw as Partial<CharacterCoreInput>;
      if (!candidate.id) { failed.set('characters', 'B3 candidate id is missing'); break; }
      if ((candidate.relationships ?? []).length || (candidate.knowledgeIds ?? []).length || (candidate.arc?.keyBeats ?? []).length) {
        failed.set('characters', `B3 candidate ${candidate.id} contains forbidden forward references`); break;
      }
      if (existingCharacterIds.has(candidate.id)) {
        const current = await owners.characters.read(projectId, candidate.id);
        if (JSON.stringify(stripVersion(current)) !== JSON.stringify(stripVersion(candidate as CharacterCoreInput))) {
          failed.set('characters', `B3 candidate id conflicts with an existing character: ${candidate.id}`); break;
        }
      }
    }
  }

  const b2 = byLayer.get('worldview');
  if (b2) {
    try {
      const existing = await owners.worldview.list(projectId);
      const existingIds = new Set(existing.map((entry) => entry.id));
      topologicalWorldviewOrder(b2.candidates as unknown as WorldEntryInput[], existingIds);
      for (const raw of b2.candidates) {
        const candidate = raw as unknown as WorldEntryInput;
        if (!existingIds.has(candidate.id)) continue;
        const current = await owners.worldview.read(projectId, candidate.id);
        if (JSON.stringify(stripStorage(current)) !== JSON.stringify(candidate)) throw new Error(`B2 candidate id conflicts with an existing entry: ${candidate.id}`);
      }
    } catch (cause) { failed.set('worldview', (cause as Error).message); }
  }

  const b5 = byLayer.get('outline');
  if (b5) {
    const outline = b5.candidates[0] as unknown as OutlineInput | undefined;
    if (!outline) failed.set('outline', 'B5 outline candidate is missing');
    else {
      const beatIds = new Set<string>();
      for (const act of outline.acts ?? []) for (const beat of act.beats ?? []) {
        if (beatIds.has(beat.id)) failed.set('outline', `Duplicate B5 beat id: ${beat.id}`);
        beatIds.add(beat.id);
        for (const id of beat.charactersInvolved ?? []) if (!characterIds.has(id)) failed.set('outline', `B5 references unknown B3: ${id}`);
        for (const detail of beat.detailBeats ?? []) if (!characterIds.has(detail.pov)) failed.set('outline', `B5 references unknown B3: ${detail.pov}`);
        for (const id of beat.prerequisites ?? []) if (!beatIds.has(id)) failed.set('outline', `B5 prerequisites references unknown beat: ${id}`);
      }
      for (const entry of outline.foreshadowing ?? []) for (const id of entry.knownBy ?? []) if (!characterIds.has(id)) failed.set('outline', `B5 foreshadowing references unknown B3: ${id}`);
    }
  }

  const c2 = byLayer.get('state');
  if (c2) {
    const candidate = c2.candidates[0] as unknown as WorldState | undefined;
    if (!candidate) failed.set('state', 'C2 state candidate is missing');
    else for (const entry of candidate.characters ?? []) if (!characterIds.has(entry.characterId)) failed.set('state', `C2 references unknown B3: ${entry.characterId}`);
  }

  const c4 = byLayer.get('canon');
  const existingCanonIds = new Set(owners.canon.query(projectId).map((event) => event.id));
  const acceptedCanonIds = new Set((c4?.candidates ?? []).map((candidate) => String((candidate as { id?: unknown }).id ?? '')));
  if (c4) for (const raw of c4.candidates) {
    const candidate = raw as unknown as CanonEventInput;
    for (const id of candidate.participants ?? []) if (!characterIds.has(id)) failed.set('canon', `C4 references unknown B3: ${id}`);
    for (const id of candidate.consequences ?? []) if (!acceptedCanonIds.has(id) && !existingCanonIds.has(id)) failed.set('canon', `C4 consequence references unavailable C4: ${id}`);
  }

  const c1 = byLayer.get('relationship');
  if (c1) for (const raw of c1.candidates) {
    const candidate = raw as unknown as RelationshipInput;
    for (const id of [candidate.from, candidate.to, ...(candidate.knownTo ?? [])]) if (!characterIds.has(id)) failed.set('relationship', `C1 references unknown B3: ${id}`);
    for (const id of candidate.milestones ?? []) if (!acceptedCanonIds.has(id) && !existingCanonIds.has(id)) failed.set('relationship', `C1 milestone references unavailable C4: ${id}`);
  }
  return failed;
}

function isDependentOnFailedLayer(layer: OnboardingLayerKey, failed: Set<OnboardingLayerKey>): boolean {
  if (layer === 'outline' || layer === 'state' || layer === 'canon') return failed.has('characters');
  if (layer === 'relationship') return failed.has('characters') || failed.has('canon');
  return false;
}

async function existingCharacters(characters: NovelCharacterService, projectId: string): Promise<Set<string>> {
  const list = await characters.list(projectId);
  return new Set(list.map((character) => character.id));
}

async function applyLayer(
  layer: OnboardingLayerKey,
  item: OnboardingAcceptedLayer,
  owners: Owners,
  projectId: string,
  _layers: OnboardingLayers,
  existingCharacterIds: Set<string>,
  appliedLayers: OnboardingLayerKey[],
): Promise<void> {
  switch (layer) {
    case 'characters': return applyCharacters(owners, projectId, item, existingCharacterIds);
    case 'worldview': return applyWorldview(owners, projectId, item);
    case 'outline': return applyOutline(owners, projectId, item, existingCharacterIds);
    case 'state': return applyState(owners, projectId, item, existingCharacterIds);
    case 'canon': return applyCanon(owners, projectId, item, existingCharacterIds);
    case 'relationship': return applyRelationship(owners, projectId, item, existingCharacterIds, appliedLayers);
  }
}

async function applyCharacters(owners: Owners, projectId: string, item: OnboardingAcceptedLayer, existing: Set<string>): Promise<void> {
  for (const raw of item.candidates) {
    const candidate = raw as unknown as CharacterCoreInput;
    if ((candidate.relationships ?? []).length || (candidate.knowledgeIds ?? []).length || (candidate.arc?.keyBeats ?? []).length) {
      throw new Error(`B3 candidate ${candidate.id} must keep relationships/knowledgeIds/arc.keyBeats empty`);
    }
    if (existing.has(candidate.id)) {
      // Idempotency: a semantically identical existing character is already applied.
      const current = await owners.characters.read(projectId, candidate.id);
      if (JSON.stringify(stripVersion(current)) !== JSON.stringify(stripVersion(candidate))) {
        throw new Error(`B3 candidate id conflicts with an existing character: ${candidate.id}`);
      }
      continue;
    }
    await owners.characters.create(projectId, candidate);
    existing.add(candidate.id);
  }
}

async function applyWorldview(owners: Owners, projectId: string, item: OnboardingAcceptedLayer): Promise<void> {
  const candidates = item.candidates as unknown as WorldEntryInput[];
  const existing = await owners.worldview.list(projectId);
  const existingIds = new Set(existing.map((entry) => entry.id));
  const order = topologicalWorldviewOrder(candidates, existingIds);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of order) {
    // OnboardingWorldview omits Host-owned status/supersededBy; create() needs them.
    const input: WorldEntryInput = { ...byId.get(id)!, status: 'active', supersededBy: null };
    if (existingIds.has(id)) {
      const current = await owners.worldview.read(projectId, id);
      if (JSON.stringify(stripStorage(current)) !== JSON.stringify(byId.get(id)!)) {
        throw new Error(`B2 candidate id conflicts with an existing entry: ${id}`);
      }
      continue;
    }
    await owners.worldview.create(projectId, input);
  }
}

async function applyOutline(owners: Owners, projectId: string, item: OnboardingAcceptedLayer, characterIds: Set<string>): Promise<void> {
  const candidate = item.candidates[0] as unknown as OutlineInput | undefined;
  if (!candidate) throw new Error('B5 outline candidate is missing');
  const outline = candidate;
  const beatIds = new Set<string>();
  for (const act of outline.acts ?? []) {
    for (const beat of act.beats ?? []) {
      if (beatIds.has(beat.id)) throw new Error(`Duplicate B5 beat id: ${beat.id}`);
      beatIds.add(beat.id);
      for (const id of beat.charactersInvolved ?? []) if (!characterIds.has(id)) throw new Error(`B5 charactersInvolved references unknown B3: ${id}`);
      for (const detail of beat.detailBeats ?? []) if (!characterIds.has(detail.pov)) throw new Error(`B5 detailBeats.pov references unknown B3: ${detail.pov}`);
    }
  }
  for (const act of outline.acts ?? []) {
    for (const beat of act.beats ?? []) {
      for (const id of beat.prerequisites ?? []) if (!beatIds.has(id)) throw new Error(`B5 prerequisites references unknown beat: ${id}`);
    }
  }
  for (const f of outline.foreshadowing ?? []) {
    for (const id of f.knownBy ?? []) if (!characterIds.has(id)) throw new Error(`B5 foreshadowing.knownBy references unknown B3: ${id}`);
  }
  const readiness = await owners.outline.readiness(projectId);
  if (readiness === 'ready') {
    const current = await owners.outline.read(projectId);
    if (JSON.stringify(stripVersion(current)) === JSON.stringify(outline)) return;
    throw new Error('B5 candidate conflicts with an existing outline');
  }
  if (readiness === 'corrupt') throw new Error('B5 existing outline is corrupt');
  await owners.outline.save(projectId, outline);
}

async function applyState(owners: Owners, projectId: string, item: OnboardingAcceptedLayer, characterIds: Set<string>): Promise<void> {
  const candidate = item.candidates[0] as unknown as WorldState | undefined;
  if (!candidate) throw new Error('C2 state candidate is missing');
  for (const char of candidate.characters ?? []) {
    if (!characterIds.has(char.characterId)) throw new Error(`C2 characters reference unknown B3: ${char.characterId}`);
  }
  const current = owners.state.current(projectId);
  if (stateEquals(current, candidate)) return;
  await owners.state.transaction(projectId, (draft) => {
    draft.storyTime = candidate.storyTime;
    draft.scene = candidate.scene;
    draft.characters = candidate.characters;
  });
}

async function applyCanon(owners: Owners, projectId: string, item: OnboardingAcceptedLayer, characterIds: Set<string>): Promise<void> {
  for (const raw of item.candidates) {
    const candidate = raw as unknown as CanonEventInput;
    for (const id of candidate.participants ?? []) if (!characterIds.has(id)) throw new Error(`C4 participants references unknown B3: ${id}`);
    try {
      await owners.canon.append(projectId, candidate);
    } catch (cause) {
      // Idempotency: duplicate id means this event was already appended.
      if (!/Duplicate canon event id/.test((cause as Error).message)) throw cause;
      const existing = owners.canon.query(projectId).find((event) => event.id === candidate.id);
      if (!existing || !canonEquals(existing, candidate)) throw cause;
    }
  }
}

async function applyRelationship(owners: Owners, projectId: string, item: OnboardingAcceptedLayer, characterIds: Set<string>, _appliedLayers: OnboardingLayerKey[]): Promise<void> {
  const existing = await owners.relationship.read(projectId);
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  const canonIds = new Set(owners.canon.query(projectId).map((event) => event.id));
  for (const raw of item.candidates) {
    const candidate = raw as unknown as RelationshipInput;
    for (const id of [candidate.from, candidate.to, ...(candidate.knownTo ?? [])]) if (!characterIds.has(id)) throw new Error(`C1 from/to/knownTo references unknown B3: ${id}`);
    for (const id of candidate.milestones ?? []) if (!canonIds.has(id)) throw new Error(`C1 milestones references unknown C4: ${id}`);
    const current = existingById.get(candidate.id);
    if (current) {
      if (JSON.stringify(stripVersion(current)) !== JSON.stringify(candidate)) throw new Error(`C1 candidate id conflicts with an existing relationship: ${candidate.id}`);
      continue;
    }
    await owners.relationship.save(projectId, candidate);
  }
}

function stripVersion<T extends { version?: number }>(value: T): Omit<T, 'version'> {
  const { version: _version, ...rest } = value as T & { version: number };
  return rest as Omit<T, 'version'>;
}

/** Strip Host-owned persistence fields (version/status/supersededBy) for equality against a candidate input. */
function stripStorage(value: { version?: number; status?: string; supersededBy?: string | null }): unknown {
  const { version: _v, status: _s, supersededBy: _sp, ...rest } = value as { version: number; status?: string; supersededBy?: string | null };
  return rest;
}

function stateEquals(current: WorldState, candidate: Omit<WorldState, 'seq'>): boolean {
  return current.storyTime === candidate.storyTime
    && JSON.stringify(current.scene) === JSON.stringify(candidate.scene)
    && JSON.stringify(current.characters) === JSON.stringify(candidate.characters);
}

/** Compare a stored CanonEvent against an input, ignoring ledger-owned fields. */
function canonEquals(existing: { id: string; storyTime: string; kind: string; summary: string; detail: string; participants: string[]; location: string; consequences: string[]; affectedLayers: string[] }, candidate: CanonEventInput): boolean {
  return existing.storyTime === candidate.storyTime
    && existing.kind === candidate.kind
    && existing.summary === candidate.summary
    && existing.detail === candidate.detail
    && JSON.stringify(existing.participants) === JSON.stringify(candidate.participants)
    && existing.location === candidate.location
    && JSON.stringify(existing.consequences) === JSON.stringify(candidate.consequences)
    && JSON.stringify(existing.affectedLayers) === JSON.stringify(candidate.affectedLayers);
}
