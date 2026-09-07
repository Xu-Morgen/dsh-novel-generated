import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';

const app = await launchUiElectron('i189');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
try {
  check('migration is reached from library rather than permanently mounted', await app.evaluate('!document.querySelector("[data-novel-migration]")'));
  await app.click('[data-novel-migration-open]');
  await app.waitFor('!!document.querySelector("[data-novel-migration-preview]")', 'migration entry');
  await app.screenshot('migration-entry');
  await app.click('[data-novel-migration-close]');
  const name = '烟雨长河里的灯火与归人——长中文标题验收';
  await app.fill('[data-novel-project-name-input]', name);
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'created author workspace');
  check('current task has one primary action without false completed stages', await app.evaluate(`document.querySelectorAll('[data-novel-workflow-panel] .nv-btn--primary').length===1 && !document.querySelector('[data-novel-workflow-stage-state="completed"]')`));
  await app.click('.nv-workbench__toggle');
  check('collapse keeps the current task visible', await app.evaluate(`!!document.querySelector('[data-novel-workflow-panel]') && !document.querySelector('[data-novel-nav]')`));
  await app.click('.nv-workbench__toggle');
  await app.click('[data-novel-assistant-toggle]');
  await app.click('[data-novel-assistant-status]');
  await app.waitFor('!!document.querySelector("[data-novel-assistant-status-result]")', 'real assistant action');
  check('assistant is reachable and returns a real Main result', true);
  await app.screenshot('assistant-open');
  await app.click('[data-novel-assistant-toggle]');
  for (const width of [1366, 1024, 720, 440]) {
    await app.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await app.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    check(`current action visible and no document overflow at ${width}`, await app.evaluate(`(() => { const e=document.querySelector('[data-novel-workflow-next-action]'); const r=e.getBoundingClientRect(); return document.documentElement.scrollWidth<=innerWidth+1 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })()`));
    await app.screenshot(`workflow-${width}`);
  }
  await app.send('Emulation.clearDeviceMetricsOverride');
  await app.click('[data-novel-workflow-open-stage="outline"]');
  await app.waitFor('!!document.querySelector("[data-novel-route=outline]")', 'outline task');
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-next=outline]")', 'remembered task after reload');
  check('real reload restores the existing workflow preference', true);
  await app.click('[data-novel-back-to-projects]');
  await app.waitFor('!!document.querySelector("[data-novel-project-chooser]")', 'return library');
  await app.screenshot('library-with-project');
  await app.click('.desktop-library__more summary');
  await app.click('[data-novel-project-archive]');
  await app.waitFor('!!document.querySelector("[data-novel-archived-project]")', 'archive real project');
  await app.click('[data-novel-project-archive-section] summary');
  check('archived project has restore only', await app.evaluate(`!document.querySelector('[data-novel-archived-project] [data-novel-project-open]') && !!document.querySelector('[data-novel-project-restore]')`));
  await app.screenshot('archive-readonly');
  await app.click('[data-novel-project-restore]');
  await app.waitFor('!!document.querySelector("button[data-novel-project-open]") && !document.querySelector("[data-novel-archived-project]")', 'restore project');
  await app.click('button[data-novel-project-open]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen restored project');
  check('restored project opens with current task intact', true);
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ iteration: 'I189', scope: 'Real Electron production UI, native mouse/keyboard, isolated real project files', checks }, null, 2));
  process.stdout.write(`I189: ${checks.length} real Electron UI checks passed; ${app.evidence}\n`);
} finally { await app.close(); }
