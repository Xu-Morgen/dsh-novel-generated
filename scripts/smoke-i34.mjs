import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const bundlePath = resolve(root, 'lib/client.js');
if (!existsSync(bundlePath)) throw new Error('I34 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');
for (const forbidden of ['createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile', 'OPENAI_API_KEY', 'node:fs']) {
  if (bundle.includes(forbidden)) throw new Error(`I34 client bundle contains forbidden symbol: ${forbidden}`);
}
for (const required of ['data-novel-editors', 'Character core and Worldview', 'Save', 'novelCharacter', 'novelWorldview']) {
  if (!bundle.includes(required)) throw new Error(`I34 client bundle missing ${required}`);
}
console.log('I34 smoke: B3/B2 editor bundle passes Host-only and forbidden-boundary scans');
