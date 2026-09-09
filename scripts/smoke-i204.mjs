import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';

const app = await launchUiElectron('i204');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '编辑保存回归');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelWorkspace/characterCreate', id, { id: 'hero', name: '旧名', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen fixture');
  await app.click('[data-novel-nav-item="characters"]');
  await app.waitFor('!!document.querySelector("[data-novel-character-id=hero]")', 'character list');
  await app.click('[data-novel-character-id="hero"]');
  const nameInput = '[data-novel-layer-panel="characters"] .nv-editor__detail input';
  await app.evaluate(`document.querySelector(${JSON.stringify(nameInput)}).select()`);
  await app.fill(nameInput, '新名字');
  await app.click('[data-novel-character-save]');
  await app.waitFor('document.querySelector("[data-novel-character-id=hero]")?.textContent==="新名字"', 'saved name');
  assert.equal((await invoke('novelWorkspace/characterRead', id, 'hero')).name, '新名字');
  const characterPath = join(app.profile, 'library', id, 'characters', 'hero.yaml');
  assert.match(await readFile(characterPath, 'utf8'), /新名字/);
  await app.screenshot('character-saved');

  await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-modes]")', 'chapters');
  await app.click('[data-novel-chapter-mode="materials"]');
  await app.waitFor('!!document.querySelector("[data-novel-management-state=ready]")', 'management');
  await app.click('[data-novel-chapter-create]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent.includes("请填写章节标题")', 'title validation');
  await app.fill('[data-novel-management-input="chapter-title"]', '第一章');
  await app.click('[data-novel-chapter-create]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent.includes("请选择视角角色")', 'pov validation');
  assert.equal((await invoke('novelWorkspace/chapterList', id)).length, 0);
  await app.screenshot('required-pov');
  await app.evaluate(`(() => { const e=document.querySelector('[data-novel-entity-select="chapter-pov"]'); e.value='hero'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await app.click('[data-novel-chapter-create]');
  await app.waitFor('document.querySelector("[data-novel-management-message]")?.textContent.includes("章节已创建")', 'chapter saved');
  const chapters = await invoke('novelWorkspace/chapterList', id);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, '第一章');
  assert.equal(chapters[0].pov, 'hero');
  await app.screenshot('chapter-created');
  // Reopen the repository through the shipped bridge, then read the persisted owners.
  await invoke('novelWorkspace/projectOpen', id);
  assert.equal((await invoke('novelWorkspace/characterRead', id, 'hero')).name, '新名字');
  assert.equal((await invoke('novelWorkspace/chapterList', id))[0].title, '第一章');
  const invalid = await app.evaluate(`window.novelDesktop.invoke('novel-creation-tool/novelWorkspace/characterUpdate', [${JSON.stringify(id)}, 'hero', {id:'changed',name:'bad'}])`);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'invalid-arguments');
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['character rename preserves ID and persists to disk', 'empty title and POV leave C5 empty', 'chapter creation with renamed POV', 'repository reopen retains edits', 'strict IPC rejects immutable ID'] }, null, 2));
  process.stdout.write('I204 Electron editor save and required-field validation passed\n');
} finally { await app.close(); }
