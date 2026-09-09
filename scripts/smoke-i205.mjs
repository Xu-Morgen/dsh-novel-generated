import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const provider = await startUiTestProvider();
const app = await launchUiElectron('i205');
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '正文缺规则恢复');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  await invoke('novelWorkspace/characterCreate', id, { id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });
  await invoke('novelWorkspace/outlineSave', id, { id: 'outline', structure: 'free', logline: '调查', themes: [], acts: [{ id: 'act', index: 0, title: '雨夜', goal: '调查', beats: [{ id: 'beat', title: '调查', description: '寻找线索', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card', title: '线索', summary: '找到线索', pov: 'mira', wordTarget: 100, points: [], status: 'planned' }] }] }], foreshadowing: [], endings: [] });
  await invoke('novelRuleStyleManager/saveStyle', id, { name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
  // Fixture-only narrative state; the author workflow under test begins with an initialized outline and empty chapter.
  await writeFile(join(app.profile, 'library', id, 'knowledge.yaml'), JSON.stringify({ entries: [], states: [{ characterId: 'mira', knows: [] }] }));
  await writeFile(join(app.profile, 'library', id, 'outline-progress.yaml'), JSON.stringify({ outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 }));
  const { fingerprint } = await invoke('novelText/fingerprint', id);
  const created = await invoke('novelText/chapterCreate', id, { id: 'chapter', index: 1, title: '第一章', pov: 'mira', status: 'draft', expectedFingerprint: fingerprint });
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen fixture');
  await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-item]")', 'chapter');
  await app.click('[data-novel-chapter-item]');
  await app.click('[data-novel-chapter-mode="materials"]');
  await app.waitFor('!!document.querySelector("[data-novel-scene-management-help]")', 'scene help');
  assert.match(await app.evaluate('document.querySelector("[data-novel-scene-management-help]").textContent'), /不必先新建空场景/);
  assert.ok(await app.evaluate('document.querySelector("[data-novel-reconciliation-read]").disabled'));
  assert.match(await app.evaluate('document.querySelector("[data-novel-reconciliation-no-options]").textContent'), /不影响首次生成正文/);
  await app.screenshot('materials-help');
  await app.click('[data-novel-chapter-mode="candidate"]');
  for (const mode of ['continue', 'scene-card']) {
    await app.click(`[data-novel-candidate-propose-${mode}]`);
    await app.waitFor('document.querySelector("[data-novel-candidate-state=error]")?.textContent.includes("没有已启用的规则")', 'actionable missing rules');
  }
  assert.equal(provider.calls.length, 0);
  assert.equal((await invoke('novelText/fingerprint', id)).fingerprint, created.fingerprint);
  await app.screenshot('missing-rules');
  await app.click('[data-novel-nav-item="ruleStyle"]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-new]")', 'rules');
  await app.click('[data-novel-rule-new]');
  await app.fill('[data-novel-rule-edit-statement]', '角色行动不得违背已确定的世界事实。');
  await app.click('[data-novel-rule-save]');
  await app.waitFor('document.querySelectorAll("[data-novel-rule-item]").length===1', 'rule saved');
  if (!await app.evaluate('document.querySelector("[data-novel-nav-group=advanced]").open')) await app.click('[data-novel-nav-group="advanced"] > summary');
  await app.click('[data-novel-nav-item="chapters"]');
  await app.click('[data-novel-chapter-item]');
  await app.click('[data-novel-chapter-mode="candidate"]');
  for (const mode of ['continue', 'scene-card']) {
    await app.click(`[data-novel-candidate-propose-${mode}]`);
    await app.waitFor('!!document.querySelector("[data-novel-candidate-state=ready]")', 'candidate ready');
    await app.screenshot(`recovered-${mode}`);
    await app.click('[data-novel-candidate-reject]');
    await app.waitFor('!!document.querySelector("[data-novel-candidate-state=done]")', 'candidate rejected');
  }
  assert.equal((await invoke('novelText/fingerprint', id)).fingerprint, created.fingerprint);
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ passed: true, checks: ['materials optional help', 'empty reconciliation cannot be read', 'both writing intents show missing rules with zero model calls', 'save active rule through UI', 'both intents recover to reviewable candidates without precreating scenes', 'unaccepted candidates leave prose unchanged'] }, null, 2));
  process.stdout.write('I205 Electron: missing rules diagnosed, rule saved, both writing candidates recovered, zero prose writes\n');
} finally { await app.close(); await provider.close(); }
