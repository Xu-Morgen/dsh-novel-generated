import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';

const app = await launchUiElectron('i213');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '场景列表刷新验收'); await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  const { fingerprint } = await invoke('novelText/fingerprint', id);
  await invoke('novelText/chapterCreate', id, { id: 'chapter', index: 1, title: '第一章', pov: 'hero', status: 'draft', expectedFingerprint: fingerprint });
  await app.send('Page.reload'); await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen');
  await app.click('[data-novel-nav-group="advanced"] > summary');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-nav-item=queue]")?.getClientRects().length ?? 0'), 0);
  await app.click('[data-novel-nav-item=chapters]'); await app.waitFor('!!document.querySelector("[data-novel-chapter-item]")', 'chapters');
  await app.click('[data-novel-chapter-item]'); await app.click('[data-novel-chapter-mode=materials]');
  await app.waitFor('!!document.querySelector("[data-novel-management-state=ready]")', 'ready');
  for (const summary of ['雨夜开场', '清晨出发']) {
    await app.fill('[data-novel-management-input=scene-summary]', summary);
    await app.click('[data-novel-scene-create]');
    await app.waitFor(`Array.from(document.querySelectorAll('[data-novel-scene-item]')).some(e=>e.textContent.includes(${JSON.stringify(summary)}))`, 'new scene visible without selecting chapter');
  }
  assert.equal(await app.evaluate('document.querySelectorAll("[data-novel-scene-item]").length'), 2);
  assert.equal((await invoke('novelWorkspace/chapterRead', id, 'chapter')).scenes.length, 2);
  await app.screenshot('scenes-refreshed');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['queue navigation hidden', 'two scenes appear without chapter reselection', 'scenes saved locally'] }, null, 2));
  process.stdout.write('I213 Electron: queue entry hidden; scenes refresh without chapter reselection passed\n');
} finally { await app.close(); }
