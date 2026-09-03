import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { desktopIpcRegistry } from '../src/platform/desktop-ipc-registry.ts';

const target = resolve(import.meta.dirname, '../contracts/desktop/ipc-methods.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify({
  ...desktopIpcRegistry.contractLock(),
  contractNote: 'I171 canonical strict IPC lock：从 desktopIpcRegistry 机械生成；参数、结果与 codec schema 有意变更必须单独审阅。',
}, null, 2)}\n`);
process.stdout.write(`created ${target} (${desktopIpcRegistry.size} descriptors)\n`);
