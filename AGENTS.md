# AGENTS.md — AI 执行约定

本文件是 AI 编码工具在本仓库工作时自动读取的固定约定。用户每次只发送「单迭代执行模板」（格式：`执行迭代 Ixx`），其余规则一律以本文件为准。

## 1. 项目与权威文档

项目：AI 长篇小说创作器（结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链）。

权威文档（优先级从高到低）：

1. `docs/novel-creation-tool-design.md`（v1.4）—— 需求与架构唯一权威来源。
2. `docs/novel-creation-tool-development-plan.md`（v1.4）—— 执行层，68 个迭代，每一步从它的 §5 迭代卡片出发。
3. `docs/novel-creation-tool-requirements.md`（v1.4）—— 覆盖矩阵，用于核对某需求是否已被某迭代覆盖。

## 2. 总控铁律

- 一迭代一任务：每次只执行一个 Ixx，绝不跨迭代顺手改别的。
- 动手前先读计划 §5 该迭代的「范围 / 明确不做 / 交付物 / 验收 / 验证」，填 §4 DoD 卡片，再写代码。
- 确定性模块：实现 → 回归测试 + 负向测试 → `npx vitest run` 全绿。
- LLM 模块：先建/更新样本集（含 held-out 子集）再改 prompt/schema，跑样本回归；低于阈值即失败，禁止「接受并继续」。
- 集成点先接 mock：任何接 LLM 的集成，先 fake backend / mock parser 跑通管道，再换真实 LLM。
- 任何「用户确认」必须复用 I4a ConfirmationGate，禁止各迭代临时实现。
- 地基切片必配「消费者夹具」（至少一条按下游消费方式的测试）。
- 样本禁改：禁止为让测试通过而修改样本/金标/阈值，违者该迭代判失败并回退（§7.15）。
- 验收不达标 = 未完成，不得进入下一迭代；超范围想法记 backlog，不在本迭代实现。

## 3. 完成定义（DoD）

每个迭代以「确定性断言绿 + 负向断言绿 +（LLM 模块时）样本回归达标 + smoke 产物可查 + 一次干净 commit」为完成，不以「代码写完」为完成。

## 4. Commit 与代码注释规范

### commit 消息格式

```text
<type>(Ixx): <一句话目标>

- 做了什么：本迭代范围
- 为什么：设计依据 / 决策引用（标 § 编号）
- 如何验证：测试命令 + 结果 / 样本准确率
- 明确不做：本迭代有意留白
```

### 纪律

- type：`feat` / `test` / `docs` / `refactor` / `fix`。
- 一次迭代一个 commit；禁止把多个迭代的改动混进一个 commit。
- 提交前自检：`git status` 只含本迭代文件；`git diff` 无 console.log / 临时文件 / 注释掉的死代码；测试绿。
- 绝不提交 node_modules、.env、真实 API key（已入 `.gitignore`）。

### 代码注释

- 注释「为什么 / 契约 / 决策」，不注释「显而易见做什么」。
- 每个引擎模块、每层 Schema、每个扩展点的**公共接口与契约**必须写 JSDoc，写明语义与不变式（如 CanonLedger append-only、ConfirmationGate 幂等、C1.knownTo 与 C3 知情边界）。
- 涉及设计决策处标注 § 编号（如「见设计 §6.6 逐层解析」）。
- TODO/FIXME 必须带迭代号与理由，否则视为残留，不得提交。

## 5. 目录结构约定

- 顶层：`src/` 源码、`scripts/` demo 与回归脚本、`projects/` 作品数据、`samples/` LLM 样本、`docs/` 文档、`contracts/` 契约锁。
- `src/` 一模块一目录，命名与计划 §5 对齐：
  - `src/core/{project,io,schema,state,canon,confirm,assemble,relationship,outline,knowledge,validate,pipeline,settings-index}/`
  - `src/llm/{backend,parse,validate,template}/`
  - `src/plugin/`、`src/ui/editor/`、`src/import/`、`src/export/`、`src/write/`、`src/agents/`
- 层 Schema 集中在 `src/core/schema/`（rules.ts、style.ts、characters.ts、worldview.ts、relationship.ts、outline.ts、knowledge.ts…）。
- 数据目录由 I2 的 `createProject()` 生成（对应设计 §10.1），源码不硬编码路径。
- 新迭代只在自属目录内新增文件；不改动已交付目录的语义；跨模块共享类型走 `contracts/` 契约锁。
- 不创建任何空目录（git 不跟踪空目录）。

## 6. 阶段收尾

每阶段末跑 `npm run demo:stage-N` 与全量 `npx vitest run`（I19b 起加全样本集回归），确认本阶段及之前产物累积可用；出现回归先定位到具体迭代，回退到上一可用 commit 修复，不带着红灯进入下一阶段。

## 7. 汇报格式（每迭代结束输出）

交付物清单 / 验收证据（测试输出、样本准确率、smoke 路径）/ commit hash / 下一步迭代。同时输出「交接块」（刚完成、下一步、本阶段引入的契约、backlog），供换窗口续接。
