import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detailBeatSchema } from '../core/schema/outline.js';
import {
  OUTLINE_GENERATION_BASELINE_EVENTS_FILE,
  OutlineGenerationBaselineRepository,
} from './outline-generation-baseline-repository.js';
import type { OutlineGenerationBaselineCreateRecord } from './outline-generation-baseline-repository.js';

const roots: string[] = [];
const fingerprint = 'a'.repeat(64);
const detailBeat = detailBeatSchema.parse({
  id: 'card-a', title: '灯塔', summary: '发现旧灯塔', pov: 'hero', wordTarget: 500, points: ['开门'], status: 'planned',
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-baseline-repository-'));
  roots.push(root);
  return root;
}

function record(overrides: Partial<OutlineGenerationBaselineCreateRecord> = {}): OutlineGenerationBaselineCreateRecord {
  return {
    baselineId: 'gb-baseline-a', projectId: 'project-a', chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a',
    b5ContentFingerprint: fingerprint, bindingFingerprint: 'b'.repeat(64),
    sceneCard: { actId: 'act-a', beatId: 'beat-a', beatTitle: '进入灯塔', detailBeat },
    authoringBase: { content: '旧灯塔的门紧闭。', sourceHash: 'c'.repeat(64) }, status: 'current',
    generatedCandidateIds: [], createdAt: '2026-08-31T00:00:00.000Z', ...overrides,
  };
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I108 OutlineGenerationBaselineRepository', () => {
  it('replays the append-only event stream after restart and keeps create/attach idempotent', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineGenerationBaselineRepository(root);
    await repository.open();
    const first = await repository.create(record());
    expect(first.revision).toBe(1);
    expect(await repository.create(record())).toEqual(first);

    const attached = await repository.attachGenerated({ baselineId: first.baselineId, candidateId: 'candidate-a' });
    expect(attached.generatedCandidateIds).toEqual(['candidate-a']);
    expect(await repository.attachGenerated({ baselineId: first.baselineId, candidateId: 'candidate-a' })).toEqual(attached);
    const events = (await readFile(join(root, OUTLINE_GENERATION_BASELINE_EVENTS_FILE), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line) as { kind: string; sequence: number });
    expect(events.map((event) => event.kind)).toEqual(['create', 'attach-generated']);
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);

    const reopened = new OutlineGenerationBaselineRepository(root);
    await reopened.open();
    expect(await reopened.read(first.baselineId)).toEqual(attached);
  });

  it('records replacement and lifecycle events without mutating earlier evidence', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineGenerationBaselineRepository(root);
    await repository.open();
    const original = await repository.create(record());
    const replacement = await repository.create(record({ baselineId: 'gb-baseline-b', b5ContentFingerprint: 'd'.repeat(64) }), original.baselineId);
    expect(replacement.status).toBe('current');
    expect((await repository.read(original.baselineId)).status).toBe('superseded');
    expect((await repository.finalize('project-a', replacement.baselineId, 'e'.repeat(64))).status).toBe('finalized');

    const events = (await readFile(join(root, OUTLINE_GENERATION_BASELINE_EVENTS_FILE), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line) as { kind: string; sequence: number });
    expect(events.map((event) => event.kind)).toEqual(['create', 'create', 'supersede', 'finalize']);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('fails closed on collisions, cross-project lifecycle events, and corrupt sequence', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineGenerationBaselineRepository(root);
    await repository.open();
    const first = await repository.create(record());
    await expect(repository.create(record({ projectId: 'project-b' }))).rejects.toThrow(/collision/);
    await expect(repository.finalize('project-b', first.baselineId, fingerprint)).rejects.toThrow(/another project/);
    await writeFile(join(root, OUTLINE_GENERATION_BASELINE_EVENTS_FILE), '{"sequence":99}\n', 'utf8');
    const corrupt = new OutlineGenerationBaselineRepository(root);
    await expect(corrupt.open()).rejects.toThrow();
  });
});
