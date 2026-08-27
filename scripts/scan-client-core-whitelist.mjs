import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I78 client bundle core 白名单构建扫描（design §14.12；架构审查 §8#5 / R16-5）。
 *
 * 以 esbuild metafile 实测 `src/client.ts` 的完整导入图，收集 `src/core/**` 输入
 * 并与白名单（单一来源 `src/client-bundle-whitelist.ts`，编译产物 lib/…）双向
 * 断言：白名单外 core 引用失败、白名单条目未被使用也失败。白名单本体与设计文档
 * §14.12 显式清单一致，任何一侧漂移都会被扫描暴露。
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** 收集 entry 的 client 图中所有 `src/core/**` 输入（esbuild metafile）。 */
export async function collectClientCoreInputs(entry = 'src/client.ts') {
  const result = await build({
    entryPoints: [resolve(repoRoot, entry)],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    external: ['react'],
    write: false,
    logLevel: 'silent',
    metafile: true,
  });
  return Object.keys(result.metafile.inputs).filter((path) => path.startsWith('src/core/'));
}

/** 运行完整白名单扫描；违规时抛错。 */
export async function runClientCoreWhitelistScan() {
  const { assertCoreWhitelisted } = await import('../lib/client-bundle-whitelist.js');
  const coreInputs = await collectClientCoreInputs();
  const violations = assertCoreWhitelisted(coreInputs);
  if (violations.length > 0) {
    throw new Error(`I78 client bundle 白名单扫描失败:\n${violations.join('\n')}`);
  }
  return coreInputs;
}

// 直接执行（node scripts/scan-client-core-whitelist.mjs）：需先 pnpm build。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runClientCoreWhitelistScan()
    .then((inputs) => console.log(`I78 client bundle 白名单扫描通过（${inputs.length} 个 core 纯模块入图，全部在白名单内）`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
