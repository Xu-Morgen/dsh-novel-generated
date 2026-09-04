import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers, DESKTOP_MANAGED_PATH, type DesktopProjectHandlerOptions } from './project-handlers.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(options: DesktopProjectHandlerOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'novel-i175-main-'));
  roots.push(root);
  const paths = await createDesktopPaths({ userDataRoot: root });
  const opened: string[] = [];
  return { paths, opened, handlers: createDesktopProjectHandlers(paths, (directory) => opened.push(directory), options) };
}

async function invoke(handlers: ReadonlyMap<string, (...args: readonly unknown[]) => unknown>, methodId: string, args: readonly unknown[] = []) {
  return desktopIpcRegistry.invoke(methodId, args, handlers.get(methodId));
}

describe('I175 Main project and settings handlers', () => {
  it('keeps two projects isolated and revalidates every explicit project id', async () => {
    const { handlers } = await fixture();
    for (const input of [{ projectId: 'alpha', name: '甲书' }, { projectId: 'beta', name: '乙书' }]) {
      expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [input])).toMatchObject({ ok: true, value: { id: input.projectId, name: input.name } });
    }
    const alpha = await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['alpha']);
    const beta = await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['beta']);
    expect(alpha).toMatchObject({ ok: true, value: { project: { id: 'alpha', name: '甲书' } } });
    expect(beta).toMatchObject({ ok: true, value: { project: { id: 'beta', name: '乙书' } } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['../alpha'])).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', [42])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('keeps archives non-openable until restore', async () => {
    const { handlers } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'archived', name: '归档书' }]);
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectArchive', ['archived']);
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['archived'])).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectArchiveList')).toMatchObject({ ok: true, value: [{ id: 'archived' }] });
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectRestore', ['archived']);
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['archived'])).toMatchObject({ ok: true, value: { project: { id: 'archived' } } });
  });

  it('routes C5 text editing and branches through Main-owned consumers', async () => {
    const { handlers } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'c5', name: 'C5' }]);
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['c5']);
    const initialState = await invoke(handlers, 'novel-creation-tool/novelWorkspace/stateSnapshots', ['c5']);
    const initialFingerprint = await invoke(handlers, 'novel-creation-tool/novelText/fingerprint', ['c5']);
    const expectedFingerprint = (initialFingerprint as { ok: true; value: { fingerprint: string } }).value.fingerprint;
    await expect(invoke(handlers, 'novel-creation-tool/novelText/chapterCreate', ['c5', {
      id: 'chapter-1', index: 1, title: '第一章', pov: 'hero', status: 'draft', expectedFingerprint,
    }])).resolves.toMatchObject({ ok: true, value: { chapter: { id: 'chapter-1', sceneCount: 0 } } });
    const afterChapter = await invoke(handlers, 'novel-creation-tool/novelText/fingerprint', ['c5']);
    const sceneFingerprint = (afterChapter as { ok: true; value: { fingerprint: string } }).value.fingerprint;
    await expect(invoke(handlers, 'novel-creation-tool/novelText/sceneCreate', ['c5', {
      chapterId: 'chapter-1', index: 0,
      scene: { id: 'scene-1', content: 'abc', summary: '开场', beats: [], canonEvents: [], notes: '' },
      expectedFingerprint: sceneFingerprint,
    }])).resolves.toMatchObject({ ok: true, value: { chapterId: 'chapter-1', scene: { id: 'scene-1' } } });
    await expect(invoke(handlers, 'novel-creation-tool/novelWorkspace/chapterList', ['c5'])).resolves.toMatchObject({
      ok: true, value: [{ id: 'chapter-1', sceneCount: 1 }],
    });
    await expect(invoke(handlers, 'novel-creation-tool/novelWorkspace/sceneEdit', [
      'c5', 'chapter-1', 'scene-1', { start: 0, end: 3 }, 'xyz', createHash('sha256').update('abc').digest('hex'),
    ])).resolves.toMatchObject({ ok: true, value: { scene: { id: 'scene-1', content: 'xyz' } } });
    const branchSave = await invoke(handlers, 'novel-creation-tool/novelBranches/save', ['c5', 'chapter-1', 'scene-1', 'before-final']);
    expect(branchSave).toMatchObject({ ok: true, value: { content: 'xyz' } });
    const branchId = (branchSave as { ok: true; value: { branches: Array<{ id: string }> } }).value.branches[0].id;
    await expect(invoke(handlers, 'novel-creation-tool/novelBranches/chooseFresh', [
      'c5', 'chapter-1', 'scene-1', branchId, createHash('sha256').update('xyz').digest('hex'),
    ])).resolves.toMatchObject({ ok: true, value: { content: 'xyz' } });
    const finalState = await invoke(handlers, 'novel-creation-tool/novelWorkspace/stateSnapshots', ['c5']);
    expect(finalState).toEqual(initialState);
  });

  it('opens a controlled Main path but returns only the locked opaque path marker', async () => {
    const { handlers, opened, paths } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'safe', name: '安全书' }]);
    const response = await invoke(handlers, 'novel-creation-tool/novelWorkbenchSettings/openProjectFolder', ['safe']);
    expect(response).toEqual({ ok: true, value: { opened: true, path: DESKTOP_MANAGED_PATH } });
    expect(opened).toEqual([paths.projectDirectory('safe')]);
    expect(JSON.stringify(response)).not.toContain(paths.libraryRoot);
    expect(await readFile(join(paths.libraryRoot, 'safe', 'project.yaml'), 'utf8')).toContain('安全书');
  });
});

describe('I178 Main review, repair, queue, and reference handlers', () => {
  it('routes bounded projections and reports long-operation progress', async () => {
    const { handlers } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'i178', name: 'I178' }]);
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['i178']);
    const progress: unknown[] = [];
    const context = { signal: new AbortController().signal, reportProgress: (value: unknown) => progress.push(value) };
    const review = await desktopIpcRegistry.invoke('novel-creation-tool/novelReview/scan', ['i178', undefined], handlers.get('novel-creation-tool/novelReview/scan'), context);
    expect(review).toMatchObject({ ok: true, value: { projectId: 'i178', issues: [], summary: { total: 0 } } });
    expect(progress).toEqual([{ phase: 'review.scan', status: 'running' }, { phase: 'review.scan', status: 'complete' }]);
    expect(await invoke(handlers, 'novel-creation-tool/novelReview/records', ['i178'])).toEqual({ ok: true, value: [] });
    expect(await invoke(handlers, 'novel-creation-tool/novelQueue/status', ['i178'])).toMatchObject({ ok: true, value: { projectId: 'i178', tasks: [] } });
    expect(await invoke(handlers, 'novel-creation-tool/novelQueue/pause', ['i178'])).toMatchObject({ ok: true, value: { projectId: 'i178' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelReferenceAudit/list', ['i178', undefined])).toMatchObject({ ok: true, value: { records: [] } });
    expect(await invoke(handlers, 'novel-creation-tool/novelReferenceCorrection/pending', ['i178'])).toEqual({ ok: true, value: [] });
    expect(await invoke(handlers, 'novel-creation-tool/novelReview/adjudicate', ['i178', { decision: 'continue', issueIds: [] }])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });
});

describe('I179 Main source import handlers', () => {
  it('keeps native file access in Main and routes normalized source review by strict identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i179-main-'));
    roots.push(root);
    const paths = await createDesktopPaths({ userDataRoot: root });
    const sourcePath = join(root, 'source.docx');
    const invalidPath = join(root, 'source.txt');
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>idea text</w:t></w:r></w:p><w:p><w:r><w:t>second line</w:t></w:r></w:p></w:body></w:document>';
    await writeFile(sourcePath, Buffer.from(zipSync({
      'word/document.xml': strToU8(documentXml),
      '[Content_Types].xml': strToU8('<Types/>'),
    })));
    await writeFile(invalidPath, 'not a docx');
    let selectedPath = sourcePath;
    const handlers = createDesktopProjectHandlers(paths, () => {}, { selectDocxFile: async () => selectedPath });
    await expect(invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'i179', name: 'I179' }])).resolves.toMatchObject({ ok: true });

    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/selectDocx', [{ unexpected: true }])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    const selected = await invoke(handlers, 'novel-creation-tool/novelWorkspace/selectDocx');
    expect(selected).toMatchObject({ ok: true, value: { fileName: 'source.docx', text: 'idea text\n\nsecond line', chunks: [{ index: 0 }] } });
    expect(JSON.stringify(selected)).not.toContain(sourcePath);
    const selectedValue = (selected as { ok: true; value: Record<string, unknown> }).value;
    expect(selectedValue).not.toHaveProperty('c3');
    expect(selectedValue).not.toHaveProperty('c4');
    expect(selectedValue).not.toHaveProperty('pov');

    const normalized = await invoke(handlers, 'novel-creation-tool/novelImportExport/normalizeSource', ['i179', { fileName: 'notes.txt', format: 'txt', text: '  idea\n\n  plan  ' }]);
    expect(normalized).toMatchObject({ ok: true, value: { projectId: 'i179', fileName: 'notes.txt', chunks: [{ index: 0 }] } });
    expect((normalized as { ok: true; value: { text: string } }).value.text).toContain('idea');
    expect((normalized as { ok: true; value: { text: string } }).value.text).toContain('plan');
    const sourceHash = (normalized as { ok: true; value: { sourceHash: string } }).value.sourceHash;
    const paragraphDecisions = [{ paragraphId: 'paragraph-0001', decision: 'pending', summary: 'awaiting author review' }];
    const created = await invoke(handlers, 'novel-creation-tool/novelImportInterpretation/create', [{
      projectId: 'i179', sourceHash, intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions,
    }]);
    expect(created).toMatchObject({ ok: true, value: { projectId: 'i179', sourceHash, status: 'draft' } });
    const importSessionId = (created as { ok: true; value: { importSessionId: string } }).value.importSessionId;
    expect(await invoke(handlers, 'novel-creation-tool/novelImportInterpretation/read', [{ projectId: 'i179', importSessionId, sourceHash }])).toMatchObject({ ok: true, value: { status: 'draft' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelImportInterpretation/read', [{ projectId: 'other', importSessionId, sourceHash }])).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelImportInterpretation/discard', [{ projectId: 'i179', importSessionId, sourceHash }])).toMatchObject({ ok: true, value: { status: 'discarded' } });

    selectedPath = invalidPath;
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/selectDocx')).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
  });
});
