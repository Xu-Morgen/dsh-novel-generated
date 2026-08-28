import { spawnCaptured } from './spawn-captured.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I91 descriptor↔adapter↔client namespace 三方类型耦合 smoke（review v2.0
 * §3.1 根因 / 计划 §18 I91）。
 *
 * 交付物核验：
 * - 接线层类型断言归零：生产接线（src/host/remote/* + src/host/composition/* +
 *   src/index.ts）无 `...args: any[]`、无 `as unknown as`；
 * - 局部 helper 泛型透传：remote 各文件的 `): InvocationDescriptor` 返回标注归零
 *   （否则幻影类型被扩宽抹掉且不报错 —— I91 最大漏改点）；
 * - Client 消费处强转归零：onboarding.ts 的 `as unknown as` 全部消除（unwrap
 *   泛型化后派生 result 类型直接到达）；
 * - 签名变更负向/正向 tsc 夹具（host 侧 + client 侧各一对）：给一个 Remote 方法
 *   增/删参数后接线层 call 或 Client 派生 namespace 调用处编译错，且报错定位在
 *   夹具文件。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I91 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const matchesIn = (paths, pattern) => paths.flatMap((p) => codeLines(p).filter((line) => line.includes(pattern)));

// Part 1 — 接线层类型断言归零 + helper 泛型透传（I91 交付物 grep 断言）。
{
  const remoteDir = resolve(repoRoot, 'src/host/remote');
  const remoteFiles = readdirSync(remoteDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const wiringFiles = [...remoteFiles.map((f) => `src/host/remote/${f}`),
    'src/host/composition/base.ts', 'src/host/composition/management.ts', 'src/host/composition/orchestration.ts', 'src/index.ts'];

  // 1a) 接线层 `...args: any[]` 归零（I91 消除 `RemoteMethodSpec.call: (...args: any[])`）。
  const anyArgs = matchesIn(wiringFiles, '...args: any[]');
  if (anyArgs.length !== 0) fail(`wiring layer still has ${anyArgs.length} ...args: any[]:\n${anyArgs.join('\n')}`);

  // 1b) 接线层 `as unknown as` 归零（I91 消除 `adapter as unknown as TService`）。
  const asUnknownAs = matchesIn(wiringFiles, 'as unknown as');
  if (asUnknownAs.length !== 0) fail(`wiring layer still has ${asUnknownAs.length} as unknown as:\n${asUnknownAs.join('\n')}`);

  // 1c) 局部 `xxxInvocation` helper 的 `): InvocationDescriptor` 返回标注归零
  //     （泛型透传；probe/project-lifecycle/editor 的直接 const 标注同样已删）。
  const helperAnnotated = matchesIn(remoteFiles.map((f) => `src/host/remote/${f}`), '): InvocationDescriptor');
  if (helperAnnotated.length !== 0) fail(`remote helpers still carry : InvocationDescriptor annotations:\n${helperAnnotated.join('\n')}`);
  const constAnnotated = matchesIn(['src/host/remote/probe.ts', 'src/host/remote/project-lifecycle.ts', 'src/host/remote/editor.ts'], ': InvocationDescriptor');
  if (constAnnotated.length !== 0) fail(`remote descriptor consts still carry : InvocationDescriptor annotations:\n${constAnnotated.join('\n')}`);

  // 1d) Client 消费处强转归零：onboarding.ts 的 `as unknown as` 全部消除
  //     （unwrap 泛型化后派生 result 类型直接到达，review 附录 A 类型擦除点）。
  const clientCasts = matchesIn(['src/client/onboarding.ts'], 'as unknown as');
  if (clientCasts.length !== 0) fail(`src/client/onboarding.ts still has as unknown as:\n${clientCasts.join('\n')}`);
}

// Part 2 — 签名变更正/负 tsc 夹具（host 侧 + client 侧各一对）。
{
  // Client 夹具经 remote-namespace → ../remote.js 的完整类型图会触及 core/io/yaml.ts
  // （其 js-yaml 依赖由仓库 src/types/js-yaml.d.ts 环境声明补齐；独立 tsc 需显式入程）。
  const tscArgs = ['exec', 'tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--types', 'node', 'src/types/js-yaml.d.ts'];
  const positive = [
    ['host', 'scripts/fixtures/i91-positive-host.ts'],
    ['client', 'scripts/fixtures/i91-positive-client.ts'],
  ];
  for (const [side, file] of positive) {
    const run = spawnCaptured('pnpm', [...tscArgs, file], { cwd: repoRoot, encoding: 'utf8' });
    if (run.status !== 0) fail(`positive ${side} tsc fixture must compile (exit ${run.status}):\n${run.output || run.stderr}`);
  }
  const negative = [
    ['host', 'scripts/fixtures/i91-negative-host.ts', 'descriptor 参数删减后接线层 call 必须编译错'],
    ['client', 'scripts/fixtures/i91-negative-client.ts', 'descriptor 参数增补后 Client 派生 namespace 调用处必须编译错'],
  ];
  for (const [side, file, intent] of negative) {
    const run = spawnCaptured('pnpm', [...tscArgs, file], { cwd: repoRoot, encoding: 'utf8' });
    if (run.status === 0) fail(`negative ${side} tsc fixture must FAIL to compile (${intent})`);
    if (!run.output.includes(file)) fail(`negative ${side} fixture failure must be located in ${file}:\n${run.output.slice(0, 800)}`);
  }
}

console.log('I91 smoke: 接线层类型断言归零（any[]/as unknown as/: InvocationDescriptor）+ Client 强转归零 + 正负夹具（host/client）通过');
