# I154 验收证据

## 交付结果

- 在“来源角色”“段落来源类型”“段落处理”和“合并此分类”旁统一增加经典圆形问号提示按钮。
- 鼠标 hover 与键盘 focus 均显示同一份详细提示；原生 `title` 作为降级路径，按钮通过 `aria-describedby` 关联 `role=tooltip` 内容。
- 提示完整解释五种来源角色、五种来源片段分类、四种处理状态，以及“合并此分类”仅接受当前分类、不拼接相邻片段且不立即写入领域数据的副作用边界。
- 面向作者的提示使用“导入服务切分出的来源片段”，明确一张卡可能包含多个 Word 段落，不暴露内部 Host 术语。
- 帮助按钮为 `type=button`，不触发业务回调；既有合并操作仍只把当前片段设为 `accepted`。

## 自动验证

- `pnpm run verify:i154`：通过。
  - TypeScript 类型检查通过。
  - Vitest：212 test files passed，1153 tests passed。
  - Client build：`lib/client.js` 生成成功。
  - I154 smoke：通过。
- `pnpm run verify:stage-23`：通过。
  - I154 与 product-flow 两轮全量回归均为 212 test files / 1153 tests 全绿。
  - I140、I149、I151、I153、I154 smoke 全部通过。
- 定向产品夹具：`src/client/import-interpretation-review.test.ts` 6/6、`src/client-onboarding-docx.test.ts` 2/2 通过。
- 可访问性回归：`src/client-shell-responsive.test.ts` 9/9 通过；保留可见键盘焦点，不增加 `outline: none`。

## 环境复核

首次全量回归中，既有 I104/I111/文本 mutation 三个文件型用例在 Windows 并发负载下触发固定 5 秒超时；隔离复跑分别在 262 ms、583 ms、220 ms 内通过，随后原样 I154 门禁完整通过。未放宽测试超时，也未修改旧业务用例。

Stage 23 首次运行准确拦截了新增提示中的内部术语 `Host`；文案改为“导入服务切分出的来源片段”后，聚焦测试 8/8、I140 最终作者词汇门及完整 Stage 23 门禁均通过。

## 产物

- `artifacts/i154-source-review-help.json`
- `scripts/smoke-i154.mjs`

## 明确未改

- DOCX reader、换行规范化、4000 UTF-16 单元 chunk 算法与 paragraph ID 均未改变。
- 来源枚举、session、Host/Remote、prompt/schema、样本与领域写入合同均未改变。
- 未恢复后置 F1/F2 导入基础设施或正文保真范围。
