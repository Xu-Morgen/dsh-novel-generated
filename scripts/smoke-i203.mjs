import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';
import { startSourceTestProvider, sourceText } from './ui-source-test-provider.mjs';
import { ONBOARDING_PROMPT_EXAMPLE } from '../src/core/onboarding/example.ts';
const sample = JSON.parse(await readFile('samples/i200/cases.json','utf8'));
const line = (prompt,label) => JSON.parse(prompt.split('\n').find(s=>s.startsWith(label)).slice(label.length));
let firstPatch = true, firstFoundation = true, characterId;
const provider = await startSourceTestProvider(prompt => {
  if(prompt.startsWith('叙事引用受限修正 ')) {
    const issues=line(prompt,'校验错误：');
    const replacements=issues.map(issue=>({path:issue.path,value:issue.code==='unknown-anchor'?issue.allowed[0]:characterId}));
    if(firstPatch) { firstPatch=false; replacements[0]={path:['outline','logline'],value:'must not overwrite narrative'}; }
    return {kind:'repair',output:JSON.stringify({replacements})};
  }
  if(prompt.includes('POV 叙事化候选生成器')) {
    const intent=line(prompt,'已确认叙事意图：'),evidence=line(prompt,'已确认证据段（必须按 paragraphId 回引）：');
    const chars=line(prompt,'允许的角色 ID 与姓名（所有角色引用只能精确选取这些 id，不得重新音译姓名生成 id）：');
    characterId=chars[0].id;
    const o=structuredClone(sample.output),protagonist=intent.protagonistCandidateId;
    o.evidenceParagraphIds=evidence.map(e=>e.paragraphId); o.protagonistCandidate.id=protagonist;
    o.outline.acts[0].beats[0].charactersInvolved=[protagonist,'invented-alias'];
    o.outline.acts[0].beats[0].detailBeats=[];
    return {kind:'adaptation',output:JSON.stringify(o)};
  }
  if(prompt.includes('B5 anchors：')) {
    const intent=line(prompt,'POV 意图：'),evidence=line(prompt,'已确认来源证据：');
    return {kind:'reveal',output:JSON.stringify({confidence:'high',entries:[{id:'secret-one',fact:'旧档案有第二个版本',kind:'secret',holders:[],revealPlan:{revealTo:[intent.protagonistCandidateId],revealAt:'invented-act-beat'},status:'hidden',evidenceParagraphIds:evidence.map(e=>e.paragraphId)}],states:[{characterId:intent.protagonistCandidateId,knows:[]}],rationale:'先调查后揭示'})};
  }
  if(prompt.includes('六层')&&prompt.includes('evidence')) {
    const value=structuredClone(ONBOARDING_PROMPT_EXAMPLE);
    for(const e of Object.values(value.evidence))e.sourceChunkIndex=0;
    if(firstFoundation) {firstFoundation=false;value.layers.relationship.candidates[0].milestones=[value.layers.canon.candidates[0].id];}
    return {kind:'foundation',output:JSON.stringify(value)};
  }
});
const app = await launchUiElectron('i203');
const invoke=(method,...args)=>uiInvoke(app,method,...args);
const select=(selector,value)=>app.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
try {
  await app.fill('[data-novel-project-name-input]', '视角大纲格式验证');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-next-action]")', 'project');
  const id = (await invoke('novelWorkspace/projectList'))[0].id;
  await invoke('novelLlmConfig/save', { baseUrl: provider.endpoint, model: 'ui-deterministic', apiKey: 'test-only-not-a-real-key', maxTokens: 32768, thinking: 'disabled', reasoningEffort: 'low' });
  await app.click('[data-novel-workflow-next-action]');
  await app.fill('[data-novel-source-import-text]', sourceText);
  await app.click('[data-novel-source-import-submit]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=succeeded]")', 'source');
  await select('[data-novel-import-interpretation-source-role]', 'background-material');
  await select('[data-novel-import-interpretation-treatment]', 'adapt-pov');
  const paragraphs = await app.evaluate('[...document.querySelectorAll("[data-novel-import-interpretation-accept]")].map(e=>e.getAttribute("data-novel-import-interpretation-accept"))');
  for (const p of paragraphs) await app.click(`[data-novel-import-interpretation-accept="${p}"]`);
  await app.click('[data-novel-import-interpretation-confirm]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=succeeded]")', 'rules');
  await app.click('[data-novel-rule-style-import-propose]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=proposed]")', 'rules proposal');
  await app.click('[data-novel-rule-style-import-accept]');
  await app.waitFor('!!document.querySelector("[data-novel-rule-style-import-status=applied]")', 'rules accepted');
  await app.click('[data-novel-source-plan-generate]');
  await app.waitFor('document.querySelector("[data-novel-source-plan-error]")?.textContent.includes("计划合并失败：故事资料")','typed merge failure');
  assert.equal(provider.calls.filter(c=>c.kind==='foundation').length,1);
  assert.equal(provider.calls.filter(c=>c.kind==='adaptation').length,1);
  assert.equal(provider.calls.filter(c=>c.kind==='reveal').length,1);
  assert.equal(provider.calls.filter(c=>c.kind==='repair').length,3);
  assert.equal((await invoke('novelWorkspace/characterList',id)).length,0);
  await app.screenshot('merge-failure');
  await app.click('[data-novel-source-plan-generate]');
  await app.waitFor('!!document.querySelector("[data-novel-source-plan=pending]")','recover merge failure');
  assert.equal(provider.calls.filter(c=>c.kind==='foundation').length,2);
  assert.equal(provider.calls.filter(c=>c.kind==='adaptation').length,2);
  assert.equal(provider.calls.filter(c=>c.kind==='reveal').length,2);
  assert.equal(provider.calls.filter(c=>c.kind==='repair').length,5);
  assert.equal((await invoke('novelWorkspace/characterList',id)).length,0);
  const identity=await app.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify('novel-source-plan:'+id)}))`);
  const plan=await invoke('novelNarrativeImportPlan/read',identity);
  const known=new Set(plan.package.characters.candidates.map(c=>c.id));
  for(const act of plan.package.outline.outline.acts)for(const beat of act.beats)assert.ok(beat.charactersInvolved.every(id=>known.has(id)));
  assert.notEqual(plan.package.outline.outline.logline,'must not overwrite narrative');
  const adaptationIdentity={projectId:plan.projectId,importSessionId:plan.importSessionId,sourceHash:plan.sourceHash,adaptationId:'narrative-adaptation-2'};
  assert.equal((await invoke('novelNarrativeAdaptation/repairProgress',adaptationIdentity)).attempt,1);
  const invalid=structuredClone(plan);invalid.package.outline.outline.acts[0].beats[0].charactersInvolved.push('unknown-again');
  const rejected=await app.evaluate(`window.novelDesktop.invoke('novel-creation-tool/novelNarrativeImportPlan/propose', [${JSON.stringify({projectId:plan.projectId,importSessionId:plan.importSessionId,sourceHash:plan.sourceHash,sourceRole:plan.sourceRole,treatment:plan.treatment,narrativeIntent:plan.narrativeIntent,package:invalid.package})}])`);
  assert.equal(rejected.ok,false);assert.ok(rejected.error.message.includes('计划合并失败：大纲'));
  await app.screenshot('repaired-plan');
  await writeFile(join(app.evidence,'validation.json'),JSON.stringify({iteration:'I203',boundedReferenceRepair:true,unauthorizedPatchRejected:true,mergeRetry:true,typedOutlineFailure:true,zeroStoryWrites:true},null,2));
  process.stdout.write('I203 Electron: bound characters, restricted repairs, rejected narrative mutation, merge failure retry, strict IPC and zero writes passed\n');
} finally {await app.close();await provider.close();}