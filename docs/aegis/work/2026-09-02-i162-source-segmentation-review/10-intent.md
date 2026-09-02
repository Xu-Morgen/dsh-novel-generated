# I162 Intent — 来源处理建议与作者可控分段

## 结论

段落来源类型必须保留。它是幕后事实、作者指令与呈现提示不直接进入读者可见大纲/正史/正文的生成安全输入，不是可删除的展示字段。

## DoD

- [x] 类型建议旁显示确定性的段落处理建议，且不修改 LLM prompt/schema/样本。
- [x] 作者可在光标处分段、与下一来源片段合并；原文逐字不变，range 有序无重叠。
- [x] 非法首尾、代理对中间、非相邻合并和超过 200 段 fail closed。
- [x] 分段变化 discard 旧 session，清空陈旧分类并精确创建/分析一个新 session。
- [x] `edited` 只由实际改分类自动产生，不再是与接受同义的手选项。
- [x] 确认摘要可选携带最终 `role`；旧无 role session/调用方兼容。
- [x] `pnpm run verify:i162`、`pnpm run verify:product-flow` 与 `pnpm run verify:stage-29` 全绿，smoke 产物可查。
- [x] 仅提交 I162 文件；用户 DOCX 变更不纳入提交。

## 明确不做

- 不修改来源原文、sourceHash、分类枚举或 LLM 输出。
- 不写 B/C/C5，不开放正文保真导入，不恢复 F1/F2。
- 不修改 I11、非空作品门或 DSH 宿主基线。
