import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { projectDirectory } from '../core/io/path.js';
import { readYaml } from '../core/io/yaml.js';
import { characterManagementInputSchema, characterManagementDecisionSchema, characterManagementProjectSchema, type CharacterManagementNamespace } from '../app/character-management-contract.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';

const payloadSchema=characterManagementInputSchema.extend({fingerprint:z.string(),version:z.number().int(),revision:z.number().int()}).strict();
const layers:Record<string,string>={characters:'角色',worldview:'世界观',state:'角色状态',canon:'正史',text:'正文',knowledge:'知情',relationships:'关系','outline.yaml':'大纲','knowledge.yaml':'知情','relationships.yaml':'关系','timeline.yaml':'时间线'};

/** Read-only conservative reference scan. Audit/import history is retained, never edited by deletion. */
export async function characterReferenceSnapshot(directory:string,characterId:string):Promise<{references:{layer:string;count:number}[];fingerprint:string}>{
  const documents:Record<string,unknown>={};const counts=new Map<string,number>();
  const count=(value:unknown):number=>value===characterId?1:value&&typeof value==='object'?Object.values(value).reduce<number>((sum,item)=>sum+count(item),0):0;
  const visit=async(relative:string,layer:string):Promise<void>=>{
    for(const entry of await readdir(join(directory,relative),{withFileTypes:true})){
      const path=join(relative,entry.name);
      if(entry.isSymbolicLink())throw new Error('角色引用目录包含不支持的链接。');
      if(entry.isDirectory())await visit(path,layer);
      else if(relative==='canon' && entry.name==='canon.jsonl'){
        const value=(await readFile(join(directory,path),'utf8')).split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
        documents[path]=value;counts.set(layer,(counts.get(layer)??0)+count(value));
      }
      else if((entry.name.endsWith('.yaml') || (relative==='text' && entry.name.endsWith('.json') && !entry.name.startsWith('.'))) && path!==join('characters',characterId+'.yaml')){
        let value=await readYaml(path.startsWith(directory)?path:join(directory,path));
        if(relative==='state'&&entry.name==='snapshots.yaml')value=(value as {snapshots:unknown[]}).snapshots.at(-1);
        documents[path]=value;counts.set(layer,(counts.get(layer)??0)+count(value));
      }
    }
  };
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const label=layers[entry.name];if(!label)continue;
    if(entry.isDirectory())await visit(entry.name,label);
    else if(entry.isFile()){const value=await readYaml(join(directory,entry.name));documents[entry.name]=value;counts.set(label,(counts.get(label)??0)+count(value));}
  }
  return {references:[...counts].filter(([,count])=>count>0).map(([layer,count])=>({layer,count})),fingerprint:createHash('sha256').update(JSON.stringify(documents)).digest('hex')};
}

/** I220: one shared I11 decision, freshness recheck, and reversible lifecycle write. */
export function createCharacterManagementService(root:string,characters:NovelCharacterService,confirmation:NovelConfirmationService,onDispose?:(dispose:()=>void)=>void):CharacterManagementNamespace{
  const tails=new Map<string,Promise<unknown>>();
  let disposed=false;onDispose?.(()=>{disposed=true;tails.clear();});
  const ensureActive=()=>{if(disposed)throw new Error('角色管理已关闭。');};
  const serial=<T>(id:string,fn:()=>Promise<T>)=>{ensureActive();const guarded=()=>{ensureActive();return fn();};const result=(tails.get(id)??Promise.resolve()).then(guarded,guarded);tails.set(id,result.catch(()=>undefined));return result;};
  const inspect=async(projectId:string,characterId:string)=>{
    const character=await characters.read(projectId,characterId);
    const record=(await characters.lifecycleRecords(projectId)).find(record=>record.characterId===characterId);
    const snapshot=await characterReferenceSnapshot(projectDirectory(root,projectId),characterId);
    return {character,record,...snapshot};
  };
  return {
    async characterManageList(raw){ensureActive();const {projectId}=characterManagementProjectSchema.parse(raw);const records=await characters.lifecycleRecords(projectId);return (await characters.listAll(projectId)).map(character=>({id:character.id,name:character.name,status:records.find(record=>record.characterId===character.id)?.status??'active'}));},
    async characterManagePropose(raw){const input=characterManagementInputSchema.parse(raw);return serial(input.projectId,async()=>{
      const snapshot=await inspect(input.projectId,input.characterId);
      const allowed=input.action!=='delete'||snapshot.references.length===0;
      const proposalId=allowed?'character-life-'+randomUUID():null;
      if(proposalId)await confirmation.propose(input.projectId,{id:proposalId,kind:'character-lifecycle',payload:{...input,fingerprint:snapshot.fingerprint,version:snapshot.character.version,revision:snapshot.record?.revision??0}});
      return {...input,proposalId,name:snapshot.character.name,references:snapshot.references,allowed,message:allowed?'确认后执行；角色资料与历史记录保留，可在管理中恢复。':'该角色仍被引用，不能直接删除。可以先冻结，或处理引用后再删除。'};
    });},
    async characterManageDecide(raw){const input=characterManagementDecisionSchema.parse(raw);return serial(input.projectId,async()=>{
      const gate=confirmation.get(input.projectId,input.proposalId);
      if(gate.kind!=='character-lifecycle')throw new Error('角色操作确认不匹配。');
      const payload=payloadSchema.parse(gate.payload);
      if(payload.projectId!==input.projectId)throw new Error('角色操作不属于当前作品。');
      if(gate.status==='rejected')return {status:'rejected',message:'已取消角色操作。'};
      const snapshot=await inspect(input.projectId,payload.characterId);
      if(snapshot.record?.operationId===gate.id)return {status:'done',message:'角色操作已完成。'};
      if(!input.accept){await confirmation.reject(input.projectId,gate.id);return {status:'rejected',message:'已取消角色操作。'};}
      if(snapshot.fingerprint!==payload.fingerprint||snapshot.character.version!==payload.version||(snapshot.record?.revision??0)!==payload.revision)return {status:'stale',message:'角色或引用已变化，请重新预览操作。'};
      if(payload.action==='delete'&&snapshot.references.length)return {status:'stale',message:'角色已出现引用，请重新预览。'};
      if(gate.status==='pending')await confirmation.accept(input.projectId,gate.id);
      await characters.changeLifecycle(input.projectId,payload.characterId,payload.action==='freeze'?'frozen':payload.action==='delete'?'deleted':'active',payload.version,payload.revision,gate.id);
      return {status:'done',message:'角色操作已完成，可在管理列表中查看或恢复。'};
    });},
  };
}
