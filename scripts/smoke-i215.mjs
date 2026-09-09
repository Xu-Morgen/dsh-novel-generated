import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const prompts = [];
const provider = await startUiTestProvider(prompt => {
  if (!prompt.startsWith('你是长篇小说章节写作器。') && !prompt.startsWith('你是长篇小说续写 agent。')) return undefined;
  prompts.push(prompt);
  return { kind: 'prose', output: '沈砚核对铜钥匙的刻痕，陆青收起证物。他们离开了钟楼。' };
});
const app = await launchUiElectron('i215');
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
  await invoke('novelWorkspace/outlineSave', id, { id: 'outline', structure: 'free', logline: '调查', themes: [], acts: [{ id: 'act', index: 0, title: '雨夜', goal: '未来幕目标：远征海岛', beats: [{ id: 'beat', title: '调查', description: '未来节事件：镇长举办晚宴', charactersInvolved: ['hero', 'ally'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
    { id: 'earlier-planned', title: '不应误选的计划卡', summary: '不应进入当前正文提示词的旧计划', pov: 'hero', wordTarget: 100, points: [], status: 'planned' },
    { id: 'active-card', title: '雨夜取证', summary: '沈砚与陆青在钟楼寻找铜钥匙。', pov: 'hero', wordTarget: 800, points: ['核对钥匙刻痕', '保留证物'], status: 'writing' },
  ] }] }], foreshadowing: [], endings: [] });
  await invoke('novelRuleStyleManager/saveStyle', id, { name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
  // Only isolated smoke state is seeded on disk; production UI / strict IPC owns the action under test.
  await writeFile(join(app.profile, 'library', id, 'knowledge.yaml'), JSON.stringify({ entries: [], states: [{ characterId: 'hero', knows: [] }] }));
  await writeFile(join(app.profile, 'library', id, 'outline-progress.yaml'), JSON.stringify({ outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 }));
  const { fingerprint } = await invoke('novelText/fingerprint', id);
  const created = await invoke('novelText/chapterCreate', id, { id: 'chapter', index: 1, title: '第一章', pov: 'hero', status: 'draft', expectedFingerprint: fingerprint });
  const ending = '最新已保存结尾：陆青把灯递给沈砚，等待他的回答。';
  const saved = '沈砚已经取得铜钥匙。' + '已发生的旧事。'.repeat(1100) + ending;
  const savedScene = await invoke('novelText/sceneCreate', id, { chapterId: 'chapter', index: 0, scene: { id: 'saved-scene', content: saved, summary: '沈砚已经取得铜钥匙', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: created.fingerprint });
  const future = await invoke('novelText/chapterCreate', id, { id: 'future', index: 2, title: '后章', pov: 'hero', status: 'draft', expectedFingerprint: savedScene.fingerprint });
  await invoke('novelText/sceneCreate', id, { chapterId: 'future', index: 0, scene: { id: 'future-scene', content: 'FUTURE_CHAPTER_MUST_NOT_APPEAR', summary: '后章摘要', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: future.fingerprint });
  const before = await invoke('novelText/fingerprint', id);
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
  for (const omitted of ['未来节事件', '未来幕目标', '## Outline', '大纲指令:', 'FUTURE_CHAPTER_MUST_NOT_APPEAR']) assert.ok(!prompt.includes(omitted), omitted);
  assert.ok(prompt.includes(ending));
  assert.ok(prompt.includes('[truncated]'));
  assert.ok(prompt.includes('沈砚已经取得铜钥匙'));
  assert.ok(prompt.includes('本次唯一待写剧情范围'));
  await app.click('[data-novel-candidate-reject]');
  await app.waitFor('!!document.querySelector("[data-novel-candidate-state=done]")', 'rejected');
  await app.click('[data-novel-candidate-propose-continue]');
  await app.waitFor('!!document.querySelector("[data-novel-candidate-state=ready], [data-novel-candidate-state=error]")', 'continuation');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-candidate-state=error]")?.textContent ?? null'), null);
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].includes(ending));
  assert.ok(!prompts[1].includes('FUTURE_CHAPTER_MUST_NOT_APPEAR'));
  const traces = join(app.profile, 'cache', 'llm-traces');
  const inputs = (await readdir(traces)).filter(name => name.endsWith('.input.txt'));
  const archivedInputs = await Promise.all(inputs.map(name => readFile(join(traces, name), 'utf8')));
  const matching = archivedInputs.filter(input => input.includes('当前细纲场景卡 ID: active-card'));
  assert.equal(matching.length, 1);
  const archived = matching[0];
  assert.ok(archived.includes(prompt));
  assert.ok(!archived.includes('test-only-not-a-real-key'));
  assert.ok(archivedInputs.some(input => input.includes(prompts[1])));
  assert.equal((await invoke('novelText/fingerprint', id)).fingerprint, before.fingerprint);
  assert.equal(await readFile(join(app.profile, 'library', id, 'outline.yaml'), 'utf8'), outlineBefore);
  await app.screenshot('scene-card-context');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['single target card, no future beat description', 'saved long chapter tail retained with explicit truncation', 'both scene-card and continue exclude later chapters', 'characters and full card retained', 'both actual HTTP prompts archived', 'unaccepted candidate leaves B5/C5 unchanged'] }, null, 2));
  process.stdout.write('I215 Electron: single card without beat prose; both intents retain saved ending, exclude future chapters, archive inputs, zero writes\n');
} finally { await app.close(); await provider.close(); }
