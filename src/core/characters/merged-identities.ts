import { join } from 'node:path';
import { z } from 'zod';
import { readYaml } from '../io/yaml.js';
import { characterLifecycleFileSchema } from './lifecycle.js';
import { confirmationRecordSchema } from '../schema/confirm.js';
import { entityIdSchema } from '../schema/base.js';
import type { Outline } from '../schema/outline.js';

const mappingSchema=z.object({input:z.object({sourceId:entityIdSchema,targetId:entityIdSchema,knowledgeFrom:z.enum(['source','target'])})});
/** Completed I11 merges authorize identity resolution; ordinary freezing never implies an alias. */
export async function resolveOutlineIdentities(directory:string,outline:Outline):Promise<Outline>{
  let lifecycle;
  try{lifecycle=characterLifecycleFileSchema.parse(await readYaml(join(directory,'character-lifecycle.yaml')));}
  catch(error){if(error instanceof Error&&(error.cause as NodeJS.ErrnoException|undefined)?.code==='ENOENT')return outline;throw error;}
  const retired=lifecycle.records.filter(record=>record.status!=='active'&&record.completedMergeIds?.length);
  if(!retired.length)return outline;
  const document=z.object({confirmations:z.array(confirmationRecordSchema)}).parse(await readYaml(join(directory,'confirmations.yaml')));
  const mappings=new Map<string,z.infer<typeof mappingSchema>['input']>();
  for(const record of retired){
    const gate=[...document.confirmations].reverse().find(gate=>gate.kind==='character-merge'&&gate.status==='accepted'&&record.completedMergeIds?.includes(gate.id));
    if(!gate)continue;
    const {input}=mappingSchema.parse(gate.payload);
    if(input.sourceId!==record.characterId)throw new Error('角色合并身份记录不一致。');
    mappings.set(input.sourceId,input);
  }
  const order:string[]=[];const visiting=new Set<string>();const visited=new Set<string>();
  const visit=(id:string)=>{if(visiting.has(id))throw new Error('角色合并身份存在循环，请检查角色管理。');if(visited.has(id)||!mappings.has(id))return;visiting.add(id);visit(mappings.get(id)!.targetId);visiting.delete(id);visited.add(id);order.unshift(id);};
  for(const id of mappings.keys())visit(id);
  const next=structuredClone(outline);
  for(const id of order){const mapping=mappings.get(id)!;const replace=(value:string)=>value===id?mapping.targetId:value;
    for(const act of next.acts)for(const beat of act.beats){beat.charactersInvolved=[...new Set(beat.charactersInvolved.map(replace))];for(const card of beat.detailBeats)card.pov=replace(card.pov);}
    for(const hint of next.foreshadowing)if(hint.knownBy.includes(id)){
      const knows=mapping.knowledgeFrom==='source'||hint.knownBy.includes(mapping.targetId);
      hint.knownBy=hint.knownBy.filter(value=>value!==id&&value!==mapping.targetId).concat(knows?[mapping.targetId]:[]);
    }
  }
  return next;
}
