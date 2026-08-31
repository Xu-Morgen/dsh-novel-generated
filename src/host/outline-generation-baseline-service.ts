import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { textContentHash } from '../core/text/index.js';
import {
  outlineGenerationBaselineAttachGeneratedInputSchema,
  outlineGenerationBaselineCreateInputSchema,
  outlineGenerationBaselineCurrentInputSchema,
  outlineGenerationBaselineReadResultSchema,
  outlineGenerationBaselineCurrentResultSchema,
  outlineGenerationBaselineSchema,
  type OutlineGenerationBaseline,
  type OutlineGenerationBaselineAttachGeneratedInput,
  type OutlineGenerationBaselineCreateInput,
  type OutlineGenerationBaselineCurrentInput,
  type OutlineGenerationBaselineCurrentResult,
  type OutlineGenerationBaselineReadResult,
  type OutlineGenerationBaselineStaleReason,
} from '../core/schema/outline-generation-baseline.js';
import type { OutlineBeatCard } from '../core/schema/outline.js';
import type { NovelOutlineService } from './outline-service.js';
import { OutlineGenerationBaselineRepository, type OutlineGenerationBaselineCreateRecord } from './outline-generation-baseline-repository.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextServiceBundle } from './text-service.js';

interface CapturedOwners {
  readonly chapterId: string;
  readonly sceneId: string;
  readonly detailBeatId: string;
  readonly content: string;
  readonly b5ContentFingerprint: string;
  readonly bindingFingerprint: string;
  readonly sourceHash: string;
  readonly textFingerprint: string;
  readonly sceneCard: OutlineBeatCard;
}

export interface NovelOutlineGenerationBaselineService {
  create(projectId: string, input: OutlineGenerationBaselineCreateInput): Promise<OutlineGenerationBaselineReadResult>;
  read(projectId: string, baselineId: string): Promise<OutlineGenerationBaselineReadResult>;
  current(projectId: string, input: OutlineGenerationBaselineCurrentInput): Promise<OutlineGenerationBaselineCurrentResult>;
  attachGenerated(projectId: string, input: OutlineGenerationBaselineAttachGeneratedInput): Promise<OutlineGenerationBaselineReadResult>;
  /** Host-only lifecycle hooks reserved for I114; not exposed as Remote in I108. */
  finalize(projectId: string, baselineId: string, finalSourceHash: string): Promise<OutlineGenerationBaseline>;
  supersede(projectId: string, baselineId: string, replacementBaselineId: string): Promise<OutlineGenerationBaseline>;
}

export interface NovelOutlineGenerationBaselineServiceOptions {
  readonly repositoryFactory?: (projectDirectory: string) => OutlineGenerationBaselineRepository;
}

function baselineIdFor(projectId: string, captured: CapturedOwners): string {
  const digest = createHash('sha256').update(JSON.stringify({
    projectId,
    chapterId: captured.chapterId,
    sceneId: captured.sceneId,
    detailBeatId: captured.detailBeatId,
    b5ContentFingerprint: captured.b5ContentFingerprint,
    bindingFingerprint: captured.bindingFingerprint,
    sourceHash: captured.sourceHash,
  })).digest('hex');
  return `gb-${digest.slice(0, 60)}`;
}

function targetMissing(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /Unknown (?:chapter|scene|bound scene|bound detail beat)/.test(message);
}

/**
 * Host owner for the I108 immutable generation-intent evidence aggregate.
 * Capture reads B5, the independent binding owner and C5 twice; a mismatch
 * fails closed before any baseline event is appended (design §14.14.2).
 */
export function createOutlineGenerationBaselineService(
  deps: {
    readonly text: Pick<NovelTextServiceBundle, 'readChapter' | 'projectFingerprint'>;
    readonly outline: Pick<NovelOutlineService, 'contentFingerprint' | 'beatCards'>;
    readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  },
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  options: NovelOutlineGenerationBaselineServiceOptions = {},
): NovelOutlineGenerationBaselineService {
  const repositories = new Map<string, Promise<OutlineGenerationBaselineRepository>>();
  const createRepository = options.repositoryFactory ?? ((directory: string) => new OutlineGenerationBaselineRepository(directory));

  const repositoryFor = (projectId: string): Promise<OutlineGenerationBaselineRepository> => {
    validateProjectId(projectId);
    const existing = repositories.get(projectId);
    if (existing !== undefined) return existing;
    const repository = createRepository(projectDirectory(projectsRoot, projectId));
    const opened = repository.open().then(() => repository);
    repositories.set(projectId, opened);
    void opened.catch(() => { if (repositories.get(projectId) === opened) repositories.delete(projectId); });
    return opened;
  };

  const captureOnce = async (projectId: string, input: OutlineGenerationBaselineCreateInput): Promise<CapturedOwners> => {
    const [chapter, b5ContentFingerprint, sceneCards, binding, textFingerprint] = await Promise.all([
      deps.text.readChapter(projectId, input.chapterId),
      deps.outline.contentFingerprint(projectId),
      deps.outline.beatCards(projectId),
      deps.binding.read(projectId),
      deps.text.projectFingerprint(projectId),
    ]);
    const scene = chapter.scenes.find((item) => item.id === input.sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${input.sceneId}`);
    const sceneCard = sceneCards.find((item) => item.detailBeat.id === input.detailBeatId);
    if (sceneCard === undefined) throw new Error(`Unknown detail beat: ${input.detailBeatId}`);
    const owned = binding.effective.find((item) => item.sceneId === input.sceneId && item.detailBeatId === input.detailBeatId);
    if (owned === undefined) throw new Error(`Scene is not bound to detail beat: ${input.sceneId}/${input.detailBeatId}`);
    if (owned.chapterId !== input.chapterId) throw new Error(`Scene binding belongs to another chapter: ${input.sceneId}`);
    return {
      chapterId: input.chapterId,
      sceneId: input.sceneId,
      detailBeatId: input.detailBeatId,
      content: scene.content,
      b5ContentFingerprint,
      bindingFingerprint: binding.fingerprint,
      sourceHash: textContentHash(scene.content),
      textFingerprint,
      sceneCard: structuredClone(sceneCard),
    };
  };

  const capture = async (projectId: string, rawInput: OutlineGenerationBaselineCreateInput): Promise<CapturedOwners> => {
    const input = outlineGenerationBaselineCreateInputSchema.parse(rawInput);
    const before = await captureOnce(projectId, input);
    const after = await captureOnce(projectId, input);
    if (before.b5ContentFingerprint !== after.b5ContentFingerprint
      || before.bindingFingerprint !== after.bindingFingerprint
      || before.sourceHash !== after.sourceHash
      || before.textFingerprint !== after.textFingerprint) {
      throw new Error('Outline generation baseline owners changed during capture');
    }
    return after;
  };

  const freshness = async (baseline: OutlineGenerationBaseline): Promise<{ freshness: 'fresh' | 'stale'; staleReasons: OutlineGenerationBaselineStaleReason[] }> => {
    const target = { chapterId: baseline.chapterId, sceneId: baseline.sceneId, detailBeatId: baseline.detailBeatId };
    let captured: CapturedOwners;
    try {
      captured = await capture(baseline.projectId, target);
    } catch (cause) {
      return {
        freshness: 'stale',
        staleReasons: [targetMissing(cause) ? 'target-missing' : 'binding-changed'],
      };
    }
    const staleReasons: OutlineGenerationBaselineStaleReason[] = [];
    if (captured.b5ContentFingerprint !== baseline.b5ContentFingerprint) staleReasons.push('b5-changed');
    if (captured.bindingFingerprint !== baseline.bindingFingerprint) staleReasons.push('binding-changed');
    if (captured.sourceHash !== baseline.authoringBase.sourceHash) staleReasons.push('source-changed');
    return { freshness: staleReasons.length === 0 ? 'fresh' : 'stale', staleReasons };
  };

  const readResult = async (baseline: OutlineGenerationBaseline): Promise<OutlineGenerationBaselineReadResult> => {
    const state = await freshness(baseline);
    const projected = state.freshness === 'stale' && baseline.status === 'current'
      ? { ...baseline, status: 'stale' as const }
      : baseline;
    return outlineGenerationBaselineReadResultSchema.parse({ baseline: projected, ...state });
  };

  const assertFresh = async (baseline: OutlineGenerationBaseline): Promise<void> => {
    const state = await freshness(baseline);
    if (state.freshness === 'stale') throw new Error(`Stale outline generation baseline ${baseline.baselineId}: ${state.staleReasons.join(', ')}`);
  };

  return {
    async create(projectId, rawInput) {
      const input = outlineGenerationBaselineCreateInputSchema.parse(rawInput);
      const repository = await repositoryFor(projectId);
      const captured = await capture(projectId, input);
      const baselineId = baselineIdFor(projectId, captured);
      const existing = (await repository.list())
        .filter((item) => item.chapterId === input.chapterId && item.sceneId === input.sceneId && item.detailBeatId === input.detailBeatId)
        .sort((left, right) => right.revision - left.revision)[0];
      if (existing !== undefined) {
        const existingFreshness = await freshness(existing);
        if (existingFreshness.freshness === 'fresh' && existing.status === 'current') return readResult(existing);
      }
      const record: OutlineGenerationBaselineCreateRecord = {
        baselineId,
        projectId,
        chapterId: input.chapterId,
        sceneId: input.sceneId,
        detailBeatId: input.detailBeatId,
        b5ContentFingerprint: captured.b5ContentFingerprint,
        bindingFingerprint: captured.bindingFingerprint,
        sceneCard: captured.sceneCard,
        authoringBase: { content: captured.content, sourceHash: captured.sourceHash },
        status: 'current',
        generatedCandidateIds: [],
        createdAt: new Date().toISOString(),
      };
      const baseline = await repository.create(record, existing?.status === 'current' ? existing.baselineId : undefined);
      return readResult(baseline);
    },
    async read(projectId, baselineId) {
      const baseline = await (await repositoryFor(projectId)).read(baselineId);
      if (baseline.projectId !== projectId) throw new Error(`Baseline belongs to another project: ${baselineId}`);
      return readResult(baseline);
    },
    async current(projectId, rawInput) {
      const input = outlineGenerationBaselineCurrentInputSchema.parse(rawInput);
      const candidates = (await (await repositoryFor(projectId)).list())
        .filter((item) => item.projectId === projectId && item.chapterId === input.chapterId && item.sceneId === input.sceneId
          && item.status !== 'superseded' && (input.detailBeatId === undefined || item.detailBeatId === input.detailBeatId))
        .sort((left, right) => right.revision - left.revision);
      if (candidates[0] === undefined) return outlineGenerationBaselineCurrentResultSchema.parse({ baseline: null, freshness: 'none', staleReasons: [] });
      const result = await readResult(candidates[0]);
      return outlineGenerationBaselineCurrentResultSchema.parse({ baseline: result.baseline, freshness: result.freshness, staleReasons: result.staleReasons });
    },
    async attachGenerated(projectId, rawInput) {
      const input = outlineGenerationBaselineAttachGeneratedInputSchema.parse(rawInput);
      const repository = await repositoryFor(projectId);
      const baseline = await repository.read(input.baselineId);
      if (baseline.projectId !== projectId) throw new Error(`Baseline belongs to another project: ${input.baselineId}`);
      await assertFresh(baseline);
      return readResult(await repository.attachGenerated(input));
    },
    async finalize(projectId, baselineId, finalSourceHash) {
      const repository = await repositoryFor(projectId);
      const baseline = await repository.read(baselineId);
      if (baseline.projectId !== projectId) throw new Error(`Baseline belongs to another project: ${baselineId}`);
      return repository.finalize(projectId, baselineId, finalSourceHash);
    },
    async supersede(projectId, baselineId, replacementBaselineId) {
      return (await repositoryFor(projectId)).supersede(projectId, baselineId, replacementBaselineId);
    },
  };
}
