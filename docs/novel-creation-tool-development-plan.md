# AI 长篇小说创作器 — 开发计划（可执行版）

> 版本：v1.4
> 日期：2026-08-19
> 状态：待执行（从 I1a 开始）
> 配套设计文档：`docs/novel-creation-tool-design.md` v1.4（本计划是它的执行层，二者并存，本计划不重复设计内容）
> v1.4 变更（本版为「小而完整」三次收紧版，迭代 57 → 68）：
> ① 拆「仍超标」的迭代：I6a → I6a/I6d（B1 规则与 B4 风格分离）；I9 → I9/I9a（关系存储与摘要注入分离，对齐 I6/I7 模式）；I10 → I10a/I10b/I10c（大纲骨架/细纲/执行态分离）；I15b → I15b1/I15b2（确定性启发式与 LLM 软约束检测分离）；I21b → I21b/I21c/I21d/I21e（四个扩展点各一片）；I23c → I23c/I23d（状态回滚与正史只读分离）；I25b → I25b1/I25b2（设定层与运行时层序列化分离）；
> ② 新增去风险迭代 I5c「真实 LLM thin 垂直切片」：C2 单层「真实生成 → 真实状态解析 → 机械写回 → 确定性校验」走通一次，把「真实 LLM 生成 + 真实 LLM 结构化解析 + 闭环」三个最不确定点从 I19b 前移到 I6 之前验证；
> ③ 修不现实的验收：I27c 字数控制从硬门槛（±15%）改为「软引导 + 误差分布报告」（§7.16）；I28b1 多样性判定删除「语义距离」（依赖后置的向量层），改用固定 rubric 的 LLM-judge（§7.17）；
> ④ 补三个结构性决策：跨层写回原子性（I19a2，§7.13）、规模 smoke（I4，§7.14）、样本金标权威 + 禁改样本（§7.15）；
> ⑤ 地基切片补「消费者夹具」、每阶段补累积 walkthrough demo、UI 栈锁定从 I1a 移到 I1b（见 §3/§4/§9）。
>
> v1.3 变更（迭代 49 → 57，历史记录）：
> ① 再拆「仍过大」的迭代：I1 → I1a/I1b；I7 → I7a/I7b/I7c；I19a → I19a1/I19a2；I24a → I24a1/I24a2；I28b → I28b1/I28b2；
> ② 新增两个「去风险」迭代：I4a「ConfirmationGate 统一确认原语」；I5b「状态解析 + 机械应用 thin 闭环」；
> ③ 验收量化与阈值分层：硬约束检测器「漏检零容忍 + 整体 ≥90%」；正史 append ≥85% 且低置信强制确认；模糊验收改为可计算判定；
> ④ schema/存储迭代统一补「负向测试」；
> ⑤ 钉死 MVP 切线：I1a–I19b = v1.0 MVP；I20–I28b2 = v1.1 增强集；
> ⑥ 样本治理与契约锁落地。

---

## 0. 文档头

### Goal

把设计文档定义的「结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链」分阶段落地。目标不是一次性建成 13 层，而是以 **68 个「小而完整」的迭代**逐步构建：每个迭代结束都是**可演示、可测试、可回归、可独立提交**的可用状态，从而避免单次开发任务过大导致功能潦草、代码质量低。

### Architecture（简述）

- 13 层叙事模型（A/B/C 三类），见设计文档 §4–§5。
- 核心引擎模块：StateEngine、CanonLedger、OutlineNavigator、KnowledgeFilter、ContextAssembler、NarrativeParser；RelationshipEngine 为可选增强；另加拆分/分类/续写/灵感四类辅助 agent，见设计文档 §6。
- 核心闭环：`生成 → 校验 → 解析 → 写回`，见设计文档 §7。
- 存储：文件式（YAML + jsonl），见设计文档 §10.1（D2 已定）。
- 横切原语：ConfirmationGate（统一「用户确认」机制，见 I4a）。

### Tech Stack（默认值，I1a 落地时最终确认）

| 项 | 决策 | 依据 |
|---|---|---|
| 运行时 | Node.js 20+ | 设计文档 §5.1 A1 |
| 语言 | TypeScript | 13 层 schema 需要类型约束 |
| 存储 | 文件式：YAML（设定/状态）+ jsonl（正史） | D2 已定 |
| LLM 后端 | OpenAI 兼容协议（I1b 起步），后抽象为 BackendAdapter | 设计文档 §5.2 |
| 测试框架 | Vitest（`npx vitest run`） | 确定性模块单测 + LLM 模块样本集 |
| 包管理 | npm | 默认 |
| UI | **I1b 锁定的二选一**：A. React + Vite（轻量渲染，交付物用 `.tsx`）；B. 原生 TS + 手写 DOM（交付物用 `.ts`）。默认推荐 A。**I1b 定死后不再变**，后续 I22/I23 交付物扩展名随锁定值 | D1「UI 最小化」，消除 `.tsx`/「原生」矛盾 |

> 若团队偏好其他测试框架/语言，仅在 I1a 中替换，后续迭代命令随之替换，不改变迭代边界。

### Baseline / Authority Refs

- 需求来源：`docs/novel-creation-tool-design.md`（v1.4，设计定稿）
- 关键决策：D1 全新自建 / D2 文件式存储 / D3 独立解析 agent / D4 本地单用户 / D5 中文优先 / D6 硬约束阻断 + 软约束提示 / D7 不做 ST 迁移 / D8 不变设定索引层 / D9 关系引擎降级可选 / D10 细纲为子结构
- 本项目无既有代码、无 ADR、无 CI 基线（greenfield）。

### Compatibility Boundary

- **无既有兼容面**：全新项目，无对外 API、无数据库迁移、无历史数据。
- 唯一需要长期保持的边界：**层 Schema 是内部契约**，后续迭代只做增量扩展（新增字段/新增层），不破坏已落库的项目文件结构；正史账本（jsonl）**append-only，永不改写已落库行**。
- 跨迭代契约：引擎模块暴露的接口（`StateEngine`、`CanonLedger`、`ConfirmationGate` 等）在引入后保持签名稳定，变更走新接口而非修改旧接口。

### MVP 硬切线（本版新增，钉死执行边界）

- **v1.0 MVP = I1a – I19b**：结构化叙事引擎 + 闭环写回，是本产品的核心价值。此区间任何一个迭代未达验收即**阻塞**，不得跳到后续增强。
- **v1.1 增强集 = I20a – I28b2**：插件化、编辑 UI、导入导出、不变设定索引、写作辅助。此区间**可按优先级重排、裁剪、后置**；未选的写入 backlog，不得为了「凑满 68 个」而潦草赶工。
- 两条线各自独立评估质量；v1.1 的任何迭代不得回头破坏 v1.0 的契约（层 Schema / 引擎接口 / 正史 append-only）。

### 旧编号 → 新编号映射（追溯用）

> 需求文档 `novel-creation-tool-requirements.md`（v1.4 已同步新编号）与设计文档里程碑 M0–M10 需要与旧编号对应。本表建立映射，保证可追溯。`I1–I28` 原编号含义以需求文档 v1.1 覆盖矩阵为准。

| 原迭代 | 本版拆分 | 原迭代 | 本版拆分 |
|---|---|---|---|
| I1 | I1a、I1b | I15 | I15a、I15b1、I15b2 |
| I2 | I2 | I16 | I16 |
| I3 | I3 | I17 | I17 |
| I4 | I4、I4a（新增） | I18 | I18a、I18b、I18c |
| I5 | I5、I5b、I5c（I5b/I5c 新增） | I19 | I19a1、I19a2、I19b |
| I6 | I6a、I6b、I6c、I6d | I20 | I20a、I20b |
| I7 | I7a、I7b、I7c | I21 | I21a、I21b、I21c、I21d、I21e |
| I8 | I8 | I22 | I22a、I22b |
| I9 | I9、I9a | I23 | I23a、I23b、I23c、I23d |
| I10 | I10a、I10b、I10c | I24 | I24a1、I24a2、I24b、I24c |
| I11 | I11 | I25 | I25a、I25b1、I25b2、I25c |
| I12 | I12 | I26 | I26a、I26b |
| I13 | I13（仅过滤；泄漏检测并入 I15a） | I27 | I27a、I27b、I27c、I27d |
| I14 | I14a、I14b | I28 | I28a、I28b1、I28b2 |

### TDD Route

```text
TDD Route:
- Mode: off
- Decision: skipped
- Strict authority: not applicable（用户/项目未要求严格 TDD）
- Test posture: post-change regression（实现后写回归测试锁定行为；不要求 RED-first）
- Reason: 项目级 TDD 未开启；以「实现 → 回归测试」保证质量，等价于 verification-before-completion
- Verification: 确定性模块跑单测；LLM 模块跑样本集 + 脚本化 smoke（见各迭代「验证」列）
```

### Verification（策略）

本项目任务按「是否依赖 LLM」分两类，验证方式不同：

| 类型 | 模块 | 验证方式 | 质量主战场 |
|---|---|---|---|
| **确定性模块** | StateEngine、CanonLedger、ConfirmationGate、ContextAssembler、OutlineNavigator（导航部分）、KnowledgeFilter（过滤部分）、一致性裁决器、项目读写、Schema 存储 | 单元测试（可断言、可回归、无 LLM 依赖） | 是，代码质量的主战场，AI 做得最好 |
| **LLM 模块** | 正文生成、各解析 agent、检测器（规则/正史/知情/软约束）、拆分/分类/续写/灵感 agent | 固定样本集 + 准确率统计 + 脚本化 smoke | 行为验收，防 prompt/schema 改动导致悄悄回退 |

**两档验收强制规则（贯穿全计划）：**

1. **确定性断言**是 AI 的完成门槛：必须有一条可 `vitest` 断言、无 LLM 依赖的行为检查。
2. **LLM 样本回归**用于 LLM 模块：样本 + 期望输出进 `samples/`，回归脚本输出准确率；低于阈值为失败，只能改 prompt/schema 后重跑，**禁止「接受并继续」**。
3. **集成点先接 mock**：任何接入 LLM 的集成迭代，先写 fake backend / mock parser 的确定性测试跑通管道，再换真实 LLM 跑样本回归。
4. **「手动演示」一律替换为脚本化 smoke**：`npm run demo:<i>`，产出可检查的文件/日志/截图。
5. **负向测试强制（本版新增）**：每个 schema/存储迭代必须含「非法输入被拒绝」断言（非法 enum / 缺必填 / append-only 违例 → 报错），不只测正确读写往返。

**LLM 阈值分层（本版新增，替代一刀切 80%）：**

| 风险档 | 模块 | 阈值 |
|---|---|---|
| **硬约束检测器（漏检零容忍）** | 规则/正史矛盾检测（I14b）、知情泄漏检测（I15a） | canonical 违规样本 **100% 命中** + 整体 ≥90% |
| **不可逆写入** | 正史解析 append（I17） | ≥85%，且 `confidence < medium` 强制走用户确认 |
| **可确认/软约束** | 状态/关系/知情/世界观解析（I16/I18a/b/c）、软约束（I15b2）、分类（I26b）、拆分（I24a2/I24b）、续写/灵感（I28a/I28b1） | ≥80% |

**样本治理（本版新增）：**

- 样本集入库（git），每条样本记录 `model` + `temperature` + `日期`，回归脚本输出准确率 + 模型版本。
- 每个 LLM 模块留 **held-out 测试子集**：dev 集用于调 prompt，test 集只在收尾验收跑，防止「对着样本调参过拟合」。
- 样本数量下限：检测器类 ≥15 条；解析/生成类 ≥10 条（I5 spike 例外，10–20 条）。

**完成标志**：每个迭代以「确定性断言绿 + 负向断言绿 + 样本回归达标 + smoke 产物可查」为完成，不以「代码写完」为完成。

---

## 1. 需求就绪检查

```text
Requirement Ready Check:
- Requirement source refs: docs/novel-creation-tool-design.md（v1.4）
- Goals and scope refs: 设计文档 §1.1 目标、§1.2 范围、§3 设计目标
- User / scenario refs: 短篇快速起稿 / 长篇一致 / 多视角安全 / 可校验（§2.2）
- Requirement item refs: 13 层 schema（§5）、7 引擎（§6）、生成流程（§7）、注入策略（§8）、一致性（§9）、存储（§10）、扩展（§11）
- Acceptance / verification criteria refs: 设计文档给出「产出」但未给可判定验收标准，本计划补齐（见 §5 各迭代「验收标准」列）
- Open blocker questions: 见 §7「待修正/待确认的开放决策」
- Decision: ready（设计规格完整，可直接分解为迭代；开放项均可映射到具体迭代内解决，不阻塞启动）
```

---

## 2. 变更必要性

```text
Change Necessity:
- User-visible need: 落地一个可用的 AI 长篇小说创作器
- No-change / non-code option: 无（当前仅设计文档，无任何代码）
- Why code change is necessary: 从零构建
- Minimum change boundary: 新项目 novel-creation-tool/，先骨架后引擎
- Decision: code-change
```

---

## 3. 执行总原则（拆分方法论）

1. **先骨架，后长肉**：第一件事是「输入→存盘」最小闭环（I1a，mock 后端），不是数据模型。
2. **垂直切片优先**：每个迭代结束是可演示、可测试、可回归、可独立提交的状态，不是「半个模块」。
3. **两类「小而完整」明确区分（本版新增）**：
   - **地基切片**：确定性、无 LLM、仅 vitest 验证、无用户可见行为（如 I2/I6a/b/c 的纯存储）。允许，但要更小 + 配负向测试，并在 DoD 卡片明确写「本迭代无用户可见行为，仅为下一片打地基」。
   - **用户可见切片**：输入 → 可见输出（生成、注入、写回、编辑）。优先保证其「可演示」。
4. **每层先「手动编辑→注入」，后「自动解析→写回」**：每层在解析器上线前即可独立测试；解析器上线后手动路径仍可纠正 AI 误写。
5. **确定性模块优先**：先做无 LLM 的引擎（单测锁定），LLM 相关只保留「生成 + 解析 + 检测」三块，后置或 spike 前移。
6. **Schema 按需定义（YAGNI）**：只定义当前迭代马上要用的字段，其余留占位。
7. **向量检索后置**：先用关键词 + 全文，向量作为后续索引缓存（设计文档 §10.3 已隐含）。
8. **一个迭代一个正交关注点**（本版硬规则）：一个迭代只承载「一个层 / 一个引擎模块 / 一个解析 agent / 一个扩展点 / 一个用户功能」。
9. **切片门槛**（本版量化标准，判断是否还需再拆）：
   - 交付物 ≤ 5–8 个源文件（不含样本数据）；
   - 验收 ≤ 5 条，每条可机器判定；
   - 最多 1 个 LLM agent + 1 个样本集；
   - 结束状态：`npx vitest run` 绿 + smoke 产物可查 + 可独立 `git commit`。
   - 超过门槛 → 继续拆，不回退到打包式开发。
10. **确认机制唯一（本版新增）**：任何「走用户确认」的迭代必须复用 I4a 的 ConfirmationGate 原语，禁止各迭代临时实现；未复用即视为验收失败。
11. **地基切片必配消费者夹具（本版新增）**：每个 schema/存储地基切片除「读写往返 + 负向拒绝」外，还必须含至少一条**按下游消费方式**写的测试（如 Rule 存储要被 I7a serializer 消费、CanonLedger 要被 I17 parser 消费），防止「schema 往返没问题、下游真用起来别扭」的隐性返工。
12. **样本禁改（本版新增）**：禁止为让测试通过而修改样本/金标/阈值；一经发现，该迭代判失败并回退。held-out test 集金标由人工（或独立于开发的另一模型）产出，AI 不得自产自评（见 §7.15）。
13. **阶段级累积 demo（本版新增）**：每阶段末除各迭代 `demo:<i>` 外，还需一个 `demo:stage-N`，把本阶段及之前产物串起来跑一遍，防「单迭代绿、累积不可用」。
14. **UI 栈锁定后移（本版新增）**：UI 技术栈在 I1b（真正写最小 UI 时）锁定，不在 I1a（无 UI 代码）提前锁死；I1a 只锁目录结构 / smoke 约定 / 配置位置。
15. **跨层写回原子性显式化（本版新增）**：多层面写回的故障语义必须显式定义（见 §7.13），禁止各 parser 各写各的、半个状态落地。

---

## 4. Definition of Done 模板

每个迭代执行时，先填写以下卡片再动代码；卡片全部满足才算完成。

```markdown
## 迭代 Ixx：<一句话目标>
- 范围：<只做什么>
- 明确不做：<本迭代有意留到下个迭代的内容>
- 切片类型：<地基切片 / 用户可见切片>（地基切片须写明「本迭代无用户可见行为」）
- 交付物：<文件路径列表>
- 验收标准：<确定性断言（可 vitest 判定）+ 负向断言 + LLM 样本回归（样本集+阈值），每条可机器判定>
- 确认机制：<是否复用 ConfirmationGate（I4a），若涉及用户确认但未复用则不合格>
- 验证：<精确命令 + 脚本化 smoke 命令>
- 依赖：<依赖的前置迭代 + 所需上游接口>
- 消费者夹具：<地基切片必填：至少一条按下游消费方式的测试；用户可见切片填「不适用」>
- 样本合规：<LLM 切片必填：样本金标来源（人工/独立模型）+ 未改动样本与阈值的声明；确定性切片填「不适用」>
- 完成证据：<测试通过输出 + 样本准确率 + smoke 产物路径 + git commit hash>
```

> 「明确不做」是防止 scope creep 的关键：任何超出本迭代范围的想法，记入「后续迭代 backlog」，不在本迭代实现。

---

## 5. 迭代路线图（68 个迭代）

> 编号按顺序执行；「映射」列标注对应设计里程碑（M0–M10）。旧编号 I1–I28 的对应关系见文档头「旧编号→新编号映射表」。
> 「验收」分两档：**确定性**（`npx vitest run` 可断言）与**样本**（固定样本集 + 阈值）。
> 标注「v1.1 可裁剪」的迭代属第二阶段增强，核心 MVP（I1a–I19b）达成后可按需重排或裁剪。

### 阶段 0：走通骨架（P0）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I1a** | P0.1 | 最小闭环骨架 + 持久化（mock 后端） | 脚手架 + 项目目录 + 「输入 → mock 固定文本 → 存盘」**纯确定性**，无 API key、无网络。**明确不做**：真实 LLM、流式、任何分层/状态/正史、UI |
| **I1b** | P0.2 | 真实后端 + 流式 + 最小 UI（锁 UI 栈） | 接入真实 OpenAI 兼容后端（薄 seam `send(request)→stream`）+ 流式 + 最小 UI（输入→流式→追加）。**本迭代锁定 UI 技术栈**（A. React+Vite 用 `.tsx` / B. 原生 TS 用 `.ts`，默认 A，定死不回改）。**明确不做**：多后端、分层、模板、Instruct |

- **I1a 交付物**：`package.json`、`tsconfig.json`、`src/index.ts`、`src/core/io/append-text.ts`、`projects/demo/`、`scripts/demo-i1a.mjs`
- **I1a 本迭代锁定的决策**：① 项目目录结构；② `npm run demo:<i>` 统一 smoke 命令约定；③ 配置读取位置（env 或 config）。UI 技术栈**不在本迭代锁定**，后移到 I1b。
- **I1a 验收**（确定性）：
  - ① mock 后端返回固定分片文本，按序追加到 `projects/demo/text/chapter-001.md`；
  - ② 重启进程后正文仍在（持久化）；
  - ③ `npm run demo:i1a` 可无人值守产出结果文件；
  - ④ 非法路径/越界写入被拒绝（负向）。
- **I1a 验证**：`npm run demo:i1a`；`npx vitest run src/core/io`
- **I1a 意义**：一次性锁定脚手架、目录结构、smoke 约定三个横切面，且**不依赖真实 LLM**，可离线确定性验证；UI 栈留到 I1b 真正写界面时再锁。

- **I1b 交付物**：`src/llm/backend/openai-compat.ts`（薄 seam）、`src/ui/`（最小界面）、`scripts/demo-i1b.mjs`
- **I1b 验收**：
  - 确定性：① 流式协议封装可被 mock 单测（分片按序到达、异常重试语义正确）；
  - 样本/smoke：② `npm run demo:i1b` 用真实后端流式返回正文并产出可查日志。
- **I1b 验证**：`npx vitest run src/llm/backend`；`npm run demo:i1b`
- **I1b 意义**：验证真实后端协议 + 流式 + 最小 UI；确定性部分用 mock 锁定，真实 LLM 只作 smoke，不做 vitest 断言。

### 阶段 1：数据模型 + 状态 + 正史 + 确认原语（原 M0 拆为 4 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I2** | M0.1 | 项目与 schema 基础 | `project.yaml` + 目录骨架 + 通用 YAML 读写 + 实体基类（`id`/`version`）。**只定义 `ProjectMeta` 与 `BaseEntity` 两个 schema**。**明确不做**：13 层任何一层、状态引擎、正史账本 |
| **I3** | M0.2 | 状态层 C2 + StateEngine | `WorldState` 先只含 `scene` + `characters`（**items/factions 后置**）；快照、`seq` 递增、读当前态、写新快照、回滚、diff。**明确不做**：items/factions、事务跨文件 |
| **I4** | M0.3 | 正史账本 C4 + CanonLedger | jsonl append-only、追加、按角色/时间/关键词查询（**向量后置**）、supersede 更正通道。**明确不做**：语义向量检索 |
| **I4a** | M0.4（新增） | ConfirmationGate 统一确认原语 | `propose(change) → 挂起 → accept()/reject() → 确定性应用/丢弃`，纯确定性、无 LLM。供 I16/I17/I18c/I24a1/I24a2/I24b/I25c/I26b/I28b2 复用。**明确不做**：任何具体业务语义 |

- **I2 交付物**：`src/core/project/`、`src/core/schema/base.ts`、`src/core/io/yaml.ts`
- **I2 验收**（确定性）：
  - ① `createProject('demo')` 生成标准目录（rules/worldview/characters/style.yaml/outline.yaml/relationships/state/knowledge/canon/text + project.yaml）；
  - ② `loadProject('demo')` 能恢复元数据；
  - ③ `ProjectMeta` 与 `BaseEntity` 带 id/version 且可读写；
  - ④ 目录骨架结构与设计 §10.1 一致（快照测试）；
  - ⑤ 缺 id/version、非法字段 → 报错（负向）。
- **I2 验证**：`npx vitest run src/core/project`

- **I3 交付物**：`src/core/state/`（WorldState schema、StateEngine、snapshot、rollback、diff）+ `listSnapshots()` 接口（供 I23c 复用）
- **I3 验收**（确定性）：
  - ① 每次变更产生新快照且 seq 递增；
  - ② 可回滚到任意 seq；
  - ③ diff 能列出两快照差异；
  - ④ `scene`/`characters` 字段完整读写，且 items/factions 不出现；
  - ⑤ 非法 seq 回滚 / 越界快照 → 报错（负向）。
- **I3 验证**：`npx vitest run src/core/state`

- **I4 交付物**：`src/core/canon/`（CanonEvent、append、query、supersede）
- **I4 验收**（确定性）：
  - ① 只能 append，不能改已落库行（重写旧行即失败）；
  - ② 按关键词/角色/时间查得到正确事件；
  - ③ supersede 更正走 `kind:'correction'` + 显式确认；
  - ④ `kind` 枚举含 `correction`；
  - ⑤ 非 append 写操作、非法 kind → 报错（负向）。
- **I4 验证**：`npx vitest run src/core/canon`；`npm run demo:scale-i4`（规模 smoke：N=10,000 事件检索延迟护栏，见 §7.14）
- **I4 需修正**：设计文档 §5.11 `CanonEvent.kind` 枚举缺 `correction`，本迭代补上（见 §7.2）。

- **I4a 交付物**：`src/core/confirm/gate.ts`、`src/core/confirm/queue.ts`
- **I4a 验收**（确定性）：
  - ① `propose` 后变更处于挂起、未应用；
  - ② `accept` 后确定性应用、`reject` 后确定性丢弃；
  - ③ 重复 confirm 幂等；
  - ④ 未确认不得应用、确认后不得二次应用（负向）；
  - ⑤ `--auto-confirm` 测试开关生效（无交互环境可跑）。
- **I4a 验证**：`npx vitest run src/core/confirm`
- **I4a 意义**：把「用户确认」做成唯一可复用原语，后续所有 LLM 模块的低置信变更、导入候选、冲突 diff 统一走它，杜绝各迭代临时实现导致重复/不一致代码。

### 阶段 2：解析器去风险 Spike（原 M5 前移，拆为 3 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I5** | M5.0-spike（前移） | 验证解析可行性 | 只做 **C2 状态解析** 可行性验证：固定输出 schema，试跑 10–20 条样本，**不接引擎、不落库**。**明确不做**：正式解析器、其他层、机械应用 |
| **I5b** | M5.0-thin（新增） | 状态解析 + 机械应用 thin 闭环（mock） | 真实正文样本 → 解析器出 ops → StateEngine 机械应用 → 断言 C2 正确更新。**证明「解析→写回」核心价值**。**明确不做**：其他层解析、真实 LLM 全流程 |
| **I5c** | M5.0-vertical（新增） | 真实 LLM thin 垂直切片（C2 单层） | 用真实 LLM：正文生成 → 真实状态解析 → 机械写回 → 一个确定性校验，**C2 单层走通一次**。**证明「真实生成 + 真实解析 + 闭环」三个最不确定点**。**明确不做**：其他层、检测器全量、插件化 |

- **I5 交付物**：`samples/parse/state/`（样本 + 期望 ops）、`src/llm/parse/spike.ts`、`docs/spike-i5.md`（spike 结论）
- **I5 验收**（样本）：① 结构化输出准确率 ≥80%（脚本统计）；② 结论文件明确写「通过 / 需调整 prompt / 需降级为规则抽取」。
- **I5 验证**：`npx tsx src/llm/parse/spike.ts --samples samples/parse/state`
- **I5 意义**：把 D3「解析 agent」当作**待验证假设**，在投入 M1–M4 前用最小成本证伪或确认。

- **I5b 交付物**：`src/llm/parse/spike-apply.ts`、`samples/parse/state/apply/`
- **I5b 验收**：
  - 确定性：① mock ops 经 StateEngine 机械应用后 C2 正确更新（无二次解读）；② 非法 op/字段被 schema 校验拒绝（负向）。
  - 样本：③ 真实解析 ops 应用后 C2 更新准确率 ≥80%。
- **I5b 验证**：`npx tsx src/llm/parse/spike-apply.ts --samples samples/parse/state/apply`
- **I5b 意义**：把「解析 → 机械写回」这一**区别于聊天器的本质闭环**从原 I19 前移到 I5 之后证明，用 mock + 单层把 D3 假设 + 机械应用可行性一次性去风险。

- **I5c 交付物**：`src/index.ts` 单层串联（C2）+ 真实 backend + 真实 state-parser（复用 I5/I5b 结论）+ `scripts/demo-i5c.mjs`
- **I5c 验收**：
  - 确定性：① 一次真实输入 → 真实生成 → 真实状态解析 → StateEngine 机械写回，C2 按解析结果正确更新；管道接线用 mock 版 vitest 锁定（无真实 LLM 依赖）。
  - 样本：② 单层闭环跑固定样本（≥10 条），「生成→解析→写回」端到端走通率与状态更新准确率 ≥80%。
- **I5c 验证**：`npx vitest run src/core/pipeline`（mock 版接线 + 写回确定性）；`npm run demo:i5c`（真实 LLM 单层 e2e）
- **I5c 意义**：把「真实 LLM 生成质量 + 真实 LLM 结构化解析 + 闭环」三个风险从 I19b 前移到投入 I6–I13 大批确定性基础工作之前验证，失败可早停，不带着假设建 13 层。

### 阶段 3：设定层（原 I6 拆为 4 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I6a** | M1.1a | B1 规则存储 | Rule schema（scope/kind/priority/immutable/examples）+ 存储 + 手动编辑（CLI/YAML，**不做 UI**）。**明确不做**：注入、生成、B4 风格 |
| **I6b** | M1.1b | B3 角色核心存储 | CharacterCore schema（含 arc/keyBeats/relationships 嵌套）+ 存储 + 手动编辑。**明确不做**：注入、生成、B2 |
| **I6c** | M1.1c | B2 世界观存储 | WorldEntry schema（含 triggerMode/parent/supersededBy 改写追踪）+ 存储 + 手动编辑。**明确不做**：注入、生成 |
| **I6d** | M1.1d | B4 风格存储 | StyleProfile schema（person/tense/povScope/tone/proseStyle/forbidden）+ 存储 + 手动编辑。**明确不做**：注入、生成、B1 规则 |

- **I6a 交付物**：`src/core/schema/rules.ts`
- **I6a 验收**（确定性）：
  - ① 增删改 Rule 持久化到 `projects/demo/rules/*.yaml`；
  - ② `immutable:true`/`scope`/`kind`/`priority`/`examples` 字段可读写；
  - ③ 非法 `scope`/`kind`、缺 `statement` → 报错（负向）；
  - ④ 消费者夹具：Rule 可被「读取全部 + 按 scope/kind 筛选」方式消费（供 I7a serializer 使用）。
- **I6a 验证**：`npx vitest run src/core/schema/rules`

- **I6b 交付物**：`src/core/schema/characters.ts`
- **I6b 验收**（确定性）：
  - ① 增删改 CharacterCore 持久化到 `projects/demo/characters/*.yaml`；
  - ② CharacterCore（不变内核）与 CharacterState（C2 可变态，I3）**字段分离、互不引用**（快照测试断言无混叠字段）；
  - ③ arc/keyBeats 嵌套结构可读写；
  - ④ 非法 `kind`、缺 `name` → 报错（负向）。
- **I6b 验证**：`npx vitest run src/core/schema/characters`

- **I6c 交付物**：`src/core/schema/worldview.ts`
- **I6c 验收**（确定性）：
  - ① 增删改 WorldEntry 持久化到 `projects/demo/worldview/*.yaml`；
  - ② keyword/regex/constant 三种 triggerMode 可配置；
  - ③ parent 层级 + supersededBy 改写追踪可读写（改写时 status→rewritten 且 supersededBy 指向新条目）；
  - ④ 非法 triggerMode、缺 title → 报错（负向）。
- **I6c 验证**：`npx vitest run src/core/schema/worldview`

- **I6d 交付物**：`src/core/schema/style.ts`
- **I6d 验收**（确定性）：
  - ① StyleProfile 全字段（person/tense/povScope/tone/proseStyle/forbidden 等）读写并持久化到 `style.yaml`；
  - ② `forbidden` 禁用表达列表独立可查（供 I14a 关键词检查复用）；
  - ③ 非法 person/povScope、缺 name → 报错（负向）；
  - ④ 消费者夹具：StyleProfile 可被「读取全部 + 序列化为恒定段」方式消费（供 I7a serializer 使用）。
- **I6d 验证**：`npx vitest run src/core/schema/style`

### 阶段 4：上下文组装与注入（原 M1.2/M1.3 拆为 4 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I7a** | M1.2a | 组装器框架 + 宏 + B1/B4 序列化 | 组装流水线（固定 section 顺序、可挂 serializer）+ 展开 `{{user}}`/`{{pov}}` 宏 + **B1 规则、B4 风格** 两个恒定层 serializer。**明确不做**：B3/B2/C2 序列化、动态预算 |
| **I7b** | M1.2b | B3/B2 序列化 | 扩展组装器增加 **B3 角色核心 + B2 世界观**（触发式）serializer。**明确不做**：C2 序列化、大纲/关系/知情注入 |
| **I7c** | M1.2c | C2 状态序列化 | 扩展组装器增加 **C2 结构化状态快照** serializer。**明确不做**：大纲/关系/知情注入、动态预算 |
| **I8** | M1.3 | 注入接入生成闭环 | 把 I7a/I7b/I7c 接入 I1b 的生成循环。**明确不做**：其他层的注入 |

- **I7a 交付物**：`src/core/assemble/`（框架 + 顺序注册）、`src/core/assemble/rules.ts`、`src/core/assemble/style.ts`
- **I7a 验收**（确定性）：
  - ① 给定项目夹具，输出**确定性** prompt（同输入同输出，快照测试）；
  - ② B1/B4 内容正确出现；
  - ③ section 顺序固定为「规则→风格」（后续 I7b/I7c 按序追加）；
  - ④ `{{user}}`/`{{pov}}` 宏被展开、不残留占位符；
  - ⑤ 缺失必填层内容 → 报错或显式空段（负向）。
- **I7a 验证**：`npx vitest run src/core/assemble`（含快照测试）

- **I7b 交付物**：`src/core/assemble/character.ts`、`src/core/assemble/worldview.ts`
- **I7b 验收**（确定性）：
  - ① B3 角色核心内容正确出现；
  - ② B2 世界观按 keyword/regex/constant 命中注入，未命中不注入；
  - ③ 顺序追加为「规则→风格→角色核心→世界观」（快照测试）；
  - ④ 非法 triggerMode 条目被跳过或报错（负向）。
- **I7b 验证**：`npx vitest run src/core/assemble`

- **I7c 交付物**：`src/core/assemble/state.ts`
- **I7c 验收**（确定性）：
  - ① C2 状态序列化为紧凑结构化快照（键值/摘要，非散文）；
  - ② 顺序追加为「规则→风格→角色核心→世界观→状态」（快照测试）；
  - ③ items/factions 不出现（后置）；
  - ④ 缺 scene/characters → 报错（负向）。
- **I7c 验证**：`npx vitest run src/core/assemble`

- **I8 验收**：
  - 确定性：① 生成的 prompt 中**包含**规则/状态文本（断言注入生效）；② 修改状态（如角色位置）后，重新生成的 prompt 反映新状态。
  - 样本：③ 固定样本回归（N≥10）——修改状态后生成文本命中新状态关键词（如状态写「爱丽丝在厨房」，生成文本须含「厨房」），命中率 ≥80%（**脚本做关键词包含判定**，替代「规则被遵守」这类模糊断言）。
- **I8 验证**：`npm run demo:i8`（产出 prompt 快照 + 生成结果）；样本脚本 `npx tsx scripts/regress-i8.ts`。

### 阶段 5：大纲、关系与知情（原 M2/M3 拆为 8 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I9** | M2.1a | 关系层 C1 存储 | Relationship schema + 存储 + 手动编辑。**明确不做**：注入、大纲、关系数值自动变化 |
| **I9a** | M2.1b | C1 摘要注入 | 扩展 assembler 增加 C1 关系摘要 serializer（对齐 I7 系列「每个 serializer 一片」）。**明确不做**：关系数值自动变化、大纲注入 |
| **I10a** | M2.2a | 大纲层 B5（预设骨架） | Outline schema（structure/logline/themes/acts/beat/foreshadow/ending）+ 存储 + 手动编辑。**明确不做**：细纲 detailBeats、执行态 C6、导航逻辑 |
| **I10b** | M2.2b | 细纲（beat 下场景卡） | beat 下 detailBeats 场景卡（title/summary/pov/wordTarget/points/status）+ 存储 + 手动编辑。**明确不做**：执行态 C6、细纲 UI |
| **I10c** | M2.2c | 大纲执行态 C6 | OutlineProgress（currentAct/currentBeat/completedBeats/deviations）+ 存储。**明确不做**：导航逻辑（I11）、偏差的语义判断 |
| **I11** | M2.3 | OutlineNavigator（纯函数） | 定位下一 beat、前置条件检查、导航提示生成、**结构性**偏差记录。**明确不做**：大纲自动改写、语义级偏差判断 |
| **I12** | M3.1 | 揭示/知情层 C3 | KnowledgeEntry + KnowledgeState schema + 存储 + 手动编辑。**明确不做**：过滤、泄漏检测 |
| **I13** | M3.2 | KnowledgeFilter（仅过滤，纯函数） | 按 POV 过滤注入（确定性）。**明确不做**：泄漏检测（并入 I15a） |

- **I9 交付物**：`src/core/schema/relationship.ts`、`src/core/relationship/`
- **I9 验收**（确定性）：
  - ① 建立关系并持久化到 `relationships/*.yaml`；
  - ② 改 `affinity`/`trust` 可读写；
  - ③ `knownTo` 字段注释写明「只管关系公开性，与 C3 知情互不引用」（见 §7.3）；
  - ④ 非法 `type`、affinity 越界（<-100 或 >+100）→ 报错（负向）；
  - ⑤ 消费者夹具：Relationship 可被「按角色对筛选 + 摘要化」方式消费（供 I9a serializer 使用）。
- **I9 验证**：`npx vitest run src/core/relationship`

- **I9a 交付物**：`src/core/assemble/relationship.ts`
- **I9a 验收**（确定性）：
  - ① 关系摘要出现在 assembler 输出中（注入扩展生效）；
  - ② section 顺序追加为「…→关系」（快照测试，随 I7 系列既定顺序）；
  - ③ 无相关角色对时不注入空段（负向）。
- **I9a 验证**：`npx vitest run src/core/assemble`

- **I10a 交付物**：`src/core/schema/outline.ts`、`src/core/outline/store.ts`
- **I10a 验收**（确定性）：
  - ① 建大纲（structure/logline/themes/act/beat/foreshadow/ending）并持久化到 `outline.yaml`；
  - ② act/beat 嵌套结构完整（快照测试）；
  - ③ 非法 structure、缺 logline → 报错（负向）；
  - ④ 消费者夹具：Outline 可被「定位当前 act/beat + 枚举 beat」方式消费（供 I10c/I11 使用）。
- **I10a 验证**：`npx vitest run src/core/outline`

- **I10b 交付物**：`src/core/outline/detail-beats.ts`（复用 I10a 的 Outline store）
- **I10b 验收**（确定性）：
  - ① beat 下 detailBeats（细纲场景卡）可读写并持久化；
  - ② 场景卡字段（title/summary/pov/wordTarget/points/status）完整读写；
  - ③ status 枚举（planned/writing/done）非法值 → 报错（负向）。
- **I10b 验证**：`npx vitest run src/core/outline`

- **I10c 交付物**：`src/core/outline/progress.ts`
- **I10c 验收**（确定性）：
  - ① OutlineProgress 记录 currentAct/currentBeat/completedBeats；
  - ② Deviation（planned/actual/reason/reconciled）可记录并可标记 reconciled；
  - ③ 引用不存在的 beat id → 报错（负向）。
- **I10c 验证**：`npx vitest run src/core/outline`

- **I11 交付物**：`src/core/outline/navigator.ts`
- **I11 验收**（确定性）：
  - ① 定位下一个未完成 beat；
  - ② 前置条件未满足时不推荐；
  - ③ 生成正确导航提示；
  - ④ 结构性偏差（当前 beat 与预期不符）记录为 Deviation 条目。
  - 说明：语义级「剧情是否偏离大纲意图」的判断**不在本迭代**（归 I15b2 软约束，需 LLM）。
- **I11 验证**：`npx vitest run src/core/outline/navigator`（纯函数，夹具测试）

- **I12 交付物**：`src/core/schema/knowledge.ts`、`src/core/knowledge/`
- **I12 验收**（确定性）：
  - ① 建秘密（KnowledgeEntry）、给角色分配知情（KnowledgeState）并持久化到 `knowledge/*.yaml`；
  - ② 知情只增不可倒退（`status` 只能 hidden→partial→revealed，逆向写入即失败）；
  - ③ 字段注释写明与 C1.knownTo 的边界（见 §7.3）；
  - ④ 非法 `kind`、逆向 status 写入 → 报错（负向）。
- **I12 验证**：`npx vitest run src/core/knowledge`

- **I13 交付物**：`src/core/knowledge/filter.ts`
- **I13 验收**（确定性）：
  - ① POV=A 时，B 持有的秘密不注入（过滤生效）；
  - ② 输出仅含 A 的 `knows` 集合条目；
  - ③ 纯函数，无 LLM 依赖。
- **I13 验证**：`npx vitest run src/core/knowledge/filter`

### 阶段 6：一致性校验（原 M4 拆为 5 个，检测/裁决分离）

> 关键拆分：把原「ConsistencyValidator」拆成**确定性裁决器**（拿结构化违规项→三态）与**LLM 检测器**（prose→结构化违规项）两层，纠正「检测=纯函数」的错误分类。

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I14a** | M4.0 | 一致性裁决器（纯函数） | 输入结构化违规项 `[{type, severity(hard/soft), target, message}]` → 三态「通过/警告/拒绝」；含 B4 `forbidden` 禁用表达关键词检查（确定性违规源）。**明确不做**：任何语义检测 |
| **I14b** | M4.1 | 规则 + 正史检测器（LLM） | prose + 规则/正史 → 结构化违规项（规则违反=硬、正史矛盾=硬）。**明确不做**：知情、软约束 |
| **I15a** | M4.2 | 知情泄漏检测器（LLM） | prose + POV + knows 集合（复用 I13）→ 泄漏违规项（硬）。**明确不做**：软约束 |
| **I15b1** | M4.3a | 软约束启发式（确定性） | 大纲偏差（复用 I11 未 reconcile 的 Deviation）+ 实体瑕疵（悬空 id 引用）→ 警告项，纯确定性。**明确不做**：关系漂移/风格偏离（语义级，归 I15b2） |
| **I15b2** | M4.3b | 软约束检测器（LLM） | 关系漂移/风格偏离（语义级）→ 警告项，走样本集。**明确不做**：动态语义向量比对 |

- **I14a 交付物**：`src/core/validate/adjudicator.ts` + `src/core/validate/forbidden-check.ts`
- **I14a 验收**（确定性）：
  - ① 任一 hard 违规 → 拒绝；
  - ② 仅 soft 违规 → 警告；
  - ③ 无违规 → 通过；
  - ④ 给定 B4 `forbidden` 词命中正文 → 产出 soft/hard 违规项（关键词匹配，可断言）；
  - ⑤ 非法违规项结构（缺 type/severity）→ 报错（负向）。
- **I14a 验证**：`npx vitest run src/core/validate/adjudicator`

- **I14b 交付物**：`src/llm/validate/rule-canon-detector.ts` + `samples/validate/rule-canon/`
- **I14b 验收**：
  - 样本：① 样本集（≥15 条，含 dev + held-out test 子集）canonical 违规样本**漏检零容忍（100% 命中）**，整体准确率 ≥90%；② 输出严格匹配违规项 schema，不自由发挥。
  - 确定性：③ 检测器输出经 I14a 裁决器正确映射到三态（联测）。
- **I14b 验证**：`npx tsx scripts/regress-i14b.ts`；`npx vitest run src/core/validate`

- **I15a 交付物**：`src/llm/validate/knowledge-leak-detector.ts` + `samples/validate/leak/`
- **I15a 验收**：
  - 样本：① 泄漏/未泄漏样本（≥15 条，含 held-out 子集）泄漏样本**漏检零容忍（100% 命中）**，整体准确率 ≥90%；② 输出违规项 schema 一致；③ 经裁决器映射为拒绝。
- **I15a 验证**：`npx tsx scripts/regress-i15a.ts`

- **I15b1 交付物**：`src/core/validate/soft-heuristics.ts`
- **I15b1 验收**（确定性）：
  - ① 大纲偏差（I11 未 reconcile 的 Deviation）→ 警告项；
  - ② 悬空 id 引用 → 警告项；
  - ③ 无违规输入 → 不产违规项（负向/空集）。
- **I15b1 验证**：`npx vitest run src/core/validate`

- **I15b2 交付物**：`src/llm/validate/soft-detector.ts` + `samples/validate/soft/`
- **I15b2 验收**（样本）：① 关系漂移/风格偏离样本准确率 ≥80%（语义部分）；② 输出严格匹配违规项 schema，经 I14a 裁决器映射为警告。
- **I15b2 验证**：`npx tsx scripts/regress-i15b2.ts`

### 阶段 7：叙事解析器与写回闭环（原 M5 拆为 8 个）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I16** | M5.1 | 状态解析 agent | 正文 → C2 ops → 机械应用（复用 I5b 结论）。**明确不做**：其他层解析 |
| **I17** | M5.2 | 正史解析 agent | 正文 → CanonEvent append（低置信走 ConfirmationGate）。**明确不做**：其他层 |
| **I18a** | M5.3a | 关系解析 agent | 正文 → C1 增删改（唯一写入机制，D9）。**明确不做**：知情、世界观 |
| **I18b** | M5.3b | 知情解析 agent | 正文 → C3 知情增改。**明确不做**：关系、世界观 |
| **I18c** | M5.3c | 世界观解析 agent | 正文 → B2 改写（产 supersededBy 变更，**走 ConfirmationGate 用户确认**）。**明确不做**：关系、知情 |
| **I19a1** | M5.4a1 | 写回闭环整合（单层，mock） | 生成 → 校验 → 解析 → 写回全流程**只接 C2 单层**，用 mock parser + fake backend（纯确定性）。**明确不做**：多层面、真实 LLM |
| **I19a2** | M5.4a2 | 写回闭环整合（四层扇出，mock）+ 写回原子性 | 把 I19a1 的接线模式扇出到 C2/C1/C3/C4 四层（mock），并**显式定义跨层写回的故障语义**（见 §7.13）。**明确不做**：插件化、真实 LLM e2e |
| **I19b** | M5.4b | 真实 LLM 端到端回归 | 把 I19a2 的 mock 换成真实解析 agent，跑全样本集 e2e。**明确不做**：新功能 |

- **I16 交付物**：`src/llm/parse/state-parser.ts` + `samples/parse/state/`
- **I16 验收**：
  - 确定性：① 解析结果机械应用到 C2（复用 StateEngine，无二次解读）；② op schema 字段（op/target/field/action/value/confidence）严格校验；③ 非法 op/字段被拒绝（负向）。
  - 样本：④ 状态样本准确率不低于 I5 spike 基线（≥80%）；⑤ 低置信变更走 ConfirmationGate（I4a）。
- **I16 验证**：`npx tsx src/llm/parse/state-parser.ts --samples samples/parse/state`

- **I17 交付物**：`src/llm/parse/canon-parser.ts` + `samples/parse/canon/`
- **I17 验收**：
  - 确定性：① 产出 CanonEvent 并 append（复用 CanonLedger，只增不改）；② 低置信 append 走 ConfirmationGate（I4a）。
  - 样本：③ 正史样本准确率 ≥85%，且 `confidence < medium` 的 append 一律进确认队列（**不因整体准确率掩盖致命误写**）。
- **I17 验证**：`npx tsx src/llm/parse/canon-parser.ts --samples samples/parse/canon`

- **I18a 交付物**：`src/llm/parse/relationship-parser.ts` + `samples/parse/relationship/`
- **I18a 验收**：
  - 确定性：① 产出 C1 增删改并机械应用；② **唯一**写 C1 的机制（关系规则引擎默认不启用，D9）。
  - 样本：③ 关系样本准确率 ≥80%。
- **I18a 验证**：`npx tsx scripts/regress-i18a.ts`

- **I18b 交付物**：`src/llm/parse/knowledge-parser.ts` + `samples/parse/knowledge/`
- **I18b 验收**：
  - 确定性：① 产出 C3 增改并机械应用；② 知情只增不可倒退（复用 I12 约束）。
  - 样本：③ 知情样本准确率 ≥80%。
- **I18b 验证**：`npx tsx scripts/regress-i18b.ts`

- **I18c 交付物**：`src/llm/parse/worldview-parser.ts` + `samples/parse/worldview/`
- **I18c 验收**：
  - 确定性：① 产出 B2 改写（status→rewritten + supersededBy）；② 改写**必须走 ConfirmationGate（I4a）确认**才落库（未确认即未应用）。
  - 样本：③ 世界观改写样本准确率 ≥80%。
- **I18c 验证**：`npx tsx scripts/regress-i18c.ts`

- **I19a1 交付物**：`src/index.ts` 生命周期串联（单层 C2）+ mock parser/fake backend
- **I19a1 验收**（确定性）：
  - ① 一次用户输入（fake backend 返回固定正文 + mock parser 返回固定 ops）后，C2 单层按 mock 正确更新；
  - ② 落库前经过 I14a 裁决器；
  - ③ 管道接线正确（无真实 LLM 依赖）。
- **I19a1 验证**：`npx vitest run src/core/pipeline`（确定性管道测试）

- **I19a2 交付物**：管道扇出到 C2/C1/C3/C4 四层（mock parser 扩展）+ 写回事务/补偿逻辑
- **I19a2 验收**（确定性）：
  - ① 一次用户输入后，C2/C1/C3/C4 四层按 mock 正确更新；
  - ② 四层写回均经过 I14a 裁决器；
  - ③ 低置信项走 ConfirmationGate（I4a）不绕过；
  - ④ **原子性**：任一层写回失败时，其余层按 §7.13 定义的行为处理（回滚或标记「不一致待补偿」），并有负向测试锁定该行为。
- **I19a2 验证**：`npx vitest run src/core/pipeline`

- **I19b 验收**（样本）：
  - ① 全样本集回归（I16/I17/I18a/b/c + I14b/I15a/I15b2）达标；
  - ② 一次真实端到端：输入 → 生成 → 校验 → 解析 → 写回，四层正确更新且通过校验。
- **I19b 验证**：`npm run demo:i19`（端到端演示脚本）+ 全样本集回归脚本。

### 阶段 8：插件化与后端适配（原 M6 拆为 7 个，v1.1 可裁剪）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I20a** | M6.1a | 后端适配器抽象 | 把 I1b 硬编码后端抽象成 BackendAdapter 接口 + 2 个实现（OpenAI 兼容 + 一个 mock）。**明确不做**：模板/Instruct、插件体系 |
| **I20b** | M6.1b | PromptTemplate/InstructPreset | 落地 PromptTemplate 与 InstructPreset 两个预设（职责在范围中分开写明），随适配器切换。**明确不做**：插件体系 |
| **I21a** | M6.2a | 单个扩展点（Validator） | 只打通 **Validator** 扩展点：注册自定义校验器并生效。**明确不做**：Injector/Parser/Provider/关系规则 |
| **I21b** | M6.2b | Injector 扩展点 | 只打通 **Injector** 扩展点：注册自定义注入器并生效。**明确不做**：Parser/Provider/关系规则 |
| **I21c** | M6.2c | Parser 扩展点 | 只打通 **Parser** 扩展点：为某层注册自定义解析 agent + 输出 schema。**明确不做**：Provider/关系规则 |
| **I21d** | M6.2d | Provider（自定义层）扩展点 | 只打通 **Provider** 扩展点：注册自定义层（如经济层/战斗层）。**明确不做**：关系规则 |
| **I21e** | M6.2e | 关系规则扩展点（D9 可选） | 打通「事件→关系数值变化」规则扩展点（RelationshipEngine 可选增强，默认不启用）。**明确不做**：无（本片可裁剪/后置） |

- **I20a 交付物**：`src/llm/backend/adapter.ts`（接口）+ 2 个实现
- **I20a 验收**（确定性）：① 切换后端不改上层代码；② mock 实现可用于后续所有管道测试；③ 采样参数随适配器配置。
- **I20a 验证**：`npx vitest run src/llm/backend` + 切换演示脚本。

- **I20b 交付物**：`src/llm/template/`（PromptTemplate、InstructPreset）
- **I20b 验收**（确定性）：① 给定 PromptTemplate，assembler 输出按 sectionOrder 排序；② InstructPreset 的 systemPrompt/jailbreak 随适配器切换注入；③ 模板字段可读写并持久化。
- **I20b 验证**：`npx vitest run src/llm/template`

- **I21a 交付物**：`src/plugin/registry.ts`（Validator 扩展点）+ 1 个演示插件
- **I21a 验收**（确定性）：① 挂载一个自定义 Validator 后，在 I14a 裁决流程中被调用并生效；② 卸载后不再被调用。
- **I21a 验证**：`npx vitest run src/plugin` + 演示脚本。

- **I21b 交付物**：`src/plugin/`（Injector 扩展点）+ 1 个演示插件
- **I21b 验收**（确定性）：① 挂载一个自定义 Injector 后，在 ContextAssembler 中被调用并生效；② 卸载后不再被调用；③ 与核心引擎接口解耦（新增插件不改引擎）。
- **I21b 验证**：`npx vitest run src/plugin` + 演示脚本。

- **I21c 交付物**：`src/plugin/`（Parser 扩展点）+ 1 个演示插件
- **I21c 验收**（确定性）：① 为某层注册自定义 Parser 后，在叙事解析流水线中被调用并产出该层 ops；② 卸载后不再被调用。
- **I21c 验证**：`npx vitest run src/plugin` + 演示脚本。

- **I21d 交付物**：`src/plugin/`（Provider 自定义层扩展点）+ 1 个演示插件
- **I21d 验收**（确定性）：① 注册自定义层后，该层在存储/注入/解析流程中被识别；② 卸载后不再被识别。
- **I21d 验证**：`npx vitest run src/plugin` + 演示脚本。

- **I21e 交付物**：`src/plugin/`（关系规则扩展点，D9 可选增强）+ 1 个演示规则
- **I21e 验收**（确定性）：① 注册「事件→关系数值变化」规则后，触发正史事件时关系数值按规则变化并记录来源；② 默认不启用（不注册即无第二写 C1 路径，见 §7.1）。
- **I21e 验证**：`npx vitest run src/plugin` + 演示脚本。

### 阶段 9：编辑 UI（原 M7 拆为 6 个，v1.1 可裁剪）

> 交付物扩展名随 I1b 锁定的 UI 栈：选 A 用 `.tsx`，选 B 用 `.ts`（下同）。

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I22a** | M7.1a | 编辑 UI 框架 + B3 角色编辑 | 编辑界面框架 + B3 CharacterCore 可视化增删改（复用 I6b 存储）。**明确不做**：世界观/大纲/关系编辑、UI 主题 |
| **I22b** | M7.1b | B2 世界观编辑 UI | B2 WorldEntry 可视化增删改（含触发/层级/改写字段）。**明确不做**：大纲/关系编辑 |
| **I23a** | M7.2a | C1 关系编辑 UI | Relationship 可视化增删改。**明确不做**：大纲/细纲编辑 |
| **I23b** | M7.2b | 大纲（含细纲）编辑 UI | B5 大纲/细纲场景卡可视化编辑。**明确不做**：items/factions 编辑 |
| **I23c** | M7.2c | 状态快照/回滚 | 状态层快照列表/回滚入口（复用 I3 `listSnapshots`）。**明确不做**：正史视图、正史编辑 |
| **I23d** | M7.2d | 正史只读视图 + supersede | 正史（C4）只读视图 + 更正走 supersede 确认入口（复用 I4 + ConfirmationGate I4a）。**明确不做**：正史编辑 |

- **I22a 交付物**：`src/ui/editor/`（框架）、`src/ui/editor/character.tsx`（或 .ts）
- **I22a 验收**（确定性）：① 可视化增删改 CharacterCore 并持久化（单测锁编辑器状态逻辑）；② 写入走引擎统一接口（不直改文件）；③ 编辑器状态逻辑无 LLM 依赖。
- **I22a 验证**：`npx vitest run src/ui/editor` + `npm run demo:i22a`

- **I22b 交付物**：`src/ui/editor/worldview.tsx`（或 .ts）
- **I22b 验收**（确定性）：① 可视化增删改 WorldEntry（含 triggerMode/parent/supersededBy）并持久化；② 走统一接口。
- **I22b 验证**：`npx vitest run src/ui/editor` + 手动/脚本演示。

- **I23a 交付物**：`src/ui/editor/relationship.tsx`（或 .ts）
- **I23a 验收**（确定性）：① 可视化增删改 Relationship 并持久化；② 走统一接口。
- **I23a 验证**：`npx vitest run src/ui/editor`

- **I23b 交付物**：`src/ui/editor/outline.tsx`（或 .ts）
- **I23b 验收**（确定性）：① 可视化编辑大纲 act/beat/细纲场景卡并持久化；② 走统一接口。
- **I23b 验证**：`npx vitest run src/ui/editor`

- **I23c 交付物**：`src/ui/editor/state-view.tsx`（或 .ts）
- **I23c 验收**（确定性）：① 展示快照列表并可回滚到指定 seq（复用 I3）；② 回滚走统一接口，不直改文件。
- **I23c 验证**：`npx vitest run src/ui/editor` + 演示。

- **I23d 交付物**：`src/ui/editor/canon-view.tsx`（或 .ts）
- **I23d 验收**（确定性）：① 正史（C4）只读，无可写入口；② 更正走 supersede 确认入口（复用 I4 + ConfirmationGate I4a），未确认不写回。
- **I23d 验证**：`npx vitest run src/ui/editor` + 演示。

### 阶段 10：导入导出（原 M8 拆为 8 个，v1.1 可裁剪）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I24a1** | M8.1a1 | 文本导入管道（mock 拆分） | txt/md 读取 + 切块 + 确认门（复用 ConfirmationGate），用 **mock 拆分 agent** 验证管道。**明确不做**：真实拆分 agent、docx、导出 |
| **I24a2** | M8.1a2 | 粗拆分 agent（LLM） | 真实拆分 agent 产出大纲/世界观候选 → 走 ConfirmationGate 用户确认写入。**明确不做**：细纲、docx、导出 |
| **I24b** | M8.1b | 细纲拆分 | 大纲 → 细纲（beat 下场景卡）候选 → 用户确认。**明确不做**：docx、导出 |
| **I24c** | M8.1c | docx 导入 | docx 解析为纯文本后复用 I24a1/a2 管线。**明确不做**：复杂版式还原 |
| **I25a** | M8.2a | 纯文本导出 | C5 章节按 txt/docs 导出 + 设定层可读 Markdown 导出。**明确不做**：单文件包 |
| **I25b1** | M8.2b1 | 单文件包格式 + 设定层序列化 | 定义包格式（版本号+导出时间）+ 设定层（B1/B4/B3/B2/B5）序列化进单文件。**明确不做**：运行时层（C1–C5）、导入 |
| **I25b2** | M8.2b2 | 运行时层序列化 | 运行时层（C1/C2/C3/C4/C5）序列化进单文件 + 「层清单完整」快照测试。**明确不做**：导入 |
| **I25c** | M8.2c | 单文件包导入 + round-trip | 导入单文件包重建项目，round-trip 一致性。**明确不做**：ST 世界书格式 |

- **I24a1 交付物**：`src/import/`（read、chunk）+ mock split
- **I24a1 验收**（确定性）：① txt/md 读取并切分为输入块；② 拆分结果写入前走 ConfirmationGate（未确认不写入）；③ 非法路径/空文件 → 报错（负向）。
- **I24a1 验证**：`npx vitest run src/import` + `npm run demo:i24a1`

- **I24a2 交付物**：`src/llm/parse/split-agent.ts` + `samples/split/`
- **I24a2 验收**：
  - 样本：① 大纲+世界观候选准确率 ≥80%；② 低置信条目标黄并走 ConfirmationGate（I4a）确认。
- **I24a2 验证**：`npx tsx scripts/regress-i24a2.ts`

- **I24b 交付物**：`src/llm/parse/detail-split-agent.ts` + `samples/detail-split/`
- **I24b 验收**（样本）：① 大纲→细纲场景卡候选准确率 ≥80%；② 细纲写入走 ConfirmationGate（I4a）。
- **I24b 验证**：`npx tsx scripts/regress-i24b.ts`

- **I24c 交付物**：`src/import/docx.ts`
- **I24c 验收**（确定性）：① docx 解析为纯文本（段落级）并复用 I24a1 管线；② 无 LLM 依赖（解析层）。
- **I24c 验证**：`npx vitest run src/import`

- **I25a 交付物**：`src/export/text.ts`
- **I25a 验收**（确定性）：① C5 章节导出 txt/docs 与原文一致；② 设定层导出 Markdown 可读；③ 导出产物不依赖运行时（纯文件）。
- **I25a 验证**：`npx vitest run src/export`

- **I25b1 交付物**：`src/export/package.ts`（包格式 + 设定层序列化器）
- **I25b1 验收**（确定性）：① 设定层（B1/B2/B3/B4/B5）序列化进单文件；② 含版本号与导出时间；③ 非法/缺失字段 → 报错（负向）。
- **I25b1 验证**：`npx vitest run src/export`

- **I25b2 交付物**：`src/export/package-runtime.ts`（运行时层序列化器）
- **I25b2 验收**（确定性）：① 运行时层（C1/C2/C3/C4/C5）序列化进单文件；② 序列化器覆盖全部 10 层（快照测试断言层清单完整，含 I25b1 的设定层）。
- **I25b2 验证**：`npx vitest run src/export`

- **I25c 交付物**：`src/import/package.ts`
- **I25c 验收**（确定性）：① 单文件包导入重建项目（round-trip：导出→导入→再导出字节一致）；② 导入与源文件冲突时 diff + 走 ConfirmationGate（I4a）确认；③ 文件仍是 source of truth。
- **I25c 验证**：`npx vitest run src/import`（round-trip 单测）

### 阶段 11：不变设定索引（原 M9 拆为 2 个，v1.1 可裁剪）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I26a** | M9a | SQLite 不变设定索引 | SQLite 存「确认设定」索引 + 精确检索 + 从文件重建；文件仍是 source of truth。**明确不做**：语义向量、分类 agent |
| **I26b** | M9b | 分类 agent | 分类 agent 产出分类候选 → 走 ConfirmationGate 确认入库。**明确不做**：语义向量检索 |

- **I26a 交付物**：`src/core/settings-index/`（SettingEntry、index、rebuild）
- **I26a 验收**（确定性）：① immutable 规则/固定世界观条目入索引并可精确检索；② 索引可从文件重建（删除索引→重建→结果一致）；③ 文件改动后增量同步；④ 无 LLM 依赖。
- **I26a 验证**：`npx vitest run src/core/settings-index`

- **I26b 交付物**：`src/llm/parse/classify-agent.ts` + `samples/classify/`
- **I26b 验收**（样本）：① 分类候选准确率 ≥80%；② 入索引前走 ConfirmationGate（I4a）。
- **I26b 验证**：`npx tsx scripts/regress-i26b.ts`

### 阶段 12：写作辅助（原 M7.3/M10 拆为 7 个，v1.1 可裁剪）

| ID | 映射 | 目标 | 范围（做什么 / 明确不做） |
|---|---|---|---|
| **I27a** | M7.3a | 固定段手动编辑 | 对 C5 段落直接编辑（复用编辑器框架）。**明确不做**：重写、写作 |
| **I27b** | M7.3b | 快速重写 | 对 C5 某段/某场景重生成，走完整「校验→裁决→解析写回」。**明确不做**：按字数写作 |
| **I27c** | M7.3c | 依据大纲按章节/字数写作 | 按当前 beat 细纲场景卡生成，支持按章节/按 wordTarget。**明确不做**：续写/灵感 |
| **I27d** | M7.3d | 本地落地 txt/docs | 完成章节落地为 txt/docs（复用 I25a 导出器）。**明确不做**：新导出格式 |
| **I28a** | M10a | 续写 agent | 显式调用续写下一段，走标准闭环。**明确不做**：灵感、被动触发 |
| **I28b1** | M10b1 | 灵感 agent（生成选项） | 产出 2–3 个可选方向（**不写回正史**，仅作选项）。**明确不做**：被动触发、大纲写回 |
| **I28b2** | M10b2 | 选定方向后调大纲/细纲 | 用户选定方向后，可选「随剧情调整大纲/细纲」（写 B5/C6 偏差或细纲改动，走 ConfirmationGate 确认）。**明确不做**：被动触发监控 |

- **I27a 交付物**：`src/write/edit.ts`
- **I27a 验收**（确定性）：① 段落内容可编辑并持久化到 C5；② 编辑后可选「重新解析该段」入口（复用 I16 等）；③ 无 LLM 依赖（编辑层）。
- **I27a 验证**：`npx vitest run src/write`

- **I27b 交付物**：`src/write/rewrite.ts`
- **I27b 验收**（样本）：① 重写输出走完整校验（I14a 裁决器）并可回归；② 重写命中目标段。
- **I27b 验证**：`npx tsx scripts/regress-i27b.ts`

- **I27c 交付物**：`src/write/compose.ts`
- **I27c 验收**：
  - 确定性：① 按章节生成时注入当前 beat 细纲场景卡与目标字数（复用 I7/I10b）。
  - 样本：② wordTarget 作为**软引导**注入（非硬门槛）；验收改为**误差分布报告**——脚本统计实际误差分布（中位数、四分位），中位数误差 ≤30% 且无系统性失控即通过（替代原 ±15% 硬门槛，见 §7.16）。
- **I27c 验证**：`npx tsx scripts/regress-i27c.ts`

- **I27d 交付物**：`src/write/export-final.ts`（复用 I25a 导出器）
- **I27d 验收**（确定性）：① 完成章节落地为含完整开头结尾的 txt/docs 文件；② 复用 I25a，不重复实现导出逻辑。
- **I27d 验证**：`npx vitest run src/write`

- **I28a 交付物**：`src/agents/continue-agent.ts` + `samples/continue/`
- **I28a 验收**（样本）：① 续写输出走「校验→裁决→解析写回」；② 样本回归达标（≥80%）。
- **I28a 验证**：`npx tsx scripts/regress-i28a.ts`

- **I28b1 交付物**：`src/agents/inspiration-agent.ts` + `samples/inspiration/`
- **I28b1 验收**：
  - 确定性：① 产出 2–3 个方向选项；② 不写回正史（断言正史行数不变）。
  - 样本：③ 方向选项的相关性/多样性用**固定 rubric 的 LLM-judge** 判定（不引入 embedding/语义距离，避免依赖后置的向量层），judge 结构化打分 ≥ 阈值即通过（替代「相关性与多样性」模糊断言，见 §7.17）。
- **I28b1 验证**：`npx tsx scripts/regress-i28b1.ts`

- **I28b2 交付物**：`src/agents/inspiration-apply.ts`
- **I28b2 验收**（确定性）：① 选定方向后，对 B5/C6 的偏差或细纲改动**走 ConfirmationGate（I4a）确认**才写回；② 未确认不写回；③ 复用 I10 Outline store，不绕过统一接口。
- **I28b2 验证**：`npx vitest run src/agents` + `npx tsx scripts/regress-i28b2.ts`

---

## 6. 依赖顺序与去风险里程碑

### 6.1 依赖主线（默认严格线性）

```text
I1a ─► I1b ─► I2 ─► I3 ─► I4 ─► I4a ─► I5 ─► I5b ─► I5c
                        │
                        └─► I6a ─► I6b ─► I6c ─► I6d ─► I7a ─► I7b ─► I7c ─► I8
                                                                                   │
                                                                                   └─► I9 ─► I9a ─► I10a ─► I10b ─► I10c ─► I11 ─► I12 ─► I13
                                                                                                                                              │
                                                                                                                                              └─► I14a ─► I14b ─► I15a ─► I15b1 ─► I15b2
                                                                                                                                                                                       │
                                                                                                                                                                                       └─► I16 ─► I17 ─► I18a ─► I18b ─► I18c ─► I19a1 ─► I19a2 ─► I19b
                                                                                                                                                                                                                                                  │
                                                                                                                                                                                                                                                  └─► I20a ─► I20b ─► I21a ─► I21b ─► I21c ─► I21d ─► I21e ─► I22a ─► I22b ─► I23a ─► I23b ─► I23c ─► I23d ─► I24a1 ─► I24a2 ─► I24b ─► I24c ─► I25a ─► I25b1 ─► I25b2 ─► I25c ─► I26a ─► I26b ─► I27a ─► I27b ─► I27c ─► I27d ─► I28a ─► I28b1 ─► I28b2
```

> `I19b` 是 v1.0 MVP 终点；`I20a` 起进入 v1.1 增强集，可按需重排/裁剪。

### 6.2 并行规则（契约锁后才允许）

- **默认严格线性**：共享 schema/接口由多个 AI agent 同时写是最大风险源，默认不并行。
- **契约锁（本版落地为可执行产物）**：把共享接口/schema 作为不可变交付物提交到 `contracts/*.ts`（冻结的 TypeScript 接口 + 快照测试），并跑一次 `npx vitest run src/core/contracts` 通过后，才允许对应并行组启动。
- **可选并行点**（契约锁后）：
  1. I6a/I6b/I6c/I6d（设定层）在 I2 BaseEntity + I3 项目目录冻结后彼此独立，可并行；
  2. I9/I9a/I10a/I10b/I10c/I11（关系/大纲）与 I12/I13（知情）彼此独立，可在 I8 后并行；
  3. I18a/I18b/I18c 三个解析 agent 互不共享写路径，可在 I17 后并行；
  4. 阶段 9–12（编辑 UI/导入导出/索引/写作辅助）在 I21e 后彼此基本独立，可并行。
- **并行收尾**：每个并行组结束后必须有一个「集成+对齐」收尾提交，跑全量 `npx vitest run` + 全样本集回归，确认接口一致。

### 6.3 关键去风险点（gate）

1. **I1a**：验证工程链路 + 锁死目录/smoke 约定（不依赖真实 LLM）。
2. **I1b**：验证真实后端协议 + 流式 + **锁死 UI 栈**。
3. **I4a**：验证「用户确认」原语可复用（后续所有确认统一走它）。
4. **I5**：验证 D3「解析 agent」假设——**全计划最重要 gate**，不通过则回炉策略。
5. **I5b**：验证「解析 → 机械写回」闭环可行（核心价值假设，前移证明）。
6. **I5c**：验证「真实 LLM 生成 + 真实解析 + 闭环」可行（真实 LLM thin 垂直切片，失败可早停）。
7. **I8**：验证「分层注入 → 生成行为随之改变」核心价值假设。
8. **I14b/I15a**：验证「LLM 检测器」产出结构化违规项的可行性（若不可行，降级为启发式 + 用户人工确认）。
9. **I19a1**：验证闭环管道接线（单层，确定性，无 LLM 干扰）。
10. **I19a2**：验证四层扇出 + 跨层写回原子性（§7.13）。
11. **I19b**：验证完整闭环「生成→校验→解析→写回」真实可用（v1.0 MVP 终点）。
12. **I25c**：验证 round-trip（数据可转移、可重建，不锁定专有格式）。

---

## 7. 待修正 / 待确认的开放决策

> 这些是设计文档的实现级缺口，**必须在对应迭代内解决**，否则会埋雷。

### 7.1 关系变更的「双机制」冲突（在 I18a 解决，v1.1 已定稿）

- 问题：§6.5 RelationshipEngine 用「规则」改关系，§6.6 又用「关系解析 agent」直接改关系，两套写 C1。
- 决策（**已定，D9**）：**解析 agent 为唯一写入主路径**；规则引擎后置为可选增强（插件），默认不启用。I18a 用单测断言「无第二写入路径」。

### 7.2 Schema 与机制不一致（在 I4 解决）

- 问题：§6.2 更正事件用 `kind:'correction'`，但 §5.11 `CanonEvent.kind` 枚举里没有。
- 决策：`CanonEvent.kind` 补 `correction`。

### 7.3 C1.knownTo 与 C3 KnowledgeState 边界（在 I9/I12 明确）

- 问题：C1.knownTo 与 C3 知情语义接近，易混。
- 决策：**C1.knownTo 只管「这段关系本身是否公开」；C3 只管「事实/秘密的知情」**。在 I9 和 I12 的 schema 注释里写明，实现时互不引用（I9/I12 各加一条快照测试断言互不引用）。

### 7.4 原 M0「数据模型」范围（由 I2 明确）

- 决策：M0 的「数据模型」不是定义全部 13 层，而是「按需定义」。本版已把各层 schema 定义分散到 I2/I3/I6a/I6b/I6c/I9/I10/I12；I2 只定义 ProjectMeta + BaseEntity。

### 7.5 C5 分支模型欠定义（后置）

- 决策：C5 分支功能整体后置到 I19b 之后；先把「单线正文→正史」跑通。待建时再定义分支与正史的关系。

### 7.6 C2 大对象拆分（由 I3 明确）

- 决策：C2 `WorldState` 先做 `scene` + `characters`，`items`/`factions`/`globalFlags` 后置到需要时再扩展。

### 7.7 检测/裁决分离（在 I14a/I14b/I15a/I15b1/I15b2 落地）

- 决策：一致性校验拆「确定性裁决器」（违规项→三态）+「LLM 检测器」（prose→违规项）。确定性部分可单测，LLM 部分走样本集。语义向量级矛盾比对后置（P3）。硬约束检测器阈值见 §0「LLM 阈值分层」。

### 7.8 UI 技术栈锁定（在 I1a 落地）

- 决策：I1a 二选一锁定（默认 React+Vite 用 `.tsx`），消除「原生/不引入重型框架」与 `.tsx` 交付物的矛盾。后续 I22/I23 交付物扩展名随锁定值。

### 7.9 用户确认统一原语（新增，在 I4a 落地）

- 问题：I16/I17/I18c/I24a1/I24a2/I24b/I25c/I26b/I28b2 多处「走用户确认」，但无统一机制，易被各迭代临时重复实现。
- 决策：I4a 提供 ConfirmationGate 统一原语（propose→accept/reject→确定性应用/丢弃）；后续所有确认复用，未复用即验收失败。在 I22 UI 前，「用户」= CLI 命令或 pending-queue 文件 + `--auto-confirm` 测试开关。

### 7.10 硬 MVP 切线与 v1.1 增强集（新增）

- 决策：I1a–I19b = v1.0 MVP（硬门槛）；I20a–I28b2 = v1.1 增强集（可重排/裁剪）。见 §0「MVP 硬切线」。

### 7.11 样本治理（新增）

- 决策：样本集入库记录 model/temperature/日期；每个 LLM 模块留 held-out test 子集；检测器类 ≥15 条、解析/生成类 ≥10 条。见 §0「样本治理」。

### 7.12 组装器 section 顺序（新增，统一 I7a/I7b/I7c 与 §8 的次序）

- 问题：原 I7 验收写「规则→世界观→风格→角色核心→状态」，与设计 §8.1「恒定层（规则/风格/角色核心）在最前」次序不一致。
- 决策：统一为「规则→风格→角色核心→世界观→状态」（恒定层优先，触发层随后，状态最后），I7a/I7b/I7c 的快照测试按此锁定。

### 7.13 跨层写回原子性（在 I19a2 落地，新增）

- 问题：一次用户输入触发 C2/C1/C3/C4 四层写回，任一层失败时其余层如何，原计划未定义。
- 决策：**默认「逐层独立提交 + 失败补偿记录」**——先写确定性层（C2/C1/C3），再 append 正史（C4）；任一层失败时，已成功层保留，失败层及其后续层标记为「待补偿」，产出 `pending-compensation` 记录供用户/下一轮处理；不引入跨文件强事务（超出文件式存储能力，见 §10.1）。I19a2 用负向测试锁定该行为。

### 7.14 规模 smoke（在 I4 落地，新增）

- 问题：核心价值是「长篇一致性」，但无迭代在真实规模下验证检索。
- 决策：I4 增补 `npm run demo:scale-i4`（N=10,000 条正史事件的检索延迟护栏，脚本输出耗时）。MVP 规模上限（如 ≤X 万字 / ≤Y 条正史）作为**已知非目标**记入 §8 风险表；向量检索仍后置（P3）。

### 7.15 样本金标权威与禁改（贯穿全计划，新增）

- 问题：AI 自产金标再自评会系统性放水；为让测试通过而改样本会破坏样本集可信度。
- 决策：① held-out test 集金标由**人工（或独立于开发的另一模型）**产出，dev 集可 AI 产出但需人工抽检；② §9 协议补硬规则：**禁止为让测试通过而修改样本/金标/阈值，一经发现该迭代判失败并回退**。

### 7.16 字数控制验收（在 I27c 落地，新增）

- 问题：原「±15%」硬门槛对真实 LLM 不可控（误差常 ±30–50%），会反复失败拖垮迭代。
- 决策：`wordTarget` 作为**软引导**注入导航指令；验收改为**误差分布报告**（中位数误差 ≤30% 且无系统性失控）。严格字数控制如需保留，降级为 v1.1 可裁剪项。

### 7.17 灵感多样性判定（在 I28b1 落地，新增）

- 问题：原「两两语义距离」依赖 embedding，而向量层已后置（P3）。
- 决策：改用**固定 rubric 的 LLM-judge**（judge prompt 对选项的相关性/多样性打结构化分），不引入任何 embedding 基础设施。

---

## 8. 风险与回滚

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| LLM 结构化输出不稳定（D3 假设失败） | 中/高 | I5 spike + I5b thin 闭环提前验证；失败则改更严格 schema / few-shot / 规则抽取 |
| 检测器（规则/正史/知情）产出不稳定 | 中/高 | I14b/I15a 样本集验证 + 漏检零容忍阈值；失败则降级启发式 + 用户人工确认（§7.7） |
| 注入后生成行为无感知（核心价值不成立） | 中/高 | I8 用样本 + 关键词包含判定验证，失败则调整注入格式或序列化紧凑度 |
| 上下文预算失控 | 中/中 | §8 注入预算占比作为常量，I7a 起用快照测试锁定，不提前做动态分配 |
| 项目文件结构随迭代膨胀 | 低/中 | 层 Schema 只增不破坏；新增层走新目录，不改旧目录语义 |
| 关系/知情语义混叠 | 中/中 | §7.3 边界在 schema 注释固化 + 单测 + 互不引用断言 |
| 拆分/分类 agent 产出质量不稳定 | 中/中 | 低置信条目一律标黄走 ConfirmationGate；拆分只产出候选，不自动落库 |
| 单文件包与源文件双写不一致 | 低/中 | 文件始终是 source of truth；单文件包只作快照，导入时 diff + ConfirmationGate 确认 |
| 编辑 UI 与引擎接口绕过 | 低/中 | UI 只走统一接口，禁直改文件（§5.1）；单测锁定写路径 |
| 并行开发导致接口漂移 | 中/中 | 默认线性；并行前先契约锁（`contracts/*.ts`）+ 并行组后集成收尾（§6.2） |
| 「用户确认」机制各迭代重复实现 | 中/高 | I4a 统一 ConfirmationGate 原语，未复用即验收失败（§7.9） |
| 样本集过拟合/污染 | 中/中 | 样本治理（held-out 子集 + 记录 model/温度 + 回归输出模型版本）（§7.11） |
| 真实 LLM 生成 + 解析串成闭环不可行 | 中/高 | I5c 真实 LLM thin 垂直切片前移验证，失败可早停（§6.3 gate 6） |
| 跨层写回部分失败导致状态不一致 | 中/中 | I19a2 显式定义原子性语义（§7.13）+ 负向测试锁定 |
| 长篇规模下检索/存储退化 | 中/中 | I4 规模 smoke（§7.14）+ MVP 规模上限为已知非目标；向量检索后置 P3 |
| 字数控制不可控（I27c） | 中/中 | wordTarget 软引导 + 误差分布报告（§7.16），不再作硬门槛 |
| AI 自产自评/改样本放水 | 中/高 | 样本金标权威 + 禁改样本硬规则（§7.15） |

**回滚面**：每个迭代是独立可 revert 的提交单元（见 §9 执行协议），失败时回退到上一迭代的「可用状态」，不改写已落库正史（append-only 天然可回滚）。

---

## 9. 给执行 agent 的协议

1. **一迭代一任务**：每次只执行一个 Ixx，不跨迭代顺手改东西。
2. **先填 DoD 卡片**（§4），再动代码；卡片未满足不进入下一迭代。
3. **确定性模块：实现 → 写回归测试 + 负向测试 → `npx vitest run` 通过**（不要求 RED-first）。
4. **LLM 模块：先建/更新样本集（含 held-out 子集），再改 prompt/schema，跑样本集回归**，准确率低于阈值即失败，禁止「接受并继续」。
5. **集成点先接 mock**：任何接入 LLM 的集成，先写 fake backend/mock parser 跑通管道，再换真实 LLM。
6. **确认统一走 ConfirmationGate（I4a）**：任何「走用户确认」不得临时实现，未复用即验收失败。
7. **提交粒度**：每个迭代完成并通过验证后提交一次（`git commit`），提交信息格式 `feat(Ixx): <一句话目标>`。
8. **遇到超范围想法**：记入 backlog，不在当前迭代实现。
9. **跨迭代契约**：引擎接口签名稳定；需要变更时新增接口，不破坏旧接口；正史 jsonl 永不改写。
10. **切片门槛**（§3.9）：若某迭代交付物 > 8 个源文件或验收 > 5 条，先回来拆片，不硬做。
11. **三问完成检查（本版新增）**：每个迭代除了跑绿 vitest + 样本达标，还要能回答——
    - ① 这个切片**用户可见**的增量是什么（地基切片须写明「本迭代无用户可见行为，仅为下一片打地基」）；
    - ② 非法输入/越界操作会不会被**拒绝**（有负向测试）；
    - ③ 依赖的「用户确认」是否走**同一个 ConfirmationGate** 而非临时实现。
    三者缺一，不算完成。
12. **地基切片必配消费者夹具（本版新增）**：每个 schema/存储迭代至少一条按下游消费方式的测试（§3.11），只测读写往返不合格。
13. **样本禁改（本版新增）**：禁止为让测试通过而修改样本/金标/阈值；held-out 金标由人工/独立模型产出（§7.15）；违者该迭代判失败。
14. **阶段级累积 demo（本版新增）**：每阶段末跑 `demo:stage-N`（§3.13），不只跑单迭代 demo。

---

## 10. 完成标准（全计划）

全部 68 个迭代完成并通过各自验收时，产品达到：

- 能基于受管状态生成正文（I8）；
- 状态/正史/关系/知情/世界观可持续累积并回溯（I3/I4/I9/I12/I18c）；
- 大纲导航 + 细纲规划 + 偏差记录可用（I10a/I10b/I10c/I11/I23b）；
- 多视角知情隔离 + 泄漏检测可用（I13/I15a）；
- 生成结果自动校验硬/软约束（I14a/I14b/I15a/I15b1/I15b2）；
- 正文→结构化写回闭环完整（I5b/I5c/I16/I17/I18a/b/c/I19a1/I19a2/I19b）；
- 统一「用户确认」原语贯穿全程（I4a）；
- 多后端可切换、模板/Instruct 预设、可挂插件（I20a/I20b/I21a/I21b/I21c/I21d/I21e）；
- 分层编辑 UI（角色/世界观/大纲/关系/状态/正史）可用（I22a–I23d）；
- 文本导入拆分、单文件包导入导出、纯文本落地可用（I24a1–I25c/I27d）；
- 不变设定索引层 + 分类 agent 可用（I26a/I26b）；
- 续写与灵感 agent 可用（I28a/I28b1/I28b2）。

**其中 I1a–I19b（v1.0 MVP）是必须高质量完成的核心**；I20a–I28b2（v1.1 增强集）可按需重排/裁剪。

即设计文档 v1.3 §3.1 六条设计目标 + §14 创作环境能力的实现版。
