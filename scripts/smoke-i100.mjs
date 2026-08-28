import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I100 公开 Remote 服务命名统一 smoke（review v2.0 §8#17 / 计划 §18 I100）。
 *
 * 交付物核验：
 * - 三服务生产引用归零：`provide('novelImport'` / `provide('novelExport'` 只出现
 *   在兼容转发层 portability-compat.ts（grep 断言）；
 * - 统一服务落位：import-export-service.ts 导出 createNovelPortabilityService +
 *   NovelPortabilityService（三面方法），orchestration 用统一服务装配 novelImportExport
 *   Remote（grep 断言）；
 * - 兼容转发层存在且 deprecated 标记 + 迁移文档存在（grep 断言）；
 * - 迁移测试在案：portability-migration.test.ts 断言三面方法齐全 + 转发行为等价
 *   （grep + 运行）；
 * - 行为等价：import/export/portability 相关测试 + index 装配测试全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I100 smoke: ${msg}`); };

// Part 1 — 生产引用归零（兼容转发层除外）。
const { join } = await import('node:path');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
});
const productionFiles = [
  ...walk(resolve(repoRoot, 'src/host')),
  ...walk(resolve(repoRoot, 'src/core')),
  ...walk(resolve(repoRoot, 'src/agents')),
];
for (const file of productionFiles) {
  if (file.endsWith('composition/portability-compat.ts')) continue;
  const text = read(file);
  if (/provide\('novelImport'/.test(text) || /provide\('novelExport'/.test(text)) {
    fail(`生产代码仍提供旧服务名：${file}`);
  }
}
// 工厂定义/统一服务文件自身允许保留工厂函数（import-service/export-service 是
// 实现 owner；统一服务消费它们）；只禁止 composition 里旧 provide 与旧名引用。
const baseComposition = read('src/host/composition/base.ts');
if (baseComposition.includes('createHostImportService') || baseComposition.includes('createExportService')) {
  fail('base.ts 仍直接装配旧工厂');
}
const compat = read('src/host/composition/portability-compat.ts');
if (!compat.includes('provide(\'novelImport\'') || !compat.includes('provide(\'novelExport\'')) fail('兼容转发层缺少旧名转发');
if (!compat.includes('@deprecated')) fail('旧名转发未标记 deprecated');

// Part 2 — 统一服务落位 + 迁移文档。
const service = read('src/host/import-export-service.ts');
if (!service.includes('export function createNovelPortabilityService')) fail('缺少统一服务工厂');
if (!service.includes('export interface NovelPortabilityService')) fail('缺少统一服务接口');
for (const method of ['read', 'review', 'exportArchive', 'exportText', 'restore', 'importPreview', 'export', 'serialize', 'parse', 'plainText', 'import', 'proposeConflict']) {
  if (!service.includes(method)) fail(`统一服务缺少方法 ${method}`);
}
const orchestration = read('src/host/composition/orchestration.ts');
if (!orchestration.includes('createNovelPortabilityService') || !orchestration.includes('provideDeprecatedPortabilityAliases')) {
  fail('orchestration 未装配统一服务与兼容转发');
}
if (!existsSync(resolve(repoRoot, 'docs/import-export-service-migration.md'))) fail('迁移/退役文档缺失');

// Part 3 — 迁移测试 + 行为等价。
const migration = read('src/host/portability-migration.test.ts');
if (!migration.includes('I100 novelImportExport 统一服务与兼容转发')) fail('迁移测试缺失');
const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/host/portability-migration.test.ts', 'src/host/import-export-service.test.ts', 'src/index.test.ts', 'src/manifest.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`迁移/装配测试未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I100 smoke: 三服务生产引用归零（兼容转发层除外）+ 统一 novelImportExport + deprecated 转发等价 + 迁移文档/测试全绿');
