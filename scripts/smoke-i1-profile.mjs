import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * I1 selected-profile bundle boot smoke (design §0.1.1, plan I1 acceptance ③).
 *
 * This proves the ordinary out-of-tree Host plugin boots through the REAL
 * DeepSeek Harness composition machinery, not just the repo-local loader:
 *
 *   1. an isolated one-shot `DSH_HOME` is created (never the live profile);
 *   2. a test profile lists the built package as a `file:` dependency and in
 *      its ordered `dsh.profile.bundles`;
 *   3. `dsh-app-boot` composes the profile exactly as `dsh --profile` would —
 *      bundle declared → bundle patch read → one uniquely-named row composed;
 *   4. `boot()` mounts that patch stack and resolves the `novelCreation`
 *      service, then Fiber dispose removes it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const profileName = 'i1test';

// The harness home that owns the installed DSH app-boot module. The isolated
// test profile below lives in a separate one-shot home so this smoke never
// touches the live profile (AGENTS 全局执行纪律 §7).
const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const appBootDir = join(realDshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
const appBootIndex = join(appBootDir, 'lib', 'index.js');
if (!existsSync(appBootIndex)) {
  throw new Error(
    `dsh-app-boot not found at ${appBootIndex}; install DeepSeek Harness (DSH) to run the selected-profile boot smoke`,
  );
}
const { loadProfile, composeEntries, boot } = await import(pathToFileURL(appBootIndex).href);

const home = mkdtempSync(join(tmpdir(), 'dsh-i1-profile-'));
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

  // Install the plugin as a selected-profile dependency (offline-first).
  const install = spawnSync('pnpm install --prefer-offline --ignore-scripts', {
    cwd: profileDir,
    shell: true,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    throw new Error(`pnpm install in test profile failed:\n${install.stderr || install.stdout}`);
  }

  // Compose the profile exactly as `dsh --profile i1test` would.
  const installAnchor = join(appBootDir, 'package.json');
  const profile = loadProfile('dsh', profileName, installAnchor, home);
  const layers = profile.layers.map((layer) => layer.patches);
  if (profile.patches.length > 0) layers.push(profile.patches);
  const composed = composeEntries(layers);

  const rows = composed.filter((row) => row?.id === 'novel-creation-tool');
  if (rows.length !== 1 || rows[0]?.name !== 'novel-creation-tool') {
    throw new Error(`expected exactly one novel-creation-tool row, got ${JSON.stringify(rows)}`);
  }

  // Real boot: mount the composed patch stack and resolve the Host service.
  const rootConfig = join(profileDir, 'cordis.yml');
  writeFileSync(rootConfig, '[]\n');
  const ctx = await boot('dsh', rootConfig, layers.flat(), () => {});

  const service = ctx.get('novelCreation', false);
  if (!service || service.version !== '2.0.0' || service.ready !== true) {
    await ctx.fiber.dispose().catch(() => {});
    throw new Error('novelCreation service missing or invalid after selected-profile boot');
  }

  await ctx.fiber.dispose();
  if (ctx.get('novelCreation', false) !== undefined) {
    throw new Error('novelCreation service survived Fiber dispose after selected-profile boot');
  }

  console.log('I1 selected-profile smoke: bundle composes and Host service boots + disposes');
} finally {
  cleanup();
}
