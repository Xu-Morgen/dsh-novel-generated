# I157 Evidence — 来源主角作者语义恢复

## 验收结果

- `pnpm run verify:stage-26`：通过。
- TypeScript：`tsc --noEmit` 与生产构建类型检查通过。
- Vitest：213 个测试文件、1168 项测试全部通过。
- Client bundle：`lib/client.js`，1,486,392 bytes。
- I157 冻结样本：dev 100%，held-out 100%，阈值 80%。
- I157 smoke：重试状态保留、作者侧主角语义、idea POV 合同、新主角生成与 B5 引用守卫全部通过。
- 累计 smoke：I140、I149、I151、I154、I155、I156 全部通过；I153 的“必须显示已有主角 ID”历史断言已由 I157 的“不得显示技术 ID”契约取代，未纳入 Stage 26 门。

## 合同与负向证据

- `idea` 已 additive 纳入 narrative adaptation、reveal 与 unified import plan 的 strict schema/contract locks。
- `idea|background-material|hybrid` 均可选择 POV 叙事化；`synopsis|existing-prose` 仍只允许扩展大纲。
- 新主角候选缺失、候选 ID 漂移或 B5 未实际引用候选时 fail closed。
- 生成的新主角只进入 B3/B5 统一预览，必须经过 I11 确认后才允许落地。
- 用户目录中的 DOCX 删除与新增未纳入 I157 提交。

## 可查产物

- `artifacts/i157-source-protagonist-semantics.json`
- `samples/i157/cases.json`
- `samples/i157/dev.json`
- `samples/i157/held-out.json`
- `samples/i157/gold.json`
