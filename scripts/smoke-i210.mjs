import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const prompts = [];
const provider = await startUiTestProvider(prompt => { prompts.push(prompt); return undefined; });
const app = await launchUiElectron('i210');
const invoke = async (method, ...args) => {
  if (!/^novelOutlineDetailGeneration\/(generate|append|regenerate)$/.test(method)) return uiInvoke(app, method, ...args);
  // The strict bridge requires the optional settings slot to be present;
  // preserve undefined rather than JSON's null array serialization.
  const result = await app.evaluate(`window.novelDesktop.invoke(${JSON.stringify('novel-creation-tool/' + method)}, [...${JSON.stringify(args)}, undefined])`);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  if (result.value?.ok === false) throw new Error(JSON.stringify(result.value.error));
  return result.value?.ok === true ? result.value.value : result.value;
};
const savedCards = () => JSON.parse(prompts.at(-1).split('\n').find(line => line.startsWith('当前生成范围已保存场景卡：')).slice('当前生成范围已保存场景卡：'.length));
const card = id => ({ id, title: id, summary: `${id} 已保存的摘要`, pov: 'mira', wordTarget: 500, points: ['事实一', '事实二'], status: 'planned' });
const beat = (id, cards) => ({ id, title: id, description: '推进调查', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: cards });
try {
  await app.fill('[data-novel-project-name-input]', '范围卡上下文验收');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  await invoke('novelWorkspace/outlineSave', id, { id: 'outline', structure: 'free', logline: '调查', themes: [], foreshadowing: [], endings: [], acts: [
    { id: 'act', index: 0, title: '范围内', goal: '调查', beats: [beat('saved-beat', [card('first'), card('second')]), beat('empty-beat', [])] },
    { id: 'outside', index: 1, title: '范围外', goal: '离开', beats: [beat('outside-beat', [card('excluded')])] },
  ] });
  const path = join(app.profile, 'library', id, 'outline.yaml');
  const before = await readFile(path, 'utf8');
  const candidate = await invoke('novelOutlineDetailGeneration/generate', id, { scope: { kind: 'act', actId: 'act' } });
  assert.deepEqual(savedCards().map(item => item.detailBeat), [card('first'), card('second')]);
  assert.deepEqual(savedCards().map(item => item.position), [0, 1]);
  await invoke('novelOutlineDetailGeneration/regenerate', id, { candidateId: candidate.candidateId, detailBeatId: 'first' });
  assert.deepEqual(savedCards().map(item => item.detailBeat.id), ['first', 'second']);
  await invoke('novelOutlineDetailGeneration/append', id, { mode: 'append-to-selected-beat', beatId: 'saved-beat', guidance: '添加新线索，衔接前两张卡' });
  assert.deepEqual(savedCards().map(item => item.detailBeat.id), ['first', 'second']);
  await invoke('novelOutlineDetailGeneration/generate', id, { scope: { kind: 'outline-beat', beatId: 'empty-beat' } });
  assert.deepEqual(savedCards(), []);
  const { fingerprint } = await invoke('novelText/fingerprint', id);
  const chapter = await invoke('novelText/chapterCreate', id, { id: 'chapter', index: 1, title: '第一章', pov: 'mira', status: 'draft', expectedFingerprint: fingerprint });
  await invoke('novelText/sceneCreate', id, { chapterId: 'chapter', index: 0, scene: { id: 'scene', content: '原文', summary: '', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: chapter.fingerprint });
  const binding = await invoke('novelSceneOutlineBinding/read', id);
  await invoke('novelSceneOutlineBinding/save', id, { sceneId: 'scene', detailBeatId: 'second', expectedFingerprint: binding.fingerprint });
  const bound = await invoke('novelOutlineDetailGeneration/generate', id, { scope: { kind: 'bound-chapter', chapterId: 'chapter' } });
  await invoke('novelOutlineDetailGeneration/regenerate', id, { candidateId: bound.candidateId, detailBeatId: 'second' });
  assert.deepEqual(savedCards().map(item => item.detailBeat.id), ['second']);
  assert.equal(await readFile(path, 'utf8'), before);
  assert.equal(prompts.length, 5);
  await writeFile(join(app.evidence, 'prompts.json'), JSON.stringify(prompts, null, 2));
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['Main strict IPC to HTTP provider carries exact saved cards', 'act scope excludes outside act', 'append and regeneration include saved cards', 'empty selected beat sends empty list', 'bound chapter excludes unbound same-beat cards', 'generation leaves outline unchanged'] }, null, 2));
  process.stdout.write('I210 Electron: scope cards reach HTTP provider in all modes; scoped isolation and zero outline writes passed\n');
} finally { await app.close(); await provider.close(); }
