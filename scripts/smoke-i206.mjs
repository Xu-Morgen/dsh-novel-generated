import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';

const app = await launchUiElectron('i206');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
async function files(root) {
  const result = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, await files(path));
    else result[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return result;
}
try {
  await app.fill('[data-novel-project-name-input]', '管理刷新验收');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-modes]")', 'chapters');
  await app.click('[data-novel-chapter-mode="materials"]');
  await app.waitFor('!!document.querySelector("[data-novel-management-state=ready]")', 'initial management read');
  const before = await files(join(app.profile, 'library', id));
  await app.click('[data-novel-chapter-create]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent.includes("请填写章节标题")', 'old mutation error');
  await app.fill('[data-novel-management-input="chapter-title"]', '保留的章节标题');
  await app.click('[data-novel-management-refresh]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent==="管理状态已刷新。"', 'refresh replaces error');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-management-input=chapter-title]").value'), '保留的章节标题');
  assert.equal(await app.evaluate('document.querySelector("[data-novel-management-message]").getAttribute("role")'), 'status');
  await app.click('[data-novel-management-refresh]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent==="管理状态已刷新。"', 'repeat refresh');
  assert.deepEqual(await files(join(app.profile, 'library', id)), before);
  await app.screenshot('refresh-recovered');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['old mutation error replaced after refresh', 'unsaved title retained', 'success announced as status', 'repeat refresh succeeds', 'all project file hashes unchanged'] }, null, 2));
  process.stdout.write('I206 Electron: management refresh clears stale errors, retains input and leaves all project files unchanged\n');
} finally { await app.close(); }
