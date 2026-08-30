import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SceneOutlineBindingRepository, sceneOutlineBindingFingerprint } from './scene-outline-binding-repository.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-binding-repository-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('I105 SceneOutlineBindingRepository', () => {
  it('treats a missing file as empty, persists sorted manual pairs, and reopens deterministically', async () => {
    const root = await temporaryRoot();
    const repository = new SceneOutlineBindingRepository(root);
    await repository.open();
    const empty = await repository.read();
    expect(empty).toEqual({ document: { version: 1, bindings: [] }, fingerprint: sceneOutlineBindingFingerprint({ version: 1, bindings: [] }) });

    const saved = await repository.mutate(empty.fingerprint, () => [
      { sceneId: 'scene-z', detailBeatId: 'card-z' },
      { sceneId: 'scene-a', detailBeatId: 'card-a' },
    ]);
    expect(saved.document.bindings.map((binding) => binding.sceneId)).toEqual(['scene-a', 'scene-z']);
    expect(await readFile(join(root, 'scene-outline-bindings.yaml'), 'utf8')).toContain('version: 1');

    const reopened = new SceneOutlineBindingRepository(root);
    expect(await reopened.read()).toEqual(saved);
  });

  it('rejects duplicate one-to-one rows, stale mutations, and corrupt documents', async () => {
    const root = await temporaryRoot();
    const first = new SceneOutlineBindingRepository(root);
    const second = new SceneOutlineBindingRepository(root);
    await first.open();
    const empty = await first.read();
    await expect(first.mutate(empty.fingerprint, () => [
      { sceneId: 'scene-a', detailBeatId: 'card-a' },
      { sceneId: 'scene-a', detailBeatId: 'card-b' },
    ])).rejects.toThrow(/Duplicate bound scene/);
    const saved = await first.mutate(empty.fingerprint, () => [{ sceneId: 'scene-a', detailBeatId: 'card-a' }]);
    await expect(second.mutate(empty.fingerprint, () => [])).rejects.toThrow(/Stale binding fingerprint/);
    expect((await second.read()).fingerprint).toBe(saved.fingerprint);

    await writeFile(join(root, 'scene-outline-bindings.yaml'), 'version: 2\nbindings: []\n', 'utf8');
    await expect(first.read()).rejects.toThrow(/Invalid scene-outline binding document/);
  });

  it('serializes genuinely overlapping instances so one CAS commits and the queued stale loser never transforms', async () => {
    const root = await temporaryRoot();
    const enteredRenameSeam = deferred();
    const releaseRenameSeam = deferred();
    const first = new SceneOutlineBindingRepository(root, {
      beforeRename: async () => {
        enteredRenameSeam.resolve();
        await releaseRenameSeam.promise;
      },
    });
    const second = new SceneOutlineBindingRepository(root);
    await first.open();
    const empty = await first.read();

    const winner = first.mutate(empty.fingerprint, () => [{ sceneId: 'scene-a', detailBeatId: 'card-a' }]);
    await enteredRenameSeam.promise;
    let staleTransformEntered = false;
    const loser = second.mutate(empty.fingerprint, () => {
      staleTransformEntered = true;
      return [{ sceneId: 'scene-b', detailBeatId: 'card-b' }];
    }).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );
    await Promise.resolve();
    expect(staleTransformEntered).toBe(false);

    releaseRenameSeam.resolve();
    const committed = await winner;
    const rejected = await loser;
    expect(rejected.status).toBe('rejected');
    if (rejected.status === 'rejected') expect(rejected.error).toBeInstanceOf(Error);
    if (rejected.status === 'rejected') expect((rejected.error as Error).message).toMatch(/Stale binding fingerprint/);
    expect(staleTransformEntered).toBe(false);
    expect(await second.read()).toEqual(committed);
  });

  it('does not replace the canonical document when the atomic rename seam fails', async () => {
    const root = await temporaryRoot();
    const initial = new SceneOutlineBindingRepository(root);
    await initial.open();
    const empty = await initial.read();
    const saved = await initial.mutate(empty.fingerprint, () => [{ sceneId: 'scene-a', detailBeatId: 'card-a' }]);
    const failing = new SceneOutlineBindingRepository(root, { beforeRename: () => { throw new Error('injected rename failure'); } });
    await expect(failing.mutate(saved.fingerprint, () => [{ sceneId: 'scene-b', detailBeatId: 'card-b' }])).rejects.toThrow('injected rename failure');
    expect(await initial.read()).toEqual(saved);
  });
});
