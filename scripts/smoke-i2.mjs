import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import Include from '@deepseek-ai/cordis-plugin-include';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';

import { apply } from '../lib/index.js';
import { NOVEL_PROBE_NAMESPACE, PROBE_MARKER } from '../lib/remote.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Part 1 — direct Cordis lifecycle with the Typert registry: provide Host
// services, register the public Remote, and prove dispose withdraws everything.
{
  const root = new Context();
  await root.plugin(TypertRegistry);
  const fiber = await root.plugin(apply);

  const status = root.get('novelCreation', false);
  if (!status || status.version !== '2.0.0' || status.ready !== true) {
    throw new Error('novelCreation service missing after plugin start');
  }
  const probe = root.get(NOVEL_PROBE_NAMESPACE, false);
  if (!probe || probe.probe().marker !== PROBE_MARKER) {
    throw new Error('novelProbe service missing after plugin start');
  }
  if (root.typert.local.get(`${NOVEL_PROBE_NAMESPACE}/probe`) === undefined) {
    throw new Error('novelProbe/probe public Remote not registered');
  }

  await fiber.dispose();

  if (root.get(NOVEL_PROBE_NAMESPACE, false) !== undefined) {
    throw new Error('novelProbe service survived Fiber dispose');
  }
  if (root.typert.local.get(`${NOVEL_PROBE_NAMESPACE}/probe`) !== undefined) {
    throw new Error('novelProbe/probe public Remote survived Fiber dispose');
  }

  console.log('I2 lifecycle smoke: Host services + public Remote provide/dispose');
}

// Part 2 — loader + include composition: cordis.yml mounts the built Host
// plugin. The Typert registry is absent here, so the Remote registration is
// skipped gracefully while the Host services still resolve.
{
  const baseUrl = new URL('../', import.meta.url).href;
  const root = new Context();
  root.baseUrl = baseUrl;
  await root.plugin(Loader, { baseUrl });
  await root.plugin(Include, { path: './cordis.yml', initial: [], enableLogs: false });

  await root.loader.await();

  const status = root.get('novelCreation', false);
  const probe = root.get(NOVEL_PROBE_NAMESPACE, false);
  if (!status || status.version !== '2.0.0') {
    throw new Error('novelCreation service not provided via cordis.yml composition');
  }
  if (!probe || probe.probe().marker !== PROBE_MARKER) {
    throw new Error('novelProbe service not provided via cordis.yml composition');
  }

  await root.fiber.dispose();
  console.log('I2 composition smoke: cordis.yml loader mounts the Host plugin');
}

// Part 3 — built client bundle: public __ModuleLoader__ handoff, no forbidden
// symbols (H0-9/H0-10).
{
  const clientPath = resolve(repoRoot, 'lib/client.js');
  if (!existsSync(clientPath)) {
    throw new Error('lib/client.js missing — run `pnpm build` before the smoke');
  }
  const bundle = readFileSync(clientPath, 'utf8');
  if (!bundle.includes('window.__ModuleLoader__.load')) {
    throw new Error('client bundle missing the public __ModuleLoader__ handoff');
  }
  const forbidden = [/harness\.handle/, /host\.call/, /clientBundle/, /createRoot\s*\(/, /<html[\s>]/i];
  for (const re of forbidden) {
    if (re.test(bundle)) throw new Error(`client bundle contains forbidden symbol ${re}`);
  }
  console.log('I2 client bundle smoke: __ModuleLoader__ handoff present, no forbidden symbols');
}
