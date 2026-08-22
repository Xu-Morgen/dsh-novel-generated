import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const bundlePath = resolve(root, 'lib/client.js');
if (!existsSync(bundlePath)) throw new Error('I36 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');
for (const forbidden of ['createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile', 'OPENAI_API_KEY', 'node:fs', 'canonUpdate', 'canonDelete']) {
  if (bundle.includes(forbidden)) throw new Error(`I36 client bundle contains forbidden symbol: ${forbidden}`);
}
for (const required of ['data-novel-editors', 'c2-c4', 'data-novel-state', 'snapshots', 'data-novel-canon', 'readonly', 'Rollback through StateEngine', 'ConfirmationGate', 'canonCorrectionPropose', 'canonCorrectionAccept']) {
  if (!bundle.includes(required)) throw new Error(`I36 client bundle missing ${required}`);
}
console.log('I36 smoke: C2 rollback and read-only C4 correction panel passes Host-only and forbidden-boundary scans');
