import type { CharacterMergeInput } from '../../app/character-merge-contract.js';
import { characterCoreSchema, type CharacterCore } from '../schema/characters.js';
import { assertKnowledgeStructure, type KnowledgeDocument } from '../schema/knowledge.js';

/** Explicit field selection; omitted fields retain target values, never merge prose heuristically. */
export function mergeCharacterCore(source:CharacterCore,target:CharacterCore,fields:CharacterMergeInput['fields']):CharacterCore{
  if(source.id===target.id)throw new Error('请选择两个不同角色。');
  if(new Set(fields.map(item=>item.field)).size!==fields.length)throw new Error('资料字段选择重复。');
  return characterCoreSchema.parse({...target,...Object.fromEntries(fields.map(item=>[item.field,(item.from==='source'?source:target)[item.field]])),version:target.version+1});
}
/** Identity correction only: keep exactly one selected knowledge set, preserving facts/status and other knowers. */
export function mergeCharacterKnowledge(before:KnowledgeDocument,sourceId:string,targetId:string,from:'source'|'target'):KnowledgeDocument{
  const chosen=from==='source'?sourceId:targetId;
  const entries=before.entries.map(entry=>{
    const holders=entry.holders.filter(id=>id!==sourceId&&id!==targetId);
    if(entry.holders.includes(chosen))holders.push(targetId);
    const revealTo=[...new Set(entry.revealPlan.revealTo.map(id=>id===sourceId?targetId:id))].filter(id=>!holders.includes(id));
    return {...entry,holders,revealPlan:{...entry.revealPlan,revealTo}};
  });
  const states=before.states.filter(state=>state.characterId!==sourceId&&state.characterId!==targetId).concat({characterId:targetId,knows:entries.filter(entry=>entry.holders.includes(targetId)).map(entry=>entry.id)});
  assertKnowledgeStructure(entries,states);
  return {entries,states};
}
