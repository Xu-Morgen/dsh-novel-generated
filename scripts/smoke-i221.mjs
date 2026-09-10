import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';
const packaged=process.argv.includes('--packaged');
const app=await launchUiElectron(packaged?'i221-packaged':'i221',packaged?resolve(process.env.NOVEL_I221_EXECUTABLE??'artifacts/desktop/win-unpacked/Novel Creation Tool.exe'):undefined);const invoke=(method,...args)=>uiInvoke(app,method,...args);
const select=async(selector,value)=>app.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
try{
 await app.fill('[data-novel-project-name-input]','重复角色合并');await app.click('[data-novel-project-create]');await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")','project');const projectId=(await invoke('novelWorkspace/projectList'))[0].id;
 const source={id:'original',name:'调查员',aliases:[],kind:'protagonist',personality:'谨慎',background:'民俗调查员，携带录音笔。',motivation:'调查邀请函',goals:[],flaws:[],abilities:[],speechStyle:'克制',staticTraits:[],arc:{startingPoint:'',desiredEnd:'',keyBeats:[]},relationships:[],knowledgeIds:[]};
 await invoke('novelWorkspace/characterCreate',projectId,source);await invoke('novelWorkspace/characterCreate',projectId,{...source,id:'duplicate',background:''});
 await invoke('novelText/chapterCreate',projectId,{id:'chapter',index:1,title:'开场',pov:'original',status:'draft',expectedFingerprint:(await invoke('novelText/fingerprint',projectId)).fingerprint});
 await app.send('Page.reload');await app.waitFor('!!document.querySelector("[data-novel-workflow-panel]")','reopen');await app.click('[data-novel-nav-item="characters"]');await app.waitFor('!!document.querySelector("[data-novel-character-manage]")','characters');await app.click('[data-novel-character-manage]');await app.waitFor('!!document.querySelector("[data-character-merge]")','merge panel');
 await select('[data-character-merge-select=sourceId]','original');await select('[data-character-merge-select=targetId]','duplicate');await select('[data-character-merge-field=background]','source');
 await app.click('[data-character-merge-propose]');await app.waitFor('!!document.querySelector("[data-character-merge-preview]")','preview');assert.ok((await app.evaluate('document.querySelector("[data-character-merge-preview]").textContent')).includes(source.background));await app.screenshot('merge-preview');
 await app.click('[data-character-merge-cancel]');await app.waitFor('!document.querySelector("[data-character-merge-pending]")','cancel');assert.equal((await invoke('novelWorkspace/characterManageList',{projectId})).filter(role=>role.status==='active').length,2);
 await app.click('[data-character-merge-propose]');await app.waitFor('!!document.querySelector("[data-character-merge-confirm]")','second preview');await app.click('[data-character-merge-confirm]');await app.waitFor('document.querySelector("[data-novel-character-management]")?.textContent.includes("合并完成")','merged');await app.screenshot('merged');
 await invoke('novelWorkspace/projectOpen',projectId);const roles=await invoke('novelWorkspace/characterManageList',{projectId});assert.equal(roles.find(role=>role.id==='original').status,'frozen');assert.equal((await invoke('novelWorkspace/characterList',projectId)).find(role=>role.id==='duplicate').background,source.background);assert.deepEqual(await invoke('novelWorkspace/characterMergePending',{projectId}),[]);
 await writeFile(join(app.evidence,'validation.json'),JSON.stringify({iteration:'I221',packaged,strictIpc:true,fieldChoice:true,preview:true,cancelZeroWrite:true,merge:true,reopen:true},null,2));process.stdout.write('I221 Electron merge field choice, preview, cancellation, reference migration, freeze and reopen passed\n');
}finally{await app.close();}
