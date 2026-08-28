import { describe, expect, it } from 'vitest';
import { createNovelPortabilityService } from './import-export-service.js';
import { provideDeprecatedPortabilityAliases } from './composition/portability-compat.js';

/**
 * I100 公开 Remote 服务命名统一迁移测试（review v2.0 §8#17 / 计划 §18 I100）：
 * 单一公开服务 `novelImportExport` 组合导入/导出/可移植性三面；旧名
 * `novelImport` / `novelExport` 经兼容转发层 deprecated 转发，行为等价。
 * 退役路径见 docs/import-export-service-migration.md。
 */
describe('I100 novelImportExport 统一服务与兼容转发', () => {
  it('统一服务暴露全部三面方法（wire + 文件导入 + 可移植档案）', () => {
    const service = createNovelPortabilityService(joinForTest());
    for (const method of ['exportArchive', 'exportText', 'restore', 'importPreview',
      'read', 'review', 'export', 'serialize', 'parse', 'plainText', 'import', 'proposeConflict']) {
      expect(typeof (service as unknown as Record<string, unknown>)[method], `missing ${method}`).toBe('function');
    }
  });

  it('旧名 deprecated 转发指向统一服务同一实现（行为等价）', async () => {
    const unified = createNovelPortabilityService(joinForTest());
    const provided: Record<string, unknown> = {};
    provideDeprecatedPortabilityAliases({ provide: (name, value) => { provided[name] = value; } }, unified);

    const novelImport = provided['novelImport'] as Record<string, unknown>;
    const novelExport = provided['novelExport'] as Record<string, unknown>;
    expect(novelImport).toBeDefined();
    expect(novelExport).toBeDefined();
    // 转发方法逐一指向统一服务对应实现。
    for (const method of ['read', 'review']) {
      expect(novelImport[method]).toBe((unified as unknown as Record<string, unknown>)[method]);
    }
    for (const method of ['export', 'serialize', 'parse', 'plainText', 'import', 'proposeConflict']) {
      expect(novelExport[method]).toBe((unified as unknown as Record<string, unknown>)[method]);
    }
    // 转发不暴露统一服务的 wire 面（旧名边界不变）。
    expect(novelImport['exportArchive']).toBeUndefined();
    expect(novelExport['restore']).toBeUndefined();
    // 纯函数行为等价：serialize/parse 经旧名与统一服务调用同一实现。
    expect(novelExport['serialize']).toBe(unified.serialize);
    expect(novelExport['parse']).toBe(unified.parse);
  });
});

function joinForTest(): string {
  // 仅需一个合法的 projectsRoot（测试不触盘）。
  return process.cwd();
}
