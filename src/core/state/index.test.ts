import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StateEngine } from './index.js';
import type { WorldState } from '../schema/state.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i4-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const initial: Omit<WorldState, 'seq'> = {
  id: 'state', version: 1, storyTime: 'day 1',
  scene: { location: 'gate', timeOfDay: 'dawn', weather: 'clear', season: 'spring', atmosphere: 'quiet' },
  characters: [{ characterId: 'lin', location: 'gate', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '', currentGoal: 'wait', flags: {} }],
};

describe('I4 StateEngine', () => {
  it('creates monotonic snapshots and restores the current state after reopening', async () => {
    const root = await temporaryRoot();
    const engine = await StateEngine.open(root, initial);
    expect(engine.current().seq).toBe(0);
    await engine.transaction((draft) => { draft.scene.location = 'square'; draft.storyTime = 'day 1 noon'; });
    expect(engine.current().seq).toBe(1);
    const reopened = await StateEngine.open(root, initial);
    expect(reopened.current().scene.location).toBe('square');
    expect(reopened.current().seq).toBe(1);
  });

  it('commits a transaction once and leaves no half-written snapshot on validation failure', async () => {
    const root = await temporaryRoot();
    const engine = await StateEngine.open(root, initial);
    await expect(engine.transaction((draft) => {
      draft.scene.location = 42 as unknown as string;
      draft.characters[0].alive = 'yes' as unknown as boolean;
    })).rejects.toThrow();
    expect(engine.current()).toEqual({ ...initial, seq: 0 });
    const persisted = await readFile(join(root, 'snapshots.yaml'), 'utf8');
    expect(persisted).not.toContain('42');
  });

  it('rolls back by creating a new monotonic snapshot and computes deterministic diffs', async () => {
    const engine = await StateEngine.open(await temporaryRoot(), initial);
    await engine.transaction((draft) => { draft.scene.location = 'square'; });
    await engine.transaction((draft) => { draft.characters[0].mood = 'afraid'; });
    const rolled = await engine.rollback(1);
    expect(rolled.seq).toBe(3);
    expect(rolled.scene.location).toBe('square');
    expect(rolled.characters[0].mood).toBe('calm');
    expect(engine.diff(0, 1)).toEqual({ fromSeq: 0, toSeq: 1, changes: [
      { path: 'scene.location', before: 'gate', after: 'square' },
    ] });
  });

  it.each([[-1, 99, 1.5]])('rejects invalid or unknown snapshot sequence %s', async (seq) => {
    const engine = await StateEngine.open(await temporaryRoot(), initial);
    expect(() => engine.snapshot(seq)).toThrow(/snapshot sequence/);
  });

  it('rejects malformed persisted snapshots instead of silently resetting them', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'snapshots.yaml'), 'snapshots:\n  - seq: 4\n', 'utf8');
    await expect(StateEngine.open(root, initial)).rejects.toThrow();
  });
});
