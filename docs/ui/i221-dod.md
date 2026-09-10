# I221 DoD：重复角色合并

验收完成：`pnpm run verify:stage-65`（含 verify:i221）全绿，264 文件 / 1286 测试，历史样本与累计桌面回归全绿。实际 Electron 与独立打包程序均通过；证据在 `artifacts/desktop/ui/i221/`、`artifacts/desktop/ui/i221-packaged/`（validation.json、merge-preview.png、merged.png）。

- 目标：作者选择保留身份、逐项资料来源、状态和知情来源，预览后经 I11 迁移当前引用并冻结原角色。
- Owner：B3、B5、C1、C2、C3、C5、timeline 各自原有 Host owner；C3 增加仅供身份纠正的内部操作，正常知情递增规则不变。strict additive 合并预览/决定/恢复列表。
- 恢复：I11 保存完整前后快照；已接受操作可重开续做，按层比较前/后状态，禁止覆盖中途无关编辑。源角色冻结为最后提交标记。
- 验收：拒绝零领域写、过期拒绝、同角色拒绝、逐字段选择、知情不并集、引用去重、保留正文与历史、失败后续做与重开幂等；strict 双向负向和 Electron UI。
- 边界：冲突关系会阻止合并并要求先处理关系；不擅自删除关系、修改历史事实、重写历史正文，不自动修复用户作品。
- 验证：verify:i221 / verify:stage-65（完整测试与原样本、累计 smoke）。
