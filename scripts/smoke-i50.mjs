import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';

import { apply } from '../lib/index.js';
import { INITIAL_STATE } from '../lib/core/schema/project-lifecycle.js';

const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i50-projects-'));
const configRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i50-config-'));
const baseUrl = new URL(`${configRoot.replace(/\\/g, '/')}/`).href;
const configPath = join(configRoot, 'cordis.yml');
const root = new Context();

async function run() {
  root.baseUrl = baseUrl;
  await root.plugin(Loader, { baseUrl });
  await root.plugin(Include, {
    path: pathToFileURL(configPath).href,
    initial: [{ id: 'novel-creation-tool', name: new URL('../lib/index.js', import.meta.url).href, config: { projectsRoot } }],
    enableLogs: false,
  });

  await root.loader.await();
  const project = root.get('novelProject', false);
  if (!project) throw new Error('novelProject service missing after loader + include boot');
  if ((await project.listProjects()).length !== 0) throw new Error('fresh projects root was not empty');

  const created = await project.createProject({ projectId: 'i50-smoke', name: 'I50 Smoke' });
  if (created.id !== 'i50-smoke' || created.version !== 1) throw new Error('createProject returned invalid metadata');
  const listed = await project.listProjects();
  if (listed.length !== 1 || listed[0].id !== created.id) throw new Error('projectList did not return the created project');

  const opened = await project.openProject(created.id);
  const expectedLayers = {
    characters: 'empty', worldview: 'empty', outline: 'uninitialized',
    relationship: 'empty', state: 'ready', canon: 'empty',
  };
  assert.deepStrictEqual(opened.layers, expectedLayers, 'unexpected six-layer readiness');
  const current = root.get('novelState', false)?.current(created.id);
  assert.deepStrictEqual(current, { ...INITIAL_STATE, seq: 0 }, 'unexpected initial state');

  await root.fiber.dispose();
  if (root.get('novelProject', false) !== undefined) throw new Error('novelProject survived Fiber dispose');
  console.log('I50 composition smoke: temp root listing/create/open six-layer readiness + initial state + dispose passed');
}

try {
  await run();
} finally {
  try { await root.fiber.dispose(); } catch {}
  try { await rm(configRoot, { recursive: true, force: true }); } catch {}
  try { await rm(projectsRoot, { recursive: true, force: true }); } catch {}
}
