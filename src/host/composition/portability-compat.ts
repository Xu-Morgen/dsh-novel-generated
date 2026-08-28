import type { NovelPortabilityService } from '../import-export-service.js';

/**
 * I100 兼容转发层（review v2.0 §8#17 / 计划 §18 I100）：公开契约迁移期保留旧
 * 服务名 `novelImport` / `novelExport` 为 deprecated 转发，指向统一公开服务
 * `novelImportExport` 的同一实现（行为等价）。退役路径见
 * `docs/import-export-service-migration.md`；本文件是生产代码中唯二允许出现
 * `provide('novelImport'` / `provide('novelExport'` 的地方（smoke 断言）。
 *
 * @deprecated 新代码一律消费 `novelImportExport` 单一公开服务；兼容期结束后
 * 删除本模块与 composition 中两处调用。
 */
export function provideDeprecatedPortabilityAliases(
  ctx: { provide(name: string, value: unknown): void },
  unified: NovelPortabilityService,
): void {
  ctx.provide('novelImport', Object.freeze({
    read: unified.read,
    review: unified.review,
  }));
  ctx.provide('novelExport', Object.freeze({
    export: unified.export,
    serialize: unified.serialize,
    parse: unified.parse,
    plainText: unified.plainText,
    import: unified.import,
    proposeConflict: unified.proposeConflict,
  }));
}
