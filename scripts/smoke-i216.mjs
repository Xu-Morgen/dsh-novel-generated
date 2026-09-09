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
const app = await launchUiElectron('i216');
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
    { id: 'next-card', title: '钟楼追问', summary: '沈砚向陆青询问铜钥匙的来历。', pov: 'hero', wordTarget: 900, points: ['不重复取钥匙', '核对来历'], status: 'planned' },
    { id: 'last-card', title: '最后一张', summary: '离开钟楼。', pov: 'hero', wordTarget: 600, points: ['带走证物'], status: 'planned' },
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
  const readOutline = async () => JSON.parse(JSON.stringify(await invoke('novelWorkspace/outlineRead', id)));
  await app.click('[data-novel-candidate-adopt-draft]');
  await app.waitFor('!!document.querySelector("[data-novel-next-card-dialog]")', 'next card dialog');
  const dialog = await app.evaluate('document.querySelector("[data-novel-next-card-dialog]").textContent');
  for (const value of ['钟楼追问', '沈砚向陆青询问铜钥匙的来历。', '不重复取钥匙', '核对来历']) assert.ok(dialog.includes(value));
  let cards = (await readOutline()).acts[0].beats[0].detailBeats;
  assert.equal(cards.find(card => card.id === 'active-card').status, 'done');
  assert.equal(cards.find(card => card.id === 'next-card').status, 'planned');
  const chapter = await invoke('novelWorkspace/chapterRead', id, 'chapter');
  assert.equal(chapter.scenes.length, 1);
  const binding = await readFile(join(app.profile, 'library', id, 'scene-outline-bindings.yaml'), 'utf8');
  assert.ok(binding.includes(chapter.scenes[0].id)); assert.ok(binding.includes('active-card'));
  await app.screenshot('next-card-confirmation');
  await app.click('[data-novel-next-card-confirm]');
  await app.waitFor('!document.querySelector("[data-novel-next-card-dialog]")', 'confirmed');
  cards = (await readOutline()).acts[0].beats[0].detailBeats;
  assert.equal(cards.find(card => card.id === 'next-card').status, 'writing');
  await app.click('[data-novel-chapter-mode="candidate"]');
  await app.click('[data-novel-candidate-propose-scene-card]');
  await app.waitFor('!!document.querySelector("[data-novel-candidate-state=ready]")', 'second candidate');
  assert.ok(prompts.at(-1).includes('当前细纲场景卡 ID: next-card'));
  await app.click('[data-novel-candidate-adopt-draft]');
  await app.waitFor('!!document.querySelector("[data-novel-next-card-dialog]")', 'last card dialog');
  await app.click('[data-novel-next-card-cancel]');
  await app.waitFor('!document.querySelector("[data-novel-next-card-dialog]")', 'cancelled');
  cards = (await readOutline()).acts[0].beats[0].detailBeats;
  assert.equal(cards.find(card => card.id === 'next-card').status, 'done');
  assert.equal(cards.find(card => card.id === 'last-card').status, 'planned');
  assert.equal((await invoke('novelWorkspace/chapterRead', id, 'chapter')).scenes.length, 2);
  const malformed = await app.evaluate(`window.novelDesktop.invoke('novel-creation-tool/novelWorkspace/sceneCardDraftAdopt', [{candidateId:'candidate',detailBeatId:'forged'}])`);
  assert.equal(malformed.ok, false); assert.equal(malformed.error.code, 'invalid-arguments');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['unadopted candidate zero outline writes', 'draft saved then actual input card done and bound', 'dialog contains complete next card content', 'confirm starts next and following generation uses it', 'cancel preserves next planned status and prior draft', 'strict forged card ID rejected'] }, null, 2));
  process.stdout.write('I216 Electron: draft saved, actual input card completed and bound, next-card dialog confirm/cancel passed\n');
} finally { await app.close(); await provider.close(); }
