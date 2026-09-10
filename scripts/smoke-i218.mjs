import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';
import { startSourceTestProvider, sourceText } from './ui-source-test-provider.mjs';

const samples = JSON.parse(await readFile('samples/rule-style-i218.json', 'utf8'));
const kinds = samples.cases.find(sample => sample.id === 'held-out-invalid').kinds;
let valid = false;
let ruleCalls = 0;
const provider = await startSourceTestProvider(prompt => {
  if (!prompt.includes('一次性 B1 规则与 B4')) return undefined;
  ruleCalls += 1;
  return { kind: 'rule-style', output: JSON.stringify({
    rules: (valid ? ['genre'] : kinds).map((kind, index) => ({ id: `rule-${index}`, scope: 'global', kind, statement: '调查需要线索。', priority: 80, immutable: false, examples: [], active: true })),
    style: { id: 'style-imported', name: '调查文风', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '紧贴角色感知', chapterFormat: '分章', dialogueConventions: '简洁', forbidden: ['提前揭示答案'] },
  }) };
});
const app = await launchUiElectron('i218');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
const select = (selector, value) => app.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
try {
  await app.fill('[data-novel-project-name-input]', '失败后重试验证');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-next-action]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  const before = await invoke('novelRuleStyleManager/list', id);
  await app.click('[data-novel-workflow-next-action]');
  await app.fill('[data-novel-source-import-text]', sourceText);
  await app.click('[data-novel-source-import-submit]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=succeeded]")', 'source');
  await select('[data-novel-import-interpretation-source-role]', 'background-material');
  await select('[data-novel-import-interpretation-treatment]', 'adapt-pov');
  const paragraphs = await app.evaluate('[...document.querySelectorAll("[data-novel-import-interpretation-accept]")].map(e=>e.getAttribute("data-novel-import-interpretation-accept"))');
  for (const paragraph of paragraphs) await app.click(`[data-novel-import-interpretation-accept="${paragraph}"]`);
  await app.click('[data-novel-import-interpretation-confirm]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=failed]")', 'failed terminal state');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-rule-style-import-retry]").disabled'), false);
  const failureText = await app.evaluate('document.querySelector("[data-novel-rule-style-import]").textContent');
  assert.match(failureText, /kind/);
  assert.doesNotMatch(failureText, /等待模型返回首个内容片段/);
  assert.deepEqual(await invoke('novelRuleStyleManager/list', id), before);
  await app.screenshot('failure-retry-enabled');
  valid = true;
  await app.click('[data-novel-rule-style-import-retry]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=succeeded]")', 'retry candidate');
  assert.equal(ruleCalls, 2);
  assert.deepEqual(await invoke('novelRuleStyleManager/list', id), before);
  await app.click('[data-novel-rule-style-import-propose]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=proposed]")', 'review gate');
  assert.deepEqual(await invoke('novelRuleStyleManager/list', id), before);
  await app.click('[data-novel-rule-style-import-accept]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=applied]")', 'applied');
  assert.equal((await invoke('novelRuleStyleManager/list', id)).rules.length, 1);
  await app.screenshot('retry-applied');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ iteration: 'I218', invalidKinds: kinds.length, failedTerminal: true, retryEnabled: true, waitingCleared: true, noEarlyWrites: true, retrySucceeded: true, appliedAfterGate: true, ruleCalls }, null, 2));
  process.stdout.write('I218 Electron: schema failure -> enabled retry -> candidate -> I11 -> applied passed\n');
} finally { await app.close(); await provider.close(); }
