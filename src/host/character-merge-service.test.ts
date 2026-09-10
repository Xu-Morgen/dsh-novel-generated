import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { ONBOARDING_PROMPT_EXAMPLE as example } from '../core/onboarding/example.js';
import { createCharacterService } from './character-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOutlineService } from './outline-service.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createStateService } from './state-service.js';
import { createRelationshipService } from './relationship-service.js';
import { createTimelineService } from './timeline-service.js';
import { createTextService } from './text-service.js';
import { createCharacterMergeService } from './character-merge-service.js';
import { mergeCharacterKnowledge } from '../core/characters/merge.js';
import type { CharacterMergeInput } from '../app/character-merge-contract.js';

it('I221 merge uses real owners, explicit fields/knowledge, I11, failure recovery and durable completion',async()=>{
 const root=await mkdtemp(join(tmpdir(),'i221-'));
 try{
  const projectId='book';await new ProjectRepository(root).createProject({projectId,name:'Book'});
  const characters=createCharacterService(root),confirmation=createConfirmationService(root),outline=createOutlineService(root),knowledge=createKnowledgeService(root),state=createStateService(root),relationship=createRelationshipService(root),text=createTextService(root),timeline=createTimelineService(outline,root);
  await Promise.all([characters.open(projectId),confirmation.open(projectId),outline.open(projectId),knowledge.open(projectId),relationship.open(projectId),text.open(projectId),state.open(projectId,{...example.layers.state.candidates[0]!,version:1})]);
  const source=example.layers.characters.candidates[0]!;await characters.create(projectId,source);await characters.create(projectId,{...source,id:'duplicate',background:'空白履历'});
  await characters.create(projectId,example.layers.characters.candidates[1]!);
  await outline.save(projectId,example.layers.outline.candidates[0]!);const initialTimeline=await timeline.ensureFromOutline(projectId);
  initialTimeline.nodes[0]!.reveals=[{entryId:'source-secret',revealTo:['mira','duplicate']}];await timeline.save(projectId,initialTimeline);
  const edge={id:'edge',from:'mira',to:'laozhou',type:'friendship' as const,affinity:30,trust:40,status:'hidden',milestones:[],knownTo:['mira','duplicate']};await relationship.saveAll(projectId,[edge]);
  const fact=(id:string,holder:string)=>({id,version:1,fact:id,kind:'secret' as const,holders:[holder],revealPlan:{revealTo:[],revealAt:'later'},status:'hidden' as const});
  await knowledge.saveAll(projectId,[fact('source-secret','mira'),fact('target-secret','duplicate')],[{characterId:'mira',knows:['source-secret']},{characterId:'duplicate',knows:['target-secret']}]);
  await text.createChapter(projectId,{id:'chapter',index:1,title:'开场',pov:'mira',status:'draft'});
  await text.appendScene(projectId,'chapter',{id:'scene',content:'mira 原文不能替换。',summary:'开场',beats:[],canonEvents:[],notes:''});
  const deps={characters,confirmation,outline,knowledge,state,relationship,text,timeline};let merge=createCharacterMergeService(deps);
  const input:CharacterMergeInput={projectId,sourceId:'mira',targetId:'duplicate',fields:[{field:'background',from:'source'}],stateFrom:'source',knowledgeFrom:'target'};
  await expect(merge.characterMergePropose({...input,targetId:'mira'})).rejects.toThrow('不同');
  await expect(merge.characterMergePropose({...input,fields:[...input.fields,...input.fields]})).rejects.toThrow('重复');
  const before=await outline.read(projectId);const original=await text.readCompleteChapter(projectId,'chapter');
  let plan=await merge.characterMergePropose(input);
  expect(plan.result.background).toBe(source.background);expect(plan.knownFacts).toEqual(['target-secret']);
  await merge.characterMergeDecide({projectId,proposalId:plan.proposalId,accept:false});expect(await outline.read(projectId)).toEqual(before);expect((await characters.read(projectId,'duplicate')).version).toBe(1);
  plan=await merge.characterMergePropose(input);await state.transaction(projectId,draft=>{draft.scene.weather='rain';});
  expect((await merge.characterMergeDecide({projectId,proposalId:plan.proposalId,accept:true})).status).toBe('stale');await merge.characterMergeDecide({projectId,proposalId:plan.proposalId,accept:false});
  plan=await merge.characterMergePropose(input);let fail=true;
  merge=createCharacterMergeService({...deps,knowledge:{...knowledge,mergeIdentity:async(...args)=>{if(fail){fail=false;throw new Error('injected disk failure');}await knowledge.mergeIdentity!(...args);}}});
  const decision={projectId,proposalId:plan.proposalId,accept:true};await expect(merge.characterMergeDecide(decision)).rejects.toThrow('injected');
  expect((await merge.characterMergePending({projectId}))[0]?.accepted).toBe(true);expect((await characters.listActive(projectId)).length).toBe(3);
  await confirmation.open(projectId);await characters.open(projectId);await state.open(projectId,{...example.layers.state.candidates[0]!,version:1});merge=createCharacterMergeService(deps);
  expect((await merge.characterMergeDecide(decision)).status).toBe('done');expect((await merge.characterMergeDecide(decision)).status).toBe('done');
  expect((await characters.listActive(projectId)).map(item=>item.id)).toEqual(['duplicate','laozhou']);expect(await characters.read(projectId,'mira')).toMatchObject(source);
  expect((await relationship.read(projectId))[0]).toMatchObject({from:'duplicate',to:'laozhou',knownTo:['duplicate']});expect((await timeline.read(projectId))?.nodes[0]?.reveals[0]?.revealTo).toEqual(['duplicate']);
  await expect(relationship.saveIfSnapshot!(projectId,[],[{...edge,version:1}])).rejects.toThrow('已变化');await expect(timeline.saveIfSnapshot!(projectId,initialTimeline,initialTimeline)).rejects.toThrow('已变化');
  expect((await outline.beatCards(projectId)).every(card=>card.detailBeat.pov!=='mira')).toBe(true);expect((await outline.read(projectId)).acts[0]?.beats[0]?.charactersInvolved).toContain('duplicate');
  expect((await knowledge.read(projectId)).states).toEqual([{characterId:'duplicate',knows:['target-secret']}]);expect(state.current(projectId).characters.map(item=>item.characterId)).toEqual(['duplicate']);
  expect(await text.readCompleteChapter(projectId,'chapter')).toBe(original);expect((await text.readChapter(projectId,'chapter')).pov).toBe('duplicate');expect(state.snapshots(projectId)[0]?.characters[0]?.characterId).toBe('mira');
  const record=(await characters.lifecycleRecords(projectId))[0]!;await characters.changeLifecycle(projectId,'mira','active',1,record.revision,'restore-source');expect(await merge.characterMergePending({projectId})).toEqual([]);expect((await merge.characterMergeDecide(decision)).status).toBe('done');expect((await characters.listActive(projectId)).length).toBe(3);
  await relationship.save(projectId,{...edge,id:'self-edge',to:'duplicate'});await expect(merge.characterMergePropose(input)).rejects.toThrow('自身关系或重复关系');
 }finally{await rm(root,{recursive:true,force:true});}
});

it('I221 explicit knowledge selection avoids a union and removes already-known reveal targets',()=>{
 const before={entries:[{id:'fact',version:1,fact:'秘密',kind:'secret' as const,holders:['source'],revealPlan:{revealTo:['target','other'],revealAt:'later'},status:'hidden' as const}],states:[{characterId:'source',knows:['fact']},{characterId:'target',knows:[]}]};
 expect(mergeCharacterKnowledge(before,'source','target','source')).toMatchObject({entries:[{holders:['target'],revealPlan:{revealTo:['other']}}],states:[{characterId:'target',knows:['fact']}]});
 expect(mergeCharacterKnowledge(before,'source','target','target')).toMatchObject({entries:[{holders:[],revealPlan:{revealTo:['target','other']}}],states:[{characterId:'target',knows:[]}]});
});
