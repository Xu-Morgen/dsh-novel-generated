# I219 DoD：跨阶段主角重复防护与复用

- 目标：有基础角色时不再断言素材无主角；同名跨阶段主角拒绝追加，提供复用基础角色后重试后续步骤的入口；计划写入前再次阻断。
- Owner：LLM 大纲生成提示与身份校验、Host plan 合并、Desktop source-plan 候选身份选择；既有 IPC 形状不变，I11 最终确认沿用。
- 明确不做：不自动凭名字合并，不改真实作品，不额外增加角色 LLM 调用；冻结/删除及跨层合并独立后续切片。
- 样本：实现前冻结 dev/held-out 重名/复用/不同人样本，阈值 100%；旧样本不修改。
- 验收：生成重复拒绝且零作品写；合并绕过失败；复用既有角色无新候选、保留基础角色完整资料；失败重试不重跑基础分析；实际 Electron 重复→复用→确认写入一位主角。
- 验证：verify:stage-63（含 verify:i219）全绿；260 文件 / 1281 测试，dev/held-out 格式身份样本 4/4，实际 Electron 重复拒绝→复用→I11 单主角写入及历史桌面/样本回归通过。
- 证据：`artifacts/i219-verification.log`、`artifacts/desktop/ui/i219/validation.json`、`duplicate-reuse.png`、`reused-applied.png`。无新增公开合同；真实作品未改动。下一步 I220。
