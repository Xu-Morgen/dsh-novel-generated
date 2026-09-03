import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { desktopIpcRegistry } from '../src/platform/desktop-ipc-registry.ts';

const target = resolve(import.meta.dirname, '../contracts/desktop/ipc-methods.json');
const methodIdsTarget = resolve(import.meta.dirname, '../src/desktop/preload/ipc-method-ids.ts');
const rendererRegistryTarget = resolve(import.meta.dirname, '../src/desktop/renderer/ipc-client-registry.ts');
const lock = desktopIpcRegistry.contractLock();
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({
  ...lock,
  contractNote: 'I171 canonical strict IPC lock：从 desktopIpcRegistry 机械生成；参数、结果与 codec schema 有意变更必须单独审阅。',
}, null, 2)}\n`);
writeFileSync(methodIdsTarget, `/** I172 generated allowlist; update only through the canonical desktop registry lock command. */\nexport const IPC_METHOD_IDS = ${JSON.stringify(lock.descriptorIds, null, 2)} as const;\n`);
const legacyMountSource = readFileSync(resolve(import.meta.dirname, '../src/client/mount-registry.ts'), 'utf8');
const serviceBindings = [...legacyMountSource.matchAll(/\{ key: '([^']+)', contribution: [^,]+, serviceKey: 'remote\.([^']+)'/g)]
  .map((match) => ({ key: match[1], service: match[2] }));
if (serviceBindings.length !== 31 || new Set(serviceBindings.map(({ key }) => key)).size !== serviceBindings.length) {
  throw new Error(`expected 31 unique legacy Client service bindings, received ${serviceBindings.length}`);
}
const descriptorsByNamespace = new Map();
for (const id of lock.descriptorIds) {
  const descriptor = lock.descriptors[id];
  const methods = descriptorsByNamespace.get(descriptor.namespace) ?? [];
  methods.push({ method: descriptor.method, methodId: descriptor.id });
  descriptorsByNamespace.set(descriptor.namespace, methods);
}
const rendererRegistry = serviceBindings.map(({ key, service: namespace }) => {
  const methods = descriptorsByNamespace.get(namespace);
  if (methods === undefined || methods.length === 0) throw new Error(`legacy Client service has no canonical IPC methods: ${key}/${namespace}`);
  return { key, namespace, methods };
});
writeFileSync(rendererRegistryTarget, `/** I174 generated Renderer client registry; update only through update:desktop-ipc-lock. */\nexport const DESKTOP_CLIENT_SERVICES = ${JSON.stringify(rendererRegistry, null, 2)} as const;\n`);
process.stdout.write(`created ${target} (${desktopIpcRegistry.size} descriptors)\n`);
