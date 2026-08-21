import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const bundle = resolve(root, 'lib/client.js');
if (!existsSync(bundle)) throw new Error('I33 bundle missing: run pnpm build first');
const source = readFileSync(bundle, 'utf8');
for (const forbidden of ['createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile', 'OPENAI_API_KEY']) {
  if (source.includes(forbidden)) throw new Error(`I33 client bundle contains forbidden symbol: ${forbidden}`);
}
for (const required of ['novel-creation-tool-workspace', 'data-novel-workspace', 'novelWorkspace/viewModel']) {
  if (!source.includes(required)) throw new Error(`I33 client bundle missing ${required}`);
}
console.log('I33 smoke: product Slot bundle contains typed Remote workspace with negative-boundary scan passing');
