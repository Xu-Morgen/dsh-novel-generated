import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { stableSceneId } from '../core/queue/task.js';
import {
  candidateTargetSelectionSchema,
  candidateTargetSnapshotSchema,
  type CandidateTargetSelection,
  type CandidateTargetSnapshot,
} from '../core/schema/candidate-target.js';
import {
  SCENE_OUTLINE_BINDING_LIMIT,
  sceneOutlineBindingImpactInputSchema,
  sceneOutlineBindingRebindSchema,
  sceneOutlineBindingSaveSchema,
  sceneOutlineBindingUnbindSchema,
  type SceneOutlineBindingImpactInput,
  type SceneOutlineBindingImpactResult,
  type SceneOutlineBindingReadResult,
  type SceneOutlineBindingRebind,
  type SceneOutlineBindingSave,
  type SceneOutlineBindingUnbind,
  type SceneOutlineEffectiveBinding,
  type SceneOutlineManualBinding,
} from '../core/schema/scene-outline-binding.js';
import type { Chapter } from '../core/schema/text.js';
import type { OutlineBeatCard } from '../core/schema/outline.js';
import type { NovelOutlineService } from './outline-service.js';
import { SceneOutlineBindingRepository } from './scene-outline-binding-repository.js';
import type { NovelTextServiceBundle } from './text-service.js';

interface ProjectReferences {
  readonly chapters: readonly Chapter[];
  readonly sceneToChapter: ReadonlyMap<string, string>;
  readonly cards: ReadonlyMap<string, OutlineBeatCard>;
}

export interface NovelSceneOutlineBindingServiceOptions {
  /** Focused open-fault seam; production uses the canonical repository. */
  readonly repositoryFactory?: (projectDirectory: string) => SceneOutlineBindingRepository;
}

export interface CandidateOwnerFingerprintTriple {
  readonly textFingerprint: string;
  readonly outlineFingerprint: string;
  readonly bindingFingerprint: string;
}

/** Host-only canonical card ownership used by queue/statistics consumers. */
export interface OwnedSceneOutlineMapping {
  readonly card: OutlineBeatCard;
  readonly chapterId: string | null;
  readonly sceneId: string;
  readonly source: 'manual' | 'default' | 'suppressed';
  readonly occupied: boolean;
}

export interface OwnedSceneOutlineTarget extends OwnedSceneOutlineMapping {
  readonly chapterId: string;
  readonly targetSnapshot: CandidateTargetSnapshot;
}

export interface NovelSceneOutlineBindingService {
  read(projectId: string): Promise<SceneOutlineBindingReadResult>;
  save(projectId: string, input: SceneOutlineBindingSave): Promise<SceneOutlineBindingReadResult>;
  rebind(projectId: string, input: SceneOutlineBindingRebind): Promise<SceneOutlineBindingReadResult>;
  unbind(projectId: string, input: SceneOutlineBindingUnbind): Promise<SceneOutlineBindingReadResult>;
  impact(projectId: string, input: SceneOutlineBindingImpactInput): Promise<SceneOutlineBindingImpactResult>;
  /** Host-only stable three-owner capture; never exposed by Remote. */
  captureOwnerFingerprintTriple(projectId: string): Promise<CandidateOwnerFingerprintTriple>;
  /** Host-only capture for a new-scene candidate; never exposed by Remote. */
  captureCandidateTarget(projectId: string, selection: CandidateTargetSelection, detailBeatId?: string): Promise<CandidateTargetSnapshot>;
  /** Host-only exact owner-token and occupancy assertion. */
  assertCandidateTargetFresh(projectId: string, snapshot: CandidateTargetSnapshot): Promise<void>;
  /** Host-only canonical mapping for every card; statistics consumes this owner directly. */
  resolveOwnedTargets(projectId: string): Promise<readonly OwnedSceneOutlineMapping[]>;
  /** Host-only all-or-nothing queue resolution under one stable owner triple. */
  resolveQueueTargets(projectId: string, chapterId: string, cardIds?: readonly string[]): Promise<readonly OwnedSceneOutlineTarget[]>;
  /** Host-only fingerprint freshness check for persisted queue targets. */
  assertQueueTargetFresh(projectId: string, snapshot: CandidateTargetSnapshot): Promise<void>;
}

/**
 * Cross-owner resolver for manual-first SceneOutlineBinding semantics.
 * C5/B5 are read-only references; only the repository writes project state.
 */
export function createSceneOutlineBindingService(
  text: Pick<NovelTextServiceBundle, 'listChapters' | 'projectFingerprint'>,
  outline: Pick<NovelOutlineService, 'beatCards' | 'contentFingerprint'> & Partial<Pick<NovelOutlineService, 'readiness'>>,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  options: NovelSceneOutlineBindingServiceOptions = {},
): NovelSceneOutlineBindingService {
  const repositories = new Map<string, Promise<SceneOutlineBindingRepository>>();
  const createRepository = options.repositoryFactory ?? ((directory: string) => new SceneOutlineBindingRepository(directory));
  const repositoryFor = (projectId: string): Promise<SceneOutlineBindingRepository> => {
    validateProjectId(projectId);
    const existing = repositories.get(projectId);
    if (existing !== undefined) return existing;
    const repository = createRepository(projectDirectory(projectsRoot, projectId));
    const opened = repository.open().then(() => repository);
    repositories.set(projectId, opened);
    void opened.catch(() => {
      if (repositories.get(projectId) === opened) repositories.delete(projectId);
    });
    return opened;
  };

  const referencesFor = async (projectId: string): Promise<ProjectReferences> => {
    validateProjectId(projectId);
    const [chapters, readiness] = await Promise.all([text.listChapters(projectId), outline.readiness?.(projectId) ?? Promise.resolve('ready' as const)]);
    if (readiness === 'corrupt') throw new Error('Cannot resolve scene-outline bindings from a corrupt outline');
    const beatCards = readiness === 'uninitialized' ? [] : await outline.beatCards(projectId);
    const sceneToChapter = new Map<string, string>();
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) {
        if (sceneToChapter.has(scene.id)) throw new Error(`Duplicate scene id across project: ${scene.id}`);
        sceneToChapter.set(scene.id, chapter.id);
      }
    }
    const cards = new Map<string, OutlineBeatCard>();
    for (const card of beatCards) {
      const detailBeatId = card.detailBeat.id;
      if (cards.has(detailBeatId)) throw new Error(`Ambiguous detail beat id across project: ${detailBeatId}`);
      cards.set(detailBeatId, card);
    }
    return { chapters, sceneToChapter, cards };
  };

  const assertManualReferences = (manual: readonly SceneOutlineManualBinding[], references: ProjectReferences): void => {
    for (const binding of manual) {
      if (!references.sceneToChapter.has(binding.sceneId)) throw new Error(`Unknown bound scene: ${binding.sceneId}`);
      if (!references.cards.has(binding.detailBeatId)) throw new Error(`Unknown bound detail beat: ${binding.detailBeatId}`);
    }
  };

  const resolveEffective = (manual: readonly SceneOutlineManualBinding[], references: ProjectReferences): SceneOutlineEffectiveBinding[] => {
    assertManualReferences(manual, references);
    const occupiedScenes = new Set(manual.map((binding) => binding.sceneId));
    const occupiedCards = new Set(manual.map((binding) => binding.detailBeatId));
    const effective: SceneOutlineEffectiveBinding[] = manual.map((binding) => ({
      ...binding,
      chapterId: references.sceneToChapter.get(binding.sceneId)!,
      source: 'manual' as const,
    }));
    const defaultScenes = new Set<string>();
    for (const card of references.cards.values()) {
      if (occupiedCards.has(card.detailBeat.id)) continue;
      const sceneId = stableSceneId(card.actId, card.beatId, card.detailBeat.id);
      const chapterId = references.sceneToChapter.get(sceneId);
      if (chapterId === undefined || occupiedScenes.has(sceneId)) continue;
      if (defaultScenes.has(sceneId)) throw new Error(`Duplicate computed scene mapping: ${sceneId}`);
      defaultScenes.add(sceneId);
      effective.push({ sceneId, detailBeatId: card.detailBeat.id, chapterId, source: 'default' });
    }
    if (effective.length > SCENE_OUTLINE_BINDING_LIMIT) throw new Error(`Binding projection exceeds limit: ${SCENE_OUTLINE_BINDING_LIMIT}`);
    return effective.sort((left, right) => left.sceneId.localeCompare(right.sceneId) || left.detailBeatId.localeCompare(right.detailBeatId));
  };

  const project = async (projectId: string): Promise<{ references: ProjectReferences; repository: SceneOutlineBindingRepository; state: SceneOutlineBindingReadResult }> => {
    const references = await referencesFor(projectId);
    const repository = await repositoryFor(projectId);
    const snapshot = await repository.read();
    return {
      references,
      repository,
      state: {
        manual: snapshot.document.bindings,
        effective: resolveEffective(snapshot.document.bindings, references),
        fingerprint: snapshot.fingerprint,
      },
    };
  };

  /**
   * Binding CAS is atomic only for the manual binding document. Referential
   * preflight validates the current C5/B5 read; it does not claim cross-owner
   * atomicity with later text/outline changes. I105 Task 2 candidate freshness
   * captures and recaptures owner fingerprints around its own side effects.
   */
  const afterMutation = async (
    references: ProjectReferences,
    repository: SceneOutlineBindingRepository,
    expectedFingerprint: string,
    transform: (bindings: readonly SceneOutlineManualBinding[]) => readonly SceneOutlineManualBinding[],
  ): Promise<SceneOutlineBindingReadResult> => {
    let effective: SceneOutlineEffectiveBinding[] | undefined;
    const result = await repository.mutate(expectedFingerprint, (bindings) => {
      const candidate = transform(bindings);
      // Validate every derived row, including the projection bound, before the
      // repository parses or writes the candidate document under its CAS lane.
      effective = resolveEffective(candidate, references);
      return candidate;
    });
    return { manual: result.document.bindings, effective: effective!, fingerprint: result.fingerprint };
  };

  const ownerFingerprints = async (projectId: string, repository: SceneOutlineBindingRepository) => {
    const [textFingerprint, outlineFingerprint, binding] = await Promise.all([
      text.projectFingerprint(projectId),
      outline.contentFingerprint(projectId),
      repository.read(),
    ]);
    return { textFingerprint, outlineFingerprint, bindingFingerprint: binding.fingerprint, bindings: binding.document.bindings };
  };

  const captureOwnerFingerprintTriple = async (projectId: string): Promise<CandidateOwnerFingerprintTriple> => {
    validateProjectId(projectId);
    const repository = await repositoryFor(projectId);
    const before = await ownerFingerprints(projectId, repository);
    const after = await ownerFingerprints(projectId, repository);
    if (before.textFingerprint !== after.textFingerprint
      || before.outlineFingerprint !== after.outlineFingerprint
      || before.bindingFingerprint !== after.bindingFingerprint) {
      throw new Error('Candidate target owners changed during capture');
    }
    return {
      textFingerprint: after.textFingerprint,
      outlineFingerprint: after.outlineFingerprint,
      bindingFingerprint: after.bindingFingerprint,
    };
  };

  const validateCandidateSelection = (
    selection: CandidateTargetSelection,
    detailBeatId: string | undefined,
    references: ProjectReferences,
    manual: readonly SceneOutlineManualBinding[],
  ): void => {
    const chapter = references.chapters.find((item) => item.id === selection.chapterId);
    if (chapter === undefined) throw new Error(`Unknown chapter: ${selection.chapterId}`);
    if (references.sceneToChapter.has(selection.sceneId)) throw new Error(`Target scene already exists: ${selection.sceneId}`);
    if (detailBeatId !== undefined && !references.cards.has(detailBeatId)) throw new Error(`Unknown detail beat: ${detailBeatId}`);
    const effective = resolveEffective(manual, references);
    if (effective.some((binding) => binding.sceneId === selection.sceneId)) throw new Error(`Target scene is already bound: ${selection.sceneId}`);
    if (detailBeatId !== undefined && effective.some((binding) => binding.detailBeatId === detailBeatId)) {
      throw new Error(`Detail beat is already bound: ${detailBeatId}`);
    }
    for (const card of references.cards.values()) {
      if (stableSceneId(card.actId, card.beatId, card.detailBeat.id) === selection.sceneId && card.detailBeat.id !== detailBeatId) {
        throw new Error(`Target scene id is reserved for a different detail beat: ${selection.sceneId}`);
      }
    }
  };

  const resolveOwnedMappings = (
    manual: readonly SceneOutlineManualBinding[],
    references: ProjectReferences,
  ): readonly OwnedSceneOutlineMapping[] => {
    assertManualReferences(manual, references);
    const manualByCard = new Map(manual.map((binding) => [binding.detailBeatId, binding]));
    const manualByScene = new Map(manual.map((binding) => [binding.sceneId, binding]));
    const defaultOwners = new Map<string, string>();
    const mappings: OwnedSceneOutlineMapping[] = [];
    for (const card of references.cards.values()) {
      const manualBinding = manualByCard.get(card.detailBeat.id);
      if (manualBinding !== undefined) {
        mappings.push({
          card,
          chapterId: references.sceneToChapter.get(manualBinding.sceneId)!,
          sceneId: manualBinding.sceneId,
          source: 'manual',
          occupied: true,
        });
        continue;
      }
      const sceneId = stableSceneId(card.actId, card.beatId, card.detailBeat.id);
      const collision = manualByScene.get(sceneId);
      if (collision !== undefined) {
        mappings.push({
          card,
          chapterId: references.sceneToChapter.get(sceneId)!,
          sceneId,
          source: 'suppressed',
          occupied: true,
        });
        continue;
      }
      const prior = defaultOwners.get(sceneId);
      if (prior !== undefined) throw new Error(`Duplicate computed scene mapping: ${sceneId} (${prior}, ${card.detailBeat.id})`);
      defaultOwners.set(sceneId, card.detailBeat.id);
      const chapterId = references.sceneToChapter.get(sceneId) ?? null;
      mappings.push({ card, chapterId, sceneId, source: 'default', occupied: chapterId !== null });
    }
    return mappings;
  };

  const captureOwnedMappings = async (projectId: string) => {
    validateProjectId(projectId);
    const repository = await repositoryFor(projectId);
    const before = await ownerFingerprints(projectId, repository);
    const references = await referencesFor(projectId);
    const mappings = resolveOwnedMappings(before.bindings, references);
    const after = await ownerFingerprints(projectId, repository);
    if (before.textFingerprint !== after.textFingerprint
      || before.outlineFingerprint !== after.outlineFingerprint
      || before.bindingFingerprint !== after.bindingFingerprint) {
      throw new Error('Scene-outline owners changed during batch resolution');
    }
    return { mappings, fingerprints: after, references };
  };

  const captureCandidateTarget = async (
    projectId: string,
    selectionInput: CandidateTargetSelection,
    detailBeatId?: string,
  ): Promise<CandidateTargetSnapshot> => {
    validateProjectId(projectId);
    const selection = candidateTargetSelectionSchema.parse(selectionInput);
    const repository = await repositoryFor(projectId);
    const before = await ownerFingerprints(projectId, repository);
    const references = await referencesFor(projectId);
    validateCandidateSelection(selection, detailBeatId, references, before.bindings);
    const after = await ownerFingerprints(projectId, repository);
    if (before.textFingerprint !== after.textFingerprint
      || before.outlineFingerprint !== after.outlineFingerprint
      || before.bindingFingerprint !== after.bindingFingerprint) {
      throw new Error('Candidate target owners changed during capture');
    }
    return candidateTargetSnapshotSchema.parse({
      ...selection,
      ...(detailBeatId === undefined ? {} : { detailBeatId }),
      textFingerprint: after.textFingerprint,
      outlineFingerprint: after.outlineFingerprint,
      bindingFingerprint: after.bindingFingerprint,
    });
  };

  return {
    async read(projectId) {
      return (await project(projectId)).state;
    },
    async save(projectId, input) {
      const command = sceneOutlineBindingSaveSchema.parse(input);
      const { references, repository, state } = await project(projectId);
      if (state.fingerprint !== command.expectedFingerprint) throw new Error(`Stale binding fingerprint: expected ${command.expectedFingerprint}, actual ${state.fingerprint}`);
      if (!references.sceneToChapter.has(command.sceneId)) throw new Error(`Unknown scene: ${command.sceneId}`);
      if (!references.cards.has(command.detailBeatId)) throw new Error(`Unknown detail beat: ${command.detailBeatId}`);
      const sceneBinding = state.effective.find((binding) => binding.sceneId === command.sceneId);
      const cardBinding = state.effective.find((binding) => binding.detailBeatId === command.detailBeatId);
      if (sceneBinding !== undefined) throw new Error(`Scene is already bound: ${command.sceneId}`);
      if (cardBinding !== undefined) throw new Error(`Detail beat is already bound: ${command.detailBeatId}`);
      return afterMutation(references, repository, command.expectedFingerprint, (bindings) => [...bindings, { sceneId: command.sceneId, detailBeatId: command.detailBeatId }]);
    },
    async rebind(projectId, input) {
      const command = sceneOutlineBindingRebindSchema.parse(input);
      const { references, repository, state } = await project(projectId);
      if (state.fingerprint !== command.expectedFingerprint) throw new Error(`Stale binding fingerprint: expected ${command.expectedFingerprint}, actual ${state.fingerprint}`);
      const current = state.manual.find((binding) => binding.sceneId === command.sceneId && binding.detailBeatId === command.detailBeatId);
      if (current === undefined) throw new Error(`Manual binding does not exist: ${command.sceneId} -> ${command.detailBeatId}`);
      if (!references.cards.has(command.nextDetailBeatId)) throw new Error(`Unknown detail beat: ${command.nextDetailBeatId}`);
      if (command.nextDetailBeatId === command.detailBeatId) throw new Error('Rebind target must differ from the current detail beat');
      const occupied = state.effective.find((binding) => binding.detailBeatId === command.nextDetailBeatId);
      if (occupied !== undefined) throw new Error(`Detail beat is already bound: ${command.nextDetailBeatId}`);
      return afterMutation(references, repository, command.expectedFingerprint, (bindings) => bindings.map((binding) => binding.sceneId === current.sceneId && binding.detailBeatId === current.detailBeatId ? { sceneId: command.sceneId, detailBeatId: command.nextDetailBeatId } : binding));
    },
    async unbind(projectId, input) {
      const command = sceneOutlineBindingUnbindSchema.parse(input);
      const { references, repository, state } = await project(projectId);
      if (state.fingerprint !== command.expectedFingerprint) throw new Error(`Stale binding fingerprint: expected ${command.expectedFingerprint}, actual ${state.fingerprint}`);
      if (!state.manual.some((binding) => binding.sceneId === command.sceneId && binding.detailBeatId === command.detailBeatId)) {
        throw new Error(`Manual binding does not exist: ${command.sceneId} -> ${command.detailBeatId}`);
      }
      return afterMutation(references, repository, command.expectedFingerprint, (bindings) => bindings.filter((binding) => binding.sceneId !== command.sceneId || binding.detailBeatId !== command.detailBeatId));
    },
    async impact(projectId, input) {
      const target = sceneOutlineBindingImpactInputSchema.parse(input);
      const { references, state } = await project(projectId);
      if (target.kind === 'scene') {
        const chapterId = references.sceneToChapter.get(target.sceneId);
        if (chapterId === undefined) throw new Error(`Unknown scene: ${target.sceneId}`);
        return { kind: 'scene', chapterId, sceneId: target.sceneId, bindings: state.effective.filter((binding) => binding.sceneId === target.sceneId), fingerprint: state.fingerprint };
      }
      const chapter = references.chapters.find((item) => item.id === target.chapterId);
      if (chapter === undefined) throw new Error(`Unknown chapter: ${target.chapterId}`);
      const sceneIds = new Set(chapter.scenes.map((scene) => scene.id));
      return { kind: 'chapter', chapterId: target.chapterId, bindings: state.effective.filter((binding) => sceneIds.has(binding.sceneId)), fingerprint: state.fingerprint };
    },
    captureOwnerFingerprintTriple,
    captureCandidateTarget,
    async assertCandidateTargetFresh(projectId, input) {
      const expected = candidateTargetSnapshotSchema.parse(input);
      const actual = await captureCandidateTarget(projectId, { chapterId: expected.chapterId, sceneId: expected.sceneId }, expected.detailBeatId);
      if (actual.textFingerprint !== expected.textFingerprint) throw new Error('Stale candidate target: text fingerprint changed');
      if (actual.outlineFingerprint !== expected.outlineFingerprint) throw new Error('Stale candidate target: outline fingerprint changed');
      if (actual.bindingFingerprint !== expected.bindingFingerprint) throw new Error('Stale candidate target: binding fingerprint changed');
    },
    async resolveOwnedTargets(projectId) {
      const readiness = await (outline.readiness?.(projectId) ?? Promise.resolve('ready' as const));
      if (readiness === 'uninitialized') return [];
      if (readiness === 'corrupt') throw new Error('Cannot resolve scene-outline bindings from a corrupt outline');
      return (await captureOwnedMappings(projectId)).mappings;
    },
    async resolveQueueTargets(projectId, chapterId, cardIds) {
      const readiness = await (outline.readiness?.(projectId) ?? Promise.resolve('ready' as const));
      if (readiness !== 'ready') throw new Error(`Cannot start queue from ${readiness} outline`);
      const { mappings, fingerprints, references } = await captureOwnedMappings(projectId);
      if (!references.chapters.some((chapter) => chapter.id === chapterId)) throw new Error(`Unknown chapter: ${chapterId}`);
      const suppressed = mappings.filter((mapping) => mapping.source === 'suppressed');
      if (suppressed.length > 0) {
        throw new Error(`Manual/default binding collision: ${suppressed.map((mapping) => `${mapping.card.detailBeat.id}->${mapping.sceneId}`).join(', ')}`);
      }
      const byCard = new Map(mappings.map((mapping) => [mapping.card.detailBeat.id, mapping]));
      const requested = cardIds === undefined ? [...byCard.keys()] : [...cardIds];
      if (new Set(requested).size !== requested.length) throw new Error('Duplicate card ids in queue batch');
      const unknown = requested.filter((id) => !byCard.has(id));
      if (unknown.length > 0) throw new Error(`Unknown scene cards: ${unknown.join(', ')}`);
      const targets = requested.map((cardId): OwnedSceneOutlineTarget => {
        const mapping = byCard.get(cardId)!;
        const resolvedChapterId = mapping.occupied ? mapping.chapterId! : chapterId;
        return {
          ...mapping,
          chapterId: resolvedChapterId,
          targetSnapshot: candidateTargetSnapshotSchema.parse({
            chapterId: resolvedChapterId,
            sceneId: mapping.sceneId,
            detailBeatId: cardId,
            textFingerprint: fingerprints.textFingerprint,
            outlineFingerprint: fingerprints.outlineFingerprint,
            bindingFingerprint: fingerprints.bindingFingerprint,
          }),
        };
      });
      const seenScenes = new Set<string>();
      for (const target of targets) {
        if (seenScenes.has(target.sceneId)) throw new Error(`Queue target collision: ${target.sceneId}`);
        seenScenes.add(target.sceneId);
      }
      return targets;
    },
    async assertQueueTargetFresh(projectId, input) {
      const expected = candidateTargetSnapshotSchema.parse(input);
      const actual = await captureOwnerFingerprintTriple(projectId);
      if (actual.textFingerprint !== expected.textFingerprint) throw new Error('Stale queue target: text fingerprint changed');
      if (actual.outlineFingerprint !== expected.outlineFingerprint) throw new Error('Stale queue target: outline fingerprint changed');
      if (actual.bindingFingerprint !== expected.bindingFingerprint) throw new Error('Stale queue target: binding fingerprint changed');
    },
  };
}
