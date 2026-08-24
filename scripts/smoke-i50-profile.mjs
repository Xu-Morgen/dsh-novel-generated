import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { INITIAL_STATE } from '../lib/core/schema/project-lifecycle.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileName = 'i50test';
const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const appBootDir = join(realDshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
const appBootIndex = join(appBootDir, 'lib', 'index.js');
if (!existsSync(appBootIndex)) {
  throw new Error(`dsh-app-boot not found at ${appBootIndex}; install DeepSeek Harness to run the selected-profile boot smoke`);
}
const { loadProfile, composeEntries, boot } = await import(pathToFileURL(appBootIndex).href);

const home = mkdtempSync(join(tmpdir(), 'dsh-i50-profile-'));
const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-smoke-i50-profile-projects-'));
const profileDir = join(home, 'profiles', profileName);
let ctx;

function cleanup() {
  try { rmSync(home, { recursive: true, force: true }); } catch {}
  try { rmSync(projectsRoot, { recursive: true, force: true }); } catch {}
}

try {
  mkdirSync(profileDir, { recursive: true });
  const manifest = {
    name: `dsh-profile-${profileName}`,
    private: true,
    dependencies: { 'novel-creation-tool': `file:${repoRoot.replace(/\\/g, '/')}` },
    dsh: { profile: { bundles: ['novel-creation-tool'] } },
  };
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(profileDir, 'cordis.patch.yml'), [
    '- id: novel-creation-tool',
    '  name: novel-creation-tool',
    '  config:',
    `    projectsRoot: ${JSON.stringify(projectsRoot.replace(/\\/g, '/'))}`,
    '',
  ].join('\n'));

  const install = spawnSync('pnpm install --prefer-offline --ignore-scripts', {
    cwd: profileDir, shell: true, encoding: 'utf8',
  });
  if (install.status !== 0) throw new Error(`pnpm install in test profile failed:\n${install.stderr || install.stdout}`);

  const profile = loadProfile('dsh', profileName, join(appBootDir, 'package.json'), home);
  const layers = profile.layers.map((layer) => layer.patches);
  if (profile.patches.length > 0) layers.push(profile.patches);
  const composed = composeEntries(layers);
  const rows = composed.filter((row) => row?.id === 'novel-creation-tool');
  if (rows.length !== 1 || rows[0]?.name !== 'novel-creation-tool') {
    throw new Error(`expected exactly one novel-creation-tool row, got ${JSON.stringify(rows)}`);
  }
  if (rows[0]?.config?.projectsRoot !== projectsRoot.replace(/\\/g, '/')) {
    throw new Error('selected profile did not inject the temporary projects root');
  }

  const rootConfig = join(profileDir, 'cordis.yml');
  writeFileSync(rootConfig, '[]\n');
  const booted = await boot('dsh', rootConfig, layers.flat(), () => {});
  ctx = booted;
  const project = ctx.get('novelProject', false);
  if (!project) throw new Error('novelProject service missing after selected-profile boot');
  if ((await project.listProjects()).length !== 0) throw new Error('profile smoke projects root was not empty');
  const created = await project.createProject({ projectId: 'i50-profile', name: 'I50 Profile Smoke' });
  const listed = await project.listProjects();
  if (listed.length !== 1 || listed[0].id !== created.id) throw new Error('profile project listing/create failed');
  const opened = await project.openProject(created.id);
  const expectedLayers = {
    characters: 'empty', worldview: 'empty', outline: 'uninitialized',
    relationship: 'empty', state: 'ready', canon: 'empty',
  };
  assert.deepStrictEqual(opened.layers, expectedLayers, 'unexpected profile six-layer readiness');
  const current = ctx.get('novelState', false)?.current(created.id);
  assert.deepStrictEqual(current, { ...INITIAL_STATE, seq: 0 }, 'unexpected profile initial state');
  await ctx.fiber.dispose();
  if (ctx.get('novelProject', false) !== undefined) throw new Error('novelProject survived selected-profile dispose');
  console.log('I50 selected-profile smoke: temp profile/projects root real boot listing/create/open readiness + initial state passed');
} finally {
  try { await ctx?.fiber.dispose(); } catch {}
  cleanup();
}
