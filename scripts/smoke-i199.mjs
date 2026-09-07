import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';
import { startSourceTestProvider, sourceText } from './ui-source-test-provider.mjs';

const provider = await startSourceTestProvider();
const app = await launchUiElectron('i199');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
const select = (selector, value) => app.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
try {
  await app.fill('[data-novel-project-name-input]', '初始化拒绝诊断');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-next-action]")', 'project');
  const projectId = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  // Reproduce a historical confirmed import with no initialization checkpoint.
  const input = { projectId, sourceHash: 'a'.repeat(64), intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', decision: 'accepted', summary: 'historical seed' }] };
  const first = await invoke('novelImportInterpretation/create', input);
  await invoke('novelImportInterpretation/confirm', { ...input, importSessionId: first.importSessionId });
  await app.click('[data-novel-workflow-next-action]');
  await app.fill('[data-novel-source-import-text]', sourceText);
  await app.click('[data-novel-source-import-submit]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=succeeded]")', 'source');
  await select('[data-novel-import-interpretation-source-role]', 'background-material');
  await select('[data-novel-import-interpretation-treatment]', 'adapt-pov');
  const paragraphs = await app.evaluate('[...document.querySelectorAll("[data-novel-import-interpretation-accept]")].map(e => e.getAttribute("data-novel-import-interpretation-accept"))');
  for (const p of paragraphs) await app.click(`[data-novel-import-interpretation-accept="${p}"]`);
  await app.click('[data-novel-import-interpretation-confirm]');
  await app.waitFor('document.querySelector("[data-novel-rule-style-import]")?.textContent.includes("此作品此前已确认过导入")', 'known refusal reaches Renderer');
  assert.equal(await app.evaluate('!!document.querySelector("[data-novel-rule-style-stream]")'), false);
  assert.equal(await app.evaluate('!!document.querySelector("[data-novel-rule-style-import-retry]")'), false);
  assert.equal(await app.evaluate('document.body.textContent.includes("test-only-not-a-real-key")'), false);
  await app.screenshot('initialization-refusal');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ iteration: 'I199', realElectronIpc: true, historicalFirstImport: true, localizedRefusal: true, waiting: false, retry: false, secretEcho: false }, null, 2));
  process.stdout.write('I199 real Electron IPC: historical first import rejection displayed without waiting or secret echo\n');
} finally { await app.close(); await provider.close(); }
