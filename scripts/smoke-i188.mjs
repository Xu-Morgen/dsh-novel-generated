import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';

const app = await launchUiElectron('i188');
const checks = [];
function check(name, condition, detail) { assert.ok(condition, name); checks.push({ name, passed: true, detail }); }
try {
  const initial = await app.evaluate(`(() => {
    const root=document.querySelector('[data-novel-desktop-root]');
    const create=document.querySelector('[data-novel-project-create]');
    const cs=getComputedStyle(create);
    return { url:location.protocol, rootCount:document.querySelectorAll('#root').length,
      paper:getComputedStyle(document.body).backgroundColor, ink:getComputedStyle(root).color,
      primary:cs.backgroundColor, buttonHeight:create.getBoundingClientRect().height,
      label:document.querySelector('[data-novel-upload-main-dialog]').textContent,
      outsideWorkbench:!create.closest('.nv-workbench'), node:typeof window.require };
  })()`);
  check('production file entry with single root and no Node', initial.url === 'file:' && initial.rootCount === 1 && initial.node === 'undefined', initial);
  check('directory consumes theme outside workbench', initial.outsideWorkbench && initial.paper === 'rgb(244, 241, 234)' && initial.ink === 'rgb(38, 41, 35)', initial);
  check('shared primary control and Chinese import entry', initial.primary === 'rgb(168, 61, 48)' && initial.buttonHeight >= 40 && initial.label === '导入 DOCX', initial);
  await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const focus = await app.evaluate(`({tag:document.activeElement.tagName, visible:document.activeElement.matches(':focus-visible'), outline:getComputedStyle(document.activeElement).outlineWidth})`);
  check('keyboard focus has a visible outline', focus.visible && focus.outline === '2px', focus);
  await app.screenshot('project-directory');
  await app.fill('[data-novel-project-name-input]', '暖纸验收作品');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-assistant]")', 'created project and actual assistant');
  const assistant = await app.evaluate(`(() => {const e=document.querySelector('[data-novel-assistant-continue]');const s=getComputedStyle(e);return {ink:s.color, background:s.backgroundColor, font:s.fontSize, outside:!e.closest('.nv-workbench')};})()`);
  check('actual assistant inherits shared controls outside workbench', assistant.outside && assistant.background === 'rgb(168, 61, 48)' && assistant.font === '14px', assistant);
  await app.screenshot('created-project');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ iteration: 'I188', scope: 'Production Electron entry, isolated empty userData, real create command and native input. No prototype data.', checks }, null, 2));
  process.stdout.write(`I188: ${checks.length} real Electron UI checks passed; ${app.evidence}\n`);
} finally { await app.close(); }
