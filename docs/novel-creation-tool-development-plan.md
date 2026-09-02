# AI 长篇小说创作器 — 开发计划（DSH 插件版）

> 版本：v3.3
> 日期：2026-09-02
> 状态：当前执行权威（**I1–I157 全部完成**；当前顺序执行 I158 来源 Remote Host 注册修复；v3.2 原 I151–I162 为后置 provenance，不占用当前连续迭代编号）
> 配套设计文档：`docs/novel-creation-tool-design.md` v3.3（本计划是它的执行层）
> 配套需求权威：`docs/novel-creation-tool-requirements.md` v3.3（需求 ID、验收、迭代覆盖）
> 重构立项输入：`docs/novel-creation-tool-architecture-review.md` v1.0（review record，非设计权威；Stage 15 依据其 §9 路线图）；`docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md` v2.0（Stage 17 依据其 §9.2 优先级表）

---

## 0. 文档头与 v1.x supersession

### 0.1 本版变更

- 历史 v1.x（v1.1–v1.4，I1a–I28b2，独立 Node/Vite 应用路线）**整体失效**，仅保留为 provenance；不再作为当前排期、执行、验收或完成声明依据。
- 本项目当前唯一身份是 **DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin**，宿主基线不可修改（见设计 §0.1）。
- I1–I150 已完成：Stage 15、Stage 16、Stage 17、Stage 18、Stage 19 与 I150 的独立提交、验证、smoke 产物和当前源码均存在；I140 已把 README 十二步主流程收口为产品级 E2E，I149 已把来源感知路由与 Stage 19 产品 E2E 收口为当前代码基线，I150 已修复范围细纲生成接线。不得再将 I106–I150 标为待执行，也不得把后置 F1/F2 回填或伪装成已完成迭代的历史范围。
- I151 首次导入规则与文风初始化、I152 credentials seam、I153 真实导入入口、I154 来源审阅解释提示、I155 作品归档、I156 来源审阅 session 持久化恢复与 I157 来源主角语义均已完成。当前单一执行卡为 Stage 27 / I158：把已公开的来源导入 strict descriptors 补入唯一 Host Typert face，消除 `/api/novelImportInterpretation/create` 404。唯一可复现项目 DSH family pin 仍为 `0.1.1-rc.2`。
- v2.5（2026-08-28）曾把 review v2.0 中级以上问题立项为 Stage 17 / I86–I102，并把 R18 顺延为旧 I103–I112 大卡；该历史只保留 provenance。
- v2.7（2026-08-29）：同步 Stage 17 已完成事实；将 R18 十个产品 epic 拆为 **Stage 18 / I103–I128**。I103 先修 Remote 返回合同基线；I104–I128 按依赖顺序交付 R18。既有 invocation 保持向后兼容，允许经 strict schema、contract lock、返回类型耦合与真实 binder E2E 的 additive Remote；13 层叙事模型与 §0.1 宿主基线不变。每迭代一个任务、一个 verify、一个 smoke 产物与一个干净 commit。
- v2.7 范围修订（2026-08-31）：按本地单用户运行边界重写 I106，删除 durable deletion saga/journal/audit、reservation 与 recovery barrier；收缩当时编号 I118（v2.8 现 I122）的章节润色为不持久化的逐场景会话编排。多叙事真相层写回统一要求同一 Host 请求内实时且幂等；派生 mirror/index 继续使用既有 outbox/可重建合同。
- v2.8（2026-08-31）：同步 I103–I105 已完成事实；核查确认现有各类 version/snapshot/branch 与 parser baseline 均不提供 B5 细纲生成版本化基线，正文受控写回也不自动调整 B5。新增 R18-11，插入 I108 与 I112–I114 四个正式迭代；原 I108–I128 按依赖顺延，Stage 18 扩展为 **I103–I132**。版本化基线只冻结生成意图，不成为第二份 B5 真相；正文语义影响与后续细纲调整只形成候选，经 I11 后才写回。
- v2.9（2026-08-31）：将 README 12 步作者流程确定为唯一主要交付、最终产品和产品级测试流程。审查发现缺少按幕/章/全书生成细纲、候选接受为草稿、最终正文的一次确认式统一定稿、全书完成/一致性门、带目录的单一全文导出和默认作者流程入口；新增 R18-12–R18-15 与 I133–I140。既有 I103–I132 不再重排，Stage 18 扩展为 **I103–I140**；十九项并列技术导航在 I139 分层收纳，能力保留但不再与主流程争夺默认入口。
- v3.0（2026-09-01）：同步 I106–I140 完成事实；针对《灰烬圣典》这类幕后真相、场景设计、作者指令与少量可用叙事文字混合的来源，新增 R19 与 Stage 19 / **I141–I149**。导入先确认来源类型和目标处理方式；幕后素材必须转译成所选 POV 的读者体验与 C3 揭示计划，已有正文必须逐字保真进入 C5，混合文档按段裁决。README 仍为 12 步唯一主流程，只增强步骤 1–2。
- v3.1（2026-09-01）：按设计审查收缩 Stage 19 / **I141–I149** 为来源确认、幕后素材 POV 叙事化、C3/C4 安全边界与产品 E2E；新增 Stage 20 / **I150–I154** 纯重构结构化来源、共享 import operation 与空作品初始化 UoW；新增 Stage 21 / **I155–I161** 独立交付已有正文保真导入。I141 不再提前冻结无服务语义 Remote，C3/C4、结构化 DOCX、UoW、manuscript candidate 与应用均拆为独立可验收切片。
- v3.2（2026-09-01）：在原 I150 前插入范围细纲生成产品修复迭代 **I150**；原 Stage 20 I150–I154 顺延为 **I151–I155**，原 Stage 21 I155–I161 顺延为 **I156–I162**。修复只扩展 I133–I134/R18-12 与 I139–I140/R18-15：选中节自动接线、作者生成要求、对已有节显式追加 LLM 新候选、逐卡保留、原卡保护与大纲工作区下拉框中文显示；不改底层枚举值，不夹带导入基础设施或正文保真能力。
- v3.3（2026-09-01）：将 v3.2 原 I151–I162 导入基础设施/正文保真卡片完整保留为后置 F1/F2 provenance，原编号不再是可执行身份，恢复时必须重新编号。当前进入查漏补缺：I150 保持原修复边界，I151 仅在作品首次导入事件中启动一次“规则与文风初始化” LLM 任务，经 I11 后写入 `rules/*.yaml` 与 `style.yaml`，后续只手工改写。
- v3.3 宿主兼容修订（2026-09-02）：I151 已完成；按连续编号新增 Stage 21 / I152，修复自定义 LLM 配置直接读写旧扁平 `.credentials.yaml` 的宿主合同违例。凭据读写收敛到 `ctx.credentials`，`novel-custom` 路由和公开 Remote 保持不变；v3.2 后置卡片中的旧编号只作 provenance。
- v3.3 导入入口修订（2026-09-02）：I152 已完成；新增 Stage 22 / I153，修复目录层 DOCX 创建作品后仍直接走旧六层分析、且来源审阅被 `OnboardingState` 条件隐藏的共同根因。I150 仍是范围细纲修复，导入来源合同继续归 I141–I149，I151 Host 合同不变。
- v3.3 来源审阅提示修订（2026-09-02）：I153 已完成；新增 Stage 23 / I154，以统一 CSS tooltip 补充四处详细解释及 hover/focus/ARIA 行为。真实 DOCX 分段继续使用 Host 4000 字符 chunks，本迭代不改分段与领域合同。
- v3.3 作品归档修订（2026-09-02）：I154 已完成；新增 Stage 24 / I155，以 Host 目录迁移、活动墓碑和三个 strict additive lifecycle Remote 交付既有作品归档/恢复。归档区只允许恢复，不新增删除或归档内编辑。
- v3.3 来源审阅持久化修订（2026-09-02）：I155 已完成；新增 Stage 25 / I156，在既有 I142 session owner 内补 Windows transient rename 有界重试，并在 I144 Client 审阅面板补原地重试与折叠技术详情；公开 Remote/schema/LLM/分段不变。
- v3.3 来源主角语义修订（2026-09-02）：I156 已完成；新增 Stage 26 / I157，修复首次 create 重试重置 Client state 和技术 ID 输入。`idea|background-material|hybrid + adapt-pov` 统一支持隐藏稳定候选 ID 与 LLM 新主角串联；synopsis/existing-prose、I151、分段和 F1/F2 边界不变。
- v3.3 来源 Remote Host 注册修订（2026-09-02）：I157 已完成；新增 Stage 27 / I158，修复 I142–I148/I151 的 Client contributions 已存在但 `hostContribution` 遗漏相同 strict descriptors 的接线缺口。只补唯一 Host face、完整性守卫与真实 Gateway E2E，不改公开合同和领域行为。

### 0.2 Goal

把设计文档定义的「结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链」作为 DSH 插件分阶段落地。每个迭代结束都是可演示、可测试、可回归、可独立提交的可用状态。

### 0.3 Architecture（简述）

- 唯一运行宿主：DSH；唯一发布形态：ordinary persistent Cordis Plugin。
- 生产安装走**所选 profile 的 bundle path**：package 声明 `dsh.bundle.patch` 并显式列入所选 profile 的有序 `dsh.profile.bundles`；plugin row 只有一个 insertion owner。
- Host 拥有作品文件 I/O、凭据、`ctx.llm`、持久化/索引、领域 Services/Events/Tools、导入导出和业务校验；Client 只拥有注册到 DSH Slot 的 UI，不拥有领域真相。
- 所有副作用归属 Cordis Fiber，停止/更新/卸载后必须完整 dispose。
- 小说内部扩展点统一称为 **Extension**，不是外层 Cordis Plugin。

### 0.4 Tech Stack

| 项 | 决策 | 依据 |
|---|---|---|
| 运行时 | Node.js ≥22（以所选 profile 实际支持为准） | 设计 §0.1 / Cordis 当前代际 |
| 语言 | TypeScript strict，ESM | 13 层 schema 需类型约束 |
| 包管理 | pnpm + 提交锁文件 | DSH 插件安装经 profile 转发 pnpm |
| 插件框架 | `@deepseek-ai/cordis`（当前观测 4.0.1） | 设计 §0.1 |
| DSH | 唯一运行时与项目 manifest/profile/lockfile pin 均为 `0.1.1-rc.2`，禁止 rc.7 fallback 或混装 | 设计 §0.1.3 / D23 |
| 生产组合 | bundle path（`dsh.bundle.patch` + `dsh.profile.bundles`） | 设计 §0.1.1 |
| 本地 smoke 组合 | 仓库 `cordis.yml` + loader/include（仅 smoke） | 设计 §0.1.1 |
| Host 构建 | TypeScript 编译输出 ESM + 类型声明 | 设计 §0.1.3 |
| Client 构建 | I2 起 React 18 + DSH Runtime/Slots + DSH-compatible bundle | 设计 §0.1.3 |
| UI | DSH Slot Client（禁止独立 HTML/SPA/Vite app） | 设计 §0.1.2 |
| LLM | Host `ctx.llm`（禁止直连 OpenAI/兼容 endpoint） | 设计 §0.1.2 |
| 存储 | 文件式 YAML（设定/状态）+ jsonl（正史）+ Markdown（正文）；SQLite 仅重建索引 | 设计 §10 |
| 测试 | Vitest + jsdom + 消费者夹具 + held-out 样本 | 设计 §0.1.3 / 需求 §0.3 |

### 0.5 Composition 合同（本计划唯一执行入口）

- 发布 package 是所选 profile 的 `package.json` 依赖；权威 `pnpm-lock.yaml` 锁定解析。
- 本项目固定选择 **bundle path**：package manifest 声明 `dsh.bundle.patch`，同一 package 显式列入所选 profile 的有序 `dsh.profile.bundles`；不得再由 profile/home patch 重复插入 row。
- 仓库 `cordis.yml` 只用于本地 Loader smoke，不是生产发现/安装入口；shipped DSH composition 永不编辑。
- 同一部署中 bundle path 与直接 patch-row 路径互斥；row 的 insertion owner 恰好一个 composition layer。

### 0.6 TDD Route

```text
TDD Route:
- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: minimum implementation + post-change regression（实现后写回归/负向测试锁定行为）
- Reason: 项目级 TDD 未开启；以「实现 → 回归/负向测试 → smoke」保证质量，等价 verification-before-completion
- Verification: 每迭代 `pnpm run verify:iN`；每阶段 `pnpm run verify:stage-N`
```

### 0.7 全局执行纪律（贯穿 I1–I140）

1. 一迭代一任务、一次干净 commit；失败即阻塞下一迭代。
2. 确定性迭代必须含：正向断言 + 负向断言 + 脚本化 smoke；schema/存储地基切片必配下游消费者夹具。
3. 集成点先 mock/fake，再换真实；LLM 集成先 fake backend/mock parser 跑通管道。
4. LLM 样本优先：改 prompt/schema 前先建/更新样本集及 held-out；gold 不可变，低于阈值即失败。
5. 阈值：硬检测器 canonical 违规 100% 命中 + 整体 ≥90%；正史解析 ≥85%；其他 LLM ≥80%。
6. I11 起所有「用户确认」复用 ConfirmationGate；未确认不写回，重复确认幂等。
7. 安装/卸载/装载 smoke 使用一次性 `DSH_HOME` 与测试 profile，不污染现有 profile。
8. 提交自检：`git status` 只含本迭代文件；`git diff` 无 console.log/临时文件/死代码；无真实 key。
9. 阶段收尾跑全量 `pnpm test` + 本阶段全部 held-out 回归 + `pnpm run verify:stage-N`。
10. 重构/修复迭代（I75–I84、I86–I102）叠加纪律：以「重构/修复前后领域行为等价 + 缺陷消除」为完成条件（既有全量测试 + 相关 stage 回归 + LLM 样本阈值不变 + 本迭代专属负向扫描断言）；只消除复制与接线债务，禁止夹带新功能或改变公开契约（I100 公开命名统一属独立迁移迭代，必须带兼容期与退役文档）；结构性拆分一次一个切片（见 §16；Stage 17 立项输入与修复专属纪律见 §18）。
11. 宿主兼容升级（I85）叠加纪律：版本观测与项目 pin 分离；manifest/profile/lockfile 必须同迭代同版本切换；完整 base+web+plugin 与 Client/Remote/Tools/LLM 门未通过时不得声明新基线，不保留 rc.7 fallback，不触碰作品数据。

---

## 1. 阶段 0：宿主合同门

**阶段门**：`pnpm run verify:stage-0`（I1–I2 全绿）。

### I1：Host-only 普通插件装载生命周期

- **目标**：以一个普通 npm Cordis Host 插件，完整证明打包、selected-profile 安装、bundle composition 装载、运行、卸载与重装。
- **明确不做**：Client bundle/Slot/Remote、项目数据、LLM、产品功能、动态 `cordis_define`、独立 server、内部 DSH API。
- **交付物**：根插件 `package.json`（DSH/Cordis 依赖 pin + bundle manifest + Host export）、`pnpm-lock.yaml`、`tsconfig.json`/`tsconfig.build.json`、`src/index.ts`、`cordis.yml`（本地 smoke）、`examples/profile.cordis.patch.yml` 参考、`src/index.test.ts`、`scripts/smoke-i1.mjs`。
- **验收**：① 可复现 `pnpm install --frozen-lockfile`；② package 构建为 TS ESM；③ selected profile 可 boot 并解析/调用 Host Service；④ stop 后 Service 与 effect 全部消失；⑤ restart 恢复；⑥ manifest/profile 断言 dependency、bundle 声明与唯一 row owner；⑦ 扫描证明无 Client bundle/code。
- **验证**：`pnpm run verify:i1`。

### I2：gate-only 最小 Client 公共合同探针

- **目标**：证明普通 out-of-tree 插件的**公开** Client bundling/装载、公开 Remote、selected-profile boot、单一 Slot 注册与完整卸载。
- **明确不做**：产品 UI、项目数据、领域方法、产品 Host–Client seam、动态 `harness.handle`/`host.call`、未发布/internal builder/`clientBundle` fallback、独立 HTML/SPA/server。
- **交付物**：最小非产品 Client probe、`dsh.client` manifest、`lib/client.js` 构建、Slot 注册/卸载测试。
- **验收**：① 引用的公开 Remote 与 Client bundling 合同已版本锁定；② 真实 build + selected-profile boot 装载 probe；③ 单一经核验 Slot 显示静态标记；④ 公开 Remote 往返返回 probe 数据；⑤ Fiber dispose 后标记/Slot/Remote 全部消失。**若公开合同无法证明，本迭代失败并停止，禁止任何产品 Client 工作。**
- **验证**：`pnpm run verify:i2`。

---

## 2. 阶段 1：数据与核心原语

**阶段门**：`pnpm run verify:stage-1`（I3–I11 全绿）。

### I3：项目根、路径安全与 schema 基础

- **目标**：Host 项目 ID→目录唯一映射、路径 containment 与 YAML I/O、`ProjectMeta`/`BaseEntity`。
- **明确不做**：叙事层 schema、StateEngine、Canon、Client、LLM。
- **验收**：`createProject` 生成 §10.1 目录；load 恢复元数据/id/version；绝对路径/`..`/symlink 逃逸、损坏 YAML、缺必填被拒；消费者夹具经 Host Service 读取。
- **验证**：`pnpm run verify:i3`。

### I4：C2 状态层与 StateEngine

- **目标**：`WorldState`（scene/characters）、单调快照、事务、回滚、diff。
- **明确不做**：items/factions/globalFlags、跨文件事务、parser、UI。
- **验收**：每次变更生成递增 seq 快照；事务失败无半写；回滚/diff 确定；非法 seq/schema 被拒；消费者夹具读当前态。
- **验证**：`pnpm run verify:i4`。

### I5：C4 正史账本 CanonLedger

- **目标**：append-only jsonl、correction/supersede、确定性查询。
- **明确不做**：向量检索、LLM 检测、parser、正史 UI。
- **验收**：旧行不可变；追加 seq 单调；角色/时间/关键词查询与 correction 正确；非法追加/改写失败；10k 事件 smoke 满足延迟护栏。
- **验证**：`pnpm run verify:i5`。

### I6：C5 生成文本存储

- **目标**：chapter/scene 文本的受控 Host 读、追加、范围替换。
- **明确不做**：分支语义、生成、重写、parser、Client 编辑器。
- **验收**：章节元数据与文本往返；有序追加跨重启保留；替换仅限选中范围；路径逃逸/非法引用失败；导出夹具读完整章节。
- **验证**：`pnpm run verify:i6`。

### I7：B1 规则层

- **目标**：Rule schema、YAML 存储、Host CRUD。
- **明确不做**：注入、语义检测、UI、其他设定层。
- **验收**：全部字段往返；immutable/priority/scope 查询正确；非法 kind/scope/缺 statement 失败；消费者夹具供应活跃规则。
- **验证**：`pnpm run verify:i7`。

### I8：B2 世界观层

- **目标**：WorldEntry schema、层级、触发与 supersededBy 改写存储。
- **明确不做**：注入、parser、向量触发、UI。
- **验收**：keyword/regex/constant 往返；parent 遍历正确；改写保留旧条目并指向新条目；非法触发/环失败；消费者夹具做触发查询。
- **验证**：`pnpm run verify:i8`。

### I9：B3 角色核心层

- **目标**：CharacterCore 存储，与 C2 CharacterState 显式分离。
- **明确不做**：角色 UI、关系变更、生成、解析。
- **验收**：核心字段/arc/keyBeats 往返；快照证明无 C2 可变字段混入；非法 kind/name/引用失败；消费者夹具筛选场景角色。
- **验证**：`pnpm run verify:i9`。

### I10：B4 风格层

- **目标**：StyleProfile 存储与禁用表达查询。
- **明确不做**：风格检测、模板、UI 主题、章节覆盖 UI。
- **验收**：完整 profile 往返；非法 person/tense/povScope 失败；forbidden 独立可查；消费者夹具产出恒定风格段。
- **验证**：`pnpm run verify:i10`。

### I11：ConfirmationGate

- **目标**：持久、幂等的统一确认原语 propose→accept/reject→确定性应用/丢弃。
- **明确不做**：业务 proposal 语义、Client 面板、LLM。
- **验收**：未确认不应用；accept 恰好一次；reject 不应用；重复解决幂等；pending 跨重启保留；非法/重放 proposal 失败；auto-confirm 仅测试开关。
- **验证**：`pnpm run verify:i11`。

---

## 3. 阶段 2：上下文与生成

**阶段门**：`pnpm run verify:stage-2`（I12–I19 全绿）。

### I12：ContextAssembler 内核

- **目标**：确定性 assembler 框架、固定 section 顺序、预算、宏展开、B1/B4 serializer。I12 固定采用 UTF-16 code-unit 预算：rules 4,000、style 3,000、总计 6,000；该预算不接受调用方或模型级动态覆盖。
- **明确不做**：B2/B3/C2 serializer、LLM、动态预算、Client。
- **验收**：同输入字节稳定；顺序 rules→style；`{{user}}`/`{{pov}}` 完整展开；section/总预算受控；缺必填/未解析宏失败。
- **验证**：`pnpm run verify:i12`。

### I13：B3/B2/C2 serializer 与触发

- **目标**：B3、B2、C2 基线 serializer 与触发行为。
- **明确不做**：大纲、关系、知情、正史、C5 历史。
- **验收**：顺序 rules→style→characters→worldview→state；仅相关角色/命中世界条目注入；状态为紧凑结构化数据；确定性截断守预算；非法层输入失败。
- **验证**：`pnpm run verify:i13`。

### I14：B5 大纲与细纲存储

- **目标**：act/beat/prerequisites/foreshadowing/endings + beat 下 detailBeats。
- **明确不做**：C6 进度、导航、语义偏差、UI。
- **验收**：嵌套结构往返；wordTarget/status 校验；悬空前提/非法结构失败；夹具枚举 beat 与场景卡。
- **验证**：`pnpm run verify:i14`。

### I15：C6 执行态与 OutlineNavigator

- **目标**：OutlineProgress + 确定性导航。
- **明确不做**：自动改纲、语义偏差 LLM、Client 编辑器。
- **验收**：进度/偏差持久化；下一 beat 尊重前提；导航输出简洁指令；结构偏差记录/调和；未知引用失败。
- **验证**：`pnpm run verify:i15`。

### I16：C1 关系层

- **目标**：Relationship 存储与相关角色摘要注入。
- **明确不做**：自动关系变更、关系规则 Extension、parser、UI。
- **验收**：值/milestone 往返；affinity/trust 边界受控；`knownTo` 明确为关系公开性；相关对摘要确定性注入；非法对/类型失败。
- **验证**：`pnpm run verify:i16`。

### I17：Host-only `ctx.llm` 生成

- **目标**：经 `ctx.llm` 的 Host 生成与凭据/设置解析、流式候选收集。
- **明确不做**：浏览器后端、Client 凭据、parser、检测器、模板注册、直连 endpoint。
- **验收**：fake `ctx.llm` 锁定请求/流/错误语义；真实 smoke 走 DSH 模型路由不暴露密钥；取消归属 Fiber；held-out 样本+元数据入库；Client bundle 扫描无凭据/endpoint。
- **验证**：`pnpm run verify:i17`。

### I18：C3 知情层与 KnowledgeFilter

- **目标**：KnowledgeEntry/KnowledgeState + 确定性 POV 过滤。
- **明确不做**：LLM 泄漏检测、parser、关系公开性复制、UI。
- **验收**：知情只进不退；holder/knows 一致；POV 只含其 knows；逆向/非法引用失败；C1.knownTo 与 C3 schema 互不引用。
- **验证**：`pnpm run verify:i18`。

### I19：完整上下文与候选生成集成

- **目标**：串联大纲/关系/知情/正史/近期与摘要 C5 历史的完整 prompt 与候选生成。
- **明确不做**：写回、检测、parser、Client、Extensions。
- **验收**：fake `ctx.llm` 证明完整有序 prompt 与预算；大纲只注入当前导航；POV 排除未知；正史/C5 用近期+摘要；真实 held-out ≥80%。
- **验证**：`pnpm run verify:i19`。

---

## 4. 阶段 3：一致性

**阶段门**：`pnpm run verify:stage-3`（I20–I24 全绿）。

### I20：确定性裁决器

- **目标**：结构化 violation → pass/warn/reject。
- **明确不做**：语义检测、LLM。
- **验收**：任一 hard 拒绝；仅 soft 警告；空集通过；forbidden 产出结构化 violation；非法 violation schema 失败；生成后与写回前两调用点夹具化。
- **验证**：`pnpm run verify:i20`。

### I21：规则/正史硬约束检测器

- **目标**：`ctx.llm` 将 prose 转为规则/正史 violation。
- **明确不做**：知情泄漏、软检查。
- **验收**：严格 schema + 裁决器集成；≥15 样本；canonical 100% + 整体 ≥90%；模型输出非法时 fail closed。
- **验证**：`pnpm run verify:i21`。

### I22：知情泄漏硬约束检测器

- **目标**：检测当前 POV 不应知道的事实。
- **明确不做**：规则/正史、软检测。
- **验收**：仅过滤后 POV 上下文供检测；结构化泄漏判 reject；≥15 样本 canonical 100% + ≥90%；输出非法 fail closed。
- **验证**：`pnpm run verify:i22`。

### I23：确定性软检查

- **目标**：未解决大纲偏差与悬空实体引用的确定性软检查。
- **明确不做**：语义关系/风格判断、LLM。
- **验收**：每类结构问题产警告；合法引用/已调和偏差无警告；非法输入失败；返回 warn 不 reject。
- **验证**：`pnpm run verify:i23`。

### I24：LLM 软检查（关系漂移/风格偏离）

- **目标**：关系漂移、风格偏离软检查。
- **明确不做**：硬拒绝、向量检索、parser。
- **验收**：严格警告 schema 集成 I20；≥10 样本 ≥80%；软发现永不变 hard；输出非法 fail closed。
- **验证**：`pnpm run verify:i24`。

---

## 5. 阶段 4：解析与受控写回

**阶段门**：`pnpm run verify:stage-4`（I25–I30 全绿）。

### I25：C2 状态 parser

- **目标**：正文解析为严格 C2 ops 并机械应用。
- **明确不做**：其他层 parser、跨层编排。
- **验收**：严格 ops schema；fake parser + StateEngine 消费者测试；非法 target/field/action 失败；低置信走 Gate；held-out ≥80%；应用无二次解释。
- **验证**：`pnpm run verify:i25`。

### I26：C4 正史 parser

- **目标**：正文解析为 CanonEvent append/supersede proposal。
- **明确不做**：其他层、改写旧行。
- **验收**：仅 append/supersede；旧行永不改写；confidence<medium 强制 pending；held-out ≥85%；拒绝后账本不变。
- **验证**：`pnpm run verify:i26`。

### I27：C1 关系 parser

- **目标**：正文解析为 C1 关系增改；默认唯一 C1 自动写入者。
- **明确不做**：关系规则引擎、知情/世界观解析。
- **验收**：合法 ops 机械应用；边界由 C1 store 强制；契约证明无第二默认 C1 写入路径；held-out ≥80%。
- **验证**：`pnpm run verify:i27`。

### I28：C3 知情 parser

- **目标**：正文解析为知情前进操作。
- **明确不做**：关系/世界观、泄漏检测。
- **验收**：仅 hidden→partial→revealed；逆向/跨级非法失败；合法机械应用；低置信走 Gate；held-out ≥80%。
- **验证**：`pnpm run verify:i28`。

### I29：B2 世界观改写 parser

- **目标**：正文解析为 B2 supersede proposal。
- **明确不做**：原地覆盖、关系/知情解析。
- **验收**：仅新条目+supersede proposal；未确认零写入；接受后旧条目标 rewritten；拒绝无改动；held-out ≥80%。
- **验证**：`pnpm run verify:i29`。

### I30：完整生命周期编排

- **目标**：generate→validate→user decision→逐层 parser→pre-write 校验→writeback/compensation。
- **明确不做**：新层、UI、Extension、另一事务 owner。
- **验收**：fake `ctx.llm` 证明确定性全流程；C2/C1/C3 先 commit，C4 append 与 B2 确认改写；失败记 pending compensation 不隐藏成功写；拒绝零写；真实 held-out e2e 达阈值。
- **验证**：`pnpm run verify:i30`。

---

## 6. 阶段 5：配置与内部 Extension

**阶段门**：`pnpm run verify:stage-5`（I31–I32 全绿）。

### I31：A2 Host 配置

- **目标**：prompt 模板、Instruct 预设、采样/模型路由配置、基于 `ctx.llm` 的后端抽象。
- **明确不做**：直连 endpoint/密钥、UI 主题、外层插件类型、Client LLM。
- **验收**：模板 section 顺序与预设持久化；路由/采样切换不改上层；mock adapter 可测；真实委托 `ctx.llm`；SecretRef 仅 Host 解析；非法路由/模板失败。
- **验证**：`pnpm run verify:i31`。

### I32：内部 Extension registry

- **目标**：Fiber 属的内部 Extension 协议，覆盖 Provider/Injector/Validator/Parser/关系规则/后端策略。
- **明确不做**：Extension 成为外层 Cordis Plugin；独立文件/凭据/LLM/UI/composition 所有权。
- **验收**：每类经同一生命周期 registry 生效于声明 seam；卸载移除；自定义 Provider 走存储/注入/解析；关系规则默认禁用、仅补充 parser 输出并带 provenance；重复/未授权注册失败。
- **验证**：`pnpm run verify:i32`。

---

## 7. 阶段 6：DSH Slot 创作工作区

**阶段门**：`pnpm run verify:stage-6`（I33–I36 全绿）。

### I33：产品 Client Slot 工作区

- **目标**：以 I2 证明的公开 Remote 合同在经核验 Slot 启动产品 React 工作区。
- **明确不做**：复用 I2 probe、独立 root/HTML/SPA/server、Client 文件/LLM、领域逻辑。
- **验收**：产品 Client 为独立 bundle 入口；selected-profile boot 在 Slot 渲染工作区；typed 最小 Remote 读 Host view model；loading/error 正常；卸载移除 UI 与 handler。
- **验证**：`pnpm run verify:i33`。

### I34：B3/B2 编辑面板

- **目标**：角色核心与世界观可视化编辑。
- **明确不做**：大纲/关系/状态/正史面板。
- **验收**：CRUD 仅经 Host Services/Remote 持久化；世界观层级/改写与角色字段校验；Client bundle 无 fs API；非法写被拒。
- **验证**：`pnpm run verify:i34`。

### I35：B5/细纲与 C1 编辑面板

- **目标**：大纲/细纲场景卡与关系编辑。
- **明确不做**：状态回滚、正史更正、生成工具。
- **验收**：经 Host 合同编辑；非法引用/越界显示 Host 错误；重载一致；Client 无重复领域校验 owner。
- **验证**：`pnpm run verify:i35`。

### I36：C2 快照回滚与 C4 只读更正面板

- **目标**：状态快照/回滚与正史只读 + supersede 确认入口。
- **明确不做**：正史直接编辑、Client 侧回滚/写回逻辑。
- **验收**：回滚走 StateEngine；正史无普通写入口；更正走 Gate 且确认后才追加 supersede；卸载无残留订阅。
- **验证**：`pnpm run verify:i36`。

---

## 8. 阶段 7：导入、可移植与索引

**阶段门**：`pnpm run verify:stage-7`（I37–I40 全绿）。

### I37：确定性导入入口

- **目标**：txt/md/docx 的受控读取、规范化、切块与 pending 候选。
- **明确不做**：真实拆分 agent、自动写层、ST 迁移、Client 文件解析。
- **验收**：各格式归一为有序 chunk；fake 拆分器验证管道；候选留 Gate；空/坏/越界输入失败；文件字节不过量过 Client。
- **验证**：`pnpm run verify:i37`。

### I38：拆分 agent

- **目标**：`ctx.llm` 粗拆 B5/B2 与细拆 detailBeats。
- **明确不做**：C1/C2/C3/C4 推断、自动接受、ST 迁移、Client LLM。
- **验收**：严格候选 schema；低置信可见 pending；接受后经既有 Store 写入；≥10 样本 ≥80%；拒绝候选零写。
- **验证**：`pnpm run verify:i38`。

### I39：导出/导入可移植性

- **目标**：纯文本/Markdown 导出 + 版本化单文件包 + 确定性往返。
- **明确不做**：ST 格式、新 source of truth、浏览器建包、向量导出。
- **验收**：C5 导出 txt/docs；设定导出可读 Markdown/YAML；`full-project` 档案覆盖 B1–B5 与 C1–C6 共 11 层、`shareable-template` 排除 C5 文本；round-trip 以规范化语义等价校验（不比较 `exportedAt` 字节）；冲突走 Gate；坏/不支持版本失败。
- **验证**：`pnpm run verify:i39`。

### I40：可重建 SQLite 不变设定索引

- **目标**：YAML source of truth 之上的重建索引。
- **明确不做**：向量/语义检索、数据库权威、分类 agent。
- **验收**：immutable B1/固定 B2 精确检索；删除后重建结果一致；YAML 变更增量同步；坏索引丢弃重建；源文件仍权威。
- **验证**：`pnpm run verify:i40`。

---

## 9. 阶段 8：索引分类与写作辅助

**阶段门**：`pnpm run verify:stage-8`（I41–I45 全绿）。

### I41：设定分类 agent

- **目标**：`ctx.llm` 分类候选供索引确认。
- **明确不做**：直接改 YAML、向量检索、自动入索引。
- **验收**：严格 SettingEntry schema；去重与 source 引用保留；Gate 先于索引；≥10 样本 ≥80%；拒绝后索引与文件不变。
- **验证**：`pnpm run verify:i41`。

### I42：局部编辑与快速重写

- **目标**：固定段手动编辑与选中范围快速重写；可选 reparse。
- **明确不做**：整章生成、静默正史改写、续写/灵感。
- **验收**：手动编辑逐字精确、非目标段哈希不变；可选 reparse 经 Gate 确认后调 I25–I29 同步 state/canon；快速重写走标准生命周期；取消/拒绝保留原文；held-out ≥80%。
- **验证**：`pnpm run verify:i42`。

### I43：大纲引导章节写作与落地

- **目标**：按场景卡与 wordTarget 软控制成章，最终 txt/docs 落地。
- **明确不做**：硬字数门槛、新导出格式、续写/灵感。
- **验收**：当前场景卡与目标字数入 prompt；标准生命周期；held-out 报告 median/四分位误差 median ≤30% 且无失控；成品有完整起止并复用 I39 导出。
- **验证**：`pnpm run verify:i43`。

### I44：续写 agent

- **目标**：显式调用续写下一段并进入标准闭环。
- **明确不做**：被动触发、灵感备选、独立核心管道。
- **验收**：用当前状态/正史/大纲/细纲/POV；标准 validate→decision→parse→writeback；fake route 锁接线；≥10 样本 ≥80%；拒绝零写。
- **验证**：`pnpm run verify:i44`。

### I45：灵感 agent + 完整生命周期门

- **目标**：2–3 备选方向；选定方向确认后调整 B5/C6；并完成全包安装/升级/卸载/重装门。
- **明确不做**：被动监测、自动写正史、向量/语义距离、未确认改纲、删除作品数据、为过关改样本/阈值。
- **验收**：备选 2–3 个可区分；正史行数不变；固定 rubric 独立 LLM judge 达阈值；选定变更 Gate 确认；全包在干净 profile 可装/升级/卸载；升级 teardown 完整；卸载零残留且不删作品数据，重装可读；全测 + 全 held-out + 全阶段 demo 绿。
- **验证**：`pnpm run verify:i45`。

---

## 10. 阶段 9：创作台 UI 重设计

**阶段门**：`pnpm run verify:stage-9`（I46–I49 全绿）。

### I46：创作台地基 + 视觉体系

- **目标**：在已核验 Slot 上把工作区升级为「创作台」——品牌头栏 + 左侧层级导航 + 内容区浮动面板，建立「编辑台/书斋」视觉体系，并注册可发现入口。
- **明确不做**：六层真实表单内容（I47–I49）、JSX runtime、novel 自有主题引擎、独立页面/SPA、新增 Host 能力或持久化。
- **交付物**：`shell.overlay` 创作台面板（折叠/关闭）、主页面右上角悬浮圆形启动入口（UI 打磨补强：点击打开并隐藏自己）、`src/client/styles.ts` 包内样式（消费 `--dsw-alias-*`）、`el()` 助手与组件基础、六层空态占位、迁移后的测试锚点。
- **验收**：selected-profile boot 渲染创作台；明暗随宿主主题切换；Fiber 卸载后 Slot/样式/监听归零；新锚点 `data-novel-workspace` + `data-novel-layer` 三态与空态断言绿；无 standalone/JSX/新增 Host seam。
- **验证**：`pnpm run verify:i46`。

### I47：B3/B2 编辑面板

- **目标**：角色核心真表单与世界观列表/详情/改写编辑，替换旧单字段表单。
- **明确不做**：大纲/关系/状态/正史面板、Client 侧领域校验 owner、直接文件读写。
- **交付物**：角色列表 + 详情表单（name/kind/personality/background/motivation/goals/flaws/abilities/speechStyle/arc）；世界观列表 + 详情 + 改写（supersede）入口。
- **验收**：CRUD 仅经 Host Remote 持久化；角色全字段与世界观层级/改写 round-trip；非法写展示 Host 错误；Client bundle 无 fs API。
- **验证**：`pnpm run verify:i47`。

### I48：B5/C1 结构化编辑器

- **目标**：大纲（幕→节→细纲场景卡）与关系对的结构化编辑，替换裸 JSON 文本框。
- **明确不做**：状态回滚、正史更正、第 14 层、重复领域校验 owner。
- **交付物**：大纲层级编辑器 + 细纲场景卡视图；关系列表 + 编辑器（from/to/type/affinity/trust/milestones/knownTo）。
- **验收**：经 Host `outlineSave`/`relationshipSave` 契约读写；非法引用/越界显示 Host 错误；重载一致；序列化后与既有契约兼容。
- **验证**：`pnpm run verify:i48`。

### I49：C2/C4 面板

- **目标**：状态快照时间线/回滚/diff 与正史只读 + supersede 更正入口。
- **明确不做**：正史直接编辑、Client 侧回滚/写回逻辑、绕过 ConfirmationGate。
- **交付物**：C2 快照时间线 + 回滚 + diff 视图；C4 只读账本（带只读徽标）+ supersede 更正表单（propose→accept）。
- **验收**：回滚走 StateEngine；正史无普通写入口；更正走 Gate 且确认后才追加 supersede；卸载无残留订阅。
- **验证**：`pnpm run verify:i49`。

---

## 11. 阶段 10：作品启动与六层初始化

**阶段门**：`pnpm run verify:stage-10`（I50–I53 全绿）。

### I50：作品选择与 Host 启动编排

- **目标**：建立 Host-owned 的多作品 list/create/open/readiness 编排，修复创作台硬编码 `default` 且六层未打开的启动缺口；纯空白作品可直接进入创作台。
- **明确不做**：DOCX 上传、LLM 分析、候选确认写入、导入已有非空作品。
- **交付物**：project lifecycle coordinator；additive `projectList/projectCreate/projectOpen` Remote；Client 作品选择/新建空白入口；六层 `ready|empty|uninitialized|corrupt` 状态；移除全部 `default`；复用唯一 ConfirmationService 实例。
- **验收**：空 root 显示新建而非六层错误；新建后 B3/B2/C1/C4 合法空、B5 uninitialized、C2 为确定性 `initial-state` seq 0 空快照；两作品切换零串写；重启可重开；精确 legacy `{}` outline 仅判 uninitialized，非空非法文件 fail closed；unknown/unsafe ID 不造 phantom 目录；open 幂等且并发合并；旧 Remote 方法保持兼容；selected-profile smoke 走真实选择→打开→六层可用路径。
- **验证**：`pnpm run verify:i50`。

### I51：受控 DOCX 上传与真实文本提取

- **目标**：在创作台提供文件选择器，通过受限 Client→Host 分块上传取得真实 DOCX 的规范文本块，并退役手写最小 parser。
- **明确不做**：LLM、六层候选、ConfirmationGate、任何作品层写入、长期保存原始 DOCX。
- **交付物**：严格 upload start/chunk/finalize/cancel Remote；Host 临时区与 SHA-256/限额校验；成熟 ZIP/XML DOCX adapter；真实 Office/LibreOffice fixtures；旧 parser 删除与 lingering-reference 检查。
- **验收**：gold 文本一致；压缩文件默认 ≤10 MiB；路径穿越、伪扩展、加密、损坏、乱序/重复块、entry/解压量/压缩比超限与 zip bomb 均拒绝；取消/失败/Fiber dispose 后临时文件归零；Client bundle 无 ZIP/XML parser 或 Node fs；作品数据不随临时清理删除。
- **验证**：`pnpm run verify:i51`。

### I52：六层初始化分析器

- **目标**：让 DOCX 规范文本与自由文本经 Host `ctx.llm` 生成 B3/B2/B5/C1/C2/C4 六个带证据的严格候选包，并支持单层反馈重生成。
- **明确不做**：C3 推断、自动接受、自动写层、Client LLM、修改 I38 的 B2/B5 专用输出合同。
- **交付物**：先冻结的 dev/held-out 样本；绑定 projectId/onboardingSessionId/sourceHash 的六层候选 schema；共享证据 map + 分层 reduce；Host analysis start/status/cancel/regenerate；fake backend 消费者夹具；进度与 Fiber 中止。
- **验收**：样本不少于 10 个且 held-out 独立；analysis start/status/cancel/regenerate 拒绝 project/session/sourceHash 错配；每层复用既有 Domain Schema 并携带 confidence/source/warnings；自由文本非空、UTF-8/NFC、无 NUL、默认 ≤2 MiB，超限在 LLM 前失败；重生成一层时其他五层候选哈希不变；B3.relationships/knowledgeIds/arc.keyBeats 强制为空；C2 是输入终点/故事起点快照且仅含当前 scene/characters 子集，C4 只含文本明确事件且可空；无 C3/items/factions/globalFlags 字段；模型不可用、取消或非法输出时所有作品层哈希不变；各层 held-out ≥80%。
- **验证**：`pnpm run verify:i52`。

### I53：候选审阅、逐层确认与幂等落地

- **目标**：完成 DOCX、自由文本、纯空白三种启动入口；六层分别支持接受、修改后接受、整层打回重生成或跳过，并将任意已接受子集经既有 Domain Service 落地后进入创作台。
- **明确不做**：导入已有非空作品、静默覆盖、C3 推断、直接改 YAML/jsonl、跨六文件强制回滚、补偿性删除、修改 I11 `pending|accepted|rejected` 三态合同。
- **交付物**：独立 onboarding Client 模块；六层审阅/反馈/裁决 UI；绑定 projectId/onboardingSessionId 的 Gate proposal lineage（`replacesId` + edited/regenerated mode）；跨层 preflight；B2 parent-first 稳定拓扑排序；B3→B2→B5→C2→C4→C1 apply orchestrator；结构化 `partial-retryable` 结果与幂等重试。
- **验收**：六层当前提案必须分别到 accepted 或显式 skipped，pending 不得启用首次 apply；修改/重生成先 reject 旧提案再建后继，跳过 reject 且无后继，旧值不可静默应用；所有 Remote 操作拒绝 project/session/sourceHash 不匹配；单层打回不改变其他候选；B3.relationships/knowledgeIds/arc.keyBeats 强制为空；B2.parent 校验本层引用并按 parent-first 稳定拓扑序 create，环/缺失 parent 失败；B5.prerequisites/C4.consequences 对完整候选 ID 集预检；B5.charactersInvolved/detailBeats.pov/foreshadowing.knownBy、C1.from/to/knownTo、C2.characters.characterId、C4.participants 校验 B3；C1.milestones 校验已先落地的 C4；任何悬空引用只阻止自身及依赖层；B2 与 B5 是独立失败域；C4 只 append/supersede；返回 `{projectId,onboardingSessionId,appliedLayers,skippedLayers,blockedLayers,pendingLayers,retryable,errors}`；重复 apply 语义幂等，部分失败后重试只补未完成层；DOCX 部分接受和自由文本单层重生成均有 selected-profile E2E；重启后作品可重开；Fiber dispose 后 job/upload/Slot/临时文件零残留。
- **验证**：`pnpm run verify:i53`。

---

## 12. 阶段 11：侧板化与现有 UI 修复

**阶段门**：`pnpm run verify:stage-11`（I54–I59 全绿）。

### I54：DSH Slot 兼容门与右侧停靠侧板

- **目标**：按 D20 重新核验所选 DSH 与当时最新版公开 Slot；在没有 additive 侧区内容 Slot 时，将居中浮窗退役为 `shell.overlay` 右侧全高非模态停靠侧板。
- **明确不做**：不升级 DSH、不接管 root/sidebar/conversation/details 单槽、不保留居中/停靠双路径、不修其他 UI。
- **交付物**：版本/Slot manifest 证据；停靠侧板样式与 shell；保留主页面右上角悬浮圆形开关入口（UI 打磨补强）；面板宽度可经左边缘拖柄调整（`--nv-panel-width`，640–1600px），过窄（<720px）自动折叠侧边路由栏为横向横条；居中浮窗样式和测试锚点退休清单。若新版已有公共 Slot，本迭代停止并先通知用户升级，不写 fallback。
- **验收**：当前基线和当时最新版均无公共 Slot 时 selected-profile 只注册一个 `shell.overlay` 主体；贴右/全高/非模态；窄屏仍在同一 Slot；卸载后 Slot/样式归零；扫描无单槽替换与双路径。
- **验证**：`pnpm run verify:i54`。

### I55：作品上下文栏与项目切换

- **目标**：让当前作品持续可见，并可返回作品列表、新建/切换作品；消除打开后无法换书与跨项目草稿污染。
- **明确不做**：不改 Host project source of truth、不做正文工作台、不改初始化裁决语义。
- **交付物**：作品上下文栏；back-to-projects/switch action；脏表单离开裁决；切换时 editor/store reset；Host `projectOpen` 复核。
- **验收**：两作品往返零串写；角色/世界观/大纲等 draft 不跨项目；失败 open 保持原作品；重启可重开；unknown/unsafe ID 仍 fail closed。
- **验证**：`pnpm run verify:i55`。

### I56：六层初始化裁决正确性

- **目标**：修复“修改后接受”未提交编辑值和“打回重生成”无反馈的缺口，锁定六层终态门。
- **明确不做**：不实现分析进度/重试（I57）、不改 I11 三态、不放宽跨层预检。
- **交付物**：逐层编辑控件；regenerate feedback；`editedValue`/feedback Remote 接线；空候选/pending/apply eligibility 状态。
- **验收**：Host 精确收到用户值；不得回退写原候选；旧提案先 reject 且 lineage 正确；空候选/pending/错绑定阻止裁决和 apply；其他层哈希不变。
- **验证**：`pnpm run verify:i56`。

### I57：初始化进度、取消、重试与应用刷新

- **目标**：把现有 analyzer status/cancel 和 partial-retryable 语义接入 UI，并在 final apply 后进入已刷新的创作台。
- **明确不做**：不改候选 Schema/prompt、不新增 applied journal、不重做导航 IA。
- **交付物**：分析 busy/progress/cancel/retry；失败恢复；apply result 分层显示；成功后 `reloadProject` + 激活创作台；部分失败仅重试未完成层。
- **验收**：分析中防重复 start；取消零层写入；错误可重试不砖化；成功刷新六层；partial retry 不重复已完成层；Fiber dispose 后 job/监听归零。
- **验证**：`pnpm run verify:i57`。

### I58：任务型创作台信息架构

- **目标**：把九项扁平导航重组为“写作 / 策划 / 连续性 / 作品设置”，为后续正文与审校面板建立稳定入口。
- **明确不做**：不实现 I60 之后的新业务面板、不改 Host Remote、不做视觉主题引擎。
- **交付物**：分组导航模型；现有六层、初始化、创作设置、LLM 设置的迁移映射；稳定 route/state/data 锚点。
- **验收**：所有既有面板可达且状态不丢；技术层编号仅作辅助徽标；旧九项扁平导航零引用；刷新/折叠保持合法 active view。
- **验证**：`pnpm run verify:i58`。

### I59：响应式、可访问性与保存反馈

- **目标**：完成停靠侧板的窄屏、键盘、焦点、异步播报与防重复提交基础体验。
- **明确不做**：不新增业务能力、不引入新 UI shell/外部字体、不建立 novel 自有主题引擎。
- **交付物**：responsive breakpoints；焦点进入/恢复/Esc；`focus-visible`；`aria-live`；保存中/已保存/失败状态；请求去重与按钮 busy 状态。
- **验收**：键盘可遍历；无 `outline:none` 无替代焦点；异步结果可播报；窄屏无不可达内容；双击/连点至多一次 Remote；明暗主题回归和 Fiber 清理通过。
- **验证**：`pnpm run verify:i59`。

---

## 13. 阶段 12：P0 正文写作闭环

**阶段门**：`pnpm run verify:stage-12`（I60–I65 全绿）。

### I60：C5 章节/场景读取与导航

- **目标**：建立 Host-owned C5 最小只读 Remote，并在写作区显示章节树、场景列表与正文。
- **明确不做**：不编辑正文、不生成候选、不暴露文件路径或整份 live repository。
- **交付物**：chapter list/read/scene read descriptor；Host adapter；Client 章节树/场景导航；空章/错误态。
- **验收**：多章顺序、空章、未知引用、跨项目拒绝、重开一致；只返回最小 owned JSON；Client bundle 无 fs/path；现有 `docs/` 派生镜像语义不变。
- **验证**：`pnpm run verify:i60`。

### I61：C5 正文编辑与可选 reparse

- **目标**：在正文编辑器中复用 I42 完成固定范围逐字保存，并允许显式选择 reparse。
- **明确不做**：不做 LLM 生成候选、不做正文分支、不隐式修改任何结构层。
- **交付物**：范围选择/编辑 UI；Host range edit Remote；变更 diff；reparse propose/accept 接线；脏文本保护。
- **验收**：用户文本 exact round-trip；范围外哈希不变；未选/拒绝 reparse 时 B2/C1/C2/C3/C4 不变；确认后只走既有 parser fan-out；非法范围零写。
- **验证**：`pnpm run verify:i61`。

### I62：统一写作候选命令合同

- **目标**：让生成、续写、按场景卡写作和局部重写共用 Host 候选命令，只生成可审阅候选而不预先落地。
- **明确不做**：不做候选 UI 裁决（I63）、不做队列（I65）、不复制已有 LLM/校验/parser 实现。
- **交付物**：冻结的 candidate contract；project/chapter/scene/sourceHash 绑定；四种 intent adapter；取消/错误/过期候选语义；fake backend 消费者夹具。
- **验收**：四种 intent 都产生合法候选且所有作品层哈希不变；错绑定、模型失败、取消、非法输出零写；复用 I19/I42–I44；若改 prompt/schema，先冻结 dev/held-out 并达到既有阈值。
- **验证**：`pnpm run verify:i62`。

### I63：候选预览与生成后裁决

- **目标**：作者看到候选正文、diff 与校验结果后，再接受、拒绝或要求重写；退役生成前预先 accept 的产品路径。
- **明确不做**：不做持久正文分支（I70）、不做批量队列、不放宽硬约束。
- **交付物**：候选审阅面板；accept/reject/rewrite action；幂等裁决；旧 `decision=accept` 入口退役与迁移说明。
- **验收**：accept 才进入标准校验→解析→受控写回；reject 零写；rewrite 产生后继候选且旧候选不可静默接受；双击幂等；旧预先接受产品入口零引用。
- **验证**：`pnpm run verify:i63`。

### I64：一致性审校中心

- **目标**：集中呈现规则/正史、知情、关系和风格问题及其正文定位，形成可执行审校流程。
- **明确不做**：不改检测器阈值/样本、不自动修正文或设定、不新增第二裁决器。
- **交付物**：统一 issue projection；严重度/来源/引用/定位；硬阻断与软警告裁决 UI；刷新/过滤。
- **验收**：规则、正史、知情、关系、风格五类问题投影均可追溯；硬冲突阻止 accept；软警告必须显式继续或重写并记录；无完整 live object 序列化；检测器既有回归全绿。
- **验证**：`pnpm run verify:i64`。

### I65：可恢复自动生成队列

- **目标**：由 Host 持有按场景卡范围执行的生成队列，支持暂停/继续/取消、重试、预算和停止策略。
- **明确不做**：不自动接受候选、不静默改 B5/C6、不建立多用户调度或浏览器任务 owner。
- **交付物**：任务 Schema/Service/Remote；场景稳定 ID；队列 UI；hard-stop/soft-stop、word/token budget、retry policy；stop/restart recovery。
- **验收**：每场景独立候选并停在待裁决；重启恢复无重复正文；暂停/继续/取消幂等；硬冲突立即停、软警告按策略停；预算不超限；Fiber dispose 后运行任务中止且持久状态可恢复。
- **验证**：`pnpm run verify:i65`。

---

## 14. 阶段 13：P1 能力可达性

**阶段门**：`pnpm run verify:stage-13`（I66–I72 全绿）。

### I66：C3 知情与揭示管理面

- **目标**：让作者按事实与角色查看 holders/revealPlan/status，并受控执行揭示或 holder 变更。
- **明确不做**：不在初始化时推断 C3、不允许知情倒退、不复制 KnowledgeFilter owner。
- **交付物**：knowledge list/read/propose Remote；事实/角色双视图；揭示/holder Gate action；POV 边界提示。
- **验收**：知情只增不退；逆向状态失败；未确认零写；POV 不泄露；重载一致；Client 只持有最小投影。
- **验证**：`pnpm run verify:i66`。

### I67：B1 规则与 B4 文风控制面

- **目标**：提供规则优先级/immutable 与人称、时态、POV、禁用表达等 Host-validated 表单。
- **明确不做**：不改变规则/风格 Schema、不复制检测器、不引入主题设置。
- **交付物**：rule/style Remote；列表/详情表单；中文枚举和错误反馈；触发检测消费者夹具。
- **验收**：round-trip；非法枚举、越界优先级、immutable 非法改写失败；保存后生成与检测读取同一 Host 真相；Client 无领域 fallback。
- **验证**：`pnpm run verify:i67`。

### I68：C6 进度与灵感方向落地

- **目标**：可视化当前幕/节/场景卡和偏差，并让用户选定的灵感方向经 Gate apply 到 B5/C6。
- **明确不做**：不自动选方向、不强制改大纲、不绕过 N-5。
- **交付物**：progress/deviation projection；导航/完成状态 UI；inspiration select→propose→apply；刷新与审计记录。
- **验收**：未选择/拒绝时层哈希不变；选择并确认后只改授权的 B5/C6；重复 apply 幂等；当前导航与 detailBeat 状态一致。
- **验证**：`pnpm run verify:i68`。

### I69：导入导出与备份 UI

- **目标**：把 I37–I38 的通用导入管线与 I39 的全项目包、shareable-template、纯文本及 round-trip 恢复能力接入作品设置。
- **明确不做**：不做 ST 迁移、不做非空作品静默合并、不让 Client 持有 Host 路径。
- **交付物**：受控 import/export Remote；格式/范围选择；下载/恢复反馈；冲突与 N-7 阻断说明。
- **验收**：full/shareable/txt/md round-trip；路径/secret 不进入 Client；非空合并按 N-7 fail closed；取消/失败无半导入；可移植性既有回归全绿。
- **验证**：`pnpm run verify:i69`。

### I70：C5 正文版本与分支

- **目标**：补齐 Host-owned 正文版本/分支模型，使候选可保留为分支、比较并选择唯一 chosen。
- **明确不做**：不复制完整项目版本控制、不隐式 reparse、不改 C4 append-only。
- **交付物**：C5 branch/version Schema 与迁移；Repository/Service；branch diff/choose UI；旧单版本文档兼容迁移与回滚边界。
- **验收**：旧项目重开不丢正文；chosen 唯一；分支切换可逆且不改 B2/C1/C2/C3/C4；显式 reparse 才同步；冲突/坏迁移 fail closed。
- **验证**：`pnpm run verify:i70`。

### I71：全局搜索与上下文追踪

- **目标**：提供跨正文/角色/世界观/大纲/正史/知情搜索、交叉引用和生成注入解释。
- **明确不做**：不引入向量检索、不泄露 secret/完整 live object/未授权 POV 知识、不让索引成为真相。
- **交付物**：可重建搜索投影；实体引用；结果跳转；context trace（层、触发原因、裁剪/预算摘要）。
- **验收**：删除索引可重建；关键词/精确引用稳定；POV/secret 负测；trace 与 ContextAssembler 实际选择一致；大规模项目响应 smoke。
- **验证**：`pnpm run verify:i71`。

### I72：写作进度面板

- **目标**：以可重建派生统计展示章节字数、目标完成度、场景卡状态、POV 分布和任务历史。
- **明确不做**：不建立第二份作品进度真相、不做云同步/多用户统计、不自动改变大纲状态。
- **交付物**：Host statistics projection；进度概览与筛选；空作品/大规模作品视图；重建命令/测试。
- **验收**：统计由 C5/B5/C6/任务记录重建且一致；删除派生统计可恢复；空作品无假进度；POV/字数/场景状态正确；Client 不持久化统计真相。
- **验证**：`pnpm run verify:i72`。

---

## 15. 阶段 14：剧情时间线（方案 A，R15）

> 定位：现有 C2/C4 `storyTime` 与 C3 `revealAt` 均为自由文本、无统一排序轴；C1 关系全量注入不符合设计 §8「相关角色对」。时间线把 B5 结构展开为有序剧情时间轴（timeline.yaml），节点可安排揭示信息与关系建立时机；C1 关系注入按「当前时间线节点之前已建立」过滤，C3 revealAt 可对齐节点 label。设计 §5.13 / §14.11，需求 R15。

### I73：剧情时间线数据层、服务与上下文过滤

- **目标**：新增时间线数据层与 Host 服务，并把关系注入改为按当前时间线节点过滤。
- **明确不做**：不改 C1/C3 wire 契约与既有层 owner（knownTo 仍只表公开性，C3 revealAt 仍自由文本）；时间线不成为 C1/C3 的第二写 owner。
- **交付物**：`core/timeline`（schema + timeline.yaml 仓库 + `buildTimelineFromOutline` 骨架生成 + `effectiveRelationshipIds`/`anchorNodeId`/`filterRelationshipsByTimeline` 纯函数，schema 与 node:fs 分离保证 Client bundle 可入图）；`host/timeline-service`（read/ensureFromOutline/setCurrentNode/save）+ `novelTimeline` Remote；onboarding `finalApply` 落地 B5 后自建骨架（已存在不覆盖）；`writing-context` 关系注入按当前节点过滤（未安排关系始终保留，时间线缺失回退全量）。
- **验收**：骨架顺序/绑定/空大纲负测；repository round-trip 与损坏 fail loudly；服务层 ensure 大纲未就绪 fail-closed、setCurrentNode 校验未知节点；writing-context 消费者夹具（时间线缺席全量/当前节点过滤/手动锚定覆盖）。
- **验证**：`pnpm run verify:i73`。

### I74：剧情时间线面板

- **目标**：策划组新增「时间线」视图，作者可查看、安排并保存时间线。
- **明确不做**：不做 revealAt 直接引用节点 id 的联动（后置）；Client 不持有时间线真相、不复制领域校验。
- **交付物**：`novelTimeline` Remote 挂载；nav 新增「时间线」稳定视图；面板：节点列表（含当前节点标记）、每节点 storyTime/关系/揭示安排编辑、手动设当前节点（null 恢复自动）、一键自建、保存；回归测试。
- **验收**：面板渲染/自建/节点列表/保存/手动设当前断言；Remote 挂载失败降级；Client bundle 无 node:fs。
- **验证**：`pnpm run verify:i74`。

---

## 16. 阶段 15：架构债务消除（重构）

**阶段门**：`pnpm run verify:stage-15`（I75–I84 全绿）。

> 立项输入：`docs/novel-creation-tool-architecture-review.md`（v1.0，2026-08-27）§9 优先重构路线图。审查记录非设计权威，本阶段是其立项落地的执行卡片；所有工作线只消除复制与接线债务，保持既有领域所有权设计不变（core 归 core、接线归组合根、真相单 owner），不改变任何领域契约与公开 Remote/wire 形状。审查证据行号（如 `client.ts L1194–2501`）为审查当日实测，随代码演进可能漂移，以文件路径与职责为准。

### 本阶段执行纪律（重构专属，叠加 §0.7）

1. 纯机械重构优先（I75/I76/I81），结构性拆分一次一个切片（I79/I80/I82/I83），大文件拆分不得一迭代内同时跨多模块大改。
2. 每个重构迭代以「重构前后领域行为等价」为完成条件：`pnpm test` 全量 + 相关 stage 回归 + LLM 样本阈值（如有）不变，外加本迭代专属的**负向扫描断言**（复制源唯一、类型断言归零、行数护栏、白名单外引用失败等，见各卡片）。
3. 重构迭代禁止夹带新功能或领域语义调整；超范围想法记 backlog，不在本迭代实现。
4. 修改既有目录语义前先确认对应卡片列出的 canonical owner、兼容/退役边界；跨模块共享类型一律走 `contracts/` 契约锁（I78 启用后强制）。

### I75：共享 Remote 接线层与组合根收敛

- **目标**：把 `src/host/remote/*.ts` 的 `param()`/`xxxInvocation()` 19 份重复助手收敛为单一共享 helper；把 `src/index.ts` 的 16 个 bindRemote 适配块替换为参数化工厂 `defineRemote(serviceKey, methods[])`；同步消除 18 处 `as Parameters<...>` 与 6 处 `as never`（含 review §3.3 指出的 3 处零成本项）；统一 27 个 `(dispose) => ctx.effect(...)` 钩子与 5 次 `resolveA2GenerationConfig(...)` 重复闭包（review §9 #1 / §8#3）。
- **明确不做**：不改任何领域服务实现与公开 wire 契约形状；不动 `client.ts`；不做契约 codegen（I77/I78）。
- **交付物**：`src/host/remote/shared.ts`（`defineRemote` 参数化工厂 + 统一 helper）；`src/index.ts` 接线层重构；回归测试 + 接线层消费者夹具。
- **验收**：方法签名变更在接线层重新报编译错（类型安全恢复负向夹具）；`pnpm test` 全量绿 + Stage 11–14 既有回归绿；grep 断言生产代码 `as Parameters<...>` 与 `as never` 归零；新增一个 Remote 方法的横切面由 5~6 文件降至 2~3 文件（以一次演示性新增+回退验证）。
- **验证**：`pnpm run verify:i75`。

### I76：llm 解析/检测公共基座

- **目标**：9 份 parse-JSON-or-throw 样板、7 份 `confidenceSchema`、3 份 violation schema 分别收敛到 `src/llm/parse/shared.ts` 与 `src/llm/validate/shared.ts`；每域只保留 op 形状 + assert + prompt（review §9 #2 / §5.4）。
- **明确不做**：不改任何 prompt 语义、输出形状、样本/gold 与阈值。
- **交付物**：两个 shared 模块；各 parser/validator 改写为引用共享基座；复制源归零断言。
- **验收**：全部既有 parser 样本回归（含 held-out）阈值不变；grep 断言 `confidenceSchema` 生产定义唯一、parse 样板单份；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i76`。

### I77：wire schema 单一来源与组合根契约补丁修复

- **目标**：`src/host/remote/*.ts` 的 wire schema 从 core schema 派生（沿用 `host/remote/timeline.ts` 与 `host/remote/editor.ts` 直接复用先例），消灭「core schema / 服务 view / wire schema / client 投影」手写四重声明；修复 `novelReview.records` 与 `novelKnowledgeManager.pending` 返回裸数组、wire 要 envelope 的组合根补丁，让契约漂移在类型层暴露（review §9 #3 / §8#1 / §6.3）。
- **明确不做**：Client 投影 shape（I78）；`contracts/` 形状本体（I78）；不改领域服务返回语义。
- **交付物**：派生 wire schema 改造；组合根补丁移除；strict codec wire smoke。
- **验收**：给 `characterCoreSchema` 改名一个字段，影响面由 6~8 文件降至 ≤3 文件（横切面演示）；wire smoke 断言请求/响应与派生 schema 完全一致；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i77`。

### I78：契约锁落地与 Client shape 收敛

- **目标**：真正启用 `contracts/` 存形状本体（当前仅 2 个只含字符串 shapeIds 的 JSON，review §6.3）；`CharacterShape`/`OutlineShape` 等 client 投影改为可打包的纯 zod 直用（消除全 optional + `kind: string` 失型）；显式化「可入 client 图的 core 纯模块白名单」到设计文档并加构建扫描约束（review §8#5）。
- **明确不做**：不改 Host 领域契约；不引入独立 codegen 工具链（设计 D22；避免第二构建面）；不做 UI 行为改动。
- **交付物**：`contracts/` 形状本体契约锁；client shape 收敛；白名单文档 + 扫描脚本。
- **验收**：契约锁与实现一致性断言（形状漂移即失败）；`CharacterShape` 字段类型收窄的编译期断言；client bundle 负向扫描通过且白名单外 core 引用失败；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i78`。

### I79：拆分 writing-adjudication-service 与共享五层写回器

- **目标**：把 `src/host/writing-adjudication-service.ts`（~588 行，17 依赖）按「候选生产 / 校验投影 / 落地 saga」三段拆分；`buildWriters`（L277–322）与 `text-edit-service.ts`（L153–201）逐行相同的 C2→C1→C3→C4→B2 五层写回器提取为共享模块（review §5.2/§5.4 / §9 #4）。
- **明确不做**：不改裁决语义、Gate 流程与公开 Remote 契约；不拆 `queue-service.ts`（review 判定其内聚，不宜拆）。
- **交付物**：拆分后模块 + 共享写回器；service 级测试迁移。
- **验收**：I62–I65 消费的既有测试与 E2E 全绿；grep 断言五层写回器单份实现；17 依赖编排面收敛；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i79`。

### I80：拆分 onboarding-adjudication-service 与类型断言消除

- **目标**：把 `src/host/onboarding-adjudication-service.ts`（~648 行）拆出「裁决状态机」与「6 个 applyLayer」；消除 12 处 `raw as unknown as XxxInput`（review §3.3 / §9 #4）。
- **明确不做**：不改六层裁决语义、apply 顺序（B3→B2→B5→C2→C4→C1）、`partial-retryable` 结果形状与 I11 三态。
- **交付物**：状态机/applyLayer 独立模块；类型化输入管线；既有测试迁移。
- **验收**：I53 相关测试与 selected-profile E2E 全绿；grep 断言生产 `as unknown as` 归零；apply 顺序与幂等语义回归不变；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i80`。

### I81：core 高优先文件拆分

- **目标**：按 review §4.1/§4.2 拆分 `src/core/statistics/index.ts`（~524 行 → types/build/repository）、`src/core/onboarding/analyzer.ts`（~426 行 → prompt/validate/example，170 行 few-shot 字面量独立）、`src/core/search/index.ts`（~432 行 → per-layer builder）；`src/core/schema/onboarding.ts`（~322 行）改用 `characterCoreSchema.omit(...)` 组合消除手写逐字段重列。
- **明确不做**：不改任何领域函数签名与行为；不拆分 review 判定可接受的文件（`core/text/index.ts`、`core/assemble/serializers.ts`）。
- **交付物**：拆分后模块 + 保持导出的兼容 index。
- **验收**：纯移动/复制无行为变化；既有测试与消费者夹具全绿；grep 断言行数护栏与复制源归零；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i81`。

### I82：client.ts 拆分（一）store 接口收敛与 ops 按层拆分

- **目标**：把 `src/client.ts`（~2876 行）拆出 `src/client/store/` 与 `src/client/ops/`；`makeOps`（L1194–2501）按层拆分；收敛 `WorkbenchActions`（75 方法）/`WorkbenchState`（45 字段）/`ProjectSessionActions` 三接口重复声明；`viewPanel`（33 形参）与 `workbenchView`（~40 形参）收敛（review §5.1 / §9 #5）。
- **明确不做**：不改 Remote 调用与面板行为；不拆 mount（I83）；不迁移 `client.test.ts`（I83）。
- **交付物**：store/ops 模块；接口收敛；既有测试锚点不变。
- **验收**：既有 `client.test.ts` 全绿（行为等价）；三接口重复声明归零断言；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i82`。

### I83：client.ts 拆分（二）面板注册表、mount 与测试 harness

- **目标**：拆出 `src/client/panels/` 注册表与 `src/client/mount.ts`（16~17 个结构相同的 `$mount` 块收敛）；`src/client/styles.ts`（~2052 行）按键分区；抽取 `src/client.test.ts`（~4838 行）中约 350 行单文件 harness 为共享测试工具并拆分测试文件（review §4.1/§4.2 / §9 #5）。
- **明确不做**：不改 UI 行为与 DOM 测试契约；不新增面板。
- **交付物**：panels/mount 模块；styles 分区；harness 抽取与测试拆分。
- **验收**：迁移后 UI 测试等价全绿（锚点/交互断言不变）；`$mount` 块重复归零断言；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i83`。

### I84：低优先级债务清零

- **目标**：合并 `normalizeText`/`chunkText` 双份文本管道（`core/upload/index.ts` vs `src/import/index.ts`，review §5.4）；合并 3 份 SHA-256→hex；修复分层倒置边（`core/settings-index → llm/port`、`core/upload → import`、`llm/template → core/settings-index` 往返，review §8#4）；修复杂项（`index.ts` 缩进错误、`workspace-service.ts` 可选参数 + 运行时 throw 类型撒谎、`onboarding-analyzer-service.ts` fire-and-forget 无日志、队列轮询 2000ms 硬编码常量化，review §8#7）；统一内部服务命名（review §8#2，不改变公开 Remote 服务名）。
- **明确不做**：不改任何公开 Remote 契约；不引入新功能；破坏性改名（如 `novelImport`/`novelImportExport`/`novelExport` 三服务合并为公开契约变更）后置为独立迁移迭代。
- **交付物**：合并/修复清单 + 负向扫描脚本。
- **验收**：复制源归零；分层倒置边扫描归零且 core→host/client 反向 import 保持 0；杂项修复各有断言；`pnpm test` 全量绿 + 全量 held-out 样本回归不变。
- **验证**：`pnpm run verify:i84`。

---

## 17. 阶段 16：DSH family `0.1.1-rc.2` 兼容升级

**阶段门**：`pnpm run verify:stage-16`（I85 全绿，✅ 完成）。

> 定位：把唯一可复现项目 DSH family pin 从 `0.1.0-rc.7` 原子切换为 `0.1.1-rc.2`，以真实
> base+web+plugin Host/Client 生命周期证据证明普通持久 Cordis Plugin 在当前 DSH 上完整兼容。
> 只升级并验证宿主公共合同；不新增产品功能、不改领域语义或公开 Remote/wire 形状。

### I85：同步 DSH family `0.1.1-rc.2` 基线并重建完整兼容门

> ✅ 完成（2026-08-28）：`verify:i85` / `verify:stage-16` 全绿。manifest/profile/lockfile
> 已原子切换为精确 `0.1.1-rc.2`；typert 包按发布 `.d.ts` 消费面移入生产依赖；真实
> base+web+plugin CLI boot（HTTP 200）/stop/restart/DSH 重启/uninstall、进程内服务级
> boot/stop/restart、Client ModuleLoader 物化、Typert gateway 往返/非法参数/卸载负测、
> 真实 ToolRuntime 注册/执行/参数 fail-closed、真实 LlmRuntime request/text-delta/finish/
> cancel 与 provider-specific stop 支持/拒绝（`UNSUPPORTED_OPTION` 显式浮出）均绿；
> 两处 Vitest 未 await 修复；I54 版本门改为读取当前项目 pin。唯一项目 DSH family pin 现为
> `0.1.1-rc.2`（D23），无 rc.7 残留或混装，作品 source of truth 零迁移/删除。

> 定位：I1–I84 已完成后，消除当前已安装运行时 `0.1.1-rc.2` 与项目可复现 pin `0.1.0-rc.7` 的漂移。只升级并验证宿主公共合同；不新增产品功能、不改领域语义或公开 Remote/wire 形状。

### I85：同步 DSH family `0.1.1-rc.2` 基线并重建完整兼容门

- **目标**：把 DSH family 项目 pin 从 `0.1.0-rc.7` 原子切换为 `0.1.1-rc.2`，以真实 base+web+plugin Host/Client 生命周期证据证明普通持久 Cordis Plugin 在当前 DSH 上完整兼容。
- **明确不做**：不改产品功能、领域 Schema、公开 Service/Remote/wire 形状、prompt、样本/gold/阈值；不新增 standalone 或动态 RPC；不保留 rc.7 fallback；不迁移、删除或改写作品 source of truth；不顺手升级 Cordis 或其他无关依赖。
- **交付物**：
  1. `package.json` 的 `@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-typert-protocol`、`@deepseek-ai/dsh-typert-registry` 精确 pin 更新为 `0.1.1-rc.2`；若发布 `.d.ts` 需要消费者解析 Typert 类型，则把对应包移到正确的生产依赖面；
  2. `examples/selected-profile.package.json` 的 `dsh-base`/`dsh-web-app` 更新为 `0.1.1-rc.2`，`pnpm-lock.yaml` 精确同步，加入 rc.7 残留/混装负向断言；
  3. 一次性 `DSH_HOME` 真实 `dsh-base + dsh-web-app + novel-creation-tool` selected-profile smoke：单一 bundle row、Host boot/stop/restart、Client ModuleLoader graph、`shell.overlay` mount/unmount、Fiber 零残留；
  4. Typert Remote 真实 gateway 往返与卸载负测；真实 ToolRuntime 注册/合法执行/非法参数 fail-closed；`ctx.llm` 以 `0.1.1-rc.2` runtime + fake adapter 锁定 request、text-delta、finish、cancel 及 provider-specific stop 支持/拒绝；
  5. 修复 `src/host/remote/shared.test.ts` 两处未 `await` 的 `resolves`；更新 I54 版本门使其读取当前项目 pin/live Slot 证据，而非硬编码 rc.7 历史观测；新增 `smoke:i85`、`verify:i85`、`verify:stage-16`。
- **验收**：① DSH family manifest/profile/lockfile 全为精确 `0.1.1-rc.2`，仓库执行基线无 `0.1.0-rc.7` 残留（历史 provenance 文本除外）；② clean install + build + 真实 base+web+plugin boot/Client mount/Remote 往返/stop/restart/upgrade/uninstall 全绿；③ Tools 非法参数在业务执行前拒绝，缺失 projectId 不得变成字符串 `undefined`；④ LLM 已支持与不支持的 stop 路由均显式，不静默承诺；⑤ `pnpm test`、全 held-out、contract lock、Stage 0/6/8/11/15 关键宿主消费者回归全绿且 Vitest 无未 await 警告；⑥ git diff 不含作品数据、样本/gold/阈值或公开契约形状变化。
- **验证**：`pnpm run verify:i85`；阶段累积 `pnpm run verify:stage-16`。
- **回退**：任一 Host/Client/Remote/Tools/LLM 门失败即 I85 未完成，回退本迭代 manifest/profile/lockfile 与兼容测试改动至 I84 commit；不得以混装、双版本或 fallback 继续。

---

## 18. 阶段 17：架构债务修复（review v2 立项）

**阶段门**：`pnpm run verify:stage-17`（I86–I102 全绿）。

> 立项输入：`docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0，2026-08-28）§9.2 优先级表。审查记录非设计权威，本阶段是其立项落地的执行卡片。覆盖范围：review v2.0 中**中级以上**（高 / 中-高 / 中）问题，按 **P0 紧急 → P1 高 → P2 中-高/中 → P3 中-高/中** 顺序排期，紧接 I85 之后；review v2.0 §8 其余中-低/低项（validator 骨架、仓储 primitive、import 格式 descriptor 等）继续留 backlog（§21）。除 **I100**（公开 Remote 命名统一，独立兼容迁移迭代）外，所有迭代**不改变领域契约与公开 Remote/wire 形状**，不夹带新功能。

### 本阶段执行纪律（修复专属，叠加 §0.7 与 §16 重构专属纪律）

1. 每个修复迭代以「修复后领域行为等价 / 缺陷消除」为完成条件：`pnpm test` 全量 + 相关 stage 回归 + LLM 样本阈值（如有）不变，外加本迭代专属**负向扫描断言**（见各卡片）。
2. 审查证据行号（如 `client/ops/queue.ts:17-34`）为审查当日（2026-08-28）实测，随代码演进可能漂移；以文件路径与职责为准。
3. 一迭代一任务；结构性拆分一次一个切片（I89/I90/I95）；禁止夹带新功能或领域语义调整；超范围想法记 backlog。
4. 修改既有目录语义前先确认对应卡片列出的 canonical owner、兼容/退役边界；跨模块共享类型一律走 `contracts/` 契约锁（I78 启用后强制）。

### I86：修复 5 个 Remote 死方法并补齐真实 binder 端到端契约测试（P0 紧急）

- **目标**：修复 `novelWriting.propose/adjudicate`、`novelReview.scan`、`novelStatistics.sceneCards/tasks` 在真实 DSH 客户端绑定器处 arity/位置实参漂移导致的必现拒绝（review §3.1：实参个数精确等于参数个数，缺参即抛错；`acceptsUndefined` 只放行显式 `undefined`，不放行缺参）。
- **明确不做**：不改 descriptor 公开形状（方法名/参数顺序/参数个数为公开 wire 契约）；不改领域服务语义；不改 fake remote UI 测试契约。
- **交付物**：5 处 Client 调用补齐实参（`propose(projectId, input, settings)`、`adjudicate(candidateId, decision, settings)`、`scan(projectId, settings)`、`sceneCards(pid, actId, beatId, status, limit)`、`tasks(pid, status, limit)`，缺省位显式传 `undefined`，对齐 `client/onboarding.ts:387/423`、`ops/progress.ts:44`、`ops/search.ts:23-24` 先例）；新增走真实 DSH 客户端绑定器语义的端到端契约测试（覆盖 5 个修复方法与既有正常对照），消除「接线后方法在真实绑定器下可调用」盲区。
- **验收**：真实绑定器下 5 个方法往返成功且负向（缺参/错参）仍拒绝；新增契约测试在 CI 全绿；既有 fake remote UI 测试不变仍绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i86`。

### I87：Agent 上下文单一 owner（P1 高）

- **目标**：消除 `src/agents/agent-tools.ts:98-102` 自建 context builder（`NovelAgentDeps:49-70` 无 timeline）与生产候选路径 `NextSceneContextProvider`（`src/index.ts:342-355` + `writing-context.ts:124-135`）双 owner 导致的 `novel_context` 与 `novel_continue` 语义分叉（可能暴露「未来」关系）（review §3.2）。
- **明确不做**：不改 prompt 语义与注入内容；不改时间线过滤规则；不改 Agent 工具名。
- **交付物**：Agent wiring（`src/index.ts:589-606`）复用同一 `NextSceneContextProvider` 实例；删除第二套 builder；一致性测试（`novel_context` 展示与 `novel_continue` prompt 基于同一上下文）。
- **验收**：grep 断言 context builder 生产定义唯一；Agent 上下文与生产候选路径同一 provider 实例；一致性测试绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i87`。

### I88：队列轮询 timer 归 Fiber（P1 高）

- **目标**：`src/client/ops/queue.ts:17-34` 的 `queuePollTimer` 从每次渲染重建的 ops 闭包（`client.ts:662` `makeOps` → `createWorkbenchOps`）移到 apply 级（Fiber）持有并随 Fiber dispose 完整回收；`OpsContext.active` 布尔快照（`ops/context.ts:21`）改为 `isActive()` 函数，消除卸载后旧闭包仍自视 active 与单槽 timer 被覆盖、堆积并行轮询链的问题（review §3.3，违反设计 §0.1.1 Fiber 行）。
- **明确不做**：不改轮询间隔与队列业务语义；不改 Host `queue-service`；不改队列 UI 行为。
- **交付物**：apply 级 poll controller（Fiber 持有 + disposer）；ops 只发命令；`isActive()` 活跃判定。
- **验收**：Fiber 卸载后轮询链归零（负向断言）；多轮 refresh/start 不堆积并行轮询（负向断言）；既有队列 UI 测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i88`。

### I89：index.ts 组合根分段（P1 高）

- **目标**：把 `src/index.ts`（65 import `:1-66`、单 apply `:145-619`、52 处 `ctx.provide` `:148-607`）按「基础服务 / 管理面 / 编排面」三段组装函数拆分；跨域副作用（onboarding 成功后触发 timeline 副流程并 `.catch(() => undefined)` 静默吞错 `:299-309`、统计 wire 形状转换 `:560-576`）外移或改为显式注册的 hook（review §3.4）。
- **明确不做**：不改任何 Service/Remote 契约与装配行为；不做新功能；不拆 client 侧（I90）。
- **交付物**：分段组装函数；副作用外移模块或显式 hook；行数护栏负向断言。
- **验收**：装配行为等价（既有测试全绿）；grep 断言单 apply 行数护栏成立、`.catch(() => undefined)` 静默吞错归零（analyzer/onboarding 副流程有显式 logger 或注册 hook）；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i89`。

### I90：client.ts 拆 controllers/presenter（P1 高）

- **目标**：把 `src/client.ts`（1002 行，factory `:372-1002`、Overlay `:703-900` 约 200 行 `ui` 方法表、`workbenchView` 21 形参 `:160-345`；Remote 资源清单五处平行维护 `:383-398/:401-416/:912-959/:965-980/:982-997`）拆出 workspace shell、project/onboarding/settings/upload controllers、overlay presenter；mount 清单改声明式 registry + service bag + disposer Set（review §3.5）。
- **明确不做**：不改 UI 行为与 DOM 测试契约；不新增面板；不动 `client/ops`、`client/store`（I82/I83 已拆）；不动 `client/layers/chapters.ts` 等大文件（I95）。
- **交付物**：controllers/presenter 模块；声明式 mount registry + service bag + disposer Set；workbenchView 长参数列表收敛。
- **验收**：迁移后 UI 测试等价全绿（锚点/交互断言不变）；grep 断言 Remote 资源清单单份维护、`$mount` 块仍归零、行数护栏成立；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i90`。

### I91：descriptor↔adapter↔client namespace 三方类型耦合（P1 高）

- **目标**：消除 `RemoteMethodSpec.call: (...args: any[])`、`adapter as unknown as TService`（`host/remote/shared.ts:56-64,71-80`）、Client 侧手写 `Promise<unknown>` 接口 + 消费处 `as unknown as X` 强转，让 descriptor↔Host adapter↔Client namespace 三方类型耦合，方法签名变更在接线层即报编译错（review §3.1 根因 / §9.2 P1，穿透 I75/I77 的遗留）。
- **明确不做**：不改公开 Remote 方法名/参数形状与领域服务实现；不做 codegen（沿用 I77/I78 派生 schema 路线）。
- **交付物**：接线层类型化（descriptor 参数/返回类型派生 adapter 与 client namespace 类型）；消除接线层 `any[]`/`as unknown as`；签名变更负向夹具。
- **验收**：grep 断言接线层 `as unknown as`/`...args: any[]` 归零；给一个 Remote 方法增删参数，接线层/Client 消费处编译错（负向夹具）；`pnpm test` 全量绿 + Stage 11–14 回归绿。
- **验证**：`pnpm run verify:i91`。

### I92：双导航真相一致性校验（P2 中-高）

- **目标**：`src/write/continuation.ts:10-30` 同时消费已含 outline/navigation 的 StoryContextAssembly（`core/pipeline/index.ts:54-59,69-79` 已把 navigation 渲染进 assembly）与独立 OutlineNavigation，补一致性校验，消除语义分叉风险（review §8#3）。
- **明确不做**：不改 assembly 组装与渲染语义；不改 prompt 输出与样本；不改导航生成规则。
- **交付物**：一致性校验（assembly 内 navigation 与独立 OutlineNavigation 不一致即 fail loudly，拒绝使用分叉视图）；回归/负向测试。
- **验收**：不一致输入被拒（负向断言）；一致输入行为不变；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i92`。

### I93：LLM 批量 apply 事务化（UoW）（P2 中-高）

- **目标**：`llm/parse/canon.ts:149-164` 逐条 append、`worldview.ts:120-137` 逐条 rewrite、`split.ts:129-153` 混合 save/create 改为工作单元（UoW）语义：后项失败不部分落库；split 重试不因 outline 已存在而失败（review §8#6）。
- **明确不做**：不改解析 schema、输出形状、prompt、样本/gold/阈值；不改 ConfirmationGate 语义。
- **交付物**：UoW 封装（全成功才提交，失败可回滚/可重试）；split 幂等重试。
- **验收**：中途失败零落库（负向断言）；split 重试成功；既有 parser 样本回归（含 held-out）阈值不变；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i93`。

### I94：TextRepository 拆分与镜像 outbox 语义（P2 中）

- **目标**：拆分 `src/core/text/index.ts` 四职（codec/迁移 `61-105` / 仓储 `108-180` / 编辑分支策略 `183-295` / 迁移写入队列 `309-356`）；修复 `:335-349` 先提交 JSON 真相再写 Markdown 镜像、镜像失败时「主写已成功但调用报错」的谎报问题（review §8#7）。
- **明确不做**：不改 C5 存储格式与语义；不改公开 Remote/wire 形状；不改分支模型。
- **交付物**：按职责拆分模块（保持导出兼容 index）；镜像写入 outbox/可补偿语义（主写成功即成功，镜像失败记录待重试并显式暴露，不谎报失败）。
- **验收**：镜像失败时主写成功且调用不谎报失败、镜像待重试（负向断言）；既有 C5/编辑测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i94`。

### I95：大文件拆分（chapters / onboarding / test-harness / 巨型测试文件）（P2 中）

- **目标**：拆分 `src/client/layers/chapters.ts`（590 行，章节树+场景编辑+reparse+候选裁决+分支五职混装，`ChaptersEditOps` 23 方法 `:164-196`，拆 chapters/scene-editor/candidate/branch 四片）、`src/client/ops/chapters.ts`（348 行，分支 `21-91`/正文 `92-209`/候选 `210-293` 三段，随 layers 拆）、`src/client/onboarding.ts`（431 行四职，拆 types/panels）、`src/client/test-harness.ts`（426 行，拆 fake runtime/remote builders/DOM helpers/onboarding fixtures）；巨型测试文件（`client-panels.test.ts` 1555、`client-shell.test.ts` 736、`client-onboarding.test.ts` 666）按面板拆文件（review §4）。`client.ts`/`index.ts` 已由 I89/I90 覆盖；`queue-service.ts` 内聚不拆（review §4 同判）；`core/text/index.ts` 由 I94 按职责拆。
- **明确不做**：不改 UI 行为、DOM 契约与测试锚点；不新增面板；不改 Remote 调用。
- **交付物**：拆分后模块 + 兼容导出；测试文件拆分；行数护栏。
- **验收**：迁移后 UI 测试等价全绿（锚点/交互断言不变）；grep 断言目标文件行数护栏与复制源归零；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i95`。

### I96：五层写回阶段合同类型化（P2 中）

- **目标**：消除 `LifecycleWriters<unknown>`（`five-layer-writeback.ts:55-60`）+ 类型断言（`:64-109`）+ `executeLifecycle<unknown>`（`landing-saga.ts:163-175`），恢复 parser/writer 形状漂移的编译期保护（review §8#1）。
- **明确不做**：不改五层写回顺序（C2→C1→C3→C4→B2）与语义；不改裁决/Gate 流程；不改公开契约。
- **交付物**：泛型化 `LifecycleWriters`/`executeLifecycle`（按层参数化类型）；消除 unknown 断言；负向夹具。
- **验收**：grep 断言 `LifecycleWriters<unknown>`/`executeLifecycle<unknown>` 归零；parser/writer 形状漂移负向夹具编译失败；既有裁决测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i96`。

### I97：Remote editor 请求合同精确化（P2 中）

- **目标**：`remote/editor.ts:35-38`、`common.ts:8` 的通用 `z.unknown()` json codec 改为表达真实请求合同（read/write 请求/响应 schema），让 strict wire 边界表达真实请求（review §8#2；领域服务侧复验保留，属防御纵深）。
- **明确不做**：不改领域服务校验语义；不改 wire 行为（请求仍经领域服务校验）。
- **交付物**：editor 请求/响应精确 schema；strict codec wire smoke。
- **验收**：wire smoke 断言请求/响应与精确 schema 完全一致；非法请求在 wire 边界拒绝（负向断言）；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i97`。

### I98：extensions store schema 校验落地（P2 中）

- **目标**：`extensions/store.ts:9-11` 声称写前/读后 schema 校验、实际仅校验 layerId 后直接 `writeYaml/readYaml<unknown>`（`:25-35`），补真实写前/读后校验与 schema resolver（review §8#4）。
- **明确不做**：不改 extension 协议与存储格式；不新增 extension kind；不改 registry 生命周期（I99）。
- **交付物**：store 层 schema resolver（按 kind 解析校验 schema）+ 写前/读后校验。
- **验收**：非法 extension 内容写前/读后被拒（负向断言）；合法内容行为不变；既有 extension 测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i98`。

### I99：extensions registry 不可变引用（P2 中）

- **目标**：`extensions/registry.ts:124-140` 保存原 extension、`:150-163` 返回同一可变引用——注册后突变可绕过 id/kind/layerId 不变量，改为注册时快照/冻结，返回不可变投影（review §8#5）。
- **明确不做**：不改 extension 注册/卸载生命周期语义；不改协议。
- **交付物**：注册快照/冻结；负向测试（注册后突变不生效/不可见）。
- **验收**：注册后突变被拒或不可见（负向断言）；既有 extension 测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i99`。

### I100：公开 Remote 服务命名统一（P2 中，独立迁移）

- **目标**：`novelImport`/`novelImportExport`/`novelExport` 三服务并存统一为单一公开服务（review §8#17；I84 明确后置的独立迁移迭代）。
- **明确不做**：不改导入导出语义与文件格式；不做静默破坏——公开契约变更必须带兼容期（旧服务名保留 deprecated 转发并文档化退役路径）与迁移测试。
- **交付物**：单一服务名 + 兼容转发层 + 命名迁移/退役文档 + 迁移测试。
- **验收**：三服务生产引用归零（兼容转发层除外）；公开契约迁移文档化；旧名 deprecated 转发行为等价；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i100`。

### I101：单 acting 互锁拆分 / OpsContext 窄化 / workspace-service 收敛（P3 中-高）

- **目标**：`client/layers/statistics.ts:115-129,166-287`（概览/详情/筛选/任务/重建删除共用一个 acting，**高**）与 `knowledge.ts:86-113,163-275`、`import-export.ts:35-67,107-209`（**中**）的单 acting 互锁独立子工作流拆为子流程判别联合或独立 busy 状态（不新建全局 LayerContext）；`OpsContext`（`ops/context.ts:17-36`，完整 state/actions + 12 Remote，传入 16 个 ops 工厂）拆 OpsRuntime + 各域窄 port；`workspace-service` mega-facade（`host/workspace-service.ts:26-64` 35 方法、`:67` 11 位置依赖）收敛（review §5 / §9.2 P3）。
- **明确不做**：不改 Remote 调用与面板行为；不新建全局 LayerContext 掩盖依赖；不改领域真相 owner。
- **交付物**：子工作流独立 busy/判别联合；OpsRuntime 窄化；workspace-service 收敛。
- **验收**：并行子工作流互不阻塞（断言）；ops 工厂窄 port 断言；既有 UI/服务测试全绿；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i101`。

### I102：onboarding schema 抽 BindingSchema / extension kind 单一 descriptor 表 / prompt 示例类型化（P3 中-高）

- **目标**：`core/schema/onboarding.ts` projectId/session/sourceHash 重列 6 次（`:115-119/:136-145/:149-155/:195-201/:231-253/:257-266`）、六层 enum 重列 4 次（`:199/:219/:235/:260-263`）复用 `core/schema/base.ts:4` 的 `entityIdSchema`，抽 BindingSchema/OnboardingLayerSchema 并拆 analysis/adjudication 合同；`extensions/registry.ts` 新增 kind 需同步 enum（`12-20`）/union（`26-84`）/seams（`86-93`）/maps（`98-110`）/projection（`150-163`）/switch（`198-219`）六处改单一 descriptor 表派生全部，未用的 `categoryByKind`（`98-101`）删除；prompt 示例字面量类型化（`core/onboarding/example.ts`、`llm/parse/*` 的 zod schema vs prompt JSON 示例双写，review §6）。
- **明确不做**：不改 onboarding 候选 schema 字段语义与 apply 顺序；不改 extension 协议；不改 prompt 语义与样本。
- **交付物**：BindingSchema/OnboardingLayerSchema；extension 单一 descriptor 表；prompt 示例类型化（双写消除）。
- **验收**：grep 断言 projectId/session/sourceHash 与六层 enum 重列归零（复用单一 schema）；extension kind 新增为单点变更（演示性新增+回退）；`pnpm test` 全量绿。
- **验证**：`pnpm run verify:i102`。

---

## 19. 阶段 18：合同地基、作者主流程与新增功能（R18，I103–I140）

**阶段门**：`pnpm run verify:stage-18`。完成时必须串行证明 I103–I140 全绿、`pnpm test`/build 全绿、Stage 18 全部 held-out 与既有五层 parser held-out 全绿、真实 Remote binder/contract-lock/Client DOM/单一全文导出回归和 README 12 步产品 E2E 全绿。

> 定位：Stage 18 / I103–I140 已全部完成并成为 Stage 19 的真实代码基线。本阶段以 typed descriptor、composition split、UoW、TextRepository、chapters slices、schema 单点化、C5 mutation、SceneOutlineBinding 与 I140 十二步产品 E2E 为完成事实。R18-1–R18-15 是产品 epic，不是实现任务；旧 I103–I112 大卡和 v2.7 I107–I128 编号均被本节取代。
>
> **共同合同**：既有 invocation 方法名、参数与结果向后兼容；additive Remote 必须 strict schema、descriptor/adapter 返回类型耦合、contract lock、真实 binder E2E。每个地基切片具备真实消费者夹具；每个 LLM 切片先冻结 dev/held-out/gold 与阈值、再改 prompt/schema，先 fake backend；任何确认复用 I11。每卡必须新增/更新 `scripts/smoke-iN.mjs` 与 `verify:iN`，并具备相关正向与负向验收；零写、dispose、有界投影、held-out、binder 等门只在该卡实际拥有对应写入、生命周期、投影、LLM 或 Remote surface 时强制，不得用人工演示替代。
>
> **v2.8 缺口核查结论**：B5 `version` 目前只是被序列化的实体字段，`OutlineRepository.save()` 不提供单调 revision、历史快照或生成锁；C5 branches、C2 snapshots、B2 supersede/version 与会话级 `StructuralPreviewPlan` 各自服务于正文、状态、世界观和 parser 重放，不能替代细纲生成基线。现有 candidate/reparse 默认写回边界固定为 C2→C1→C3→C4→B2，明确不含 B5；I45 灵感方向只有作者选择并经 I11 后才调整 B5/C6，也不是“根据定稿正文自动分析并调和未来细纲”。因此 I108、I112–I114 是新增能力，不得由既有字段改名、caller fallback 或扩张旧 parser writer 冒充。

> **v2.9 十二步流程核查结论**：I37–I38/I50–I53/I119–I120 已覆盖来源导入与大纲候选，I61–I63/I70/I105 已覆盖正文候选、编辑、版本与细纲绑定，I18/I121 已覆盖有效上下文和 POV 知情过滤；但当前需求/设计没有完整覆盖“按幕/章/全书生成细纲”“候选先成为可编辑草稿”“最终正文只确认一次”“全部细纲完成后的全书发布门”“带目录的单一全文”和“默认作者流程入口”。同时 `src/client/nav.ts` 把十九项写作、数据层、索引/统计、队列与设置能力作为同权入口，默认落在角色层；I39 `exportPlainText()` 输出逐章文件而非单一稿件；既有 candidate `accept` 在作者微调前即执行五层写回。I133–I140 专门补齐这些流程缺口并分层收纳过度暴露能力，既有高级能力和旧 invocation 保持兼容，不通过删除功能制造表面简化。

### I103：Remote 返回合同门与 Branch 基线修复（Stage 18 P0）

- **依赖**：I102；**canonical owner**：`host/remote/shared` 类型链、显式 Remote adapter、`contracts/`。
- **目标**：修复 `novelBranches.list` Domain 裸数组与 wire `{ branches }` 的已知漂移，并让 descriptor result 类型约束 adapter 返回值。
- **兼容/退役**：保留既有公开 `{ branches }` wire；Domain `listBranches()` 可继续返回数组，由唯一 Host adapter 包 envelope。删除 Client `.branches ?? []` 的契约漂移 fallback；不改其他服务语义。
- **交付物**：`MethodSpecFor.call` 结果类型耦合；Branch/Writing/Review/C5/Remote descriptor 基线锁；真实 DSH binder list 往返；非法返回结果负向夹具；Stage 18 verify 命令清单。
- **验收**：真实 Client 获得非空 branch 列表；数组直出/缺字段/多字段均 fail closed；旧 invocation descriptor 逐字段不变；消费者夹具证明 Domain→adapter→codec→Client 一致。
- **明确不做**：不增加 Stage 18 产品功能，不改 Branch Domain 真相或 C5 Schema。
- **验证**：`pnpm run verify:i103`；smoke 产物 `artifacts/i103-remote-result-contract.json`。

### I104：C5 章节/场景 mutation 与项目级排序（R18-1a）

- **依赖**：I103；**canonical owner**：`TextRepository`、`ChapterWriteQueue` 与 additive `novelText` mutation adapter。
- **目标**：新增章节/场景创建、元数据更新、硬删除和项目级 reorder 原语；ID 永久不变，“重命名”只修改 title/summary 等作者元数据；把非删除 CRUD/reorder 暴露为 strict additive Remote。
- **兼容/退役**：C5 chapter/scene Schema 不变；现有 create/append/replace/branch 和旧 read/edit/reparse invocation 不变。多章 reorder 必须一次预检、一次项目级串行提交，失败不得留下重复/断裂 index。
- **交付物**：严格 mutation input；chapter/scene metadata patch；批量 reorder；JSON 与 Markdown 镜像删除/重建语义；删除影响报告与 sourceHash/fingerprint；非删除 CRUD/reorder descriptors、adapter、locks 与真实 binder fixture。
- **验收**：CRUD/reorder 经真实 Remote 重开逐字段一致；重复 ID、越界 index、最后有效落点、未知 scene、非法结果、并发 stale 全拒绝；仓库故障注入后无半排序；真实 TextService→adapter→Client 消费者夹具。
- **明确不做**：本迭代不公开硬删除 Remote/UI；不建立绑定、候选或 queue 级联；非空硬删除只提供受控原语，I106 才经 I11 暴露。
- **验证**：`pnpm run verify:i104`；`artifacts/i104-c5-mutations.json`。

### I105：SceneOutlineBinding 与候选落点合同（R18-1b）

- **依赖**：I104；**canonical owner**：Host `SceneOutlineBindingRepository`；C5/B5 仍各自拥有正文/细纲真相。
- **目标**：以项目级 `scene-outline-bindings.yaml` 保存 sceneId↔detailBeatId 一对一关系，并让非 rewrite 候选显式接受 chapterId/sceneId 落点。
- **兼容/退役**：不改 C5/B5 Schema，不复用 `scene.beats`，不重写 scene ID；保留 `stableSceneId` 作为自动生成默认映射但不充当任意手工绑定真相；退役 candidate-production、queue task targeting 与相关 Client projection 中把业务落点固定为 `chapter-1` 的主路径，只允许历史 fixture/迁移兼容显式白名单。
- **交付物**：strict schema/repository、原子 save/read/rebind/unbind、referential preflight、binding 与 candidate-target additive Remote、真实 outline/text/writing/queue 消费者夹具、`chapter-1` 残留扫描。
- **验收**：重复、悬空、跨项目、同 card 多 scene、同 scene 多 card 拒绝；重启恢复；删除前可枚举绑定影响；手工与 queue 候选准确落到选择/派生 chapter+scene 且 stale/已占用 fail closed；生产路径零 `chapter-1` 业务硬编码。
- **明确不做**：不在 Client 展示管理表单；不自动改 B5 状态或 C6 进度。
- **验证**：`pnpm run verify:i105`；`artifacts/i105-scene-outline-binding.json`。

### I106：章节树管理、受控删除与空作品引导（R18-1c）

- **依赖**：I104、I105；**canonical owner**：现有 `TextRepository` project write lane + I11；Client chapters ops/state 只持交互状态并消费 I104/I105 Remote。
- **目标**：把已交付的 CRUD、排序、元数据、绑定和候选落点接入 GUI，并新增唯一的受控硬删除工作流。
- **兼容/退役**：复用 I104/I105 strict invocation，不复制 Remote。硬删除先返回含正文、branches、binding、活动 queue/candidate 与可定位历史引用的有界 impact 并经 I11；source/branch/binding fingerprint 变化使旧 proposal stale。活动 queue/candidate 必须先取消/裁决。apply 在现有本地 project write lane 内最终复验，以 proposalId 幂等地先清理 binding、再删除 C5；同一请求成功前完成两项，不建立后台叙事层补写。既有历史记录不修改，读取时依据目标存在性显示 stale；Markdown 镜像复用 I104 outbox。
- **交付物**：Client 章节树与场景表单/排序；绑定/落点选择；简化的 deletion impact/propose/apply/reject Remote；无章节/无场景引导态；同一 proposal 重试夹具。
- **验收**：GUI 经真实 binder 完成 CRUD/排序/绑定/落点；未确认、拒绝、stale fingerprint、活动 queue/candidate 均零写；确认后 binding 清理与 C5 删除在返回成功前完成；重复 apply 返回 already-deleted 且不重复副作用；binding 已清而 C5 尚在时重试可继续；既有历史记录保留并可投影 stale；跨项目/非法表单拒绝；DOM 锚点和 dispose 绿。
- **明确不做**：不做持久 deletion saga/journal/audit、reservation、全局 recovery barrier、特殊 open/recovery 路径、垃圾箱/恢复、富文本、ID 重命名或非空项目导入。
- **验证**：`pnpm run verify:i106`；`artifacts/i106-chapter-management-e2e.json`。

### I107：章节区四种互斥操作模式（R18-9）

- **依赖**：I106；**canonical owner**：`ChaptersLayerState.mode`。
- **目标**：建立 writing/candidate/versions/materials 四模式容器，为后续预览、润色、链接和聚合版本 UI 提供稳定落点。
- **兼容/退役**：不新增顶层 `WorkbenchViewId`；移动既有 panel 而非复制。旧垂直并排主路径 delete-first 退役，既有 `data-novel-*` 锚点保持。
- **交付物**：mode state/actions、互斥渲染、徽标、键盘/焦点/窄屏行为、切场景 candidate target 清理或绑定。
- **验收**：任一时刻只有一模式；隐藏 panel 零请求/零重复注册；未保存编辑不丢失；切 scene/refresh 行为确定；候选裁决后徽标清除；Client harness 消费者夹具。
- **明确不做**：不改 Host、候选、Branch 或导航合同，不新增功能面板内容。
- **验证**：`pnpm run verify:i107`；`artifacts/i107-chapter-modes.json`。

### I108：细纲生成版本化基线（R18-11a）

- **依赖**：I105、I106；**canonical owner**：Host `OutlineGenerationBaselineRepository`；当前 B5 仍只由 `OutlineRepository` 拥有。
- **目标**：为每次按细纲卡生成建立不可变 `OutlineGenerationBaseline`，冻结 projectId/chapterId/sceneId/detailBeatId、B5 contentFingerprint、binding fingerprint、场景卡内容、基线 revision 与 authoring base；候选、作者编辑和下一场景均以 baselineId 明确关联同一生成意图。
- **兼容/退役**：不改变 B5/C5 Schema、既有 `outline.version`、C5 branches 或 C2 snapshots；baseline 是持久的操作证据而非第 14 层、B5 历史编辑器或第二份当前细纲真相。为支持重启后比较，它只保留受大小上限约束的 authoring-base 文本证据与 hash，当前正文仍唯一来自 C5。B5、binding、目标正文 sourceHash 任一变化只使旧 baseline stale，不锁死作者编辑，也不自动覆盖 B5。baseline aggregate 由不可变 create/attach-generated/finalize/supersede 事件投影，已记录事件不得原位改写。
- **交付物**：strict baseline/event schema、项目级 repository 与 revision、create/read/current/attach-generated additive Remote、fingerprint/freshness、大小与保留上限、真实 SceneOutlineBinding→baseline→fake candidate 消费者夹具、contract lock/binder E2E。
- **验收**：重启后同一 baseline 可恢复；重复 create/attach 幂等；跨项目、未绑定/悬空 detailBeat、重复当前 baseline、旧 B5/binding/sourceHash、非法结果均 fail closed；冻结场景卡与创建时 B5 逐字段一致；删除目标后只投影 stale；baseline 不进入 B5/C5、Markdown/txt 或 11 层可移植内容。
- **明确不做**：不分析正文变化、不生成细纲调整、不提供全书大纲版本树、不阻止作者编辑 B5。
- **验证**：`pnpm run verify:i108`；`artifacts/i108-outline-generation-baseline.json`。

### I109：StructuralPreviewPlan 与五层纯 diff（R18-2a）

- **依赖**：I103、I108；**canonical owner**：writing-adjudication `StructuralPreviewPlan` 会话运行态。
- **目标**：冻结 C2→C1→C3→C4→B2 parser outputs、sourceHash、适用时的 I108 generationBaselineId 与各层基线，并生成有界结构化 change set。
- **兼容/退役**：不持久化 plan，不成为叙事层；重启/候选恢复后必须重新 prepare。按细纲卡生成必须绑定有效 baseline；历史未绑定正文的 rewrite/reparse 可显式使用 `no-outline-baseline`，但不得进入 I112/I113。既有五层 parser/writer/UoW 仍是唯一执行 owner，不复制解析器。
- **交付物**：strict plan/change schema；add/update/remove 与数组顺序语义；大小/条目上限；基线指纹；纯 diff 与 freshness 校验。
- **验收**：同输入同 diff；层外字段、重复实体、超限、任一基线变化拒绝；投影无正文全集/live object；真实 landing-saga 消费者夹具证明冻结输出可写回。
- **明确不做**：不接 candidate/reparse Remote 或 Client；不改 prompt/schema。
- **验证**：`pnpm run verify:i109`，并运行既有五层 parser held-out；`artifacts/i109-structural-preview-plan.json`。

### I110：Writing candidate 五层预览接线（R18-2b）

- **依赖**：I109；**canonical owner**：candidate-production/validation-projection/landing-saga。
- **目标**：prepare candidate plan、additive 返回五层 preview，并让 accept 重放同一 plan。
- **兼容/退役**：保留既有 `novelWriting.preview` 结果；通过 additive invocation 暴露 layer preview，旧 Client 不受影响。accept 禁止重新调用 LLM parser。
- **交付物**：candidate→plan 生命周期、strict Remote、Client candidate 模式预览、接受后实际 delta 回读比较。
- **验收**：`preview delta == committed delta`；reject/cancel/stale/parser error/hard violation 零写；重复 accept 幂等；真实 binder 与 Client 消费者夹具。
- **明确不做**：不接 localized reparse，不持久化 plan。
- **验证**：`pnpm run verify:i110`；既有 parser held-out；`artifacts/i110-candidate-layer-preview.json`。

### I111：Reparse 五层预览与接受后回扫（R18-2c）

- **依赖**：I109、I110；**canonical owner**：controlled text-edit/reparse workflow。
- **目标**：把范围编辑后的五层 plan 展示于 candidate 模式，并在 I11 accept 后重放、写 C5、回扫比较。
- **兼容/退役**：既有 reparse propose/accept/reject 保留；新增 prepare/read preview seam。Gate 仍是唯一用户确认，plan 不是第二 proposal。
- **交付物**：reparse preview Remote、Client 展示、source/range/layer freshness、post-commit scan outcome。
- **验收**：成功路径在 Gate 前展示冻结 preview，accept 后重放同一 plan 且 `preview delta == committed delta`；非法 UTF-16 range、baseHash 错配、Gate pending/rejected、parser/写回失败均零写；五层+C5 UoW 补偿成立；post-scan mismatch 显式 error 不伪报成功。
- **明确不做**：不改变普通逐字保存“只写 C5”语义。
- **验证**：`pnpm run verify:i111`；既有 parser held-out；`artifacts/i111-reparse-layer-preview.json`。

### I112：正文变更分类与下游影响分析（R18-11b）

- **依赖**：I108、I110、I111；**canonical owner**：Host `TextChangeImpactAnalyzer`；C5/B5 repositories 仍分别拥有正文与当前细纲。
- **目标**：以 baseline 的 authoring base、作者最终保存正文及当前 B5 有界窗口建立 `TextChangeImpactReport`，先确定性识别纯空白/格式变化，再由 LLM 将实质变化分类为 `wording-only`、`story-fact` 或 `plot-direction`，输出正文证据锚点、置信度及可能受影响的未来 detailBeatId。
- **兼容/退役**：普通正文保存继续只写 C5；分析为显式 finalize/inspect 命令且零写。仅 `story-fact`/`plot-direction` 可进入 I113；`wording-only` 与纯格式变化必须给出“无需调整细纲”。不得复用五层 parser 输出冒充 B5 影响，不得把自由模型文本直接作为写命令。
- **交付物**：先冻结不少于 12 个 dev/held-out/gold（含纯润色、事实变化、方向变化、混合变化、否定/撤回、长文本预算）与 ≥80% 阈值；strict report/evidence schema；确定性 delta/未来卡窗口；fake backend；prompt/parser；prepare/read/cancel additive Remote；真实 baseline+C5+B5 消费者夹具。
- **验收**：整体与 held-out ≥80%，纯格式 canonical 100% 不触发语义调整；证据 quote/range/sourceHash 准确；只允许当前绑定卡之后且 status=planned 的卡进入 affected 集；模型非法输出、证据越界、已完成/当前卡、未知 ID、超限、取消、stale baseline/B5/source 均零写并 fail closed；同输入同排序。
- **明确不做**：不生成 replacement、不修改 B5/C6、不自动调用 I11。
- **验证**：`pnpm run verify:i112`；`artifacts/i112-text-change-impact.json`。

### I113：后续细纲调和候选与逐卡预览（R18-11c）

- **依赖**：I112；**canonical owner**：Host `OutlineReconciliationPlanner`；候选只引用 I112 report 与当前 B5 freshness。
- **目标**：针对受影响的未来细纲卡生成有界 `OutlineReconciliationPlan`，逐卡给出保持原样、AI replacement、作者手动 replacement 或暂缓处理四种可裁决路径，并展示 before/after 与正文证据。
- **兼容/退役**：先候选后写回；AI 只能建议修改未来 `detailBeat` 的 title/summary/pov/wordTarget/points，必须保留 detailBeatId、所属幕/节、数组顺序与 `planned` 状态。keep 不写该卡；manual 必须提交按 canonical schema 校验的 editedValue；pending 不修改 B5，只在 I114 映射为 C6 deviation。禁止删除/新增/重排卡片、修改当前或已完成卡、静默连带改角色/世界观/正史。
- **交付物**：先冻结不少于 12 个 dev/held-out/gold 与整体/逐分类 ≥80% 阈值；strict plan/item schema、影响范围上限、fake backend、prompt/parser、regenerate-one/read/cancel additive Remote、B5 纯 diff、真实 I112 report→planner→OutlineService dry-run 消费者夹具。
- **验收**：建议与正文证据/原细纲相符且阈值达标；逐卡 before/after diff 可重现；混合 keep/AI/manual/pending 可表达；重复/未知/非未来 ID、ID/order/status 篡改、越界引用、模型失败、取消、B5 baseline stale 均零写；重生成单卡不得改变其他 plan item。
- **明确不做**：不应用 B5、不更新当前卡进度、不建立后台自动调纲器。
- **验证**：`pnpm run verify:i113`；`artifacts/i113-outline-reconciliation-plan.json`。

### I114：确认式细纲调和与“定稿并继续”闭环（R18-11d）

- **依赖**：I107、I108、I113；**canonical owner**：Host `OutlineReconciliationService` + I11 + 既有 B5/C6 UoW；Client 使用 chapters materials 模式。
- **目标**：在正文定稿后展示影响分类和逐卡调和选择，经唯一 ConfirmationGate 原子应用获授权的未来细纲修改；提供显式“定稿并继续”，幂等完成当前 scene 绑定的 detailBeat/C6 进度并创建下一场景的新 generation baseline。
- **兼容/退役**：普通“保存正文”永远只写 C5；candidate accept/reparse accept 不自动完成细纲卡。只有用户触发 finalize，且 report 为 wording-only 或所有受影响卡均已选择 keep/AI/manual/pending，才可提交。apply 最终复验 C5 sourceHash、B5 fingerprint、binding 与 plan fingerprint；同一 Host 请求中保存一份新 B5、保存 C6 deviation/progress、finalize baseline，并在下一 detailBeat 已有或可确定性派生合法 target 时创建下一 baseline；无法解析目标则返回 `needs-target`，不创建幽灵章节/场景。失败由既有 UoW 补偿，禁止 post-commit 后台补写。pending 在 C6 记录偏差，若它对应下一目标则阻止生成直至 keep/adjust/manual 解决。
- **交付物**：strict propose/accept/reject/finalize/continue Remote 与 contract locks；Gate payload；B5/C6/baseline UoW；materials 模式影响摘要、证据跳转、逐卡四态裁决、manual 编辑和下一场景入口；真实 binder/Client E2E。
- **验收**：未确认、拒绝、缺少逐卡裁决、stale source/B5/binding/plan、跨项目、当前/已完成卡修改、写盘故障均零写或完整补偿；accepted 只修改获授权的未来卡且 stable ID/order 不变；重复 accept/finalize 返回同一结果；wording-only 除当前卡完成标记外零 B5 语义 diff；当前卡只在显式 finalize 后 `writing→done`，仅当所属 beat 的必需 detailBeats 全部 done 时才向 C6 completedBeats 单调追加并推进 currentBeat；下一 baseline 精确冻结调和后的目标卡且下一次生成不消费旧 baseline，`needs-target` 不产生任何虚构 target。
- **明确不做**：不自动接受正文、不无人值守改大纲、不调整幕/节结构、不建立全书 revision timeline。
- **验证**：`pnpm run verify:i114`；`artifacts/i114-outline-reconciliation-e2e.json`。

### I115：跨层引用维护矩阵与确定性 coordinator（R18-5a）

- **依赖**：I111；**canonical owner**：`CrossLayerReferenceCoordinator`，底层 B3/C1/C3/B5/timeline repositories 不变。
- **目标**：逐字段冻结“可确定性派生 / 作者语义候选 / 禁止自动修改”矩阵，并让 coordinator 在 candidate/reparse 已获授权后、landing UoW commit 前参与同一受控事务；禁止 post-commit 第二写入器。
- **兼容/退役**：C3 只增不退；关系“线性”定义为单一实体版本链而非 affinity/trust 单调数值。禁止后台扫描正文后静默 LLM 写层。
- **交付物**：维护矩阵、strict change set、base version/hash、幂等 apply、跨 repository UoW/补偿、真实 owner 消费者夹具。
- **验收**：重复事件幂等；未知/跨项目 ID、知情撤销、并行版本、部分失败拒绝或补偿；未接受 candidate/reparse 不触发；同一 accepted outcome 只应用一次。
- **明确不做**：不做审查 UI、audit journal 或 LLM 修正。
- **验证**：`pnpm run verify:i115`；`artifacts/i115-reference-matrix.json`。

### I116：引用 operational audit/outbox 与审查投影（R18-5b）

- **依赖**：I115；**canonical owner**：独立 Host operational journal/outbox；叙事层仍由原 repositories 拥有。
- **目标**：记录每次自动引用更新的来源、目标、before/after、状态、失败与重试，并提供按层有界审查投影。
- **兼容/退役**：journal 是机制数据，可轮转/重建部分投影，不进入 13 层、Markdown 或可移植正文；不得被下游当作引用真相。
- **交付物**：strict journal schema/repository、原子 append、pending/applied/failed 状态、重启恢复、additive audit Remote。
- **验收**：成功/失败/重试不丢记录且不重复 apply；corrupt fail closed；有界分页/排序；Client 只得最小 owned JSON；Fiber dispose 后零任务。
- **明确不做**：不提供错误标记 UI或 LLM 修正。
- **验证**：`pnpm run verify:i116`；`artifacts/i116-reference-audit.json`。

### I117：自动更新审查 UI 与手填 ID 主路径退役（R18-5c）

- **依赖**：I116、I107；**canonical owner**：Client reference-review state/ops；Host audit 只读面。
- **目标**：按层查看自动更新、筛选/标记错误，并用名称/实体选择器取代时间线、大纲、关系面板的手填 ID。
- **兼容/退役**：新选择器消费者验证后 delete-first 删除旧 `listField` ID 主路径，不保留 hidden fallback；既有持久值保留并按 canonical ID 展示。
- **交付物**：审查面板、错误标记命令、名称选择器、旧入口扫描与 DOM/可访问性测试。
- **验收**：真实 audit→Client E2E；未知/已删除实体安全显示；旧手填入口与其写操作零引用；错误标记不直接改任何叙事层。
- **明确不做**：不调用 LLM、不执行修正写回。
- **验证**：`pnpm run verify:i117`；`artifacts/i117-reference-review-ui.json`。

### I118：LLM 引用修正候选与 I11 写回（R18-5d）

- **依赖**：I115–I117；**canonical owner**：reference correction workflow + I11。
- **目标**：把作者标记的错误与指令转换为 strict 多层修正候选，预览后经 Gate 应用。
- **兼容/退役**：不直接复用自由对话文本为写命令；LLM 只产候选，coordinator 仍是确定性 apply owner；不降低 C3 单调和实体引用校验。
- **交付物**：先提交 dev/held-out/gold（整体准确率≥80%）与 fake backend；prompt/schema；candidate preview；Gate apply/reject；audit lineage。
- **验收**：非法输出、模型失败/取消、stale base、未知 ID、知情回退、Gate pending/reject 均零写；accepted 幂等并进入 audit；真实模型 held-out 达标。
- **明确不做**：不建立后台自动修正或第二确认机制。
- **验证**：`pnpm run verify:i118`；`artifacts/i118-reference-correction.json`。

### I119：长稿→大纲 outline-only 候选与样本门（R18-6a）

- **依赖**：I103；**canonical owner**：`LongDraftWorkflowCoordinator` 复用 split-agent/outline parser。
- **目标**：仅从新建/空作品入口为长稿建立 outline-only strict 输出，不静默丢弃既有 split 的 worldview/detail-beat 结果。
- **兼容/退役**：新增专用 prompt/schema，不修改 I38 既有 split 合同；分析开始前由 Host readiness preflight 证明目标项目为空，非空项目在调用 LLM 前拒绝；输入只允许 Host 受控文本，大小/分块有上限。
- **交付物**：先冻结 dev/held-out/gold（≥80%）和 fake backend；empty-project preflight；outline candidate、sourceHash/provenance、取消/错误状态、additive Remote。
- **验收**：非空项目在 LLM 前拒绝且零调用/零写；长文分块顺序稳定；非法/超限/取消/模型错误零写；同输入候选绑定一致；真实模型 held-out 达标且不生成未授权 B2/C3 内容。
- **明确不做**：不写项目、不允许非空项目 apply、不实现逐章循环。
- **验证**：`pnpm run verify:i119`；`artifacts/i119-long-draft-outline-samples.json`。

### I120：空作品拆纲应用、恢复与幂等（R18-6b）

- **依赖**：I119、I105；**canonical owner**：LongDraftWorkflowCoordinator + I11 + OutlineService。
- **目标**：仅对新建/空作品提供预览→确认→原子应用，并保存最小 workflow checkpoint 供取消/恢复。
- **兼容/退役**：N-7 保持：任一非空结构层/C5 内容立即 blocked；不增加合并、备份迁移或逐项覆盖 fallback。
- **交付物**：readiness preflight、Gate payload、原子 apply/rollback、checkpoint 状态机、Client 引导。
- **验收**：非空项目、sourceHash 变化、未确认/拒绝/取消、重复 apply、写盘故障均无半初始化；成功只写 B5 所需内容并可重开。
- **明确不做**：不覆盖已有大纲，不导入原稿为 C5，不支持 ST。
- **验证**：`pnpm run verify:i120`；`artifacts/i120-long-draft-apply.json`。

### I121：通用逐章循环与作者修订正文上下文（R18-6c）

- **依赖**：I106、I114、I120；**canonical owner**：`NextSceneContextProvider` 与 Client workflow state。
- **目标**：让所有项目按“当前有效细纲基线→首版→作者保存/调和→下一章”循环，并证明下一章只消费作者已保存的当前正文与 I114 产生的当前有效 baseline。
- **兼容/退役**：修复 `listChapters()`/context 的叙事排序依赖，统一 chapter.index→scene.index；删除文件名顺序、stale baseline 和 caller 自建 history fallback。
- **交付物**：有界上一章/最近场景选择规则、sourceHash/trace、真实 context-builder→fake writer 消费者夹具、工作流 UI 状态。
- **验收**：作者修改并保存后下一次 prompt 逐字包含新正文且不含旧草稿；下一次只消费当前有效 baseline，旧 baseline/B5 fingerprint 变化 fail closed；跨章顺序、空章、分支 chosen、预算裁剪、取消/切项目均确定；现有 continue/queue/agent 共用同 owner。
- **明确不做**：不做“继续写作首页”或后台自动接受。
- **验证**：`pnpm run verify:i121`；`artifacts/i121-revised-context.json`。

### I122：章节润色逐场景编排（R18-4a）

- **依赖**：I106、I109、I121；**canonical owner**：既有 writing-adjudication 单场景 candidate；Client 只持当前会话的 scene 游标和展示状态。
- **目标**：按 scene.index 逐个为当前章节创建独立 rewrite candidate，提供最小章节级操作入口。
- **兼容/退役**：不扩 writing intent enum；使用 `rewrite + polishMode`，每 scene 独立 sourceHash。章节级进度不持久化，刷新/重启后不恢复；已接受正文由既有 C5/branch 真相保留。单场景接受继续经现有 validation→preview→landing，在同一 Host 请求内实时、幂等完成获授权的多层写回。
- **交付物**：纯函数 scene.index 顺序选择；会话级 currentSceneId/completedCount/error；启动下一场景、停止与重新开始动作；真实 existing candidate 消费者夹具；Fiber dispose 清理会话状态。
- **验收**：每次至多创建一个场景候选；单 scene stale/失败不修改其他 scene；重复裁决不重复写；刷新后无批次恢复承诺但已接受正文保持；空章/跨项目拒绝；停止后不继续发起 LLM。
- **明确不做**：不定义三种 prompt、不做全书批量或自动 accept。
- **验证**：`pnpm run verify:i122`；`artifacts/i122-polish-scene-flow.json`。

### I123：三种润色样本、prompt、UI 与裁决（R18-4b）

- **依赖**：I122、I107；**canonical owner**：共享 rewrite pipeline + Client 会话级逐场景编排。
- **目标**：交付语言润色、压缩精简、扩写细节三个参数化模式及逐场景章节 UI。
- **兼容/退役**：三模式共用一个 schema/service，不建三套 prompt owner；accepted scene 仍经现有 validation→preview→landing。
- **交付物**：先冻结每模式 dev/held-out/gold（整体及每模式≥80%）与 fake backend；prompt preset；Client 启动/当前场景/逐场景审阅/停止/重新开始。
- **验收**：三模式意图区分达标；非法输出、取消、模型失败、hard violation、reject 零写；当前会话进度可见；accepted 逐场景版本与正文一致且多层写回实时幂等。
- **明确不做**：不新增整章自由文本拆分或全书润色。
- **验证**：`pnpm run verify:i123`；`artifacts/i123-polish-heldout.json`。

### I124：EntityLink/TextAnchor 与 Client router/back-stack（R18-8a）

- **依赖**：I103、I107；**canonical owner**：core link contract、Host resolver、Client navigation stack。
- **目标**：建立统一 entity/text target、来源上下文快照、打开/返回协议。
- **兼容/退役**：复用现有 SearchNavigation 可用字段但不让 Search 成为全局 owner；Client 单向 `jumpTo` 迁入 router 后删除重复分支，不保留 caller fallback。
- **交付物**：strict EntityLink、UTF-16 TextAnchor、sourceHash、route result/error；back entry 保存 view/mode/selection/filter/focus；Host target existence resolver。
- **验收**：非法 kind/range/跨项目/未知实体/stale 安全失败；forward/back 状态逐字段恢复；dirty editor 不被静默覆盖；真实 search→router 消费者夹具。
- **明确不做**：不建来源适配全集、不持久化链接、不改正文。
- **验证**：`pnpm run verify:i124`；`artifacts/i124-link-router.json`。

### I125：七类链接来源与目标适配（R18-8b）

- **依赖**：I124、I117；**canonical owner**：各 panel 的薄 link adapter，router 仍唯一导航 owner。
- **目标**：接入角色、关系、知情、审校、时间线、搜索、场景卡的 source→target 与反向返回。
- **兼容/退役**：adapter 只构造 EntityLink，不查询/复制领域真相；旧 search/review 直接切 activeView 路径在等价验证后退役。
- **交付物**：七类入口、目标选中/高亮、返回控件、模式协同、可访问性与 DOM 锚点。
- **验收**：每类至少一条真实 Host projection→Client target E2E；失效实体/过滤变化/切项目安全降级；返回不丢选择、筛选、scroll/focus。
- **明确不做**：不做文本重链或导出验证。
- **验证**：`pnpm run verify:i125`；`artifacts/i125-link-adapters.json`。

### I126：文本锚点 stale/relink 与回传重建（R18-8c）

- **依赖**：I124、I125；**canonical owner**：Host derived link index/resolver。
- **目标**：正文 sourceHash 变化后拒绝旧 range，并基于纯正文重新分析、生成新锚点。
- **兼容/退役**：索引位于可删除重建的派生目录，不进入 C5/Markdown/archive；不猜测偏移，不保留 stale range fallback。
- **交付物**：versioned derived index、build/drop/rebuild、quote disambiguation、编辑/回传 invalidation、重链状态与失败降级。
- **验收**：相同正文重建确定；重复 quote 不误链；编辑后旧锚点 stale；回传重建前后正文逐字一致；corrupt/drop 后可重建且不泄漏 POV 禁止信息。
- **明确不做**：默认使用确定性分析；若未来引入 LLM 必须另立样本迭代。
- **验证**：`pnpm run verify:i126`；`artifacts/i126-link-rebuild.json`。

### I127：链接导出与 round-trip 零污染（R18-8d）

- **依赖**：I126；**canonical owner**：现有 ImportExport/ExportService。
- **目标**：证明 Markdown、txt、可移植归档和恢复均不携带内部 link/index 数据，外部回传只运输纯正文。
- **兼容/退役**：既有导出字节合同保持；不新增 sidecar、HTML link 或 archive compatibility carrier。
- **交付物**：导出排除规则、Markdown/txt byte fixture、archive 路径扫描、round-trip→rebuild E2E。
- **验收**：编辑前后相同正文导出逐字一致；txt/Markdown/archive 零内部 ID/anchor/index；恢复后 link index 不存在但可重建；恶意内嵌 link metadata 被当普通正文或按输入规则拒绝而不执行。
- **明确不做**：不改变 portable archive 的叙事层内容。
- **验证**：`pnpm run verify:i127`；`artifacts/i127-link-export-safety.json`。

### I128：Review 文本锚点与修复候选工作流（R18-3a）

- **依赖**：I110、I124–I126；**canonical owner**：ReviewRepairWorkflow；定位归 EntityLink/TextAnchor，候选归 writing-adjudication。
- **目标**：从 review issue 精确打开文本范围，并用 issue evidence 生成 rewrite candidate。
- **兼容/退役**：review issue additive location/provenance，不改旧 scan/adjudicate/records 结果；旧只有 chapter/scene 的 issue 仍可降级为场景级定位，但不伪造 range。
- **交付物**：先冻结 repair prompt dev/held-out/gold（≥80%）与 fake backend；稳定 issue fingerprint、anchor、candidate lineage、additive Remote、问题卡入口。
- **验收**：准确 range；stale hash/错 quote/重复 issue/跨项目/模型失败/取消零写；hard issue 可生成候选但仍不能被非法接受；真实 review→router→candidate E2E。
- **明确不做**：不持久化 resolved，不修改检测阈值或既有 gold。
- **验证**：`pnpm run verify:i128`；`artifacts/i128-review-repair.json`。

### I129：接受→复扫→会话级 resolved 闭环（R18-3b）

- **依赖**：I128、I111；**canonical owner**：Client review repair session state；Host scan 仍是真实当前问题投影。
- **目标**：候选接受后自动重扫；仅当同一 issue fingerprint 不再出现时，在当前会话保留 resolved 卡与证据。
- **兼容/退役**：不扩 ReviewAuditJournal resolved 状态、不落盘第二真相；完整重扫、重开 panel、切项目或重启后 resolved 卡消失。
- **交付物**：repair session state machine、scan correlation、resolved view、失败/retry/取消 UI。
- **验收**：问题仍存在不得 resolved；scan 失败显示不确定状态；重复 accept/scan 幂等；hard conflict、stale candidate、reject 零写；会话清理/dispose 绿。
- **明确不做**：不提供跨会话解决历史。
- **验证**：`pnpm run verify:i129`；`artifacts/i129-review-resolved-session.json`。

### I130：章节→场景→版本 Host 聚合投影（R18-10a）

- **依赖**：I103、I104；**canonical owner**：NovelBranchService 只读聚合，TextRepository/scene.branches 仍是真相。
- **目标**：新增一次性有界 aggregate(projectId) Remote，按 chapter.index→scene.index 输出版本元数据树。
- **兼容/退役**：additive `novelBranches.aggregate`；修复后的 list/read/save/choose/diff 不变。Client 禁止用 chapterList+N×list 自建第二聚合 owner。
- **交付物**：strict tree schema/descriptor/lock/adapter、分页/规模预算、空树与隐含单版本语义、真实 repository/binder 消费者夹具。
- **验收**：无正文泄漏；`branches.length===0 || chosenCount===1`；坏/重复/chosen 多个 fail closed；跨项目/未知 project 拒绝；排序稳定且大作品有界。
- **明确不做**：不切换版本、不改 C5 Schema、不做全书快照。
- **验证**：`pnpm run verify:i130`；`artifacts/i130-branch-aggregate.json`。

### I131：聚合版本树比较与 freshness 切换（R18-10b）

- **依赖**：I107、I130；**canonical owner**：Client versions mode；写入仍调用 BranchService choose。
- **目标**：在 versions 模式展示树、按需 diff，并显式切换任意场景版本。
- **兼容/退役**：不新增 ConfirmationGate；用户先选择/查看 diff，再调用新 strict additive `chooseFresh(projectId, chapterId, sceneId, branchId, sourceHash)`。既有四参数 `choose` descriptor/行为逐字段不变；`chooseFresh` 陈旧时拒绝。旧局部分支面板保留为场景级消费者，不复制真相。
- **交付物**：`chooseFresh` schema/descriptor/adapter/contract lock；树展开/选择、按需 branch read/diff、switch/reload、徽标、返回场景与焦点、N+1 请求扫描。
- **验收**：空/单/多版本 UI；未知 branch、stale source、跨项目、并发切换拒绝；成功后 chosen 唯一且 editor 重载；聚合视图与局部面板等价；隐藏模式零轮询。
- **明确不做**：不做全书 revision timeline、批量切换或隐式保存。
- **验证**：`pnpm run verify:i131`；`artifacts/i131-branch-tree-client.json`。

### I132：既有 Stage 18 面板作者术语与错误展示层（R18-7）

- **依赖**：I106–I131；**canonical owner**：Client presentation lexicon/error presenter。
- **目标**：统一移除截至 I131 已存在面板中的作者可见工程术语，并把动态错误映射为可行动作者语言；I139 新增的最终流程壳由 I140 再做全量终检。
- **兼容/退役**：不改 Host/Remote/wire/schema/存储、`novel_*`、参数名、测试 fixture 或 `data-novel-*`；直接展示 `cause.message` 的作者主路径在 mapper 覆盖后退役，原始技术信息仅高级视图可见。
- **交付物**：唯一术语表、denylist/allowlist 扫描、`toUserMessage`/错误码映射、advanced view、aria/title/error/empty/loading/success 文案。
- **验收**：截至 I131 的全部作者可见面板机器扫描零禁词；五类动态错误和七类 Stage 18 面板 fixture；技术合同 allowlist 零误改；DOM 锚点快照、可访问性与下一步动作断言全绿。
- **明确不做**：不建 i18n、多语言框架或改变导航结构。
- **验证**：`pnpm run verify:i132`；`artifacts/i132-author-lexicon.json`。

### I133：按幕/章/全书的细纲范围与就绪合同（R18-12a）

- **依赖**：I105、I106、I120；**canonical owner**：`OutlineGenerationScopePlanner` + B5 只读范围解析器。
- **目标**：建立 act/outline-beat/bound-chapter/all 四种作者选择到稳定 B5 目标集合的唯一 Host 合同，并在调用 LLM 前给出可生成、只补缺失、需显式重生成或不可生成的就绪结果。
- **兼容/退役**：B5 仍是唯一细纲真相；创作 C5 前以 B5 beat 表达章节规划范围，已有 chapter scope 只能经 SceneOutlineBinding 解析，不允许 Client 以索引、标题或手填 ID 猜测。既有 outline read/save invocation 不变；调用方自建范围和全量覆盖 fallback 禁止。
- **交付物**：strict `OutlineGenerationScope`/readiness/result schema；act/outline-beat/bound-chapter/all resolver；目标卡 fingerprint、保护集合与 mutation budget；additive Remote/descriptor/contract lock/真实 binder；大规模有界分页消费者夹具。
- **验收**：三类 scope 均能确定性解析且顺序稳定；未知幕、未绑定章节、空范围、跨项目绑定、stale B5 均在 LLM 前零写失败；默认 mutation budget 只允许新增缺失 detailBeat；范围外、已有稳定 ID 和顺序不可修改。
- **明确不做**：不调用 LLM、不生成文案、不创建第二份 outline、不提供 Client 编辑面。
- **验证**：`pnpm run verify:i133`；`artifacts/i133-outline-generation-scope.json`。

### I134：范围细纲候选、作者审阅与确认应用（R18-12b）

- **依赖**：I133；**canonical owner**：`OutlineDetailGenerationService` + outline 步骤候选面板。
- **目标**：让作者按 I133 冻结范围生成细纲候选，逐卡编辑、重生成、跳过或确认，并以一个 I11 proposal 只应用授权范围。
- **兼容/退役**：先建立不少于 12 条 dev/held-out 样本和 fake backend，再实现 prompt/schema；既有手工 outline 编辑继续可用。默认只补齐缺失卡；覆盖已有卡必须显式选择重生成并预览，禁止整份 outline replace。
- **交付物**：范围细纲样本/gold/held-out；strict LLM result parser；会话候选与 source fingerprint；逐卡 diff/编辑 UI；I11 apply；additive Remote 全套合同门。
- **验收**：held-out ≥80%；candidate 只含授权范围且结构/引用合法；接受前、拒绝、取消、解析失败、B5 stale 零写；混合 edit/regenerate/skip 可重放；apply 后范围外 byte/fingerprint 不变，重复确认幂等。
- **明确不做**：不生成正文、不自动建立生成基线、不改已完成细纲卡、不做后台批量生成。
- **验证**：`pnpm run verify:i134`；`artifacts/i134-scoped-detail-outline.json`。

### I135：候选接受为草稿与统一定稿计划（R18-13a）

- **依赖**：I110、I114、I118、I134；**canonical owner**：writing-adjudication draft seam + `FinalizationPlanBuilder`。
- **目标**：把“接受候选供作者微调”与“确认最终正文带来的叙事变化”拆开：前者仅受控落地 C5 草稿，后者从作者最终保存文本生成一份统一定稿计划。
- **兼容/退役**：既有 candidate `accept` invocation 与结果保持兼容，但主 UI 改用 additive `adoptDraft`；`adoptDraft` 不运行五层 parser、引用写回、B5 调和或 C6 推进。I109–I118/I114 的 diff 与 apply owner 被组合，不复制 parser、调和或引用规则。
- **交付物**：strict draft adoption/`FinalizationPlan` schema；candidate/baseline/sourceHash/freshness 锁；五层结构 diff、确定性引用、未来细纲选择和完成/下一步的统一投影；additive Remote/contract lock/真实 binder；作者汇总预览消费者夹具。
- **验收**：adopt 后只有目标 C5 chosen 正文及既有可重建镜像/索引/统计随保存变化，C1/C2/C3/C4/B2/B5/C6 均不变；作者再编辑后 plan 只消费最终保存正文；wording-only 不含 B5 mutation；plan 有界、可解释且一份覆盖全部待确认叙事真相变化；stale/无 baseline/未绑定均 fail closed 或显式降级，禁止伪造调和。
- **明确不做**：本迭代不应用 plan、不自动完成当前卡、不删除兼容 accept。
- **验证**：`pnpm run verify:i135`；`artifacts/i135-finalization-plan.json`。

### I136：一次确认式定稿、调和与自动前进（R18-13b）

- **依赖**：I135；**canonical owner**：`FinalizationCoordinator` + 既有 I11 ConfirmationGate/UoW。
- **目标**：用一个 proposal、一次作者裁决和一个 Host 请求应用 I135 全部授权变化，随后幂等完成当前细纲卡并建立下一张有效生成基线。
- **兼容/退役**：I114 的 standalone reconciliation 可继续独立使用；主流程通过其已授权内部 apply seam 组合，不产生嵌套 Gate。旧 candidate accept 不改，但从普通作者主路径退役；Client 不逐个调用各层 writer。
- **交付物**：统一 proposal payload/授权 token；Finalization UoW 与 operation ID；五层、引用、B5/C6、baseline 的有序 apply；单一汇总确认 UI；`needs-target`/stale/partial-failure 作者结果。
- **验收**：整个流程只出现一次确认；拒绝、取消、sourceHash/B5/层 freshness 变化与任一步失败均不伪装完成且可用同一 operation 幂等重试；成功后结构变化等于预览、当前卡完成、下一 baseline 唯一；无合法下一张返回 `needs-target`，不得创建幽灵章节/场景或自动接受下一份正文。
- **明确不做**：不后台定稿、不自动裁决作者语义、不跨多个细纲卡批量接受正文。
- **验证**：`pnpm run verify:i136`；`artifacts/i136-one-confirm-finalization.json`。

### I137：全书完成门与发布就绪一致性检查（R18-14a）

- **依赖**：I121、I128、I136；**canonical owner**：`BookCompletionService` + review detector 聚合器。
- **目标**：所有必需细纲卡完成后才建立全书发布就绪门，复用既有确定性/LLM 检测器对 chosen 正文做有界跨章一致性检查。
- **兼容/退役**：既有按当前范围的 review scan 保持不变；新增 additive book readiness/scan，不以 Client N+1 拼装。完成状态来自 B5/C6/binding/C5 与未决提案，不新增可手改的“全书完成”标志。
- **交付物**：completion/readiness schema；分页章节快照与全书 issue 聚合；未完成/缺正文/待裁决/硬阻断/警告分类；发布门 UI；Remote/contract lock/真实 binder；既有 detector held-out 累积回归。
- **验收**：未完成卡、缺 binding/正文、pending finalization/reconciliation、硬违规均关闭导出门；全书顺序与范围无遗漏/重复；软警告可显式留存裁决但不静默消失；重开后从真相重算一致；大项目内存/结果有界，扫描失败不修改正文或故事状态。
- **明确不做**：不自动改正文、不新增全书快照、不做全书一键润色。
- **验证**：`pnpm run verify:i137`；`artifacts/i137-book-readiness.json`。

### I138：带目录的单一 TXT/Markdown 全文编译（R18-14b）

- **依赖**：I127、I137；**canonical owner**：`ManuscriptCompiler` + `novelImportExport` adapter。
- **目标**：在 I137 发布门通过后，按真实章节/场景顺序编译一份完整 TXT 或 Markdown，并自动生成章节目录。
- **兼容/退役**：I39 现有 per-chapter 纯文本/项目归档导出保持兼容，新增 `compileManuscript` 主流程方法；原每章文件导出退到进阶/兼容入口，不冒充完整交稿。正文仍只来自 chosen C5，Client 不拼接文件。
- **交付物**：compile options/result canonical schema；确定性标题/目录/换行规则；TXT/Markdown renderer；发布门 receipt freshness；additive Remote/contract lock/真实 binder；下载 UI。
- **验收**：两种格式各恰好一个主稿；章节/场景顺序、标题与正文逐字正确，目录锚点/页内标题一致；旧分支、设定 sidecar、内部链接/ID/技术元数据零混入；stale receipt/阻断门拒绝；同一输入重复编译 byte-stable。
- **明确不做**：不实现 DOCX/PDF/EPUB，不做排版引擎或外部发布平台上传。
- **验证**：`pnpm run verify:i138`；`artifacts/i138-single-manuscript.json`。

### I139：作者优先的唯一创作流程壳与功能分层（R18-15a）

- **依赖**：I132、I134、I136–I138；**canonical owner**：Client `workflow` route/store/presenter + nav registry。
- **目标**：新增并默认进入“创作流程”，以导入、大纲、细纲、生成基线、正文、定稿同步、全书检查、导出八个阶段承载 README 12 步；重开作品恢复当前阶段与场景。
- **兼容/退役**：既有 WorkbenchViewId、Remote、DOM deep-link 和十九项能力不删除；角色/世界观/关系/状态/正史/知情/时间线进入“故事资料”，审校/版本/搜索/统计/队列/备份进入“进阶工具”，模型/创作设置进入“设置”。`characters` 默认落点和十九项同权一级导航退役；同一动作只保留一个主流程 owner。
- **交付物**：additive `workflow` view 与 `DEFAULT_VIEW` 迁移；阶段 readiness/next-action 投影；分层导航与返回上下文；主流程聚合现有 panel/action 的薄适配；窄屏、键盘、aria 与重开恢复测试。
- **验收**：新建/导入/写作中/待定稿/全书完成作品分别落到正确阶段；所有 12 步无需进入进阶工具即可完成；既有能力仍可达且 deep-link 不断；普通流程零 raw ID、fingerprint、索引 rebuild/drop、Gate/UoW、层编号和重复确认；隐藏进阶面板零请求。
- **明确不做**：不复制领域逻辑、不建立独立继续写作首页、不删除高级能力、不改变 DSH Slot shell。
- **验证**：`pnpm run verify:i139`；`artifacts/i139-primary-workflow-shell.json`。

### I140：README 十二步完整产品流程 E2E 与最终术语门（R18-7、R18-15b）

- **依赖**：I139；**canonical owner**：产品级验收 harness（test-only）+ 全量作者术语门。
- **目标**：用固定 fake LLM 和真实 Host/Remote/Client harness 从来源导入跑到单一全文导出，把 README 12 步作为最终产品完成定义，而非模块清单。
- **兼容/退役**：不改领域语义或公开合同；新增 `verify:product-flow` 作为 README 主流程验收入口。I132 的局部术语结论由本迭代全量扫描收口，失败即 Stage 18 未完成。
- **交付物**：成功主路径 E2E；拒绝/重写/手改、stale baseline/sourceHash、一次确认拒绝与失败回滚、重启恢复、POV 知情过滤、无下一目标、全书阻断和双格式合稿负向矩阵；全量 denylist/allowlist；`artifacts/i140-primary-author-workflow.json`。
- **验收**：12 步按顺序全部产生作者可观察证据；步骤 6 adopt 前后与步骤 8 单次确认的写边界精确；步骤 10 上下文只含有效四类输入；步骤 11 阻断门有效；步骤 12 两种单稿内容/目录正确；所有作者可见主流程和进阶入口零禁词，技术合同 allowlist 无误改；`pnpm test`/build/全部 Stage 18 held-out 累积全绿。
- **明确不做**：不以 mock UI 截图代替 Host 行为，不引入新功能，不降低样本阈值或修改 gold。
- **验证**：`pnpm run verify:i140`；`pnpm run verify:product-flow`；`artifacts/i140-primary-author-workflow.json`。

---

## 20. 阶段 19：来源确认与幕后素材 POV 叙事化（R19，I141–I149）

**阶段门**：`pnpm run verify:stage-19`。完成时必须串行证明 I141–I149、`pnpm test`/build、Stage 19 held-out、既有 I52/I119/parser held-out、真实 binder/contract-lock/Client DOM、NarrativeImportPlan 恢复矩阵与 README 十二步产品 E2E 全绿。

> 定位：Stage 19 以《灰烬圣典》的真实失败模式为输入，只修复来源语义、幕后素材 POV 叙事化与 C3/C4 泄密边界。`existing-prose` 可以被识别并继续走既有拆纲，但 `preserve-prose` 与 C5 写入明确留给当前已后置的 F2。所有 LLM 卡先冻结 dev/held-out/gold（≥80%）并以 fake backend 跑通；非空作品在 LLM/写入前 fail closed；每卡新增 `scripts/smoke-iN.mjs`、`verify:iN` 与 `artifacts/iN-*.json`。

### I141：来源角色、当前目标处理与叙事意图纯合同（R19-1a）

- **依赖**：I140；**canonical owner**：`core/schema/import-interpretation`。
- **目标**：建立 sourceRole、`expand-outline|adapt-pov`、narrativeIntent、ImportSourceBinding、合法组合纯校验器与稳定 fingerprint。
- **兼容/退役**：I52/I119/I120 合同逐字段不变；`preserve-prose` 尚不进入公开 enum；limited 必须主角，omniscient 可不指定单一主角。I141 不发布 Remote、不持久化 session。
- **交付物**：strict schema、组合矩阵、canonical serialization/fingerprint、Client 派生类型和纯消费者夹具。
- **验收**：合法 round-trip；unknown 字段、非法组合、limited 缺主角、无稳定候选 ID 的未知主角失败；同输入 byte-stable；旧 contract lock 零变化。
- **明确不做**：不调用 LLM、不建服务/Remote/UI/checkpoint、不写作品层。
- **验证**：`pnpm run verify:i141`；`artifacts/i141-import-intent-contract.json`。

### I142：导入意图 session owner 与 additive Remote（R19-1b）

- **依赖**：I141；**canonical owner**：`ImportInterpretationSessionService` + Remote adapter。
- **目标**：把 projectId/importSessionId/sourceHash、作者确认意图与段落裁决摘要绑定为可恢复 operational checkpoint，并提供 manual create/read/confirm/discard Remote。
- **兼容/退役**：session 不是第 14 层或可移植作品内容；Client 不补默认值。新增方法具 canonical schema、descriptor/result lock、返回类型耦合、真实 binder 与非法结果负测。
- **交付物**：session/checkpoint store、additive Remote、跨项目/sourceHash freshness、dispose 与 binder fixture。
- **验收**：重开恢复；换文件使旧 session stale；跨项目、伪造 hash、非法结果 fail closed；dispose 后零资源；旧 Remote lock 不变。
- **明确不做**：不自动分类、不渲染 UI、不建 NarrativeImportPlan。
- **验证**：`pnpm run verify:i142`；`artifacts/i142-import-session-contract.json`。

### I143：段落来源解释分类器与样本门（R19-2a）

- **依赖**：I142；**canonical owner**：`llm/analyze/import-interpretation` + `ImportInterpretationService`。
- **目标**：对 Host 生成的稳定 paragraph ID 分类 world-truth/plot-plan/prose/author-instruction/presentation-note，并给出整体 sourceRole 建议、置信度与证据。
- **兼容/退役**：模型不输出 treatment、POV、字符 offset 或写命令；Host 从 paragraph ID 投影范围。不修改 I52/I119 prompt/schema。
- **交付物**：先提交 `samples/i143` dev/held-out/gold；fake backend；prompt/schema/parser；paragraph coverage guard；begin/status/cancel/result Remote；dispose 测试。
- **验收**：整体与段落分类准确率分别 ≥80%；paragraph ID 完整、有序且唯一；“玩家可见/若提前调查/帮我想想/幕后年表”不判为正文；未知/重复/漏段、非法 JSON、超限、取消、模型失败零写。
- **明确不做**：不生成 B/C 层、不建立审阅 UI、不确认作者意图。
- **验证**：`pnpm run verify:i143`；`artifacts/i143-source-interpretation-samples.json`。

### I144：来源确认与混合段审阅 UI（R19-2b）

- **依赖**：I143；**canonical owner**：Client `workflow` 导入步骤 state/presenter。
- **目标**：展示建议，让作者确认/修改 sourceRole、当前 treatment、适用 POV/主角/初始已知/揭示节奏，并逐段裁决 hybrid。
- **兼容/退役**：不新增 route，不复制上传/long-draft controller；作者可跳过分类手动选择。后置 F2 恢复并交付前，existing-prose 只能选择 expand-outline 或看到保真能力尚未交付的明确提示。
- **交付物**：来源/目标表单、conditional POV、证据、段落 role/合并、可访问性/窄屏/取消/恢复、binder DOM harness、术语映射。
- **验收**：五类来源与两个当前目标可达；非法组合 Host/Client 双重拒绝；低置信不自动推进；未决段阻止继续；换文件清空裁决；隐藏面板零请求，dispose 零 listener/timer。
- **明确不做**：不生成 B5/C3/C4/C5，不更改步骤 3–12。
- **验证**：`pnpm run verify:i144`；`artifacts/i144-import-intent-review.json`。

### I145：幕后素材→POV 读者体验 B5 候选（R19-3）

- **依赖**：I144；**canonical owner**：`NarrativeAdaptationService` + 专用 B5 prompt/schema。
- **目标**：把已裁决 evidence 转译为视角可经历的行动、调查、误判、冲突和揭示顺序；limited 新主角形成独立稳定 B3 protagonist candidate。
- **兼容/退役**：不复用 I119 来源顺序 prompt；作者指令只作约束，presentation note 只作场景机制；禁止硬编码主角。
- **交付物**：先提交 `samples/i145` dev/held-out/gold；fake backend；strict B5/protagonist candidate；paragraph evidence；regenerate intent lock；《灰烬圣典》DOCX fixture。
- **验收**：held-out ≥80%；第一幕建立调查者体验，不按幕后年表直述且不泄露真实自杀、助手操纵、群体信念复活；ID/POV/evidence 合法；失败/取消零写。
- **明确不做**：不生成 C3/C4，不写 B3/B5。
- **验证**：`pnpm run verify:i145`；`artifacts/i145-pov-outline-samples.json`。

### I146：幕后秘密 C3 揭示候选（R19-4a）

- **依赖**：I145；**canonical owner**：`NarrativeRevealPlanner`。
- **目标**：生成 C3 secret/backstory/foreshadow/plotpoint、holders/KnowledgeState/revealPlan，并把 revealAt 锚定到 I145 B5。
- **兼容/退役**：不修改 C3 schema/KnowledgeFilter；I52 继续禁止 C3；不在本卡判断或写 C4。
- **交付物**：先提交 `samples/i146` dev/held-out/gold；fake backend；C3 parser；B5 anchor validator；holders↔knows guard；POV consumer fixture。
- **验收**：held-out ≥80%；holders/knows 双向一致；revealTo 不含 holder；主角起点未知；未知 B3/B5 引用、非法输出、取消零写。
- **明确不做**：不生成/应用 C4，不应用 C3，不修改 finalization。
- **验证**：`pnpm run verify:i146`；`artifacts/i146-secret-reveal-plan.json`。

### I147：C4 public-at-start guard 与 POV 泄漏门（R19-4b）

- **依赖**：I146；**canonical owner**：import-only visibility projector + knowledge leak detector consumer。
- **目标**：确定性限制初始化 C4 只含故事开始时已公开/建立事件，并验证 B5/C3/C4/B2 trigger 组合后的 POV context。
- **兼容/退役**：不修改 CanonLedger append-only、普通 finalization 或 C3/C4 canonical schema；未公开事实只留在 C3。
- **交付物**：public-at-start evidence schema/projector；C4 negative fixture；POV context harness；泄漏 detector 累积回归。
- **验收**：幕后/未来/presentation/作者指令进入 C4 必须失败；主角 context reveal 前零隐藏事实；公开事件可通过；同证据投影确定性一致。
- **明确不做**：不调用新的 LLM、不写层、不建立 plan coordinator。
- **验证**：`pnpm run verify:i147`；`artifacts/i147-c4-visibility-guard.json`。

### I148：NarrativeImportPlan 统一预览与可恢复应用（R19-5a）

- **依赖**：I147；**canonical owner**：`NarrativeImportPlanCoordinator` + I11 + 既有 onboarding/layer owners。
- **目标**：明确复用 I52 的 B3/B2/C1/C2 地基候选，替换其 B5/C4，加入 I145 B5、I146 C3 与 I147 C4，形成一次预览和一次确认。
- **兼容/退役**：只允许新建/空作品。写前全量预检，随后复用既有逐层幂等语义；writer 中途失败返回 durable partial-failure 和 committedStages，以同 operation 恢复，不谎报原子性。共享 UoW 的机械迁移已后置到 F1。
- **交付物**：plan/proposal/receipt/checkpoint schema；跨层引用计划器；propose/accept/reject/recover Remote；Client 汇总预览；逐阶段故障注入；binder E2E。
- **验收**：pending/reject/stale/非空项目零写；故障精确记录且重开可恢复；重复 accept 不重复层数据/时间线；成功后 B5/C3/C4/POV context 正确；原 DOCX 清理不影响 checkpoint。
- **明确不做**：不写 C5、不承诺跨 owner 全回滚、不支持非空合并或后台应用。
- **验证**：`pnpm run verify:i148`；`artifacts/i148-narrative-import-apply.json`。

### I149：来源感知主流程路由与 Stage 19 产品 E2E（R19-5b）

- **依赖**：I144、I148；**canonical owner**：既有 Client `workflow` 薄路由 + 产品验收 harness。
- **目标**：让普通拆纲与幕后叙事化从步骤 1–2 汇入 I140 步骤 3–12；existing-prose 明确停留在拆纲/等待后置 F2，不伪装保真导入。
- **兼容/退役**：不新增 route，不删除 I52/I119 入口；扩展 `verify:product-flow`，I140 原矩阵保持绿。
- **交付物**：《灰烬圣典》E2E、hybrid 段裁决、手工选择、分类拒绝、stale、取消、partial-failure 恢复、POV 泄漏负向矩阵、术语终检、stage gate。
- **验收**：README 12 步编号不变；《灰烬圣典》第一幕不泄底且有调查者 POV/C3 reveal；hybrid 未决零写；existing-prose 未选择保真路径；binder/locks/held-out/dispose/test/build/product-flow 全绿。
- **明确不做**：不写 C5、不新增第 13 步、不做非空合并、素材库、富文本或 DOCX 导出。
- **验证**：`pnpm run verify:i149`；`pnpm run verify:product-flow`；`pnpm run verify:stage-19`；`artifacts/i149-source-aware-product-flow.json`。

## 20.1 阶段间范围细纲生成修复门（R18-12、R18-15，I150）

> 定位：I150 修复 I133–I134 已交付 Host 范围合同与大纲工作区之间的产品接线缺口。v3.3 将它纳入 Stage 20 查漏补缺序列；它不回填或重写既有迭代历史，也不夹带后置 F1/F2、正文生成或正文保真能力。

### I150：选中节接线、引导追加候选与大纲下拉框中文化（R18-12、R18-15）

- **依赖**：I134、I140、I149；**canonical owner**：既有 Client outline editor/范围细纲候选 state + `OutlineDetailGenerationService`。
- **目标**：大纲工作区把当前选中幕/节直接接入范围细纲生成，不再要求作者手填技术 ID；作者可输入本次生成要求，对当前已保存节显式调用 Host `ctx.llm` 生成新的追加候选细纲卡，并逐卡编辑、选择是否保留到当前节。
- **兼容/退役**：既有 `generate` 默认 fill-missing 与逐卡 regenerate 行为保持兼容；新增严格显式的 selected-beat append mode/guidance，旧调用方结果不变。当前节已有卡全部默认保护，不覆盖、不删除、不重排；Client 只传稳定 ID，不拥有 B5 真相。大纲未保存或选择与 canonical B5 不一致时 fail closed。结构、冲突类型、细纲状态、生成范围等大纲工作区下拉框只把作者可见标签改为中文，wire/持久化枚举值保持不变。
- **交付物**：先建/更新 append-mode dev/held-out/gold；strict guidance/mode schema 与 prompt/parser；Host 追加候选预算/原卡保护；选中节自动接线、生成要求输入、逐卡“保留到当前节/不保留”UI；中文枚举 label map；Remote descriptor/result lock、真实 binder、Client DOM 与产品消费者夹具。
- **验收**：选中节后零手填 ID，切节同步范围并清空旧候选；未选节、未保存草稿、未知/stale beat、空/超限 guidance、非法 mode/result、模型失败/取消均零写；点击当前节“生成新候选”必须产生一次有界 LLM 请求，即使该节已有卡；候选只追加到所选节，原卡及范围外 byte/fingerprint 不变；逐卡编辑与保留选择经唯一 I11 后幂等应用；所有大纲工作区下拉框显示中文且提交值仍为 canonical 英文枚举；held-out ≥80%，I133–I140、binder、contract lock、product-flow 全绿。
- **明确不做**：不整节覆盖、不批量重生成原卡、不自动保存脏大纲、不生成正文/基线、不修改 Stage 19 导入语义、不开始 StructuredImportSource。
- **验证**：`pnpm run verify:i150`；`pnpm run verify:product-flow`；`artifacts/i150-outline-detail-generation-repair.json`。

## 21. Stage 20：查漏补缺（R22，I151）

**阶段门**：`pnpm run verify:stage-20`。I150 是本序列首卡但保持 R18-12/R18-15 身份；I151 只解决首次导入时 B1/B4 缺少初稿的问题。F1/F2 后置包不得夹带恢复。

### I151：首次导入的一次性规则与文风初始化（R22-1）

- **依赖**：I150、I11、I50–I53、I67；**canonical owner**：新增 Host `RuleStyleImportInitializationService` + 现有 `NovelRuleService`/`NovelStyleService`；候选绑定与一次性 checkpoint 由 Host 持有。
- **目标**：仅在 Host 确认的新建/空作品首次受控导入事件中，与导入分析同时启动一个独立“规则与文风初始化” Host LLM 任务，形成可编辑 B1/B4 初稿；经唯一 I11 后分别写入 `rules/*.yaml` 与 `style.yaml`，后续只由用户手工改写。
- **兼容/退役**：不改 I52/I53 `ONBOARDING_LAYER_KEYS`、六层 prompt/schema/result/apply 及既有 I67 Remote；新方法必须 strict additive，具 canonical schema、descriptor/result contract lock、adapter 返回类型耦合与真实 DSH binder。成功后无 LLM regenerate 入口，现有手工管理面是唯一后续编辑 owner。
- **交付物**：先提交 `samples/i151` dev/held-out/gold；strict B1+B4 envelope（LLM 规则强制 `immutable:false`）、prompt/parser 与 fake backend；Host one-shot checkpoint（project/source/import session/status/candidate fingerprint/Gate lineage）；Service/Remote/Client 双区候选编辑；I11 proposal/apply；B1/B4 本地文件消费者夹具；smoke 产物。
- **验收**：首次导入精确只启动一个任务/一次 LLM，同 operation 重试、刷新、重开、重复 apply 只恢复/重放不重新调模型；应用启动、Client 挂载、作品列表刷新、`projectOpen`、重启重开、纯空白创建、后续导入及 B1/B4 文件为空均零 LLM；候选确认前零 B1/B4 写；接受后所选规则在 `rules/*.yaml`、风格在 `style.yaml` 且重开 round-trip；非空 B1/B4、跨 project/source/session、stale、reject/cancel、非法 JSON/schema、模型失败、写盘失败不覆盖/不伪成功；B1/B4 held-out 各 ≥80%；重启后仅读本地文件。
- **明确不做**：不在 app/open 时根据空文件推断初始化，不对纯空白创建臆造内容，不覆盖已有规则/风格，不为日常编辑保留 LLM 重生成，不恢复 F1/F2，不改六层裁决语义。
- **验证**：`pnpm run verify:i151`；`pnpm run verify:product-flow`；`pnpm run verify:stage-20`；`artifacts/i151-rule-style-import-initialization.json`。

## 22. Stage 21：DSH credentials seam 兼容修复（R23，I152）

**阶段门**：`pnpm run verify:stage-21`。当前执行编号严格承接已完成 I151，因此使用 I152；v3.2 后置包中的旧 I151–I162 标签只作非执行 provenance，不占用当前编号，也不恢复 F1/F2。

### I152：自定义 LLM 凭据归还 `ctx.credentials` canonical owner（R23-1）

- **依赖**：I31、I85、I91、I151；**canonical owner**：DSH `ctx.credentials` / `CredentialProvider`。
- **目标**：消除 `NovelLlmConfigService` 对 `$DSH_HOME/.credentials.yaml` schema、权限、锁和热重载的越权所有权；保存经 `CredentialProvider.set()`，配置状态经 `describe()`，由 rc.2 provider 自行维护 `version: 1` / `refs` 文档。
- **兼容/退役**：`novel-custom` provider id、`novelLlmConfig.load/save` Remote 形状、`settings.yaml` 的 `llm-pi-ai.providers.novel-custom`、A2 `modelRef`/`secretRef` 全部保持兼容；退役小说插件直接读写 `.credentials.yaml` 的内部实现。
- **交付物**：`@deepseek-ai/dsh-credentials` 精确生产依赖与 `dsh-credentials-local` 测试依赖；credentials seam 注入；真实 LocalCredentialProvider 消费者夹具；非法/缺失/只读 seam 负测；I152 smoke 产物。
- **验收**：真实 rc.2 provider 保存后文档只有 `version`/`refs`/`records` 顶层空间且引用可立即解析；其他 refs/records 保留；留空 API key 只在已配置时允许；缺失 seam、只读环境遮蔽、provider set 失败均零 settings/A2 写；Client/Remote 不出现 key；源码不再直接读写 `.credentials.yaml`；全量回归与 I85 宿主门全绿。
- **明确不做**：不升级 DSH，不新增或复制模型路由，不改 provider/model/sampling/prompt/schema，不自动修改用户现有损坏文件，不恢复 F1/F2。
- **验证**：`pnpm run verify:i152`；`pnpm run verify:stage-21`；`artifacts/i152-credentials-seam.json`。

## 23. Stage 22：目录层首次受控导入接线修复（R24，I153）

**阶段门**：`pnpm run verify:stage-22`。I153 只修一个共同入口根因，不回填 I150/I151 历史范围。

### I153：DOCX 新作品先进入来源审阅并触达 I151（R24-1）

- **依赖**：I53、I141–I149、I151–I152；**canonical owner**：Client `UploadController` + 既有 `ImportInterpretationController`。
- **目标**：目录层 DOCX 新建/打开作品后，以 Host chunks 直接建立来源审阅并保持目录层可见；不再先启动旧六层分析。作者确认后由既有 controller 启动 I151。
- **兼容/退役**：保留上传、项目、来源审阅与 I151 全部公开合同；退役目录层 `createProject -> startAnalysis -> browseProjects` 旧接线及 `OnboardingState` 对来源审阅的渲染前置条件。I150 范围细纲生成不变。
- **交付物**：窄 `startSourceReview` composition port；目录层独立审阅渲染；空目录→上传→新建/打开→背景资料/已有正文→已有主角→确认→I151 的产品消费者夹具；I153 smoke 产物。
- **验收**：两个来源角色和已有主角输入在真实上传路径可达；确认前旧六层 begin=0、I151 begin=0，确认后 I151 begin=1；Host ranges 非法、作品切换竞态 fail closed；无 `OnboardingState` 仍显示来源审阅；全量与产品流回归全绿。
- **明确不做**：不改 I150，不新增来源 enum，不交付 `preserve-prose`，不改 prompt/schema/样本、Host Remote 或后续导入策略。
- **验证**：`pnpm run verify:i153`；`pnpm run verify:product-flow`；`pnpm run verify:stage-22`；`artifacts/i153-controlled-import-entry.json`。

## 24. Stage 23：来源审阅解释提示（R25，I154）

**阶段门**：`pnpm run verify:stage-23`。I154 是纯 Client 呈现切片，不改任何领域或公开合同。

### I154：来源分类与段落操作 hover/focus 帮助（R25-1）

- **依赖**：I141–I144、I153；**canonical owner**：Client `sourceInterpretationReview` + `ONBOARDING_STYLES`。
- **目标**：在来源角色、段落来源类型、段落处理及“合并此分类”旁放置统一经典帮助按钮；hover/focus 显示完整选项语义和操作副作用。
- **兼容/退役**：所有 select/button 的 canonical 值、callback 与 data anchor 不变；不退役业务入口，只消除需查文档才能理解的 UI 盲区。
- **交付物**：单一 tooltip renderer、四组详细中文说明、原生 title/ARIA/focus fallback、响应式样式、纯渲染与真实合并回调夹具、I154 smoke。
- **验收**：四类 help 全部存在并关联 role=tooltip；鼠标 hover 与键盘 focus CSS 可见；来源角色五项、来源片段五类、四种处理和合并零拼接语义完整；help button 本身不触发业务，原合并仍只回调 accepted。
- **明确不做**：不改 4000 字符 chunk 分段、不承诺 Word 段落一一对应、不改 enum/session/Remote/prompt/schema/样本、不恢复 F1/F2。
- **验证**：`pnpm run verify:i154`；`pnpm run verify:product-flow`；`pnpm run verify:stage-23`；`artifacts/i154-source-review-help.json`。

## 25. Stage 24：既有作品归档与恢复（R26，I155）

**阶段门**：`pnpm run verify:stage-24`。I155 只扩展项目生命周期，不改变作品内容 schema 或任何生成语义。

### I155：Host-owned 作品归档与强制只读（R26-1）

- **目标**：允许作者归档当前已存在作品；归档作品退出主项目列表，在恢复前无法打开或编辑。
- **明确不做**：永久删除、自动/批量归档、归档内预览/编辑/搜索/导出、云同步、ProjectMeta 字段扩展、LLM/F1/F2。
- **交付物**：`.archive/<projectId>` 完整树、活动位置墓碑、并发 lifecycle transition lane；additive `projectArchiveList/projectArchive/projectRestore` Remote；主列表归档按钮与只恢复的归档区；合同锁、binder、负向夹具与 I155 smoke。
- **验收**：活动列表归档后立即移除；归档列表只显示恢复且零打开入口；`projectOpen`、新服务访问和归档前缓存仓储写均失败；重复/未知/非法/冲突转换 fail closed；恢复后元数据与层文件原样可开；Remote 参数/结果严格校验。
- **验证**：`pnpm run verify:i155`；`pnpm run verify:stage-24`；`artifacts/i155-project-archive.json`。

## 26. Stage 25：来源审阅 session 持久化恢复（R27，I156）

**阶段门**：`pnpm run verify:stage-25`。I156 是既有 I142/I144 路径的可靠性修复，不新增公开合同或生成能力。

### I156：Windows 首次落盘重试与作者原地恢复（R27-1）

- **目标**：来源审阅 session 首次原子落盘不再被 Windows 瞬时文件锁直接击穿；失败后作者无需重新上传即可重试。
- **明确不做**：不改 session/Remote/schema/contract lock、DOCX chunk、分类 enum、LLM prompt/样本、I151 触发、项目归档或 F1/F2。
- **交付物**：transient rename 有界退避与故障注入 seam；来源审阅重试操作、保真 paragraph 投影、高级错误详情；Host/Client 负向夹具与 I156 smoke。
- **验收**：EPERM/EBUSY/EACCES 前若干次失败后成功落盘；非 transient 与重试耗尽 fail closed；无 session 时重试 create，有 session 时只重启 analysis；重试输入与原 Host chunks/sourceHash 一致且不启动旧六层分析。
- **验证**：`pnpm run verify:i156`；`pnpm run verify:stage-25`；`artifacts/i156-source-review-session-recovery.json`。

## 27. Stage 26：来源主角作者语义恢复（R28，I157）

**阶段门**：`pnpm run verify:stage-26`。I157 只扩展既有 Stage 19 sourceRole 的 `idea + adapt-pov` 合法组合并修复 Client 作者语义；不恢复正文保真 F2，不绕过 I11。

### I157：重试状态保持、无 ID 表单与 LLM 新主角串联（R28-1/R28-2）

- **依赖**：I145、I148、I153、I156；**canonical owner**：Client `ImportInterpretationController` + `llm/analyze/narrative-adaptation` + Stage 19 strict schema/locks。
- **目标**：首次 session create 失败后的重试保留作者全部审阅状态；作者只选择 AI 创建或已有角色名称，不填写任何角色/知识 ID；创作想法、背景资料和混合文档都可由 LLM 提议新主角并转换为视角叙事。
- **兼容/退役**：既有 invocation 名称、参数字段与结果字段不变；仅把 `idea` additive 加入 narrative adaptation/reveal/plan 的 sourceRole enum。Client 内部生成稳定 candidate ID，旧显式 ID 数据仍可读取但不再渲染为输入。synopsis/existing-prose 仍只拆纲。
- **交付物**：先冻结 `samples/i157` dev/held-out/gold；保状态 retry helper；作者语义 protagonist selector；初始已知说明；idea strict schema/contract locks；prompt 与 deterministic candidate-in-B5 guard；产品/LLM/负向夹具及 I157 smoke。
- **验收**：重试前后 sourceHash/ranges/作者选择完全一致；DOM 零手填 ID；空项目选择 adapt-pov 默认 limited+AI 新主角；已有角色只按名称显示；idea/background/hybrid 均通过；缺 candidate、候选 ID 漂移、B5 未引用候选、synopsis/existing-prose 非法组合均失败；新 held-out ≥80%，旧 I145/I146 样本不回归，未确认零写。
- **明确不做**：不自动接受或直接写 B3/B5/C3/C4；不开放 preserve-prose；不修改 DOCX chunk、I151 触发、归档或 DSH family pin。
- **验证**：`pnpm run verify:i157`；`pnpm run verify:stage-26`；`artifacts/i157-source-protagonist-semantics.json`。

## 28. Stage 27：来源 Remote Host 注册修复（R29，I158）

**阶段门**：`pnpm run verify:stage-27`。I158 是现有 strict Remote 的 Host 注册接线修复，不新增 endpoint、schema 或产品能力。

### I158：来源导入链 Host Typert face 完整登记（R29-1）

- **依赖**：I142–I148、I151、I157；**canonical owner**：`src/host/remote/host-contribution.ts`。
- **目标**：让 DSH Gateway 真实认领 `novelImportInterpretation/create` 及同一来源导入链全部已公开 endpoint，消除 HTTP 404。
- **兼容/退役**：只把六组既有 invocations 加入唯一 `hostContribution`；Client contribution、invocation ID、namespace、参数、结果、adapter 与 domain service 均保持不变，不新增 HTTP/动态 fallback。
- **交付物**：Host face 登记；Client-mounted descriptors 全部存在于 Host face 的集合守卫；真实 Typert Registry + Gateway + plugin 的 create 正向往返、未知 endpoint 负向与 Fiber dispose 夹具；I158 smoke/产物。
- **验收**：`novelImportInterpretation/create` 不再 404 且创建合法 draft session；六组来源导入 descriptor 零缺失/零重复；未知 endpoint 仍不被认领；卸载后 descriptors 消失；既有 contract locks 字节不变。
- **明确不做**：不改来源语义、LLM、I11、持久化、DOCX、Client UI、DSH pin 或 F1/F2。
- **验证**：`pnpm run verify:i158`；`pnpm run verify:stage-27`；`artifacts/i158-source-remote-host-registration.json`。

## Deferred Package F1：导入基础设施重构（v3.2 原 Stage 20 / I151–I155）

> **后置说明**：下列卡片完整保留 v3.2 设计意图，但原 I151–I155 只作 provenance，不得执行原 `verify:i151`–`verify:i155` 或占用当前 I151 身份。恢复时必须重新编号、重新冻结依赖和验证命令。

### F1-1（v3.2 原 I151）：StructuredImportSource 与 DOCX 段落/标题证据（R20-1）

- **依赖（后置原设计）**：I150；**canonical owner**：`core/docx` + `core/text/structured-import-source`。
- **目标**：建立格式、规范文本、paragraph ID、heading level、source range、sourceHash 的单一 Host 来源模型。
- **兼容/退役**：既有 readDocxText/readImportedText text/chunks 是新模型的纯投影且 contract lock 不变；验证后删除第二解析实现。
- **交付物**：DOCX/TXT/Markdown 结构 fixture、strict schema、兼容投影、恶意包/不可靠标题负测、消费者夹具。
- **验收**：段落/标题证据稳定；纯文本投影逐字段等价；路径/ZIP/大小安全不退化；Client bundle 不含 parser。
- **明确不做**：不拆 chapter/scene、不写 C5、不改变 UI。
- **原验证意图**：恢复排期时重建命令与 artifact；不占用当前 `verify:i151`。

### F1-2（v3.2 原 I152）：共享 ImportOperation 与 checkpoint 地基（R20-2）

- **依赖（后置原设计）**：F1-1；**canonical owner**：`core/schema/import-operation` + Host checkpoint store。
- **目标**：提取 operation envelope、participant contract、freshness/replay、project write lane 和可恢复 checkpoint。
- **兼容/退役**：只建内部/strict additive 地基，不修改 NarrativeImportPlan wire；不得出现 Narrative/Manuscript 两套状态机。
- **交付物**：schema/store/lane、状态迁移、跨项目/hash/plan guard、Narrative consumer fixture、dispose 测试。
- **验收**：重开一致、非法迁移 fail closed、operation replay、同项目串行/跨项目隔离、地基零领域写。
- **明确不做**：不实现 UoW commit/restore、不迁移 Stage 19 coordinator。
- **原验证意图**：恢复排期时重建命令与 artifact；原 `verify:i152` 不具当前执行身份。

### F1-3（v3.2 原 I153）：空作品初始化 UoW 与恢复门（R20-3）

- **依赖（后置原设计）**：F1-2；**canonical owner**：`ImportInitializationUnitOfWork`。
- **目标**：冻结 participant 基线/目标快照，执行 prepare→commit→restore/recover；恢复未完成时阻断普通写作。
- **兼容/退役**：本地单 Host，不做分布式事务、全局 saga 或后台 LLM 补写；participant 仍由各领域 owner 实施读写。
- **交付物**：UoW journal、participant harness、每阶段/恢复阶段故障注入、重启恢复、readiness blocker。
- **验收**：成功全新；失败/崩溃最终收敛全旧或全新；pending-recovery 不可误报成功/继续写作；重复 recover 幂等。
- **明确不做**：不接产品 Remote/UI、不迁移 NarrativeImportPlan。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F1-4（v3.2 原 I154）：NarrativeImportPlan 迁移共享 UoW（R20-4a）

- **依赖（后置原设计）**：F1-3；**canonical owner**：Narrative plan participants + shared coordinator adapter。
- **目标**：把 I148 plan/operation/checkpoint 机械迁移到共享地基，成功/拒绝/stale/replay 与结果形状不变。
- **兼容/退役**：迁移验证后 delete-first 删除旧状态机/store/lane；不得修改 prompt、候选语义、样本或 UI。
- **交付物**：B3/B2/B5/C1/C2/C3/C4 participants、adapter、故障等价锁、旧路径零引用扫描。
- **验收**：I141–I149 全绿；所有 participant 故障经共享恢复收敛；binder/contract lock 不变；无双 owner/fallback。
- **明确不做**：不新增 manuscript participant、不写 C5。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F1-5（v3.2 原 I155）：导入地基架构收口与正文消费门（R20-4b）

- **依赖（后置原设计）**：F1-4；**canonical owner**：架构 smoke/contract guards。
- **目标**：证明结构化来源、shared operation、UoW 和 Narrative consumer 是单一可扩展地基，并冻结后置 F2 participant 接口。
- **兼容/退役**：只冻结内部 participant seam，不新增产品 Remote；Stage 19 contract lock、Client DOM 与错误语义保持不变。
- **交付物**：依赖方向/重复 owner 扫描、F2 fake participant fixture、全量 regression、stage smoke。
- **验收**：旧 DOCX/text/import、I52/I119、Stage 19 产品流、contract lock、test/build 全绿；fake manuscript participant 可 prepare/commit/restore/replay 而无需复制 coordinator。
- **明确不做**：不交付 preserve-prose、不创建真实 C5 participant 或 UI。
- **原验证意图**：恢复排期时重建命令、stage gate 与 artifact。

## Deferred Package F2：已有正文保真导入（v3.2 原 Stage 21 / I156–I162）

> **后置说明**：下列卡片完整保留 v3.2 设计意图，但原 I156–I162 只作 provenance，无当前 stage/verify 身份。恢复时必须先完成重新编号的 F1，再重新冻结本包。

### F2-1（v3.2 原 I156）：确定性 manuscript source candidate（R21-1）

- **依赖（后置原设计）**：F1-5；**canonical owner**：`ManuscriptImportPlanner`。
- **目标**：从 StructuredImportSource 建立有序 chapter/scene ranges、稳定 ID 和 Host-owned C5 content candidate。
- **兼容/退役**：通过新 V2 confirmation method/schema 新增 `preserve-prose`，I142 旧方法仍只接受/返回 expand-outline|adapt-pov；不可靠标题降级单章/单场景；LLM schema 禁止 C5 content。
- **交付物**：V2 confirmation descriptor/adapter/contract lock/binder；candidate schema、DOCX/TXT/Markdown 规则、coverage/fidelity guard、非空 preflight、大文档测试。
- **验收**：新旧方法隔离且旧 lock 不变；完整覆盖/无重叠/可重建；重复标题异 ID；标点/对话/空行策略确定；空/超限/hybrid 未决/非空严格拒绝；伪造 LLM C5 字段失败。
- **明确不做**：不生成 B/C、不应用、不保留富文本样式/批注。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-2（v3.2 原 I157）：已有正文反向 B5 与场景映射候选（R21-2a）

- **依赖（后置原设计）**：F2-1；**canonical owner**：manuscript outline adapter + I119 analyzer consumer。
- **目标**：按 chapter/scene range 反向生成 B5，并生成可审阅的 scene→detailBeat mapping candidate。
- **兼容/退役**：不修改 I119 prompt/schema；无法可靠绑定保持 pending，不猜测；B5 无权改变 C5。
- **交付物**：fake adapter、range evidence、mapping schema、I119 held-out/大文档分块回归。
- **验收**：B5 evidence 可回指原段；mapping 引用合法稳定 ID；pending 可见；失败/取消零写，C5 candidate fingerprint 不变。
- **明确不做**：不生成其他 B/C、不保存 binding、不应用正文。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-3（v3.2 原 I158）：已有正文其他 B/C 反向候选（R21-2b）

- **依赖（后置原设计）**：F2-2、I146、I147；**canonical owner**：I52/Stage 19 parser adapters。
- **目标**：复用既有分析器生成 B3/B2/C1/C2/C3/C4 候选并绑定 paragraph evidence；正文中确实叙述成立的事件才可进入 C4。
- **兼容/退役**：不修改既有 prompt/schema/gold；不可靠层可为空/待作者补充，不为填满 plan 发明事实。
- **交付物**：adapter、证据耦合、全部既有 held-out、POV/C4 guards、伪造引用负测。
- **验收**：结构候选 schema/引用合法；C3/C4 安全；任意结构错误不改变 C5/B5；模型不得返回 C5 字段。
- **明确不做**：不应用层、不自动接受 mapping。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-4（v3.2 原 I159）：ManuscriptImportPlan 双预览与一次确认（R21-3）

- **依赖（后置原设计）**：F2-3；**canonical owner**：Manuscript plan builder + Client preview。
- **目标**：分离预览 C5、B/C 与 mapping，冻结 ID/range/fingerprint，形成一次 I11 proposal。
- **兼容/退役**：不复用 candidate accept/finalization；只允许新建/空作品；Client 不解析文件或重建 ranges。
- **交付物**：plan/proposal strict schema、全量引用/fidelity preflight、正文/结构双预览、binder/contract lock。
- **验收**：未确认/reject/stale/非空零写；C5 coverage 与所有引用在 propose 前通过；刷新恢复预览一致；一次 confirmation 无嵌套 Gate。
- **明确不做**：不 commit participant、不写 C5/B/C/binding。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-5（v3.2 原 I160）：TextRepository manuscript UoW participant（R21-4）

- **依赖（后置原设计）**：F2-4；**canonical owner**：`TextRepository` import participant。
- **目标**：把冻结 chapter/scene/chosen C5 作为一个 F1 UoW participant prepare/commit/restore/replay，并复用 Markdown mirror/outbox。
- **兼容/退役**：导入正文是作者初始 chosen C5，不创建 AI candidate 分支、不触发 finalization；普通 TextRepository API 不变。
- **交付物**：participant adapter、目标快照、故障注入、重开/mirror/outbox/replay fixture。
- **验收**：章节/场景/正文不重复；restore 精确；重开顺序和原文一致；mirror 失败不谎报 C5 主写状态。
- **明确不做**：不协调其他 participant、不写 binding/B/C。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-6（v3.2 原 I161）：ManuscriptImportPlan 共享 UoW 应用与恢复 UI（R21-5a）

- **依赖（后置原设计）**：F2-5；**canonical owner**：shared import coordinator + manuscript participants。
- **目标**：经一次已接受 proposal 应用 C5、B/C 与已确认 SceneOutlineBinding，并在 pending-recovery 时提供唯一恢复入口。
- **兼容/退役**：所有 participant 复用 F1 coordinator；不复制状态机/checkpoint/lane；apply 前重验空作品/sourceHash/intent/plan。
- **交付物**：participants、accept/reject/recover adapter、恢复 UI、逐 participant/恢复故障 E2E。
- **验收**：失败最终全旧或全新；重复 apply replay；正文/结构/binding/正史/知情不重复；恢复前普通流程阻断；I121 context 只取当前正文和 POV 可知信息。
- **明确不做**：不合并非空项目、不建版本树、不自动润色。
- **原验证意图**：恢复排期时重建命令与 artifact。

### F2-7（v3.2 原 I162）：正文保真主流程路由与产品 E2E（R21-5b）

- **依赖（后置原设计）**：F2-6；**canonical owner**：既有 workflow 薄路由 + 产品验收 harness。
- **目标**：开放 existing-prose+preserve-prose，从步骤 1–2 导入后汇入步骤 3–12，并证明最终单稿正文保真。
- **兼容/退役**：不新增 route/第 13 步；I52/I119 与 Stage 19 路径继续兼容；扩展同一 verify:product-flow。
- **交付物**：纯正文 DOCX/TXT/MD、hybrid、背景叙事化、拒绝、stale、恢复、全文导出 E2E；术语终检；stage gate。
- **验收**：规范来源→C5→全书检查→TXT/Markdown 文字与顺序一致；三路来源汇入同一 workflow；所有 held-out/binder/locks/dispose/test/build、当前基线及重新编号后的前序卡回归全绿。
- **明确不做**：不做非空合并、富文本、批注、版本树、自动润色或 DOCX 正式导出。
- **原验证意图**：恢复排期时重建单迭代命令、`verify:product-flow`、stage gate 与 artifact。

---

## 25. 完成线

I1–I157 均已完成：I45 完成 v2.0 核心闭环，I49 完成首轮创作台 UI，I53 完成作品启动与六层初始化，I59 完成停靠侧板与现有 UI 修复，I65 完成 P0 正文写作闭环，I72 完成 P1 能力可达性，I74 完成剧情时间线，I84 完成 Stage 15 架构债务消除，I85 完成 Stage 16 DSH family `0.1.1-rc.2` 兼容升级，I86–I102 完成 Stage 17 review v2.0 修复，I103–I140 完成合同地基、章节/正文/细纲新增能力、统一定稿、发布门、作者流程壳和 README 十二步产品 E2E，I141–I149 完成来源确认、幕后素材 POV 叙事化、C3/C4 安全边界与来源感知产品 E2E，I150 完成范围细纲生成接线修复，I151 完成首次导入规则与文风初始化，I152 完成 credentials seam 修复，I153 完成目录层首次受控导入接线修复，I154 完成来源审阅解释提示，I155 完成既有作品归档与恢复，I156 完成来源审阅 session Windows 落盘与原地重试恢复，I157 完成来源主角作者语义恢复。

v3.3 当前进度：**Stage 26 / I157 已完成 → 当前顺序执行 Stage 27 / I158 来源 Remote Host 注册修复**。v3.2 原 I151–I162 仍为后置 F1/F2 provenance，其旧标签不占用当前编号，也不得依原身份执行。

I74 完成时还必须证明：

- ordinary persistent DSH/Cordis Host+Client 插件仍可安装、装载、升级、卸载，且 Host/Client owner 与 §0.1 不变；
- 创作台不再呈现为居中独立浮窗，不替换 DSH 单槽；没有公共侧区 Slot 时只存在 `shell.overlay` 右侧停靠侧板主路径；
- 多作品可切换且草稿隔离，六层初始化的编辑/重生成/进度/取消/重试与 apply 刷新行为正确；
- C5 章节/场景可在创作台阅读和编辑，生成统一先形成候选，作者在生成后裁决，拒绝零写；
- 一致性问题可定位，自动生成队列可恢复且不绕过 ConfirmationGate；
- C3、B1、B4、C6、导入导出、正文分支、搜索/上下文追踪、进度统计与剧情时间线均有 UI 消费者；
- 剧情时间线：B5 落地后自建骨架，作者可编辑保存；C1 关系注入只含「当前时间线节点之前已建立」的关系，时间线缺失/未锚定回退全量（兼容旧数据）；
- 所有用户确认统一经 I11 Gate，C4 保持 append-only，派生索引/统计可删除重建；
- 卸载不删除作品 source of truth，Fiber dispose 后 Service/Tool/Remote/Slot/样式/任务监听零残留。

Stage 15（I84）完成时还必须证明：

- 接线层类型安全恢复：生产代码无 `as Parameters<...>` / `as never` / `as unknown as` 领域输入断言，方法签名变更在接线层即报编译错；
- 全仓库最大复制源归零：parse-JSON 样板、`confidenceSchema`、violation schema、五层写回器、文本管道、SHA-256 均只保留一份实现；
- 契约单一来源生效：wire schema 派生自 core schema，`contracts/` 存形状本体，schema 字段单一变更影响面 ≤3 文件；
- god file / god service 消除：`client.ts` 与 `index.ts`、两个 adjudication service 均按职责拆分，行数护栏成立，`$mount` 块与 `WorkbenchActions`/`WorkbenchState`/`ProjectSessionActions` 三接口重复声明归零；
- 分层边界保持：core→host/client 反向 import 为 0，分层倒置边修复，「可入 client 图的 core 纯模块白名单」显式化并受扫描约束；
- 领域行为等价：I1–I74 全部既有验收（`pnpm test` + stage verify + LLM 样本阈值）在重构后保持绿，公开 Remote/wire 契约形状不变。

Stage 16（I85）完成时还必须证明（✅ I85 已验证）：

- manifest、selected profile 与 lockfile 的 DSH family 唯一 pin 均为精确 `0.1.1-rc.2`，无 rc.7/rc.2 混装或 fallback；
- 真实 base+web+plugin selected-profile 的 Host、Client ModuleLoader、Slot、Typert Remote、Tools、`ctx.llm` 与完整生命周期门全部通过；
- 升级前后领域行为、公开 Remote/wire、样本/gold/阈值与作品 source of truth 不变；失败可整体回退到 I84，而不产生第二宿主路径。

Stage 17（review v2 修复迭代 I86–I102）完成时还必须证明：

- 五个 Remote 死方法在真实 DSH 客户端绑定器下往返成功，端到端 binder 契约测试在 CI 全绿（I86）；
- 接线层类型安全恢复：descriptor↔adapter↔client namespace 三方类型耦合，方法签名变更在接线层即报编译错，生产接线无 `any[]`/`as unknown as`（I91/I96）；
- Agent 上下文单一 owner，`novel_context` 与 `novel_continue` 无语义分叉（I87）；
- 队列轮询 timer 归属 Fiber，卸载后零残留轮询、不堆积并行轮询链（I88）；
- index.ts/client.ts 装配层按职责分段/拆 controllers，Remote 资源清单单份维护（I89/I90）；
- 双导航一致、LLM 批量 apply 事务化（UoW）、TextRepository 拆分且镜像失败不谎报（I92/I93/I94）；
- 大文件与巨型测试文件拆分，行数护栏成立（I95）；
- editor wire 请求合同精确、extensions store/registry 校验与不可变（I97/I98/I99）；
- 公开 Remote 命名统一经兼容期迁移完成（I100）；
- 单 acting 互锁 / OpsContext / workspace-service 收敛（I101）；onboarding schema 与 extension kind 单点化（I102）；
- 领域行为等价：I1–I85 全部既有验收在修复后保持绿，公开 Remote/wire 契约形状不变（I100 兼容迁移除外）。

Stage 18（I103–I140）完成时还必须证明：

- 既有 invocation 的方法、参数、结果逐字段向后兼容；所有 additive Remote 有 strict schema、返回类型耦合、contract lock 与真实 binder E2E，`novelBranches.list` 基线漂移已修复且无 caller fallback；
- C5 CRUD/排序、SceneOutlineBinding 与候选落点具有单一 owner；本地硬删除在同一请求内实时、幂等完成 binding→C5，Gate 前失败零写且中途技术失败可用同一 proposal 重试；C5/B5 Schema 保持已裁决边界；
- generation baseline 可重启恢复但不成为第二份 B5 真相；candidate/reparse 的五层 preview 与实际 writeback delta 一致，plan stale/restart 行为明确且未产生持久第二真相；
- 正文变化被区分为纯格式/措辞、故事事实与剧情方向；只有具证据的后两类可产生未来细纲调和候选，B5 任何语义调整均逐卡预览、经 I11 且 freshness/UoW 受控；“定稿并继续”只确定性推进当前卡/C6 并创建下一有效 baseline；
- 自动引用、LLM 修正、长稿拆纲与三种润色均遵守样本优先、fake backend、I11、未确认零写和真实 held-out 阈值；
- EntityLink/派生索引不进入 C5、Markdown、txt 或归档，七类跳转、返回上下文、stale/relink 与 round-trip 全绿；
- review repair 的 sourceHash/range 闭环成立，resolved 只存在于当前 Client 会话且不会伪造 Host 历史；
- 四模式、版本聚合、freshness switch 和术语门在真实 Client harness 下成立，隐藏面板零请求，作者可见禁词归零且技术合同未误改；
- act/chapter/all 范围细纲候选只修改授权范围；候选接受为草稿时只有 C5 改变，作者最终正文形成单一 FinalizationPlan 并只经一次 I11 确认完成五层、引用、B5/C6 与下一 baseline 的受控写回；
- 全部细纲完成后全书一致性与发布就绪门成立；正式导出按真实顺序生成带目录的单一 TXT/Markdown，不混入旧分支、设定 sidecar、内部链接或技术 ID；
- `workflow` 是默认作者入口，README 12 步无需进入进阶工具即可完成；既有十九项能力分层保留而不与主流程并列，产品 E2E 覆盖拒绝、stale、失败回滚、重启、POV 与发布阻断；
- `pnpm test`、build、I103–I140 全部 verify、`verify:product-flow`、`verify:stage-18`、全部 Stage 18/既有 parser held-out、Fiber dispose 与 source-of-truth 安全门全绿。

Stage 19（I141–I149）完成时还必须证明：

- 来源角色、当前目标处理与 POV/揭示意图是两根显式轴，纯合同先于 session/Remote，建议不可替代作者确认，全部操作绑定 project/importSession/sourceHash；
- 稳定 paragraph ID 完整覆盖、可逐段裁决，offset 由 Host 投影，作者指令与 presentation note 不会变成正文或正史；
- 幕后素材生成读者体验 B5 与 C3 秘密揭示计划，《灰烬圣典》第一幕不直接泄露真实自杀、助手操纵或群体信念复活；
- C4 初始化不接收仅存在于幕后说明、未来计划或作者指令中的事件，主角 POV context 在 reveal 前不含隐藏事实；
- NarrativeImportPlan 明确复用 I52 的 B3/B2/C1/C2、替换其 B5/C4 并加入 C3；既有逐层 apply 中途失败只能显式 partial-failure 并以同 operation 恢复，不得谎报原子成功；
- Stage 19 不开放 preserve-prose、不写 C5；README 仍为同一 12 步 workflow，幕后来源从步骤 1–2 汇入已交付步骤 3–12；I1–I140 product-flow、全部相关 held-out、binder、contract lock、dispose、`pnpm test`/build 和 `verify:stage-19` 全绿。

I150 范围细纲生成修复门完成时还必须证明：

- 当前选中节成为唯一普通作者范围来源，Client 不显示或要求手填 actId/beatId/chapterId；切节、脏草稿、stale B5 均 fail closed；
- 当前节即使已有卡也只通过显式 append mode 调用 LLM 生成新卡，原卡/顺序/范围外内容受保护；作者 guidance、逐卡编辑与保留选择经唯一 I11 应用；
- 大纲工作区全部下拉框显示中文标签但 canonical wire/持久化枚举值不变；I133–I140、held-out、binder、contract lock、product-flow 与 `verify:i150` 全绿。

I151 首次导入规则/文风初始化完成时还必须证明：

- 只有 Host 确认的新建/空作品首次导入事件启动一个 B1+B4 LLM 任务；app 启动、Client 挂载、`projectOpen`、重开、纯空白创建、后续导入与空 B1/B4 文件均零 LLM；
- 任务独立于 I52 六层 analyzer，无 `ONBOARDING_LAYER_KEYS` 或六层 wire 变化；同一首次导入重试/重放只恢复原任务，不二次调模型；
- 候选经 I11 前零写；后续只有用户手工改写，并以 `rules/*.yaml` 与 `style.yaml` 为唯一 B1/B4 真相，重启只读文件；
- B1/B4 held-out 各 ≥80%，fake backend、binder/contract lock、负向触发矩阵、写盘故障、product-flow、test/build 与 `verify:stage-20` 全绿。

F1/F2 的结构化来源、共享 UoW 与正文保真验收仍保留在后置卡中，但当前不执行；恢复排期时重新编号和冻结 stage gate。

语义向量检索、C2 items/factions/globalFlags、ST 迁移、已有非空作品合并导入、novel 自有主题引擎、C3 revealAt 直接引用时间线节点 id 的联动，以及 review v2.0 其余中-低/低项（validator 骨架、仓储 primitive、import 格式 descriptor 等）继续后置为 backlog；公开 Remote 服务的破坏性改名（`novelImport`/`novelImportExport`/`novelExport` 三服务合并）已由 **I100** 立项（兼容迁移，见 §18）。

---

## 24. Risks 与 Retirement

- **Client 公开合同风险**：I2 若无法证明公开 out-of-tree Client bundling/Remote，则按停止线停止，不使用动态 RPC 或 internal builder fallback。
- **DSH 版本漂移与兼容门**：I54 已完成 Slot 落点决策；I85 已把唯一项目 DSH family pin 从 `0.1.0-rc.7` 原子切换为 `0.1.1-rc.2`，并重跑真实 base+web+plugin 与完整 Client/Remote/Tools/LLM 门；门内任一失败即回退 I85，不以混装或双路 fallback 过关。当前无运行时观测与项目 pin 的漂移。
- **旧路径残留**：旧 I1a/I1b 独立 Vite/浏览器 LLM 路径必须零引用；不保留双主路径兼容层。
- **作品数据安全**：卸载/回退不删除作品 source of truth；只退役 tracked 固定 mock 产物，不触碰未跟踪存档或真实作品目录。
- **创作台 UI 重设计风险**：I46 将测试锚点从 `data-novel-editors` 迁移到新契约并重写 `client.test.ts`；I33–I36 既有 Host 契约（`novelWorkspace` Remote）不得回退，样式必须归属 Fiber 并在卸载后归零。
- **作品启动风险**：I50 必须由 Host project lifecycle 统一证明 readiness；禁止在 Client、Remote 转发层或六个面板增加各自的自动建目录/吞错 fallback。现有 `default` 与重复 ConfirmationService owner 在 I50 主路径通过后 delete-first 退役。
- **DOCX 安全与退役**：I51 的临时上传只属派生数据；真实作品文件不可删除。成熟解析器主路径通过后删除手写 parser 并扫描零引用，不保留兼容双路径。
- **六层推断风险**：I52–I53 只面向新建/空作品，C4 仅允许文本明确事件，C3 始终禁止；未确认候选零写，跨层引用先预检，跨文件失败必须可重试而非补偿性删除。
- **候选与自动化风险**：I62–I65 必须保持“先候选、后裁决”；队列只编排生成，不自动接受、不静默改 B5/C6。任务恢复依赖稳定 ID 与幂等状态，不以重复追加正文作为重试。
- **正文分支迁移风险**：I70 是 C5 source-of-truth 迁移迭代；必须先锁旧单版本项目 fixture，失败时 fail closed，禁止为了兼容保留两个可写 owner。
- **派生视图风险**：I71 搜索索引与 I72 统计均可删除重建，不得成为正文/设定/进度的第二真相，也不得越过 C3/POV 知识边界。
- **时间线语义风险**：I73–I74 的时间线是作者可编辑的规划文档，不是 C1/C3 的第二写 owner；`knownTo` 仍只表关系公开性，C3 revealAt 仍自由文本。关系过滤必须「未安排关系始终保留」，否则时间线出现即丢关系；时间线缺失/未锚定必须回退全量，避免行为突变。schema 与 node:fs 分离，Client bundle 不得入图 repository。
- **重构/修复回归风险**：I75–I84 与 I86–I102 纯机械重构/修复必须以既有全量测试 + stage 回归 + LLM 样本阈值兜底；出现回归先定位到具体迭代并回退上一可用 commit，不带着红灯进入下一迭代。
- **修复迭代范围风险（v2.5）**：I86–I102 以 review v2.0 中级以上问题为界，禁止顺手夹带中-低/低项或新功能；I100 属公开 Remote 契约迁移，必须带兼容期与退役文档，禁止静默破坏既有调用方；审查证据行号以文件路径与职责为准。
- **契约漂移风险**：I77/I78 改变 wire 形状推导方式时，必须以 strict codec wire smoke 证明形状等价；禁止继续在接线层以补丁掩盖契约不匹配。I103 起把 result 类型、descriptor lock 与真实 binder 纳入同一门，additive 不等于可跳过兼容审查。
- **Stage 18 本地持久化风险**：SceneOutlineBinding 与 reference audit 是明确的 Host owner；章节润色进度和删除操作不新增持久 journal。非空 C5 硬删除只能经 I11，并在现有本地 project write lane 内最终复验、同步幂等清理 binding/C5；禁止 caller 侧级联、后台叙事层补写或无影响报告删除。
- **Stage 18 自动化风险**：StructuralPreviewPlan 与章节润色编排只在会话内存在；generation baseline 虽持久但仅是不可变生成意图证据，不得成为 B5 第二真相。detail-outline、impact/reconciliation、reference LLM、long-draft、polish、review repair 均只产候选，任何失败/取消/未确认零写；wording-only 不得触发 B5 语义修改，未来细纲调整不得越过当前/已完成卡或改 stable ID/order。候选“接受为草稿”只写 C5；获授权的最终多层叙事内容写回必须由单一 FinalizationPlan 在一次 I11 后、同一 Host 请求内实时且幂等完成，不得嵌套确认或以“自动联动”恢复后台静默写层。
- **Stage 18 派生数据与退役**：EntityLink/index、resolved session state 和 aggregate tree 不得成为第二真相；新 router/选择器验证后删除旧 direct-jump/手填 ID 主路径，不保留双 owner fallback。主流程不得把十九项技术面板继续作为同权入口；单一 Markdown/txt 稿件和 archive 均零链接 sidecar，per-chapter 文本导出仅保留为进阶兼容入口。
- **Stage 19 来源语义风险**：自动分类只可建议，不可替作者决定 sourceRole/treatment/POV；混合范围未决即停止。ImportInterpretation/checkpoint 是 operational evidence，不得成为第 14 层、第二素材库或覆盖 B/C/C5 owner。
- **Stage 19 泄密风险**：幕后年表不得直接转成 B5 顺序或初始化 C4；隐藏事实只通过 C3 holders/knows/revealPlan 进入 POV-safe 上下文，必须以《灰烬圣典》和知识泄漏 detector 证明 reveal 前零泄漏，禁止依赖 prompt 礼貌要求模型保密。
- **Stage 19 应用风险**：I148 仍复用既有逐层 apply 语义，技术失败可能留下已明确记账的已完成层；必须返回 partial-failure、阻止普通流程并以同一 operation 恢复，不得在 Stage 19 文案或结果中冒充全回滚。未来恢复 F1 时，该实现必须 delete-first 迁移共享 UoW。
- **I150 范围细纲修复风险**：选中节只能从当前已保存 B5 投影到生成范围；禁止 Client 猜测 ID、自动保存脏草稿、覆盖已有卡或把中文展示值写入 canonical 枚举。append guidance 是显式 LLM 意图，不得静默改变既有 fill-missing 调用语义。
- **I151 编号风险**：后置 v3.2 原 I151–I162 与当前 I151 存在历史同号，所有后置引用必须显式带“v3.2 原”或 F1/F2 卡号；未重新编号前禁止实施。
- **I151 首次导入初始化风险**：禁止把 app 启动、`projectOpen` 或“B1/B4 为空”当作初始化触发器，否则每次打开都可产生新模型输出。one-shot checkpoint 必须绑定首次 import operation；LLM 规则初稿必须 `immutable:false`，否则与“后续用户手工改写”矛盾。B1/B4 成功后只读写 `rules/*.yaml`/`style.yaml`，不得建立第二真相或日常重生成入口。
- **后置 F1 重构风险**：结构化来源必须保持旧 text/chunks 投影；UoW 恢复不得创建第二领域 owner。未恢复排期前禁止夹带 preserve-prose、修改 prompt/gold/阈值或改变 Stage 19 wire/产品语义。
- **后置 F2 正文保真风险**：C5 content 只能由 Host 受控原文范围构造；LLM 返回任何 C5 文本均视为合同错误。规范化、标题拆分、双预览与 apply 必须证明无丢段、重排、改写或重复；非空项目继续 fail closed，富文本/批注/修订不在保真承诺内。
- **大文件拆分风险**：I82/I83 拆 `client.ts` 时保持 DOM 契约与既有测试锚点不变，测试迁移分批提交；禁止一迭代内同时改实现与语义。
- **范围蔓延风险**：重构迭代禁止夹带新功能或领域语义调整；超范围想法记 backlog。
- **命名统一风险**：I84 只统一内部命名，公开 Remote 服务名不动；需改名的破坏性变更另行立项走兼容迁移。
- **Historical record**：Git 历史保留旧提交；v2.2/v2.3 文档记录旧路线与被退役内部路径，不把死代码留在主分支。
