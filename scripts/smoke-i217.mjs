import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const prompts = [];
const provider = await startUiTestProvider(prompt => { prompts.push(prompt); return { kind: 'parser', output: JSON.stringify({ ops: [] }) }; });
const app = await launchUiElectron('i217');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '整章定稿回归');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  for (const [chapterId, index] of [['chapter', 1], ['next', 2]]) {
    await invoke('novelText/chapterCreate', id, { id: chapterId, index, title: index === 1 ? '第一章：抵达' : '第二章：追踪', pov: 'hero', status: 'draft', expectedFingerprint: (await invoke('novelText/fingerprint', id)).fingerprint });
  }
  const contents = ['', '巴士在公路边停下。\n\n道恩拿起行李，走向镇口。', '镇上的灯亮了。\n\n他沿着街道走进夜色。'];
  for (let index = 0; index < contents.length; index++) {
    await invoke('novelText/sceneCreate', id, { chapterId: 'chapter', index, scene: { id: `scene-${index}`, content: contents[index], summary: index ? `摘要 ${index}` : '', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: (await invoke('novelText/fingerprint', id)).fingerprint });
  }
  // Isolated smoke fixture only. Production Main parsers and strict bridge own all tested actions.
  await writeFile(join(app.profile, 'library', id, 'knowledge.yaml'), JSON.stringify({ entries: [], states: [] }));
  await invoke('novelWorkspace/outlineSave', id, { id: 'outline', structure: 'free', logline: '抵达小镇', themes: [], foreshadowing: [], endings: [], acts: [{ id: 'act', index: 0, title: '开场', goal: '抵达', beats: [
    { id: 'beat', title: '抵达', description: '走进小镇', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
      { id: 'card-1', title: '下车', summary: '下车', pov: 'hero', wordTarget: 100, points: [], status: 'done' },
      { id: 'card-2', title: '进镇', summary: '进镇', pov: 'hero', wordTarget: 100, points: [], status: 'done' },
    ] },
    { id: 'next-beat', title: '追踪', description: '寻找线索', charactersInvolved: [], conflictType: 'external', prerequisites: ['beat'], optional: false, detailBeats: [
      { id: 'next-card', title: '线索', summary: '调查', pov: 'hero', wordTarget: 100, points: [], status: 'planned' },
    ] },
  ] }] });
  await writeFile(join(app.profile, 'library', id, 'outline-progress.yaml'), JSON.stringify({ outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 }));
  for (const index of [1, 2]) await invoke('novelSceneOutlineBinding/save', id, { sceneId: `scene-${index}`, detailBeatId: `card-${index}`, expectedFingerprint: (await invoke('novelSceneOutlineBinding/read', id)).fingerprint });
  const before = await invoke('novelWorkspace/chapterManuscript', { projectId: id, chapterId: 'chapter' });
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen');
  if (!await app.evaluate('document.querySelector("[data-novel-nav-group=advanced]").open')) await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-item=chapter]")', 'chapter list');
  await app.click('[data-novel-chapter-item="chapter"]');
  await app.waitFor('document.querySelectorAll("[data-novel-chapter-prose-scene]").length===2', 'all chapter prose');
  assert.deepEqual(await app.evaluate('[...document.querySelectorAll("[data-novel-chapter-prose-scene]")].map(node=>node.dataset.novelChapterProseScene)'), ['scene-1', 'scene-2']);
  assert.equal(await app.evaluate('document.querySelector("[data-novel-chapter-analyze]").disabled'), false);
  assert.ok(await app.evaluate('document.querySelector("[data-novel-chapter-empty-scenes]").textContent.includes("1")'));
  await app.screenshot('whole-chapter');
  await app.click('[data-novel-chapter-analyze]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-finalize]") || document.querySelector("[data-novel-chapter-finalization-state=error]")', 'analysis');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-chapter-finalization-state=error]")?.textContent ?? null'), null);
  assert.equal(prompts.length, 5);
  for (const prompt of prompts) for (const content of contents.slice(1)) {
    for (const paragraph of content.split('\n\n')) assert.ok(prompt.includes(paragraph), 'all prose reaches each parser');
  }
  assert.deepEqual(await invoke('novelWorkspace/chapterManuscript', { projectId: id, chapterId: 'chapter' }), before);
  await app.screenshot('chapter-confirmation');
  await app.click('[data-novel-chapter-finalize-cancel]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-finalization-state=ready]")', 'cancel');
  assert.deepEqual(await invoke('novelWorkspace/chapterManuscript', { projectId: id, chapterId: 'chapter' }), before);
  await app.click('[data-novel-chapter-analyze]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-finalize]")', 'reanalyze');
  await app.click('[data-novel-chapter-finalize]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-next]") || !!document.querySelector("[data-novel-chapter-finalization-state=partial-failure]")', 'finalization');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-chapter-finalization-state=partial-failure]")?.textContent ?? null'), null);
  const after = await invoke('novelWorkspace/chapterManuscript', { projectId: id, chapterId: 'chapter' });
  assert.equal(after.status, 'canon');
  assert.deepEqual(after.scenes, before.scenes);
  const progress = parseYaml(await readFile(join(app.profile, 'library', id, 'outline-progress.yaml'), 'utf8'));
  assert.deepEqual(progress.completedBeats, ['beat']);
  assert.equal(progress.currentBeat, 'next-beat');
  await app.click('[data-novel-chapter-next]');
  await app.waitFor('document.querySelector("[data-novel-chapter-manuscript] h3")?.textContent === "第二章：追踪"', 'next chapter');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-chapter-analyze]").disabled'), true);
  await invoke('novelText/sceneCreate', id, { chapterId: 'next', index: 0, scene: { id: 'next-scene', content: '他找到了第一条线索。', summary: '', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: (await invoke('novelText/fingerprint', id)).fingerprint });
  await app.click('[data-novel-chapter-item="next"]');
  await app.waitFor('document.querySelector("[data-novel-chapter-analyze]")?.disabled === false', 'next prose');
  await app.click('[data-novel-chapter-analyze]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-finalize]")', 'last chapter analysis');
  await app.click('[data-novel-chapter-finalize]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-next]")', 'last chapter done');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-chapter-next]").textContent'), '创建下一章');
  await app.click('[data-novel-chapter-next]');
  await app.waitFor('!!document.querySelector("[data-novel-management-input=chapter-title]")', 'create next chapter form');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-management-input=chapter-title]").value'), '');
  assert.equal((await invoke('novelWorkspace/chapterList', id)).length, 2);
  const malformed = await app.evaluate(`window.novelDesktop.invoke('novel-creation-tool/novelWorkspace/chapterAnalyze', [{projectId:${JSON.stringify(id)},chapterId:'chapter',candidateId:'forged'}])`);
  assert.equal(malformed.ok, false); assert.equal(malformed.error.code, 'invalid-arguments');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['reopened saved whole chapter', 'empty first scene explicit', 'all prose to five parsers', 'cancel zero domain writes', 'one confirmation chapter canon and prose unchanged', 'bound completed beat advances C6', 'next chapter navigation', 'empty chapter disabled', 'last chapter opens creation without auto creating', 'strict extra field rejected'] }, null, 2));
  process.stdout.write('I217 Electron whole chapter read / analyze / cancel / confirm / next passed\n');
} finally { await app.close(); await provider.close(); }
