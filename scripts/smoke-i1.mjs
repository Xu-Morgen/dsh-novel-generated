import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';

import { apply } from '../lib/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Part 1 — direct Cordis lifecycle: provide on start, cleanup on dispose.
{
  const root = new Context();
  const fiber = await root.plugin(apply);

  const before = root.get('novelCreation', false);
  if (!before || before.version !== '2.0.0' || before.ready !== true) {
    throw new Error('novelCreation service missing after plugin start');
  }

  await fiber.dispose();

  if (root.get('novelCreation', false) !== undefined) {
    throw new Error('novelCreation service survived Fiber dispose');
  }

  console.log('I1 lifecycle smoke: plugin provides service, dispose removes it');
}

// Part 2 — loader + include composition: cordis.yml mounts the built plugin.
{
  const baseUrl = new URL('../', import.meta.url).href;
  const root = new Context();
  root.baseUrl = baseUrl;
  await root.plugin(Loader, { baseUrl });
  await root.plugin(Include, { path: './cordis.yml', initial: [], enableLogs: false });

  await root.loader.await();

  const composed = root.get('novelCreation', false);
  if (!composed || composed.version !== '2.0.0') {
    throw new Error('novelCreation service not provided via cordis.yml composition');
  }

  await root.fiber.dispose();

  console.log('I1 composition smoke: cordis.yml loader mounts the Host plugin');
}
