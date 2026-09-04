import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { desktopSaveFileInvocation } from '../file-dialog-contract.js';
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

describe('I180 Main export and OS file handlers', () => {
  it('routes progress, search, statistics, timeline, export, and manuscript consumers through Main owners', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i180-flow-'));
    roots.push(root);
    const paths = await createDesktopPaths({ userDataRoot: root });
    const handlers = createDesktopProjectHandlers(paths, () => {});
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'i180flow', name: 'I180 flow' }]);
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['i180flow']);
    const project = join(paths.libraryRoot, 'i180flow');
    const outline = { id: 'outline', version: 1, structure: 'free', logline: 'A minimal flow', themes: ['trust'], acts: [{ id: 'act-1', index: 0, title: 'Opening', goal: 'Begin', beats: [{ id: 'beat-1', title: 'First beat', description: 'Begin the story', charactersInvolved: [], conflictType: 'internal', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] };
    await writeFile(join(project, 'outline.yaml'), `${JSON.stringify(outline)}\n`, 'utf8');
    await writeFile(join(project, 'knowledge.yaml'), '{"entries":[],"states":[]}\n', 'utf8');
    await writeFile(join(project, 'outline-progress.yaml'), '{"outlineId":"outline","currentAct":"act-1","currentBeat":"beat-1","completedBeats":[],"deviations":[],"tensionLevel":0}\n', 'utf8');

    await expect(invoke(handlers, 'novel-creation-tool/novelOutlineProgress/projection', ['i180flow'])).resolves.toMatchObject({ ok: true, value: { currentBeat: 'beat-1' } });
    await expect(invoke(handlers, 'novel-creation-tool/novelSearch/build', ['i180flow'])).resolves.toMatchObject({ ok: true, value: { indexExists: true } });
    await expect(invoke(handlers, 'novel-creation-tool/novelStatistics/rebuild', ['i180flow'])).resolves.toMatchObject({ ok: true, value: { indexExists: true } });
    await expect(invoke(handlers, 'novel-creation-tool/novelTimeline/read', ['i180flow'])).resolves.toEqual({ ok: true, value: null });
    await expect(invoke(handlers, 'novel-creation-tool/novelImportExport/exportText', ['i180flow', 'txt'])).resolves.toMatchObject({ ok: true, value: { format: 'txt' } });
    await expect(invoke(handlers, 'novel-creation-tool/novelImportExport/compileManuscript', ['i180flow', { format: 'txt' }])).resolves.toMatchObject({ ok: false, error: { code: 'handler-failed' } });
  });

  it('writes through the Main-selected destination without exposing a path and handles cancel/invalid input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i180-main-'));
    roots.push(root);
    const paths = await createDesktopPaths({ userDataRoot: root });
    const target = join(root, 'saved-export.json');
    const handlers = createDesktopProjectHandlers(paths, () => {}, { saveFile: async () => target });
    const saved = await invoke(handlers, desktopSaveFileInvocation.id, [{ fileName: 'i180.json', content: '{"ok":true}', mimeType: 'application/json' }]);
    expect(saved).toEqual({ ok: true, value: { saved: true, fileName: 'saved-export.json' } });
    expect(await readFile(target, 'utf8')).toBe('{"ok":true}');
    expect(JSON.stringify(saved)).not.toContain(root);

    const cancelledHandlers = createDesktopProjectHandlers(paths, () => {}, { saveFile: async () => undefined });
    await expect(invoke(cancelledHandlers, desktopSaveFileInvocation.id, [{ fileName: 'cancel.json', content: '{}' }])).resolves.toEqual({ ok: true, value: { saved: false, fileName: 'cancel.json' } });
    await expect(invoke(handlers, desktopSaveFileInvocation.id, [{ fileName: 'i180.json', content: '{}', unexpected: true }])).resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });
});

describe('I181 Main-owned desktop assistant', () => {
  it('routes open/status/context/inspire through the shared Main composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i181-main-'));
    roots.push(root);
    const paths = await createDesktopPaths({ userDataRoot: root });
    const llm = {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ directions: [
          { id: 'one', title: '方向一', premise: '守住秘密', changes: { outlineNote: '守住', progressNote: '推进' }, rationale: '稳妥' },
          { id: 'two', title: '方向二', premise: '公开真相', changes: { outlineNote: '公开', progressNote: '转折' }, rationale: '激进' },
        ] }) };
      },
    };
    const handlers = createDesktopProjectHandlers(paths, () => {}, { llm });
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'i181', name: 'I181 助手' }]);

    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/status', [undefined])).resolves.toMatchObject({ ok: true, value: { projects: [{ id: 'i181' }] } });
    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/open', ['i181'])).resolves.toMatchObject({ ok: true, value: { project: { id: 'i181' } } });
    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/status', ['i181'])).resolves.toMatchObject({ ok: true, value: { projectId: 'i181', scenes: 0 } });

    const project = join(paths.libraryRoot, 'i181');
    const outline = { id: 'outline', version: 1, structure: 'free', logline: '一场关于秘密的开端', themes: ['trust'], acts: [{ id: 'act-1', index: 0, title: '开场', goal: '开始', beats: [{ id: 'beat-1', title: '第一步', description: '开始故事', charactersInvolved: [], conflictType: 'internal', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] };
    const style = { id: 'style-1', version: 1, name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '准确', chapterFormat: '普通', dialogueConventions: '中文引号', forbidden: [] };
    const rule = { id: 'rule-1', version: 1, scope: 'global', kind: 'genre', statement: '保持叙事一致。', priority: 1, immutable: true, examples: [], active: true };
    await writeFile(join(project, 'outline.yaml'), `${JSON.stringify(outline)}\n`, 'utf8');
    await writeFile(join(project, 'style.yaml'), `${JSON.stringify(style)}\n`, 'utf8');
    await writeFile(join(project, 'rules', 'rule-1.yaml'), `${JSON.stringify(rule)}\n`, 'utf8');
    await writeFile(join(project, 'knowledge.yaml'), '{"entries":[],"states":[{"characterId":"mira","knows":[]}]}\n', 'utf8');
    await writeFile(join(project, 'outline-progress.yaml'), '{"outlineId":"outline","currentAct":"act-1","currentBeat":"beat-1","completedBeats":[],"deviations":[],"tensionLevel":0}\n', 'utf8');

    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/context', ['i181'])).resolves.toMatchObject({ ok: true, value: { projectId: 'i181', navigation: { beatId: 'beat-1' }, currentCard: { id: 'agent-fallback-card' } } });
    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/inspire', ['i181'])).resolves.toMatchObject({ ok: true, value: { directions: [{ id: 'one' }, { id: 'two' }] } });
  });

  it('fails unknown commands and incomplete continue targets without calling the writer', async () => {
    const { handlers } = await fixture();
    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/missing')).resolves.toMatchObject({ ok: false, error: { code: 'unknown-method' } });
    await expect(invoke(handlers, 'novel-creation-tool/novelAssistant/continue', ['demo', 'chapter-only', undefined])).resolves.toMatchObject({ ok: false, error: { code: 'handler-failed' } });
  });
});
