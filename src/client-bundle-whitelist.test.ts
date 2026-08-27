import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { assertCoreWhitelisted, CLIENT_CORE_WHITELIST } from './client-bundle-whitelist.js';

/**
 * I78 client bundle 白名单扫描（design §14.12；架构审查 §8#5 / R16-5）。
 * 正向：真实 bundle（esbuild metafile 实测 src/client.ts 全导入图）的 core 输入
 * 必须与白名单完全一致；负向：白名单外 core 引用失败、白名单条目未使用失败。
 */

describe('I78 client bundle core 白名单', () => {
  it('正向：真实 client bundle 的 core 输入与白名单完全一致', async () => {
    const result = await build({
      entryPoints: ['src/client.ts'],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: 'es2020',
      external: ['react'],
      write: false,
      logLevel: 'silent',
      metafile: true,
    });
    const coreInputs = Object.keys(result.metafile.inputs).filter((path) => path.startsWith('src/core/'));
    expect(coreInputs.length).toBeGreaterThan(20);
    expect(assertCoreWhitelisted(coreInputs)).toEqual([]);
  });

  it('负向：白名单外 core 引用（如含 node:fs 的 core/project）必须失败', () => {
    const violations = assertCoreWhitelisted([...CLIENT_CORE_WHITELIST, 'src/core/project/index.ts']);
    expect(violations.join('\n')).toContain('src/core/project/index.ts');
  });

  it('负向：白名单条目未被使用（过期条目）必须失败', () => {
    const violations = assertCoreWhitelisted(CLIENT_CORE_WHITELIST.slice(1));
    expect(violations.join('\n')).toContain(CLIENT_CORE_WHITELIST[0]);
  });

  it('负向：同时混入白名单外引用与未使用条目时全部报告', () => {
    const violations = assertCoreWhitelisted(['src/core/schema/characters.ts']);
    expect(violations.length).toBeGreaterThan(1);
  });
});
