import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const prompts = [];
const provider = await startUiTestProvider(prompt => {
  if (!prompt.startsWith('你是长篇小说章节写作器。')) return undefined;
  prompts.push(prompt);
  return { kind: 'prose', output: '沈砚核对铜钥匙的刻痕，陆青收起证物。他们离开了钟楼。' };
});
const app = await launchUiElectron('i214');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '场景卡上下文回归');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  for (const [characterId, name, kind] of [['hero', '沈砚', 'protagonist'], ['ally', '陆青', 'supporting']]) {
    await invoke('novelWorkspace/characterCreate', id, { id: characterId, name, aliases: [], kind, personality: '沉着审慎', background: '曾任钟楼档案员', motivation: '查明真相', goals: ['保护同伴'], flaws: [], abilities: [], speechStyle: '言辞简短', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });
  }
  await invoke('novelWorkspace/outlineSave', id, { id: 'outline', structure: 'free', logline: '调查', themes: [], acts: [{ id: 'act', index: 0, title: '雨夜', goal: '调查钟楼', beats: [{ id: 'beat', title: '调查', description: '寻找线索', charactersInvolved: ['hero', 'ally'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
    { id: 'earlier-planned', title: '不应误选的计划卡', summary: '不应进入当前正文提示词的旧计划', pov: 'hero', wordTarget: 100, points: [], status: 'planned' },
    { id: 'active-card', title: '雨夜取证', summary: '沈砚与陆青在钟楼寻找铜钥匙。', pov: 'hero', wordTarget: 800, points: ['核对钥匙刻痕', '保留证物'], status: 'writing' },
  ] }] }], foreshadowing: [], endings: [] });
  await invoke('novelRuleStyleManager/saveStyle', id, { name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
  // Only isolated smoke state is seeded on disk; production UI / strict IPC owns the action under test.
  await writeFile(join(app.profile, 'library', id, 'knowledge.yaml'), JSON.stringify({ entries: [], states: [{ characterId: 'hero', knows: [] }] }));
  await writeFile(join(app.profile, 'library', id, 'outline-progress.yaml'), JSON.stringify({ outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 }));
  const { fingerprint } = await invoke('novelText/fingerprint', id);
  const created = await invoke('novelText/chapterCreate', id, { id: 'chapter', index: 1, title: '第一章', pov: 'hero', status: 'draft', expectedFingerprint: fingerprint });
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen fixture');
  await app.click('[data-novel-nav-item="ruleStyle"]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-new]")', 'rules');
  await app.click('[data-novel-rule-new]');
  await app.fill('[data-novel-rule-edit-statement]', '不得让铜钥匙凭空消失。');
  await app.click('[data-novel-rule-save]');
  await app.waitFor('document.querySelectorAll("[data-novel-rule-item]").length===1', 'saved rule');
  const outlineBefore = await readFile(join(app.profile, 'library', id, 'outline.yaml'), 'utf8');
  if (!await app.evaluate('document.querySelector("[data-novel-nav-group=advanced]").open')) await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-item]")', 'chapter');
  await app.click('[data-novel-chapter-item]');
  await app.click('[data-novel-chapter-mode="candidate"]');
  await app.click('[data-novel-candidate-propose-scene-card]');
  await app.waitFor('!!document.querySelector("[data-novel-candidate-state=ready], [data-novel-candidate-state=error]")', 'candidate');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-candidate-state=error]")?.textContent ?? null'), null);
  assert.equal(prompts.length, 1);
  const prompt = prompts[0];
  for (const expected of ['当前细纲场景卡 ID: active-card', '雨夜取证', '沈砚与陆青在钟楼寻找铜钥匙。', '核对钥匙刻痕', '保留证物', '目标字数: 800', '当前视角角色姓名: 沈砚', '"name":"沈砚"', '"name":"陆青"', '"kind":"protagonist"', '曾任钟楼档案员', '言辞简短', '不得让铜钥匙凭空消失。', '## Style', '不得擅自改名']) assert.ok(prompt.includes(expected), expected);
  assert.ok(!prompt.includes('不应误选的计划卡'));
  assert.ok(!prompt.includes('agent-fallback-card'));
  const traces = join(app.profile, 'cache', 'llm-traces');
  const inputs = (await readdir(traces)).filter(name => name.endsWith('.input.txt'));
  const archivedInputs = await Promise.all(inputs.map(name => readFile(join(traces, name), 'utf8')));
  const matching = archivedInputs.filter(input => input.includes('当前细纲场景卡 ID: active-card'));
  assert.equal(matching.length, 1);
  const archived = matching[0];
  assert.ok(archived.includes(prompt));
  assert.ok(!archived.includes('test-only-not-a-real-key'));
  assert.equal((await invoke('novelText/fingerprint', id)).fingerprint, created.fingerprint);
  assert.equal(await readFile(join(app.profile, 'library', id, 'outline.yaml'), 'utf8'), outlineBefore);
  await app.screenshot('scene-card-context');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['real Renderer scene-card action through strict IPC', 'writing card before earlier planned card', 'saved card target preserved', 'B3 names and profiles + B1/B4 reach HTTP provider', 'full input TXT matches actual prompt without credential', 'unaccepted candidate leaves B5/C5 unchanged'] }, null, 2));
  process.stdout.write('I214 Electron: actual card and character context reach provider and input TXT; zero B5/C5 writes\n');
} finally { await app.close(); await provider.close(); }
