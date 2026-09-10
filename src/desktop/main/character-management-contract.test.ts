import { expect,it } from 'vitest';
import { characterManagementDescriptors } from '../../app/character-management-contract.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';
it('I220 strict lifecycle methods reject forged arguments and invalid results in both clients',async()=>{
 for(const descriptor of characterManagementDescriptors){
  expect(IPC_METHOD_IDS).toContain(descriptor.id);
  expect(DESKTOP_CLIENT_SERVICES.find(service=>service.key==='workspace')!.methods.some(method=>method.methodId===descriptor.id)).toBe(true);
  const input=descriptor.method==='characterManageList'?{projectId:'book'}:descriptor.method==='characterManagePropose'?{projectId:'book',characterId:'mira',action:'freeze'}:{projectId:'book',proposalId:'gate',accept:true};
  let calls=0;
  expect(await desktopIpcRegistry.invoke(descriptor.id,[{...input,extra:true}],()=>{calls++;})).toMatchObject({ok:false,error:{code:'invalid-arguments'}});expect(calls).toBe(0);
  expect(await desktopIpcRegistry.invoke(descriptor.id,[input],()=>({wrong:true}))).toMatchObject({ok:false,error:{code:'invalid-result'}});
 }
});
