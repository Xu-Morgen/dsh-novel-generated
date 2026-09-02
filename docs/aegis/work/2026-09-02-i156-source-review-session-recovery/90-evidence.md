# I156 验收证据

## 交付结果

- `ImportInterpretationSessionService` 对原子 rename 的 `EPERM/EBUSY/EACCES` 做最多 5 次线性退避；非 transient 与耗尽重试仍 fail closed。
- 来源审阅失败态保留 Host `sourceHash`、paragraph ID/text/range，并提供“重试来源审阅”。无 session 时重建 checkpoint；已有 session 时只重启分析。
- 普通提示保持作者文案，原始错误只在显式“查看技术详情”中展示。

## 验收证据

- `pnpm run verify:stage-25`：通过。
- 全量测试：212 test files / 1163 tests 全绿。
- 生产构建：`tsc -p tsconfig.build.json` 与 Client bundle 通过，`lib/client.js` 1,484,535 bytes。
- I156 聚焦回归：3 test files / 14 tests 全绿；覆盖 Host 三种 transient 错误、非 transient、耗尽重试、Client 两类恢复与高级详情。
- Smoke：`artifacts/i156-source-review-session-recovery.json` 已生成；I140、I149、I151、I153、I154、I155 累计 smoke 全部通过。
- 公开合同：Remote descriptor/result lock、session/schema、DOCX chunks、I151 首次导入触发及 LLM prompt/样本均未修改。

## 现场诊断

2026-09-02 11:13 创建的真实项目目录及基础层文件存在，但 `.import-interpretation-sessions.yaml` 不存在，失败边界位于首次 checkpoint 原子落盘之前；未读取、写入或修复用户真实作品数据。

## 非目标确认

未新增第二持久化格式、文件重上传、Client range 重建、旧六层 fallback、公开合同变更或 F1/F2 能力。用户工作区中的 DOCX 删除/新增未触碰、未纳入提交。
