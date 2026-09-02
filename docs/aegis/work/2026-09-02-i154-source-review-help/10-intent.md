# I154 DoD — 来源审阅解释提示

- 目标：在来源角色、段落来源类型、段落处理及“合并此分类”旁增加统一、详细、可访问的帮助提示。
- canonical owner：`src/client/import-interpretation-review.ts` 的纯 renderer 与 `src/client/styles/onboarding.ts`；不新增状态 owner。
- 正向验收：四类帮助按钮可见；hover 与键盘 focus 展开 tooltip；五种来源角色、五种来源片段分类、四种处理状态和合并副作用均有详细中文解释。
- 负向验收：帮助按钮为 `type=button` 且不触发业务 callback；原“合并此分类”仍只提交 accepted；不改 select canonical value、确认门或写入行为。
- 可访问性：原生 `title` 降级；按钮 `aria-label/aria-describedby` 指向 `role=tooltip`；focus-within 与 hover 同等显示。
- 当前分段事实：目录 DOCX 审阅单元来自 Host 4000 字符 chunk，一张卡可能含多个 Word 段落；提示称“来源片段”，本迭代不修改分段。
- 明确不做：不改 DOCX reader/chunkText/paragraph ID，不改 enum/session/Remote/prompt/schema/样本，不恢复 F1/F2。
- 验证：`pnpm run verify:i154`；`pnpm run verify:product-flow`；`pnpm run verify:stage-23`。
- 产物：`artifacts/i154-source-review-help.json`。
