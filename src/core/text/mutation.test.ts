import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ChapterWriteQueue, TextRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i104-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const chapter = (id: string, index: number, title = id) => ({ id, index, title, pov: 'pov-1', status: 'draft' as const });
const scene = (id: string, content = id) => ({ id, content, summary: `${id}-summary`, beats: [], canonEvents: [], notes: '' });

describe('I104 TextRepository C5 mutations', () => {
  it('round-trips create/metadata/reorder and rebuilds JSON + Markdown mirrors', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    let fingerprint = await repository.projectFingerprint();

    ({ fingerprint } = await repository.createChapterAt(chapter('chapter-a', 1), fingerprint));
    ({ fingerprint } = await repository.createChapterAt(chapter('chapter-b', 2), fingerprint));
    ({ fingerprint } = await repository.insertScene('chapter-a', 0, scene('scene-a1', 'A1'), fingerprint));
    ({ fingerprint } = await repository.insertScene('chapter-a', 1, scene('scene-a2', 'A2'), fingerprint));
    ({ fingerprint } = await repository.insertScene('chapter-b', 0, scene('scene-b1', 'B1'), fingerprint));
    ({ fingerprint } = await repository.updateChapterMetadata('chapter-b', { title: '第二章', status: 'revised' }, fingerprint));
    ({ fingerprint } = await repository.updateSceneMetadata('chapter-a', 'scene-a2', { summary: '改后摘要', notes: '作者注' }, fingerprint));

    const reordered = await repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-b', sceneIds: ['scene-b1'] },
        { chapterId: 'chapter-a', sceneIds: ['scene-a2', 'scene-a1'] },
      ],
    });
    expect(reordered.chapters.map((item) => [item.id, item.index])).toEqual([['chapter-b', 1], ['chapter-a', 2]]);

    const reopened = new TextRepository(root);
    await reopened.open();
    const chapters = await reopened.listChapters();
    expect(chapters.map((item) => [item.id, item.index, item.title])).toEqual([
      ['chapter-b', 1, '第二章'], ['chapter-a', 2, 'chapter-a'],
    ]);
    expect(chapters[1].scenes.map((item) => [item.id, item.index, item.summary])).toEqual([
      ['scene-a2', 0, '改后摘要'], ['scene-a1', 1, 'scene-a1-summary'],
    ]);
    expect(await readFile(join(root, 'docs', 'chapter-b.md'), 'utf8')).toContain('# 第二章');
    expect(await readFile(join(root, 'docs', 'chapter-a.md'), 'utf8')).toContain('场景 1 · 改后摘要');
  });

  it('rejects duplicate/out-of-range/incomplete/unknown/stale mutations with zero writes', async () => {
    const repository = new TextRepository(await temporaryRoot());
    await repository.open();
    let fingerprint = await repository.projectFingerprint();
    ({ fingerprint } = await repository.createChapterAt(chapter('chapter-a', 1), fingerprint));
    ({ fingerprint } = await repository.insertScene('chapter-a', 0, scene('scene-a'), fingerprint));
    const baseline = await repository.readChapter('chapter-a');

    await expect(repository.createChapterAt(chapter('chapter-a', 2), fingerprint)).rejects.toThrow(/already exists/);
    await expect(repository.createChapterAt(chapter('chapter-b', 3), fingerprint)).rejects.toThrow(/out of range/);
    await expect(repository.insertScene('chapter-a', 2, scene('scene-b'), fingerprint)).rejects.toThrow(/out of range/);
    await expect(repository.insertScene('chapter-a', 1, scene('scene-a'), fingerprint)).rejects.toThrow(/Duplicate scene/);
    await expect(repository.updateSceneMetadata('chapter-a', 'missing', { summary: 'x' }, fingerprint)).rejects.toThrow(/Unknown scene/);
    await expect(repository.updateChapterMetadata('chapter-a', { id: 'hijack' } as never, fingerprint)).rejects.toThrow();
    await expect(repository.updateSceneMetadata('chapter-a', 'scene-a', { content: 'hijack' } as never, fingerprint)).rejects.toThrow();
    await expect(repository.reorderProject({ expectedFingerprint: fingerprint, chapters: [], extra: true } as never)).rejects.toThrow();
    await expect(repository.reorderProject({ expectedFingerprint: fingerprint, chapters: [] })).rejects.toThrow(/every chapter/);
    await expect(repository.reorderProject({ expectedFingerprint: fingerprint, chapters: [{ chapterId: 'chapter-a', sceneIds: ['missing'] }] })).rejects.toThrow(/Unknown scene/);
    await expect(repository.updateChapterMetadata('chapter-a', { title: 'stale' }, '0'.repeat(64))).rejects.toThrow(/Stale/);
    expect(await repository.readChapter('chapter-a')).toEqual(baseline);
  });

  it('reports delete impact, removes mirrors, and preserves the project last scene landing', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-a', 'AAAA'));
    await repository.appendScene('chapter-b', scene('scene-b', 'BBBBB'));
    let fingerprint = await repository.projectFingerprint();

    const impact = await repository.inspectSceneDelete('chapter-a', 'scene-a');
    expect(impact).toMatchObject({ kind: 'scene', sceneCount: 1, proseCharacters: 4, projectFingerprint: fingerprint });
    expect(impact.sources).toEqual([{ sceneId: 'scene-a', sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/), branches: [] }]);
    const deletedScene = await repository.deleteScenePrimitive('chapter-a', 'scene-a', fingerprint);
    expect(deletedScene.impact.projectFingerprint).toBe(fingerprint);
    fingerprint = deletedScene.fingerprint;
    expect(fingerprint).toBe(await repository.projectFingerprint());
    expect((await repository.readChapter('chapter-a')).scenes).toEqual([]);
    await expect(repository.deleteScenePrimitive('chapter-b', 'scene-b', fingerprint)).rejects.toThrow(/last valid scene landing/);

    const deletedChapter = await repository.deleteChapterPrimitive('chapter-a', fingerprint);
    expect(deletedChapter.fingerprint).toBe(await repository.projectFingerprint());
    await expect(readFile(join(root, 'text', 'chapter-a.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'docs', 'chapter-a.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await repository.listChapters()).map((item) => [item.id, item.index])).toEqual([['chapter-b', 1]]);
  });

  it('rolls back every chapter when a project reorder commit faults mid-flight', async () => {
    const root = await temporaryRoot();
    let armed = false;
    let cleanupFault = true;
    const repository = new TextRepository(root, {
      beforeProjectCommitStep(_step, chapterId, phase) {
        if (armed && phase === 'apply' && chapterId === 'chapter-a') throw new Error('injected project commit fault');
        if (armed && phase === 'cleanup' && cleanupFault) {
          cleanupFault = false;
          throw new Error('injected cleanup fault after rollback');
        }
      },
    });
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-a'));
    await repository.appendScene('chapter-b', scene('scene-b'));
    const fingerprint = await repository.projectFingerprint();
    armed = true;

    const reorder = repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-b', sceneIds: ['scene-b'] },
        { chapterId: 'chapter-a', sceneIds: ['scene-a'] },
      ],
    });
    await expect(reorder).rejects.toThrow(/injected project commit fault/);
    expect((await repository.listChapters()).map((item) => [item.id, item.index])).toEqual([
      ['chapter-a', 1], ['chapter-b', 2],
    ]);
    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.listChapters()).map((item) => [item.id, item.index])).toEqual([
      ['chapter-a', 1], ['chapter-b', 2],
    ]);
  });

  it('recovers a prepared journal after rollback itself faults and process reopens', async () => {
    const root = await temporaryRoot();
    let armed = false;
    let restoreFault = true;
    const repository = new TextRepository(root, {
      beforeProjectCommitStep(_step, chapterId, phase) {
        if (armed && phase === 'apply' && chapterId === 'chapter-a') throw new Error('apply fault');
        if (armed && phase === 'restore' && chapterId === 'chapter-a' && restoreFault) {
          restoreFault = false;
          throw new Error('restore fault');
        }
      },
    });
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-a'));
    await repository.appendScene('chapter-b', scene('scene-b'));
    const fingerprint = await repository.projectFingerprint();
    armed = true;

    await expect(repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-b', sceneIds: ['scene-b'] },
        { chapterId: 'chapter-a', sceneIds: ['scene-a'] },
      ],
    })).rejects.toThrow(/recovery remains pending/);

    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.listChapters()).map((item) => [item.id, item.index])).toEqual([
      ['chapter-a', 1], ['chapter-b', 2],
    ]);
    await expect(readFile(join(root, 'text', '.project-uow-journal'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('finalizes committed journal cleanup after restart without rolling back truth', async () => {
    const root = await temporaryRoot();
    let armed = false;
    let cleanupFault = true;
    const repository = new TextRepository(root, {
      beforeProjectCommitStep(_step, _chapterId, phase) {
        if (armed && phase === 'cleanup' && cleanupFault) {
          cleanupFault = false;
          throw new Error('cleanup fault');
        }
      },
    });
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-a'));
    await repository.appendScene('chapter-b', scene('scene-b'));
    const fingerprint = await repository.projectFingerprint();
    armed = true;
    await repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-b', sceneIds: ['scene-b'] },
        { chapterId: 'chapter-a', sceneIds: ['scene-a'] },
      ],
    });

    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.listChapters()).map((item) => [item.id, item.index])).toEqual([
      ['chapter-b', 1], ['chapter-a', 2],
    ]);
  });

  it('serializes two repository instances that target the same project path', async () => {
    const root = await temporaryRoot();
    let armed = false;
    let releaseApply = (): void => {};
    let signalApplyStarted = (): void => {};
    const applyGate = new Promise<void>((resolve) => { releaseApply = resolve; });
    const applyStarted = new Promise<void>((resolve) => { signalApplyStarted = resolve; });
    const first = new TextRepository(root, {
      async beforeProjectCommitStep(_step, chapterId, phase) {
        if (armed && phase === 'apply' && chapterId === 'chapter-b') {
          signalApplyStarted();
          await applyGate;
        }
      },
    });
    await first.open();
    await first.createChapter(chapter('chapter-a', 1));
    await first.createChapter(chapter('chapter-b', 2));
    await first.appendScene('chapter-a', scene('scene-a'));
    await first.appendScene('chapter-b', scene('scene-b'));
    const second = new TextRepository(root);
    await second.open();
    const fingerprint = await first.projectFingerprint();
    armed = true;
    const reorder = first.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-b', sceneIds: ['scene-b'] },
        { chapterId: 'chapter-a', sceneIds: ['scene-a'] },
      ],
    });
    await applyStarted;
    let secondWriteSettled = false;
    const secondWrite = second.updateChapterMetadata(
      'chapter-a',
      { title: 'must-not-commit' },
      fingerprint,
    ).then(
      () => ({ status: 'resolved' as const, message: '' }),
      (error: unknown) => ({ status: 'rejected' as const, message: error instanceof Error ? error.message : String(error) }),
    ).finally(() => { secondWriteSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondWriteSettled).toBe(false);
    releaseApply();
    await reorder;
    expect(await secondWrite).toMatchObject({ status: 'rejected', message: expect.stringMatching(/Stale .*project fingerprint/) });
    expect((await second.listChapters()).map((item) => [item.id, item.index])).toEqual([
      ['chapter-b', 1], ['chapter-a', 2],
    ]);
  });

  it('replays committed mirror work durably when outbox publication was interrupted', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.appendScene('chapter-a', scene('scene-a1', 'A1'));
    await repository.appendScene('chapter-a', scene('scene-a2', 'A2'));
    const outboxPath = join(root, 'text', '.mirror-outbox');
    await mkdir(outboxPath);
    const fingerprint = await repository.projectFingerprint();
    await repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [{ chapterId: 'chapter-a', sceneIds: ['scene-a2', 'scene-a1'] }],
    });
    expect(await readFile(join(root, 'text', '.project-uow-journal'), 'utf8')).toContain('"phase": "committed"');

    await rm(outboxPath, { recursive: true, force: true });
    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.readChapter('chapter-a')).scenes.map((item) => [item.id, item.index])).toEqual([
      ['scene-a2', 0], ['scene-a1', 1],
    ]);
    expect(await readFile(join(root, 'docs', 'chapter-a.md'), 'utf8')).toContain('场景 1 · scene-a2-summary');
    await expect(readFile(join(root, 'text', '.project-uow-journal'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(outboxPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    if (process.platform === 'win32') await expect(readFile(join(root, 'text', '.fsync-barrier'), 'utf8')).resolves.toBe('');
  });

  it('serializes active reads against later writes', async () => {
    const queue = new ChapterWriteQueue(await temporaryRoot());
    await queue.open();
    let releaseRead = (): void => {};
    let signalReadStarted = (): void => {};
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const readStarted = new Promise<void>((resolve) => { signalReadStarted = resolve; });
    let writeStarted = false;
    const reading = queue.read(async () => {
      signalReadStarted();
      await readGate;
      return 'snapshot';
    });
    await readStarted;
    const writing = queue.enqueue(async () => { writeStarted = true; });
    await Promise.resolve();
    expect(writeStarted).toBe(false);
    releaseRead();
    await expect(reading).resolves.toBe('snapshot');
    await writing;
    expect(writeStarted).toBe(true);
  });

  it('fails closed on project-wide duplicate scene IDs in legacy-compatible files', async () => {
    const repository = new TextRepository(await temporaryRoot());
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-duplicate'));
    await repository.appendScene('chapter-b', scene('scene-duplicate'));
    const fingerprint = await repository.projectFingerprint();
    await expect(repository.reorderProject({
      expectedFingerprint: fingerprint,
      chapters: [
        { chapterId: 'chapter-a', sceneIds: ['scene-duplicate'] },
        { chapterId: 'chapter-b', sceneIds: ['scene-duplicate'] },
      ],
    })).rejects.toThrow(/Duplicate scene id across project/);
    await expect(repository.inspectSceneDelete('chapter-a', 'scene-duplicate')).rejects.toThrow(/Duplicate scene id across project/);
  });

  it('persists single-chapter create and scene-update mirror intents across reopen', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await rm(join(root, 'docs'), { recursive: true, force: true });
    await writeFile(join(root, 'docs'), 'blocked mirror directory', 'utf8');

    await repository.createChapter(chapter('chapter-a', 1));
    expect(await readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).toContain('"chapterId": "chapter-a"');
    await repository.appendScene('chapter-a', scene('scene-a', 'before'));
    const fingerprint = await repository.projectFingerprint();
    await repository.updateSceneMetadata('chapter-a', 'scene-a', { summary: 'after-reopen' }, fingerprint);
    expect(await readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).toContain('"operation": "write"');

    await rm(join(root, 'docs'), { force: true });
    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.readChapter('chapter-a')).scenes[0].summary).toBe('after-reopen');
    expect(await readFile(join(root, 'docs', 'chapter-a.md'), 'utf8')).toContain('after-reopen');
    await expect(readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the newest write/delete mirror action across repository instances', async () => {
    const root = await temporaryRoot();
    const first = new TextRepository(root);
    await first.open();
    await first.createChapter(chapter('chapter-a', 1));
    await first.createChapter(chapter('chapter-b', 2));
    await first.appendScene('chapter-a', scene('scene-a'));
    await first.appendScene('chapter-b', scene('scene-b'));
    const second = new TextRepository(root);
    await second.open();
    const mirrorPath = join(root, 'docs', 'chapter-a.md');
    await rm(mirrorPath, { force: true });
    await mkdir(mirrorPath);

    await first.updateChapterMetadata('chapter-a', { title: 'failed-write' }, await first.projectFingerprint());
    expect(first.pendingMirrors()).toContainEqual(expect.objectContaining({ operation: 'write', chapterId: 'chapter-a' }));
    await second.deleteChapterPrimitive('chapter-a', await second.projectFingerprint());
    expect(first.pendingMirrors()).toContainEqual(expect.objectContaining({ operation: 'delete', chapterId: 'chapter-a' }));
    expect(await readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).toContain('"operation": "delete"');

    await first.createChapterAt({
      id: 'chapter-a',
      index: 2,
      title: 'new-write',
      pov: 'lin',
      status: 'draft',
    }, await first.projectFingerprint());
    expect(second.pendingMirrors()).toContainEqual(expect.objectContaining({ operation: 'write', chapterId: 'chapter-a' }));
    expect(await readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).toContain('"operation": "write"');

    await rm(mirrorPath, { recursive: true, force: true });
    expect(await second.flushPendingMirrors()).toBe(1);
    expect(await readFile(mirrorPath, 'utf8')).toContain('# new-write');
    expect(first.pendingMirrors()).toHaveLength(0);
  });

  it('retries Markdown tombstone deletion through the typed mirror outbox after reopen', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter(chapter('chapter-a', 1));
    await repository.createChapter(chapter('chapter-b', 2));
    await repository.appendScene('chapter-a', scene('scene-a'));
    await repository.appendScene('chapter-b', scene('scene-b'));
    const mirrorPath = join(root, 'docs', 'chapter-a.md');
    await rm(mirrorPath, { force: true });
    await mkdir(mirrorPath);
    const fingerprint = await repository.projectFingerprint();
    await repository.deleteChapterPrimitive('chapter-a', fingerprint);
    expect(repository.pendingMirrors()).toContainEqual(expect.objectContaining({ operation: 'delete', chapterId: 'chapter-a' }));
    expect(await readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).toContain('"operation": "delete"');

    await rm(mirrorPath, { recursive: true, force: true });
    await writeFile(mirrorPath, 'stale mirror', 'utf8');
    const reopened = new TextRepository(root);
    await reopened.open();
    expect(reopened.pendingMirrors()).toHaveLength(0);
    await expect(readFile(mirrorPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'text', '.mirror-outbox'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
