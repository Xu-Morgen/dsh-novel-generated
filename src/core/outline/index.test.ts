import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OutlineRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i14-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const outline = (over: Record<string, unknown> = {}) => ({
  id: 'harbor-outline',
  structure: 'three-act' as const,
  logline: 'A wary deckhand must name the harbor curse before dawn.',
  themes: ['identity', 'debt'],
  acts: [{
    id: 'act-one', index: 1, title: 'The Fog', goal: 'Reveal the impossible harbor.',
    beats: [{
      id: 'beat-arrival', title: 'Arrival', description: 'Mara enters the silent harbor.',
      charactersInvolved: ['mara'], conflictType: 'external' as const,
      prerequisites: [], optional: false,
      detailBeats: [{
        id: 'scene-dock', title: 'At the dock', summary: 'Mara finds a bell that makes no sound.',
        pov: 'mara', wordTarget: 1200, points: ['fog closes in', 'the bell is cold'], status: 'planned' as const,
      }],
    }],
  }],
  foreshadowing: [{
    id: 'curse-bell', hint: 'The bell has a familiar mark.', payoff: 'The mark belongs to Mara.',
    status: 'unplanted' as const, knownBy: ['mara'],
  }],
  endings: [{
    id: 'end-release', title: 'Release', conditions: ['Mara names the curse'],
    description: 'The harbor releases the drowned ships.',
  }],
  ...over,
});

describe('I14 OutlineRepository', () => {
  it('round-trips acts, beats, prerequisites, detail beats, foreshadowing, and endings', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineRepository(root);
    await repository.open();
    await repository.save(outline());

    const reopened = new OutlineRepository(root);
    await reopened.open();
    expect(await reopened.read()).toEqual({ ...outline(), version: 1 });
    expect(await reopened.beatCards()).toEqual([{
      actId: 'act-one', beatId: 'beat-arrival', beatTitle: 'Arrival',
      detailBeat: expect.objectContaining({ id: 'scene-dock', wordTarget: 1200, status: 'planned' }),
    }]);
  });

  it('accepts every detail-beat status and rejects invalid wordTarget/status', async () => {
    const repository = new OutlineRepository(await temporaryRoot());
    await repository.open();
    for (const status of ['planned', 'writing', 'done'] as const) {
      const value = outline({ acts: [{
        ...(outline().acts[0]),
        beats: [{ ...(outline().acts[0].beats[0]), detailBeats: [{
          ...outline().acts[0].beats[0].detailBeats[0], status,
        }] }],
      }] });
      await expect(repository.save(value)).resolves.toMatchObject({ acts: [{ beats: [{ detailBeats: [{ status }] }] }] });
    }
    await expect(repository.save(outline({ acts: [{
      ...(outline().acts[0]), beats: [{ ...(outline().acts[0].beats[0]), detailBeats: [{
        ...outline().acts[0].beats[0].detailBeats[0], wordTarget: 0,
      }] }],
    }] }))).rejects.toThrow();
    await expect(repository.save(outline({ acts: [{
      ...(outline().acts[0]), beats: [{ ...(outline().acts[0].beats[0]), detailBeats: [{
        ...outline().acts[0].beats[0].detailBeats[0], status: 'queued',
      }] }],
    }] }))).rejects.toThrow();
  });

  it('rejects dangling prerequisites, duplicate nodes, and C6 leakage', async () => {
    const repository = new OutlineRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.save(outline({ acts: [{
      ...(outline().acts[0]), beats: [{ ...(outline().acts[0].beats[0]), prerequisites: ['missing-beat'] }],
    }] }))).rejects.toThrow(/Unknown beat prerequisite/);
    await expect(repository.save(outline({ acts: [
      outline().acts[0], { ...outline().acts[0], id: 'act-two' },
    ] }))).rejects.toThrow(/Duplicate beat id/);
    await expect(repository.save(outline({ currentBeat: 'beat-arrival' } as never))).rejects.toThrow(/Unrecognized key/);
  });

  it('fails closed for malformed persisted outline documents', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineRepository(root);
    await repository.open();
    await writeFile(join(root, 'outline.yaml'), 'id: broken\nstructure: three-act\n', 'utf8');
    await expect(repository.read()).rejects.toThrow(/Invalid outline document/);
  });

  it('writes a canonical YAML document for the Host-owned source of truth', async () => {
    const root = await temporaryRoot();
    const repository = new OutlineRepository(root);
    await repository.open();
    await repository.save(outline());
    expect(await readFile(join(root, 'outline.yaml'), 'utf8')).toContain('detailBeats:');
  });
});
