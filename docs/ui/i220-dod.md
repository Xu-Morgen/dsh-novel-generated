# I220 DoD：角色冻结、恢复与受控删除

验收完成：`pnpm run verify:stage-64` 全绿，262 文件 / 1283 测试；包含 verify:i220、I219 身份样本、历史 held-out 与 Electron 回归。桌面证据：`artifacts/desktop/ui/i220/validation.json`、`frozen.png`、`referenced-delete-blocked.png`。

- 目标：提供真实角色管理入口，预览角色当前引用后经 I11 冻结、恢复或删除；删除可恢复，不改写历史资料。
- Owner：CharacterRepository 增加独立生命周期文件（旧 B3 schema 不变），Host 管理编排/I11 与引用扫描，Desktop strict additive 管理方法及角色页消费者。
- 语义：冻结保留角色及历史读取，阻止角色修改和以其为当前角色的生成；自动生成候选不选冻结角色。删除保留可恢复记录，仅允许引用检查通过的角色；被引用时展示原因并提供冻结选项。
- 验收：冻结/恢复重开有效、写作消费者与更新拒绝冻结、无引用删除/恢复、引用阻止删除、I11 拒绝零领域写/幂等/过期拒绝、未知角色与伪造参数失败；strict 输入/输出负向与实际 Electron 管理入口。
- 验证：verify:i220 / verify:stage-64；全量与旧样本。I219 全绿提交后才实施。
- 明确不做：不硬删除历史事件、不以“死亡”替代冻结、不静默移除引用；跨层合并属于 I221。
