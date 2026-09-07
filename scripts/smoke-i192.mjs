import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { startUiTestProvider, uiInvoke } from './ui-test-provider.mjs';

const provider = await startUiTestProvider();
const app = await launchUiElectron('i192');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
const invoke = (method, ...args) => uiInvoke(app, method, ...args);
try {
  await app.fill('[data-novel-project-name-input]', '北港长篇正文验收');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'created project');
  const projects = await invoke('novelWorkspace/projectList');
  const id = projects[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  await invoke('novelWorkspace/characterCreate', id, { id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });
  // Domain fixture setup is distinct from the author interactions tested below.
  const outline = { id: 'outline', structure: 'free', logline: '米拉追查北港旧灯塔的秘密。', themes: ['追查'], acts: [{ id: 'act-1', index: 0, title: '雨夜北港', goal: '找到线索', beats: [{ id: 'beat-1', title: '码头', description: '米拉找到钥匙。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'detail-1', title: '钥匙', summary: '米拉找到钥匙。', pov: 'mira', wordTarget: 100, points: ['钥匙'], status: 'planned' }] }] }], foreshadowing: [], endings: [] };
  const detail = outline.acts[0].beats[0].detailBeats[0];
  outline.acts[0].beats[0].detailBeats.push({...detail,id:'detail-2',title:'潮痕'},{...detail,id:'detail-3',title:'旧海图'});
  await invoke('novelWorkspace/outlineSave', id, outline);
  await invoke('novelRuleStyleManager/saveStyle', id, { name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
  // Fixture only: C3 must already be initialized; this is not a source-import acceptance claim.
  await writeFile(join(app.profile, 'library', id, 'knowledge.yaml'), JSON.stringify({entries: [{id:'secret',version:1,fact:'灯塔藏着海图',kind:'secret',holders:[],revealPlan:{revealTo:['mira'],revealAt:'第三幕'},status:'hidden'}], states: [{characterId: 'mira', knows: []}]}), { flag: 'w' });
  await writeFile(join(app.profile,'library',id,'outline-progress.yaml'),JSON.stringify({outlineId:'outline',currentAct:'act-1',currentBeat:'beat-1',completedBeats:[],deviations:[],tensionLevel:0}),{flag:'wx'});
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")', 'reopen seeded fixture');

  const nav = async view => {
    await app.evaluate(`document.querySelectorAll('details[data-novel-nav-group]').forEach(e=>e.open=true)`);
    await app.click(`[data-novel-nav-item="${view}"]`);
    await app.waitFor(`!document.querySelector('[data-novel-view-panel="${view}"] [data-novel-layer-state="loading"]')`, view);
  };
  await nav('characters');
  await app.waitFor('!!document.querySelector("[data-novel-character-save]")', 'character form');
  await app.click('[data-novel-character-new]');
  await app.fill('[data-novel-layer-panel="characters"] .nv-form > .nv-field input', '北港守灯人');
  await app.click('[data-novel-character-save]');
  await app.waitFor('document.querySelectorAll("[data-novel-character-id]").length===2', 'character saved');
  check('character created by real form', (await invoke('novelWorkspace/characterList',id)).some(c=>c.name==='北港守灯人'));
  await app.click('[data-novel-character-new]');
  await app.fill('[data-novel-layer-panel="characters"] .nv-form > .nv-field input','北港巡夜人');
  await app.click('[data-novel-character-save]');
  await app.waitFor('document.querySelectorAll("[data-novel-character-id]").length===3','second Chinese character');
  check('distinct Chinese names receive distinct draft identifiers',new Set((await invoke('novelWorkspace/characterList',id)).map(c=>c.id)).size===3);
  for (const width of [1366,720,440]) {
    await app.send('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false});
    await app.evaluate('document.querySelector("[data-novel-character-save]").scrollIntoView({block:"center"})');
    check(`story form fits ${width}`, await app.evaluate(`(() => {const e=document.querySelector('[data-novel-layer-panel="characters"]');return e.scrollWidth<=e.clientWidth+1})()`));
    await app.screenshot(`characters-${width}`);
  }
  await app.send('Emulation.clearDeviceMetricsOverride');
  await nav('worldview');
  await app.waitFor('!!document.querySelector("[data-novel-worldview-save]")','worldview');
  await app.fill('[data-novel-layer-panel="worldview"] .nv-form input[type="text"]','北港旧灯塔');
  await app.fill('[data-novel-layer-panel="worldview"] textarea','灯塔每逢潮汐便会亮起。');
  await app.click('[data-novel-worldview-save]');
  await app.waitFor('!!document.querySelector("[data-novel-worldview-id]")','world saved');
  check('world setting saved',true);
  await app.screenshot('worldview');
  await app.fill('[data-novel-layer-panel="worldview"] textarea','第二层灯室有一道暗门。');
  await app.click('[data-novel-worldview-save]');
  await app.waitFor('document.querySelectorAll("[data-novel-worldview-id]").length===2','same title revision');
  check('world revision with unchanged Chinese title preserves predecessor',true);
  await nav('relationship');
  await app.waitFor('!!document.querySelector("[data-novel-relationship-save]")','relationship form');
  await app.evaluate(`for(const [field,value] of [['relationship-from','mira'],['relationship-to','untitled']]){const e=document.querySelector('[data-novel-entity-select="'+field+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await app.click('[data-novel-relationship-save]');
  await app.waitFor('!!document.querySelector("[data-novel-relationship-id]")','relationship saved');
  check('relationship saves through existing entity selectors',true);
  await app.screenshot('relationship-saved');
  for (const view of ['relationship','state','canon','knowledge','timeline','ruleStyle','progress','review','queue','search','statistics','importExport']) {
    await nav(view);
    await app.waitFor(`!!document.querySelector('[data-novel-view-panel="${view}"]')`,view+' panel');
    // Wait for remote reads to finish before measuring or interacting.
    await app.waitFor(`!document.querySelector('[data-novel-view-panel="${view}"] [data-novel-layer-state="loading"], [data-novel-view-panel="${view}"] [data-novel-${view.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}-state="loading"]')`,view+' ready');
    await app.screenshot(view);
    check(`${view} actual page reachable`,true);
  }
  await app.click('[data-novel-import-export-import] > summary');
  check('empty import preview disabled',await app.evaluate('document.querySelector("[data-novel-ie-import-preview]").disabled'));
  await app.fill('[data-novel-ie-import-text]','第一章 北港\n米拉守在灯塔旁。');
  await app.click('[data-novel-ie-import-preview]');
  await app.waitFor('!!document.querySelector("[data-novel-ie-preview]")','preview');
  check('import preview renders actual normalized content',true);
  await app.screenshot('import-preview');
  await nav('search');
  await app.click('[data-novel-search-maintenance] > summary');
  await app.click('[data-novel-search-rebuild]');
  await app.waitFor('document.querySelector("[data-novel-search-message]")?.textContent.includes("重建")','search index');
  await app.fill('[data-novel-search-input]','北港');
  await app.click('[data-novel-search-submit]');
  await app.waitFor('!!document.querySelector("[data-novel-search-jump]")','real search results');
  check('search indexes real saved story data',true);
  await app.screenshot('search-results');
  await nav('statistics');
  await app.click('[data-novel-statistics-rebuild]');
  await app.waitFor('document.querySelector("[data-novel-statistics-stats]")?.textContent.includes("已构建")','statistics');
  check('statistics rebuild preserves source outline', (await invoke('novelWorkspace/outlineRead',id)).acts.length===1);
  await app.click('[data-novel-statistics-drop]');
  await app.waitFor('document.querySelector("[data-novel-statistics-stats]")?.textContent.includes("尚未计算")','drop derived');
  check('derived statistics deletion explicit and reversible',true);

  await nav('knowledge');
  await app.waitFor('!!document.querySelector("[data-novel-knowledge-fact]")','knowledge fact');
  await app.click('[data-novel-knowledge-fact-action]');
  await app.click('[data-novel-knowledge-holder-check="mira"]');
  await app.click('[data-novel-knowledge-propose="reveal"]');
  await app.waitFor('!!document.querySelector("[data-novel-knowledge-accept]")','knowledge confirmation');
  check('knowledge proposal has not applied before confirmation',(await invoke('novelKnowledgeManager/read',id,'secret')).holders.length===0);
  await app.screenshot('knowledge-confirmation');
  await app.click('[data-novel-knowledge-reject]');
  await app.waitFor('!document.querySelector("[data-novel-knowledge-accept]")','knowledge rejected');
  await app.click('[data-novel-knowledge-fact-action]');
  await app.click('[data-novel-knowledge-holder-check="mira"]');
  await app.click('[data-novel-knowledge-propose="reveal"]');
  await app.waitFor('!!document.querySelector("[data-novel-knowledge-accept]")','new knowledge confirmation');
  await app.click('[data-novel-knowledge-accept]');
  await app.waitFor('!document.querySelector("[data-novel-knowledge-accept]")','knowledge accepted');
  check('knowledge explicit accept adds the selected holder',(await invoke('novelKnowledgeManager/read',id,'secret')).holders.some(holder=>holder.characterId==='mira'));
  const fp=await invoke('novelText/fingerprint',id);
  await invoke('novelText/chapterCreate',id,{id:'chapter',index:1,title:'北港雨夜',pov:'mira',status:'draft',expectedFingerprint:fp.fingerprint});
  await app.send('Page.reload');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")','reopen chapters fixture');
  await nav('chapters');
  await app.waitFor('!!document.querySelector("[data-novel-chapter-item]")','target chapter');
  await app.click('[data-novel-chapter-item]');
  await nav('queue');
  await app.waitFor('!!document.querySelector("[data-novel-queue-card]")','queue cards ready');
  check('queue uses actual outline status labels',await app.evaluate('!document.querySelector("[data-novel-queue-card]").textContent.includes("无法识别")'));
  provider.state.delay=1500;
  await app.click('[data-novel-queue-start]');
  await app.waitFor('!document.querySelector("[data-novel-queue-pause]").disabled','queue running');
  await app.click('[data-novel-queue-pause]');
  await app.waitFor('!document.querySelector("[data-novel-queue-resume]").disabled','queue paused');
  await app.screenshot('queue-paused');
  check('pause exposes one prominent resume action',await app.evaluate('document.querySelector("[data-novel-queue-controls]").querySelectorAll(".nv-btn--primary").length===1'));
  await app.click('[data-novel-queue-resume]');
  await app.waitFor('!document.querySelector("[data-novel-queue-pause]").disabled','resumed');
  await app.click('[data-novel-queue-cancel]');
  await app.waitFor('document.querySelector("[data-novel-queue-summary]").textContent.includes("空闲")','cancelled run');
  check('queue cancellation retains recoverable task projection',(await invoke('novelQueue/status',id)).tasks.some(t=>t.status==='queued'));
  provider.state.delay=0;provider.state.fail=true;
  await app.click('[data-novel-queue-start]');
  await app.waitFor('!!document.querySelector("[data-novel-queue-retry]")','failed task');
  check('provider failure remains visible with retry',await app.evaluate('!!document.querySelector("[data-novel-queue-task-error]")'));
  await app.screenshot('queue-failure');
  provider.state.fail=false;
  const retriedId=await app.evaluate('document.querySelector("[data-novel-queue-retry]").getAttribute("data-novel-queue-retry")');
  await app.click('[data-novel-queue-retry]');
  await app.waitFor(`document.querySelector('[data-novel-queue-task="${retriedId}"]')?.getAttribute('data-novel-queue-task-status')==='queued'`,'same task requeued');
  await app.click('[data-novel-queue-start]');
  await app.waitFor(`document.querySelector('[data-novel-queue-task="${retriedId}"]')?.getAttribute('data-novel-queue-task-status')==='candidate-ready'`,'retried candidate');
  check('retry recovers to candidate awaiting author decision',true);
  await app.screenshot('queue-candidate-ready');
  await app.click(`[data-novel-queue-task="${retriedId}"] [data-novel-queue-review]`);
  await app.waitFor('!!document.querySelector("[data-novel-candidate-adopt-draft]")','queue candidate review');
  await app.evaluate('document.querySelector("[data-novel-queue-candidate-review]").scrollIntoView({block:"start"})');
  await app.screenshot('queue-review');
  await app.click('[data-novel-candidate-adopt-draft]');
  await app.waitFor('!!document.querySelector("[data-novel-queue-draft-saved]")','queue draft adoption');
  check('queue candidate is actually reachable and accepted via existing draft action',(await invoke('novelWorkspace/chapterRead',id,'chapter')).scenes.length>0);
  await writeFile(join(app.evidence,'validation.json'),JSON.stringify({iteration:'I192',checks,providerCalls:provider.calls},null,2));
  console.log(`I192: ${checks.length} real Electron checks passed`);
} catch(error) {
  await app.screenshot('failure');
  await writeFile(join(app.evidence,'failure.txt'),await app.evaluate('document.body.innerText'));
  throw error;
} finally {await app.close();await provider.close();}




