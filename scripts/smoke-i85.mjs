import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * I85 DSH family `0.1.1-rc.2` 真实 base+web+plugin 生命周期 smoke（R17-1..3 / H0-11..13）。
 *
 * Part 0 — 静态负向扫描（验收①）：manifest/profile/lockfile 全部精确 `0.1.1-rc.2`，
 *   无 `0.1.0-rc.7` 残留或 rc.7/rc.2 混装（历史 provenance 文本除外）。
 * Part 1 — 一次性 DSH_HOME：
 *   1a. `pnpm install --shamefully-hoist` 安装真实 `@deepseek-ai/dsh-base` +
 *       `@deepseek-ai/dsh-web-app` + `novel-creation-tool`（file:）；
 *   1b. `dsh --dump-config`（真实 CLI 组合）→ 恰好一个 novel-creation-tool row（单 owner）；
 *   1c. 进程内 boot base+plugin：novelCreation/llm/tools 服务断言 + stop 后消失 +
 *       restart 恰好恢复一次（Fiber dispose 零残留）；
 *   1d. 真实 `dsh --profile <name> web --no-open --port 0` 启动 base+web+plugin：
 *       解析 URL 行 → HTTP 200（整树含插件激活），kill（stop）；再次启动（restart/DSH 重启）
 *       → 再次 HTTP 200，kill；
 *   1e. uninstall（bundles 移除 plugin）→ dump-config 零 row；CLI 仍能 boot（HTTP 200）。
 * Part 2 — Client ModuleLoader 装载（R17-3）：built `lib/client.js` 经 rc.2 loader 合同
 *   （queue → registration → factory 物化）注册唯一 `novel-creation-tool` bundle 并产出
 *   client 插件入口；断言 shell.overlay 注册面存在。DOM/Slot 装卸由确定性测试覆盖。
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const profileName = 'i85test';
const DSH_FAMILY_PIN = '0.1.1-rc.2';
const PLUGIN_VERSION = '2.0.0';

const realDshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const appBootDir = join(realDshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
const appBootIndex = join(appBootDir, 'lib', 'index.js');
if (!existsSync(appBootIndex)) {
  throw new Error(`dsh-app-boot not found at ${appBootIndex}; install DeepSeek Harness (DSH) to run the I85 lifecycle smoke`);
}
const { loadProfile, composeEntries, boot } = await import(pathToFileURL(appBootIndex).href);

// 真实 `dsh` CLI 入口（全局 npm 安装的 @deepseek-ai/dsh）。`--profile <name>`
// 后跟应用自身参数（web 命令只是 --profile web 的别名，二者不可叠加）。
const npmPrefixRun = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['prefix', '-g'], { encoding: 'utf8' });
const globalPrefix = (npmPrefixRun.status === 0 ? npmPrefixRun.stdout : '').trim() || join(process.env.APPDATA ?? '', 'npm');
const dshBin = globalPrefix === '' ? '' : join(globalPrefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
if (!existsSync(dshBin)) {
  throw new Error(`dsh CLI not found at ${dshBin}; install the DeepSeek Harness CLI to run the I85 lifecycle smoke`);
}

const fail = (msg) => { throw new Error(`I85 smoke: ${msg}`); };
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');

// Part 0 — 静态负向扫描（验收① / R17-1）。
{
  const pkg = JSON.parse(read('package.json'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const dshDeps = Object.entries(all).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));
  if (dshDeps.length === 0) fail('no DSH family direct dependency declared');
  for (const [name, spec] of dshDeps) {
    if (spec !== DSH_FAMILY_PIN) fail(`DSH family dep ${name} must be pinned exactly at ${DSH_FAMILY_PIN}, got ${spec}`);
  }
  const profile = JSON.parse(read('examples/selected-profile.package.json'));
  if (profile.dependencies?.['@deepseek-ai/dsh-base'] !== DSH_FAMILY_PIN
    || profile.dependencies?.['@deepseek-ai/dsh-web-app'] !== DSH_FAMILY_PIN) {
    fail('selected-profile DSH family pins must equal 0.1.1-rc.2');
  }
  const lock = read('pnpm-lock.yaml');
  if (lock.includes('0.1.0-rc.7')) fail('pnpm-lock.yaml contains 0.1.0-rc.7 residue');
}

// Part 1 — 一次性 DSH_HOME：真实 base+web+plugin。
const home = mkdtempSync(join(tmpdir(), 'dsh-i85-'));
process.env.DSH_HOME = home;
const profileDir = join(home, 'profiles', profileName);
const rootConfig = join(profileDir, 'cordis.yml');
const cleanup = () => {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    // 残留临时 home 无害；绝不掩盖 smoke 的真实结果。
  }
};

function writeManifest(bundles) {
  const manifest = {
    name: `dsh-profile-${profileName}`,
    private: true,
    dependencies: {
      '@deepseek-ai/dsh-base': DSH_FAMILY_PIN,
      '@deepseek-ai/dsh-web-app': DSH_FAMILY_PIN,
      'novel-creation-tool': `file:${repoRoot.replace(/\\/g, '/')}`,
    },
    dsh: { profile: { bundles } },
  };
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}

async function composeRows() {
  const installAnchor = join(appBootDir, 'package.json');
  const profile = loadProfile('dsh', profileName, installAnchor, home);
  const layers = profile.layers.map((layer) => layer.patches);
  if (profile.patches.length > 0) layers.push(profile.patches);
  const composed = composeEntries(layers);
  const rows = composed.filter((row) => row?.id === 'novel-creation-tool');
  return { layers, rows };
}

function dumpConfigRows() {
  const dump = spawnSync(process.execPath, [dshBin, '--profile', profileName, '--dump-config'], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  });
  if (dump.status !== 0) fail(`dsh --dump-config failed:\n${dump.stderr || dump.stdout}`);
  return (dump.stdout.match(/id:\s*novel-creation-tool/g) ?? []).length;
}

/** 启动真实 `dsh --profile <name> [web flags]`，轮询 URL 行 + HTTP 200，返回 { child, port, exited }。 */
async function bootWebViaCli() {
  const child = spawn(process.execPath, [dshBin, '--profile', profileName, '--no-open', '--port', '0'], {
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const exited = new Promise((resolveExit) => child.once('exit', (code, signal) => resolveExit({ code, signal })));
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:(\d+))/);
    if (match) {
      const port = Number(match[2]);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok) return { child, port, exited, output };
      } catch {
        // server 尚未接受连接，继续轮询。
      }
    }
    const done = await Promise.race([exited.then((r) => ({ ...r, settled: true })), new Promise((r) => setTimeout(() => r({ settled: false }), 500))]);
    if (done.settled) fail(`dsh web exited early (${done.code ?? done.signal}):\n${stderr || output}`);
  }
  child.kill('SIGKILL');
  fail(`dsh web did not become ready:\n${output}\n${stderr}`);
}

async function stopWebViaCli(child, exited) {
  child.kill('SIGTERM');
  const result = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ code: null, signal: 'timeout' }), 15000))]);
  if (result.signal === 'timeout') {
    child.kill('SIGKILL');
    fail('dsh web did not stop after SIGTERM');
  }
}

try {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(rootConfig, '[]\n');

  // 1a. 真实安装（提升式布局，与 ~/.dsh/profiles/node_modules 一致）。
  writeManifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'novel-creation-tool']);
  const install = spawnSync('pnpm install --prefer-offline --ignore-scripts --shamefully-hoist', {
    cwd: profileDir,
    shell: true,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    throw new Error(`pnpm install in temp profile failed:\n${install.stderr || install.stdout}`);
  }

  // 1b. 真实 CLI 组合：单 insertion owner（R17-2 / H0-2）。
  if (dumpConfigRows() !== 1) fail('dsh --dump-config must expose exactly one novel-creation-tool row');

  // 1c. 进程内 boot base+plugin：服务级断言 + stop 消失 + restart 恰好恢复一次。
  writeManifest(['@deepseek-ai/dsh-base', 'novel-creation-tool']);
  async function bootBaseOnce() {
    const { layers } = await composeRows();
    return boot('dsh', rootConfig, layers.flat(), () => {});
  }
  function assertHost(ctx) {
    const status = ctx.get('novelCreation', false);
    if (!status || status.version !== PLUGIN_VERSION || status.ready !== true) {
      throw new Error('novelCreation service missing/invalid after selected-profile boot');
    }
    const llm = ctx.get('llm', false);
    const tools = ctx.get('tools', false);
    if (!llm || typeof llm.stream !== 'function') throw new Error('llm service missing/invalid after base boot');
    if (!tools || typeof tools.register !== 'function') throw new Error('tools service missing/invalid after base boot');
  }
  let ctx = await bootBaseOnce();
  assertHost(ctx);
  await ctx.fiber.dispose();
  if (ctx.get('novelCreation', false) !== undefined) fail('novelCreation survived stop (Fiber dispose)');
  ctx = await bootBaseOnce();
  assertHost(ctx);
  await ctx.fiber.dispose();

  // 1d. 真实 CLI 启动 base+web+plugin：boot → HTTP 200 → stop；restart（DSH 重启）→ HTTP 200。
  writeManifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'novel-creation-tool']);
  const first = await bootWebViaCli();
  await stopWebViaCli(first.child, first.exited);
  const second = await bootWebViaCli();
  await stopWebViaCli(second.child, second.exited);

  // 1e. uninstall：bundles 移除 plugin → 零 row；base+web 仍可 boot（HTTP 200）。
  writeManifest(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
  if (dumpConfigRows() !== 0) fail('expected zero novel-creation-tool rows after bundle uninstall');
  const afterUninstall = await bootWebViaCli();
  await stopWebViaCli(afterUninstall.child, afterUninstall.exited);

  // Part 2 — Client ModuleLoader 装载（R17-3）。
  {
    const bundlePath = join(repoRoot, 'lib', 'client.js');
    if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
    const bundle = readFileSync(bundlePath, 'utf8');
    // queue→registration：与 rc.2 dsh-client-modules 的 ClientModuleLoaderTarget 同形。
    const pending = [];
    const windowStub = {
      __ModuleLoader__: {
        mode: 'queue',
        pendingQueue: pending,
        load(registration) { pending.push(registration); },
        create() { throw new Error('create should not be reached in this smoke'); },
      },
    };
    const vm = await import('node:vm');
    const context = vm.createContext({ window: windowStub, console });
    vm.runInContext(bundle, context, { filename: 'lib/client.js' });
    if (pending.length !== 1) fail(`expected one ModuleLoader registration, got ${pending.length}`);
    const registration = pending[0];
    if (registration.id !== 'novel-creation-tool') fail(`registration id must be novel-creation-tool, got ${registration.id}`);
    if (typeof registration.factory !== 'function') fail('registration factory must be a function');
    // 物化：bundle wrapper 内部已调用 `module.exports.default(require)` 并把结果
    // 作为 factory 返回值（client 插件入口）；react 与 dsh-client-runtime/client
    // 由浏览器 module table 提供（stub）。
    const requireStub = (spec) => {
      if (spec === 'react') return { createElement: () => ({}) };
      if (spec === '@deepseek-ai/dsh-client-runtime/client') return { defineStore: () => ({}) };
      throw new Error(`unexpected require(${spec}) from client bundle`);
    };
    const entry = registration.factory(requireStub);
    if (typeof entry?.apply !== 'function') fail('materialized client entry must expose apply()');
    if (!Array.isArray(entry.inject) || !entry.inject.includes('slots') || !entry.inject.includes('remote')) {
      fail('materialized client entry inject must declare slots + remote');
    }
    if (!bundle.includes('shell.overlay')) fail('client bundle must register the shell.overlay slot (unique additive path)');
  }

  console.log('I85 smoke: rc.2 负向扫描 + 真实 base+web+plugin CLI boot/HTTP/stop/restart/uninstall + 进程内服务级 boot/stop/restart + Client ModuleLoader 物化通过');
} finally {
  cleanup();
}
