import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * I2 selected-profile bundle boot smoke (design §0.1.1, §0.1.3 I2; acceptance ②).
 *
 * Proves the ordinary out-of-tree plugin's Host half boots through the REAL
 * DeepSeek Harness composition machinery after a real package build, and that
 * the package declares the public Client bundle the DSH client-modules scan
 * would serve (`dsh.client` + `./client` + built `lib/client.js`).
 *
 * The browser half itself is exercised by the deterministic Slot/Remote tests;
 * a headless smoke cannot run the web shell, so this script verifies the Host
 * boot + the exact public bundle declaration/artifact instead.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const profileName = 'i2test';

const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const appBootDir = join(realDshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
const appBootIndex = join(appBootDir, 'lib', 'index.js');
if (!existsSync(appBootIndex)) {
  throw new Error(
    `dsh-app-boot not found at ${appBootIndex}; install DeepSeek Harness (DSH) to run the selected-profile boot smoke`,
  );
}
const { loadProfile, composeEntries, boot } = await import(pathToFileURL(appBootIndex).href);

// The built client bundle and manifest must exist before the boot (real build).
const clientBundle = join(repoRoot, 'lib', 'client.js');
if (!existsSync(clientBundle)) {
  throw new Error('lib/client.js missing — run `pnpm build` before the profile smoke');
}
const pkgJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
if (pkgJson.dsh?.client?.platform !== 'web') {
  throw new Error('package.json must declare dsh.client { platform: "web" }');
}
if (pkgJson.exports?.['./client']?.default !== './lib/client.js') {
  throw new Error('package.json must export ./client -> ./lib/client.js');
}
const bundle = readFileSync(clientBundle, 'utf8');
if (!bundle.includes('window.__ModuleLoader__.load')) {
  throw new Error('lib/client.js must be the public __ModuleLoader__ bundle');
}

const home = mkdtempSync(join(tmpdir(), 'dsh-i2-profile-'));
const profileDir = join(home, 'profiles', profileName);
const cleanup = () => {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    // A leftover temp profile is harmless; never mask the smoke's real result.
  }
};

try {
  mkdirSync(profileDir, { recursive: true });
  const manifest = {
    name: `dsh-profile-${profileName}`,
    private: true,
    dependencies: {
      'novel-creation-tool': `file:${repoRoot.replace(/\\/g, '/')}`,
    },
    dsh: { profile: { bundles: ['novel-creation-tool'] } },
  };
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  const install = spawnSync('pnpm install --prefer-offline --ignore-scripts', {
    cwd: profileDir,
    shell: true,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    throw new Error(`pnpm install in test profile failed:\n${install.stderr || install.stdout}`);
  }

  const installAnchor = join(appBootDir, 'package.json');
  const profile = loadProfile('dsh', profileName, installAnchor, home);
  const layers = profile.layers.map((layer) => layer.patches);
  if (profile.patches.length > 0) layers.push(profile.patches);
  const composed = composeEntries(layers);

  const rows = composed.filter((row) => row?.id === 'novel-creation-tool');
  if (rows.length !== 1 || rows[0]?.name !== 'novel-creation-tool') {
    throw new Error(`expected exactly one novel-creation-tool row, got ${JSON.stringify(rows)}`);
  }

  const rootConfig = join(profileDir, 'cordis.yml');
  writeFileSync(rootConfig, '[]\n');
  const ctx = await boot('dsh', rootConfig, layers.flat(), () => {});

  const status = ctx.get('novelCreation', false);
  const probe = ctx.get('novelProbe', false);
  if (!status || status.version !== '2.0.0' || status.ready !== true) {
    await ctx.fiber.dispose().catch(() => {});
    throw new Error('novelCreation service missing after selected-profile boot');
  }
  if (!probe || probe.probe().marker !== 'I2-PROBE') {
    await ctx.fiber.dispose().catch(() => {});
    throw new Error('novelProbe service missing after selected-profile boot');
  }

  await ctx.fiber.dispose();
  if (ctx.get('novelCreation', false) !== undefined || ctx.get('novelProbe', false) !== undefined) {
    throw new Error('Host services survived Fiber dispose after selected-profile boot');
  }

  console.log('I2 selected-profile smoke: bundle composes; Host services boot + dispose; client bundle declared');
} finally {
  cleanup();
}
