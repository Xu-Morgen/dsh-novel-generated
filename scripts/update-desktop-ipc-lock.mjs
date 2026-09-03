import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { desktopIpcRegistry } from '../src/platform/desktop-ipc-registry.ts';

const target = resolve(import.meta.dirname, '../contracts/desktop/ipc-methods.json');
const methodIdsTarget = resolve(import.meta.dirname, '../src/desktop/preload/ipc-method-ids.ts');
const lock = desktopIpcRegistry.contractLock();
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({
  ...lock,
  contractNote: 'I171 canonical strict IPC lock：从 desktopIpcRegistry 机械生成；参数、结果与 codec schema 有意变更必须单独审阅。',
}, null, 2)}\n`);
writeFileSync(methodIdsTarget, `/** I172 generated allowlist; update only through the canonical desktop registry lock command. */\nexport const IPC_METHOD_IDS = ${JSON.stringify(lock.descriptorIds, null, 2)} as const;\n`);
process.stdout.write(`created ${target} (${desktopIpcRegistry.size} descriptors)\n`);
