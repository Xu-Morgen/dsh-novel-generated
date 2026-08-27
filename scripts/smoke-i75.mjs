import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I75 共享 Remote 接线层与组合根收敛 smoke（架构审查 §9#1 / §8#3 / §6.3）。
 *
 * 交付物核验：
 * - 接线层类型断言归零：生产代码无 `as Parameters<...>`；`src/index.ts` 与
 *   `src/host/remote/` 无 `as never`；组合根 27 个 `(dispose) => ctx.effect(...)`
 *   钩子与 6 次 `resolveA2GenerationConfig(await settingsIndex.load())` 闭包收敛。
 * - 复制源唯一：`param()`/`xxxInvocation()` 全量工厂只有 shared.ts 一份；
 *   `defineRemote` 取代 16 个 bindRemote 适配块（bindRemote 在 index.ts 归零）。
 * - 类型安全恢复负向夹具：domain 方法签名变更在接线层即报编译错（tsc 负向/正向
 *   对照夹具）。
 * - 演示性新增+回退：新增一个 Remote 方法只触及 service + descriptor + 接线规格
 *   三个文件，共享接线层零改动（一次性演示，结束后回退删除）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I75 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const countIn = (p, pattern) => codeLines(p).filter((line) => line.includes(pattern)).length;

const remoteDir = resolve(repoRoot, 'src/host/remote');
const allRemoteFiles = readdirSync(remoteDir).filter((f) => f.endsWith('.ts') && f !== 'shared.ts' && f !== 'common.ts');
const allSrcTs = [];
const walkSrc = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) allSrcTs.push(path);
  }
};
walkSrc(resolve(repoRoot, 'src'));

// Part 1 — 接线层类型断言归零 + 组合根收敛 + 复制源唯一。
{
  const index = read('src/index.ts');
  const shared = read('src/host/remote/shared.ts');

  // 1a) 生产代码 `as Parameters<...>` 归零（I75 消除 18 处；审查 §3.3）。
  const asParameters = allSrcTs.flatMap((p) => codeLines(p).filter((line) => line.includes('as Parameters<')));
  if (asParameters.length !== 0) fail(`production code still has ${asParameters.length} as Parameters<...> assertion(s):\n${asParameters.join('\n')}`);

  // 1b) 接线层 `as never` 归零（I75 消除 6 处，含审查 §3.3 的 3 处零成本项）。
  const asNever = ['src/index.ts', ...allRemoteFiles.map((f) => `src/host/remote/${f}`)]
    .flatMap((p) => codeLines(p).filter((line) => line.includes('as never')));
  if (asNever.length !== 0) fail(`wiring layer still has as never:\n${asNever.join('\n')}`);

  // 1c) 组合根重复闭包收敛：27 个 dispose 钩子 → onFiberDispose；6 次 settings 闭包 → resolveGenerationSettings。
  if (countIn('src/index.ts', '(dispose) => ctx.effect(') !== 0) fail('index.ts still has duplicated (dispose) => ctx.effect(...) hooks');
  if (countIn('src/index.ts', 'resolveA2GenerationConfig(await settingsIndex.load())') !== 0) fail('index.ts still duplicates resolveA2GenerationConfig(await settingsIndex.load())');
  if (!index.includes('const onFiberDispose = (dispose: () => void): void => { ctx.effect(() => dispose); };')) fail('index.ts missing the unified onFiberDispose hook');
  if (!index.includes('const resolveGenerationSettings = async') || !index.includes('resolveA2GenerationConfig(a2Config).settings;')) fail('index.ts missing the unified resolveGenerationSettings closure');

  // 1d) 16 个 bindRemote 适配块 → defineRemote（bindRemote 在组合根归零）。
  const bindRemoteCount = countIn('src/index.ts', 'bindRemote(');
  const defineRemoteCount = countIn('src/index.ts', 'defineRemote(');
  if (bindRemoteCount !== 0) fail(`index.ts still has ${bindRemoteCount} bindRemote(...) call(s)`);
  if (defineRemoteCount !== 16) fail(`expected 16 defineRemote(...) wiring blocks, got ${defineRemoteCount}`);

  // 1e) `param()` 全量工厂只有 shared.ts 一份（19 份逐文件复制归零）。
  for (const f of allRemoteFiles) {
    const copy = countIn(`src/host/remote/${f}`, 'const param = ');
    if (copy !== 0) fail(`src/host/remote/${f} still defines a local param() copy`);
  }
  const paramFactoryCount = countIn('src/host/remote/shared.ts', 'export function param(');
  if (paramFactoryCount !== 1) fail('shared.ts must be the single param() factory source');

  // 1f) shared 接线层是泛型机制：代码中不得包含任何 novel-* 服务名（接线与领域解耦；
  // 注释里的文档性引用除外，故按代码行过滤）。
  const sharedCode = codeLines('src/host/remote/shared.ts');
  const novelNames = sharedCode.filter((line) => /novel[A-Z]/.test(line));
  if (novelNames.length !== 0) fail(`shared.ts is not generic — contains service-specific names:\n${novelNames.join('\n')}`);

  // 1g) 构建产物同样干净（tsc 保留注释，同样过滤后断言）。
  if (!existsSync(resolve(repoRoot, 'lib/index.js'))) fail('lib/index.js missing — run `pnpm build` first');
  const libIndex = codeLines('lib/index.js');
  if (libIndex.some((line) => line.includes('as Parameters<') || line.includes('as never'))) fail('lib/index.js still carries wiring-layer type assertions');
  const libRemoteDir = resolve(repoRoot, 'lib/host/remote');
  if (existsSync(libRemoteDir)) {
    for (const f of readdirSync(libRemoteDir).filter((name) => name.endsWith('.js'))) {
      const libLines = codeLines(join('lib/host/remote', f));
      if (libLines.some((line) => line.includes('as Parameters<') || line.includes('as never'))) fail(`lib/host/remote/${f} still carries wiring-layer type assertions`);
    }
  }
}

// Part 2 — 类型安全恢复负向/正向 tsc 夹具。
{
  const tscArgs = ['exec', 'tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--types', 'node'];
  const positive = spawnSync('pnpm', [...tscArgs, 'scripts/fixtures/i75-positive-signature.ts'], { cwd: repoRoot, encoding: 'utf8' });
  if (positive.status !== 0) fail(`positive tsc fixture must compile (exit ${positive.status}):\n${positive.stderr || positive.stdout}`);
  const negative = spawnSync('pnpm', [...tscArgs, 'scripts/fixtures/i75-negative-signature.ts'], { cwd: repoRoot, encoding: 'utf8' });
  if (negative.status === 0) fail('negative tsc fixture must FAIL to compile (domain signature change must error at the wiring layer)');
  if (!(negative.stderr || negative.stdout).includes('i75-negative-signature')) {
    fail(`negative fixture failure must be located in i75-negative-signature.ts:\n${(negative.stderr || negative.stdout).slice(0, 800)}`);
  }
}

// Part 3 — 演示性新增 + 回退：新增一个 Remote 方法只触及 3 个文件（service /
// descriptor / 接线规格），共享接线层零改动。一次性演示文件，跑完即回退删除。
{
  const demoFile = join(repoRoot, 'scripts', `.i75-demo-${process.pid}.ts`);
  try {
    writeFileSync(demoFile, [
      '/** I75 演示性新增（一次性，smoke 结束后回退删除）。 */',
      "import { defineRemote, param, remoteInvocation } from '../src/host/remote/shared.js';",
      "import { strictCodec, stringCodec } from '../src/host/remote/common.js';",
      "import { z } from 'zod';",
      '',
      '// 1) domain service 新增方法（service 文件）。',
      'interface DemoSearchService {',
      '  search(projectId: string, query: string): Promise<{ total: number }>;',
      '}',
      'const demoSearch: DemoSearchService = {',
      "  async search(projectId, query) { return { total: projectId === 'demo' && query === '灯' ? 2 : 0 }; },",
      '};',
      '',
      '// 2) remote 文件新增 wire descriptor。',
      "const demoSearchInvocation = remoteInvocation('novelDemoSearch', 'search', [",
      "  param('projectId', stringCodec),",
      "  param('query', stringCodec),",
      "], strictCodec('novel-creation-tool#demoSearch:result', z.object({ total: z.number().int().nonnegative() }).strict()));",
      "if (demoSearchInvocation.id !== 'novel-creation-tool/novelDemoSearch/search') throw new Error('demo descriptor id mismatch');",
      '',
      '// 3) 接线规格（index.ts 的 defineRemote spec）；shared.ts/common.ts/remote.ts 零改动。',
      "const adapter = defineRemote('novelDemoSearch', 'novelDemoSearch', demoSearch, [",
      "  { method: 'search', call: (projectId: string, query: string) => demoSearch.search(projectId, query) },",
      ']);',
      "const binding = (adapter as unknown as { typertRemote?: { serviceKey?: string; namespace?: string } }).typertRemote;",
      "if (binding?.serviceKey !== 'novelDemoSearch' || binding?.namespace !== 'novelDemoSearch') throw new Error('demo binding mismatch');",
      '',
      "const result = await adapter.search('demo', '灯');",
      'if (result.total !== 2) throw new Error(`demo dispatch failed: ${JSON.stringify(result)}`);',
      "console.log('I75 demo new-method cross-section: service + descriptor + wiring spec only, shared machinery untouched OK');",
      '',
    ].join('\n'));
    const run = spawnSync('pnpm', ['exec', 'tsx', demoFile], { cwd: repoRoot, encoding: 'utf8' });
    if (run.status !== 0) fail(`demo new-method cross-section must run (exit ${run.status}):\n${run.stderr || run.stdout}`);
    if (!run.stdout.includes('shared machinery untouched')) fail('demo did not reach its success assertion');
  } finally {
    // 回退：删除一次性演示文件，仓库保持干净。
    try { rmSync(demoFile, { force: true }); } catch {}
  }
}

console.log('I75 smoke: 共享 Remote 接线层（类型断言归零/复制源唯一/组合根收敛/负向夹具/演示性新增+回退）通过');
