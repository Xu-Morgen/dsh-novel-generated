import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { characterMergeInputSchema, characterMergeDecideSchema, characterMergeProjectSchema, characterMergePreviewSchema, type CharacterMergeNamespace } from '../app/character-merge-contract.js';
import { characterCoreSchema } from '../core/schema/characters.js';
import { characterLifecycleRecordSchema } from '../core/characters/lifecycle.js';
import { mergeCharacterCore, mergeCharacterKnowledge } from '../core/characters/merge.js';
import { outlineSchema } from '../core/schema/outline.js';
import { worldStateSchema } from '../core/schema/state.js';
import { knowledgeEntrySchema, knowledgeStateSchema } from '../core/schema/knowledge.js';
import { relationshipSchema } from '../core/schema/relationship.js';
import { chapterSchema } from '../core/schema/text.js';
import { timelineSchema } from '../core/timeline/schema.js';
import { outlineContentFingerprint } from '../core/outline/index.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelTextServiceBundle } from './text-service.js';
import type { NovelTimelineService } from './timeline-service.js';

const snapshotSchema=z.object({source:characterCoreSchema,target:characterCoreSchema,lifecycle:z.array(characterLifecycleRecordSchema),outline:outlineSchema.nullable(),state:worldStateSchema,knowledge:z.object({entries:z.array(knowledgeEntrySchema),states:z.array(knowledgeStateSchema)}).strict(),relationships:z.array(relationshipSchema),chapters:z.array(chapterSchema),timeline:timelineSchema.nullable()}).strict();
const planSchema=z.object({input:characterMergeInputSchema,before:snapshotSchema,after:snapshotSchema}).strict();
type Snapshot=z.infer<typeof snapshotSchema>;
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const stale=()=>({status:'stale' as const,message:'资料已变化，已停止合并以保留当前编辑。请重新检查；已接受的操作可在角色管理中续做。'});

/** I221: durable I11 before/after plan; each original owner writes only its typed layer. */
export function createCharacterMergeService(deps:{characters:NovelCharacterService;confirmation:NovelConfirmationService;outline:NovelOutlineService;state:NovelStateService;knowledge:NovelKnowledgeService;relationship:NovelRelationshipService;text:NovelTextServiceBundle;timeline:NovelTimelineService;onDispose?:(dispose:()=>void)=>void}):CharacterMergeNamespace{
  const {characters,confirmation,outline,state,knowledge,relationship,text,timeline}=deps;
  let disposed=false;const tails=new Map<string,Promise<unknown>>();deps.onDispose?.(()=>{disposed=true;tails.clear();});
  const serial=<T>(id:string,operation:()=>Promise<T>)=>{const run=()=>{if(disposed)throw new Error('角色合并已关闭。');return operation();};const next=(tails.get(id)??Promise.resolve()).then(run,run);tails.set(id,next.catch(()=>undefined));return next;};
  const read=async(projectId:string,sourceId:string,targetId:string):Promise<Snapshot>=>snapshotSchema.parse({source:await characters.read(projectId,sourceId),target:await characters.read(projectId,targetId),lifecycle:await characters.lifecycleRecords(projectId),outline:(await outline.readiness(projectId))==='uninitialized'?null:await outline.read(projectId),state:state.current(projectId),knowledge:await knowledge.read(projectId),relationships:await relationship.read(projectId),chapters:await text.listChapters(projectId),timeline:await timeline.read(projectId)});
  const complete=(snapshot:Snapshot,id:string)=>snapshot.lifecycle.some(record=>record.characterId===snapshot.source.id&&record.completedMergeIds?.includes(id));
  return {
    characterMergePending:raw=>{const {projectId}=characterMergeProjectSchema.parse(raw);return serial(projectId,async()=>{
      const records=await characters.lifecycleRecords(projectId);
      return confirmation.list(projectId).filter(gate=>gate.kind==='character-merge'&&gate.status!=='rejected'&&!records.some(record=>record.completedMergeIds?.includes(gate.id))).map(gate=>{const plan=planSchema.parse(gate.payload);return {proposalId:gate.id,sourceId:plan.input.sourceId,targetId:plan.input.targetId,accepted:gate.status==='accepted'};});
    });},
    characterMergePropose:raw=>{const input=characterMergeInputSchema.parse(raw);return serial(input.projectId,async()=>{
      if(input.sourceId===input.targetId)throw new Error('请选择两个不同角色。');
      const pending=confirmation.list(input.projectId).filter(gate=>gate.kind==='character-merge'&&gate.status!=='rejected');
      const records=await characters.lifecycleRecords(input.projectId);
      if(pending.some(gate=>!records.some(record=>record.completedMergeIds?.includes(gate.id))))throw new Error('请先完成或取消已有合并预览。');
      const before=await read(input.projectId,input.sourceId,input.targetId);
      if(before.lifecycle.some(record=>(record.characterId===input.sourceId&&record.status==='deleted')||(record.characterId===input.targetId&&record.status!=='active')))throw new Error('请先恢复被删除的源角色或不可用的保留角色。');
      const after=structuredClone(before);
      after.target=mergeCharacterCore(before.source,before.target,input.fields);
      const map=(id:string)=>id===input.sourceId?input.targetId:id;
      const ids=(values:string[])=>[...new Set(values.map(map))];
      const chosen=input.knowledgeFrom==='source'?input.sourceId:input.targetId;
      const visibility=(values:string[])=>values.filter(id=>id!==input.sourceId&&id!==input.targetId).concat(values.includes(chosen)?[input.targetId]:[]);
      if(after.outline){for(const act of after.outline.acts)for(const beat of act.beats){beat.charactersInvolved=ids(beat.charactersInvolved);for(const card of beat.detailBeats)card.pov=map(card.pov);}for(const hint of after.outline.foreshadowing)hint.knownBy=visibility(hint.knownBy);}
      const selected=before.state.characters.find(character=>character.characterId===(input.stateFrom==='source'?input.sourceId:input.targetId));
      after.state.characters=before.state.characters.filter(character=>character.characterId!==input.sourceId&&character.characterId!==input.targetId).concat(selected?[{...selected,characterId:input.targetId}]:[]);
      if(!same(after.state,before.state))after.state.seq++;
      after.knowledge=snapshotSchema.shape.knowledge.parse(mergeCharacterKnowledge(before.knowledge,input.sourceId,input.targetId,input.knowledgeFrom));
      after.relationships=before.relationships.map(item=>({...item,from:map(item.from),to:map(item.to),knownTo:visibility(item.knownTo)}));
      const pairs=new Set<string>();for(const item of after.relationships){const key=JSON.stringify([item.from,item.to,item.type]);if(item.from===item.to||pairs.has(key))throw new Error('合并将产生自身关系或重复关系，请先在关系页处理后重试。');pairs.add(key);}
      after.chapters=before.chapters.map(chapter=>({...chapter,pov:map(chapter.pov)}));
      if(after.timeline)for(const node of after.timeline.nodes)for(const reveal of node.reveals)reveal.revealTo=ids(reveal.revealTo);
      const proposalId='character-merge-'+randomUUID();
      await confirmation.propose(input.projectId,{id:proposalId,kind:'character-merge',payload:z.json().parse(planSchema.parse({input,before,after}))});
      const preview={proposalId,source:before.source,target:before.target,result:after.target,state:selected?{...selected,characterId:input.targetId}:null,knownFacts:after.knowledge.entries.filter(entry=>entry.holders.includes(input.targetId)).map(entry=>entry.fact),changes:['保留身份：'+before.target.name+'（'+before.target.id+'）','资料按下方预览保存；当前状态及知情仅采用所选角色。',...(['outline','state','knowledge','relationships','chapters','timeline'] as const).filter(key=>!same(before[key],after[key])).map(key=>({outline:'大纲与场景卡',state:'当前角色状态',knowledge:'知情与揭示计划',relationships:'关系',chapters:'章节视角',timeline:'时间线'}[key])+'：迁移当前引用'), '原角色资料、历史状态、正史与正文文字保留；完成后冻结原角色。']};
      return characterMergePreviewSchema.parse(preview);
    });},
    characterMergeDecide:raw=>{const input=characterMergeDecideSchema.parse(raw);return serial(input.projectId,async()=>{
      const gate=confirmation.get(input.projectId,input.proposalId);
      if(gate.kind!=='character-merge')throw new Error('角色合并确认不匹配。');
      const {input:choice,before,after}=planSchema.parse(gate.payload);
      if(choice.projectId!==input.projectId)throw new Error('角色合并不属于当前作品。');
      if(gate.status==='rejected')return {status:'rejected',message:'已取消合并。'};
      const current=await read(input.projectId,choice.sourceId,choice.targetId);
      if(complete(current,gate.id))return {status:'done',message:'合并已完成；原角色资料已保留。'};
      if(!input.accept){if(gate.status==='accepted')throw new Error('合并已经确认，请使用继续完成操作。');await confirmation.reject(input.projectId,gate.id);return {status:'rejected',message:'已取消合并，角色资料未改变。'};}
      if(gate.status==='pending'&&!same(current,before))return stale();
      // Validate every owner before resuming; chapter writes may have stopped between two chapters.
      for(const key of ['source','target','lifecycle','outline','state','knowledge','relationships','timeline'] as const)if(!same(current[key],before[key])&&!same(current[key],after[key]))return stale();
      if(current.chapters.length!==before.chapters.length||current.chapters.some((chapter,index)=>!same(chapter,before.chapters[index])&&!same(chapter,after.chapters[index])))return stale();
      if(gate.status==='pending')await confirmation.accept(input.projectId,gate.id);
      if(!same(current.target,after.target)){if(!characters.updateIfVersion)throw new Error('角色版本保存不可用。');const {id:_id,version:_version,...patch}=after.target;await characters.updateIfVersion(input.projectId,choice.targetId,patch,before.target.version);}
      if(after.outline&&!same(current.outline,after.outline)){if(!outline.saveIfFingerprint||!before.outline)throw new Error('大纲合并保存不可用。');await outline.saveIfFingerprint(input.projectId,after.outline,outlineContentFingerprint(before.outline));}
      if(!same(current.state,after.state))await state.transaction(input.projectId,draft=>{const {seq:_seq,...expected}=before.state;if(!same(draft,expected))throw new Error('角色状态已变化，请重新检查。');draft.characters=structuredClone(after.state.characters);});
      if(!same(current.knowledge,after.knowledge)){if(!knowledge.mergeIdentity)throw new Error('知情身份纠正不可用。');await knowledge.mergeIdentity(input.projectId,choice.sourceId,choice.targetId,choice.knowledgeFrom,before.knowledge);}
      if(!same(current.relationships,after.relationships)){if(!relationship.saveIfSnapshot)throw new Error('关系版本保存不可用。');await relationship.saveIfSnapshot(input.projectId,after.relationships,before.relationships);}
      for(let index=0;index<after.chapters.length;index++){const chapter=after.chapters[index]!;if(!same(current.chapters[index],chapter)){const fingerprint=await text.projectFingerprint(input.projectId);if(!same(await text.readChapter(input.projectId,chapter.id),before.chapters[index]))throw new Error('章节已变化，请重新检查。');await text.updateChapterMutation(input.projectId,{chapterId:chapter.id,patch:{pov:chapter.pov},expectedFingerprint:fingerprint});}}
      if(after.timeline&&!same(current.timeline,after.timeline)){if(!timeline.saveIfSnapshot||!before.timeline)throw new Error('时间线版本保存不可用。');await timeline.saveIfSnapshot(input.projectId,after.timeline,before.timeline);}
      const final=await read(input.projectId,choice.sourceId,choice.targetId);
      if(!same(final,after))return stale();
      await characters.changeLifecycle(input.projectId,choice.sourceId,'frozen',before.source.version,before.lifecycle.find(record=>record.characterId===choice.sourceId)?.revision??0,gate.id);
      return {status:'done',message:'合并完成，当前引用已迁移；原角色已冻结，历史资料和正文保留。'};
    });},
  };
}
