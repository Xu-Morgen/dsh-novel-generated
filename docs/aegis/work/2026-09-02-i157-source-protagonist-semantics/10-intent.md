# I157 Intent — 来源主角作者语义恢复

## 目标

1. session-create 失败后的重试保留来源角色、处理目标、POV、揭示节奏和逐段裁决。
2. 作者界面不出现角色 ID、候选 ID、初始已知信息 ID 输入；空作品用“由 AI 创建并串联新主角”，已有角色只按名称选择。
3. `idea|background-material|hybrid + adapt-pov` 共用新主角 POV 叙事化路径；LLM 返回稳定 B3 候选并在 B5 中实际引用。

## DoD

- [x] 新 `samples/i157` dev/held-out/gold 在 prompt/schema 变更前冻结，准确率阈值 ≥80%。
- [x] create retry 复用当前 review state 与 Host ranges，不调用 fresh-state reset。
- [x] limited 默认生成隐藏、确定性的 protagonist candidate ID；DOM 无技术 ID 输入。
- [x] idea additive enum 同步 adaptation/reveal/import-plan strict schema 与 contract locks。
- [x] candidate 缺失、ID 漂移、B5 未引用、synopsis/existing-prose 非法路径 fail closed。
- [x] `pnpm run verify:i157` 与 `pnpm run verify:stage-26` 全绿，产物可查。
- [x] 仅提交 I157 文件；用户 DOCX 变更不纳入提交。

## 明确不做

- 不自动接受或绕过 I11 写 B3/B5/C3/C4。
- 不开放 existing-prose 保真导入，不恢复 F1/F2。
- 不改 DOCX 分段、I151、项目归档或 DSH pin。
