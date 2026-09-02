# I163 Evidence — 来源解释异步失败重试闭环

## 验收结果

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm run verify:i163`：通过。
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm run verify:stage-30`：通过。
- 全量测试：215 个测试文件、1177 条测试全部通过。
- Client 构建：`lib/client.js`，1,493,787 bytes。
- I163 smoke：failed job 同输入原位重试、错配 fail closed、原始错误详情、同 session 消费与迟到响应守卫全部通过。
- 产品流累积回归：I140、I149、I151、I153、I154 与 I162 smoke 全部通过。

## 可查产物

- `artifacts/i163-import-analysis-retry.json`
- `contracts/stage19/import-interpretation-remote.json` SHA-256 保持 `9f8427f805563aaca71d514c21e7e3b057e2d5df234cafb493cfacb85afa36b5`。

## 范围核对

- 未新增或修改 Remote/schema。
- 未修改 LLM prompt、解析器、样本、gold 或阈值。
- 未修改 session YAML、来源原文/I162 分段、B/C/C5、I11 或 F1/F2。
- 用户维护的 DOCX 删除/新增未纳入 I163 提交。
