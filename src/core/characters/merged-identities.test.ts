import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';import { join } from 'node:path';
import { expect,it } from 'vitest';
import { writeYaml } from '../io/yaml.js';
import { OutlineRepository } from '../outline/index.js';
import { outlineContentFingerprint } from '../outline/fingerprint.js';
import { ONBOARDING_PROMPT_EXAMPLE } from '../onboarding/example.js';

it('I222 only completed accepted merges resolve retired references; reads preserve bytes and stale saves cannot restore old identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'i222-identities-'));
 try{
  const repository=new OutlineRepository(root);await repository.open();const old=await repository.save(ONBOARDING_PROMPT_EXAMPLE.layers.outline.candidates[0]!);const bytes=await readFile(join(root,'outline.yaml'),'utf8');
  const records=[{characterId:'mira',status:'deleted',revision:1,completedMergeIds:['merge']}];
  await writeYaml(join(root,'character-lifecycle.yaml'),{version:1,records});
  const gate={id:'merge',version:1,kind:'character-merge',status:'pending',payload:{input:{sourceId:'mira',targetId:'retained',knowledgeFrom:'target'}}};
  await writeYaml(join(root,'confirmations.yaml'),{confirmations:[gate]});expect(await repository.read()).toEqual(old);
  await writeYaml(join(root,'confirmations.yaml'),{confirmations:[{...gate,status:'accepted'}]});const resolved=await repository.read();expect(resolved.acts[0]!.beats[0]!.detailBeats[0]!.pov).toBe('retained');expect(await readFile(join(root,'outline.yaml'),'utf8')).toBe(bytes);
  expect((await repository.saveIfFingerprint(old,outlineContentFingerprint(resolved))).acts[0]!.beats[0]!.detailBeats[0]!.pov).toBe('retained');expect((await repository.save(old)).acts[0]!.beats[0]!.detailBeats[0]!.pov).toBe('retained');
  await expect(repository.saveIfFingerprint(old,'wrong')).rejects.toThrow('Outline changed');
  await writeYaml(join(root,'character-lifecycle.yaml'),{version:1,records:[{characterId:'mira',status:'frozen',revision:1}]});expect((await repository.save(old)).acts[0]!.beats[0]!.detailBeats[0]!.pov).toBe('mira');
  await writeYaml(join(root,'character-lifecycle.yaml'),{version:1,records:[...records,{characterId:'retained',status:'frozen',revision:1,completedMergeIds:['reverse']}]});await writeYaml(join(root,'confirmations.yaml'),{confirmations:[{...gate,status:'accepted'},{...gate,id:'reverse',status:'accepted',payload:{input:{sourceId:'retained',targetId:'mira',knowledgeFrom:'target'}}}]});await expect(repository.read()).rejects.toThrow('Invalid outline document');
 }finally{await rm(root,{recursive:true,force:true});}
});
