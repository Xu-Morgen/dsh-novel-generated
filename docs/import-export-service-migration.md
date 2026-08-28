# 导入/导出/可移植性服务命名统一迁移（I100）

> 迭代卡片：计划 §18 I100（review v2.0 §8#17）。公开契约迁移，必须带兼容期与
> 退役文档，禁止静默破坏既有调用方。

## 背景

此前导入导出域存在三个并存服务：

| 旧服务名 | 承载面 | 方法 |
|---|---|---|
| `novelImport` | 文件导入（I37 确定性导入） | `read` / `review` |
| `novelExport` | 可移植档案（I39） | `export` / `serialize` / `parse` / `plainText` / `import` / `proposeConflict` |
| `novelImportExport` | 受控 wire 面（I69 UI） | `exportArchive` / `exportText` / `restore` / `importPreview` |

同一领域三个服务边界并存，属于命名/服务边界遗留（v1.0 §8#2 后置项）。

## 目标形态（迁移后）

- **单一公开服务 `novelImportExport`**：`createNovelPortabilityService(projectsRoot)`
  组合三面为同一服务对象，Remote 装配面不变（方法/参数/wire 形状零变化）。
- **兼容转发层** `src/host/composition/portability-compat.ts`：
  `novelImport` / `novelExport` 保留为 deprecated 转发（指向统一服务同一实现，
  行为等价），供兼容期旧调用方使用。
- 生产代码中只有兼容转发层允许出现 `provide('novelImport'` / `provide('novelExport'`
  （smoke 断言）。

## 迁移路径与退役

1. 新代码一律消费 `novelImportExport`（含三面方法：wire 四方法 + 文件导入 +
   可移植档案）。
2. 兼容期：`novelImport` / `novelExport` 经转发层可用，等价转发、标记 `@deprecated`。
3. 退役：兼容期结束后删除 `portability-compat.ts` 与 composition 中两处调用，
   旧名不再提供；届时 `novelImportExport` 是唯一公开服务。

## 验收证据

- `pnpm run verify:i100` 全绿（typecheck + pnpm test + build + smoke:i100 +
  stage-11-14 回归 + samples）。
- smoke 断言：三服务生产引用归零（`novelImport`/`novelExport` 的 provide 只存在于
  portability-compat.ts）；迁移测试验证转发行为等价。
