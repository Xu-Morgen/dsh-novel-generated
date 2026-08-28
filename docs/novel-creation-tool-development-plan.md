# AI 长篇小说创作器 — 开发计划（DSH 插件版）

> 版本：v2.6
> 日期：2026-08-28
> 状态：当前执行权威（**I1–I85 全部完成**；Stage 16 完成，唯一可复现项目 DSH family pin 已由 I85 切换为 `0.1.1-rc.2`；Stage 17 修复迭代 I86–I102 已立项；**Stage 18 新增功能迭代 I103–I112 已立项（v2.6 作者裁决先行执行）**）
> 配套设计文档：`docs/novel-creation-tool-design.md` v2.4（本计划是它的执行层）
> 配套需求权威：`docs/novel-creation-tool-requirements.md` v2.5（需求 ID、验收、迭代覆盖）
> 重构立项输入：`docs/novel-creation-tool-architecture-review.md` v1.0（review record，非设计权威；Stage 15 依据其 §9 路线图）；`docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md` v2.0（Stage 17 依据其 §9.2 优先级表）

---

## 0. 文档头与 v1.x supersession

### 0.1 本版变更

- 历史 v1.x（v1.1–v1.4，I1a–I28b2，独立 Node/Vite 应用路线）**整体失效**，仅保留为 provenance；不再作为当前排期、执行、验收或完成声明依据。
- 本项目当前唯一身份是 **DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin**，宿主基线不可修改（见设计 §0.1）。
- I1–I85 已完成：插件核心、创作台、多作品启动、六层初始化、侧板化、正文写作闭环、能力可达性、剧情时间线、Stage 15 架构债务消除与 Stage 16 DSH family `0.1.1-rc.2` 兼容升级均已有独立提交与验证证据；不得再将 I1–I85 标为待执行。
- 排期扩展为 **16 个阶段、85 个迭代（I1–I85）**。v2.4 新增 **Stage 16 / I85 DSH family `0.1.1-rc.2` 兼容升级**：把唯一可复现项目 DSH family pin 从 `0.1.0-rc.7` 原子切换为 `0.1.1-rc.2`（manifest/profile/lockfile 同步），并以真实 base+web+plugin、Client ModuleLoader/Slot、Typert Remote、Tools 与 `ctx.llm` 兼容门验证；I85 完成前运行时观测与项目 pin 分离，完成后唯一项目 pin 即 `0.1.1-rc.2`。
- v2.5（2026-08-28）：I85 完成后，按 review v2.0（`docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`）§9.2 优先级表把其中**中级以上（高 / 中-高 / 中）**审查问题立项为 **Stage 17 修复迭代 I86–I102**，紧接 I85 之后按 P0 紧急 → P1 高 → P2 中-高/中 → P3 中-高/中 顺序排期；原 I85 后的 R18 新增功能候选迭代 **I86–I95 延后至全部修复迭代之后，顺延重编号为 I103–I112（Stage 18）**，仍为未排期候选占位；review v2.0 其余中-低/低项继续留 backlog（§21）。除 I100（公开 Remote 命名统一，独立兼容迁移迭代）外，修复迭代不改变领域契约与公开 Remote/wire 形状。
- v2.6（2026-08-28）：**作者裁决正式立项 Stage 18 新增功能迭代 I103–I112（R18 候选全部转正）**并先行执行（Stage 17 修复迭代继续排期、不受影响）；需求文档 §0.4 更新当前迭代身份，正式 verify 命令分配为 `verify:i103`–`verify:i112`、阶段门 `verify:stage-18`，每迭代单独 commit 并按 AGENTS.md §2/§3 纪律执行；任何迭代都不改变 §0.1 宿主基线、公开 Remote/wire 契约形状与既有 13 层模型。

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
| DSH | 当前运行时观测 `0.1.1-rc.2`；项目 manifest/profile/lockfile pin 仍为 `0.1.0-rc.7`，I85 完成完整兼容门后才切换唯一项目 pin | 设计 §0.1.3 / D20 / D23 |
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

### 0.7 全局执行纪律（贯穿 I1–I85）

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

## 19. 阶段 18：新增功能迭代（R18 立项，I103–I112）

**阶段门**：`pnpm run verify:stage-18`（I103–I112 全绿）。

> 定位：v2.4 期间按「专业作者视角评审」产出、经作者逐项裁决的后续迭代计划（需求权威 `requirements.md` R18，设计要点 `design.md` §14.14）。**v2.6（2026-08-28）作者裁决正式立项为 Stage 18 迭代 I103–I112**（v2.5 由原 I86–I95 顺延重编号），已纳入需求文档 §0.4 当前迭代身份并分配正式 verify 命令（`verify:i103`–`verify:i112`）；每迭代单独 commit，按 AGENTS.md §2/§3 执行纪律（一迭代一任务、DoD、验证命令）。任何迭代都不改变 §0.1 宿主基线、公开 Remote/wire 契约形状与既有 13 层模型。
>
> 立项说明：本阶段原编号 I86–I95 位于 I85 之后；v2.5 依据 review v2.0 立项 Stage 17 修复迭代（I86–I102）并顺延重编号为 I103–I112；**v2.6 作者裁决在 Stage 17 之前先行执行 Stage 18**（Stage 17 修复迭代继续排期，不受影响）。
>
> 产品方向定调（作者裁决）：**导入大纲 → AI 按大纲推导细纲 → 自动生成首版正文 → 作者仅微调 → 发布**。据此「继续写作首页」「富文本/专注编辑器」「笔记素材库」「DOCX 编译」明确不立项（requirements N-10–N-13）；正文编辑保持轻量，交付以 Markdown 为准。

### I103：场景/章节管理（R18-1，候选）

- **目标**：GUI 补齐章节与场景的完整组织能力：新建/重命名/删除/排序章节与场景、章节标题/POV/状态、场景摘要与 notes 编辑、场景↔细纲场景卡绑定、生成候选落点选择。
- **明确不做**：不引入富文本编辑器；不改 C5 存储 Schema 与既有公开 Remote/wire 形状；不改变写作候选合同。
- **交付物**：章节/场景 CRUD 与排序 Remote 接线（复用 `createChapter`/`appendScene` 等既有 Domain Service）；Client 章节树/场景列表增强（编辑、排序、落点选择）；空作品引导态文案更新。
- **验收**：CRUD/排序 round-trip；场景↔细纲卡绑定校验（悬空引用拒绝）；候选落点选择生效；`pnpm test` 全绿；公开契约形状不变。
- **验证**：`pnpm run verify:i103`。

### I104：生成变更逐层预览（R18-2，候选）

- **目标**：接受生成候选或重解析前，展示 C1/C2/C3/C4/B2 将发生的逐层结构化变更（旧值→新值），接受后自动回扫确认。
- **明确不做**：不改变既有候选/裁决合同形状；不隐式写层。
- **交付物**：Host 层变更预览投影（每层旧值→新值，有界 JSON）；Client 预览面板（候选审阅内）；接受后回扫确认。
- **验收**：预览与实际写回一致；未确认零写；预览投影无完整 live object 泄漏；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i104`。

### I105：审校→定位→修复闭环（R18-3，候选）

- **目标**：审校问题卡一键定位到章节/场景/文本范围，从问题卡直接发起修复候选（rewrite 语义），接受后自动回扫并标记 resolved。
- **明确不做**：不改检测器阈值/样本；不自动接受；硬冲突仍阻止接受。
- **交付物**：审校问题→正文定位跳转（衔接 R18-8 链接模型）；问题卡内「发起修复候选」；修复接受后自动回扫与 resolved 标记。
- **验收**：问题定位准确；修复候选复用既有 candidate 合同与 Gate；接受后回扫状态正确；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i105`。

### I106：单章三种可选润色（R18-4，候选）

- **目标**：正文区提供三种可选润色操作（建议：语言润色 / 压缩精简 / 扩写细节，启动时与作者最终确认），只作用于当前章节，产出候选先审阅后落盘。
- **明确不做**：不做全书批量润色；不改 candidate 合同；硬约束校验仍生效。
- **交付物**：三种润色 intent 的候选入口；复用既有校验→裁决→写回。
- **验收**：三种润色均产候选且零写；接受后逐字落盘；拒绝零写；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i106`。

### I107：自动引用联动（R18-5，候选）

- **目标**：角色/关系/知情引用由系统自动维护，作者不手填 ID；角色与关系单调线性变化、知情事实单调新增；自动更新在审查页可见，作者可标记错误更新并发起对话让 LLM 修正内部库。
- **明确不做**：不改变 C1.knownTo / C3 知情边界语义；不提供作者手动编辑 ID 列表的入口；不改 13 层 Schema。
- **交付物**：自动引用维护器（引用随角色/关系/知情更新自动同步）；「自动更新审查页」（按层列出自动更新、可标记错误）；LLM 修正回路（对话驱动的内部库修正，写回仍走 ConfirmationGate）；移除时间线/大纲/关系面板的 `listField` ID 输入。
- **验收**：单调性不变式（角色/关系线性、知情新增）；手填 ID 入口移除扫描；审查页错误标记与 LLM 修正 E2E；修正写回经 Gate；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i107`。

### I108：长稿导入→大纲循环工作流（R18-6，候选）

- **目标**：已有长稿先拆为大纲；循环 = AI 按大纲推导细纲 → 生成首版正文 → 作者微调保存 → 下一章基于细纲 + 作者修订后的正文继续。
- **明确不做**：不静默合并结构层；不做 ST 迁移（N-1）；导入拆大纲候选仍走 ConfirmationGate。
- **交付物**：长稿→大纲拆分候选入口（复用 I38 拆分 agent 思路）；循环工作流的写作上下文保证（下一章注入细纲 + 已修订正文）；工作流引导文案。
- **验收**：长稿拆分候选经 Gate 落地；下一章生成消费「细纲 + 作者修订后正文」；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i108`。

### I109：术语替换（R18-7，候选）

- **目标**：把创作台所有面向作者的 UI 文案中的工程术语替换为作者可理解语言，不改变任何功能、契约与数据。
- **明确不做**：不改 Host/Client/Remote 契约、wire 形状、Schema 与存储；不改 `novel_*` 工具名与参数（属外部合同）；不建 i18n/多语言框架；不改导航分组结构（R12-5）。
- **交付物**：全文扫描 `src/client/` 作者可见文案并维护替换对照表；文案替换；技术徽标降级到高级视图；错误/空态文案给出可执行下一步。
- **替换对照表（初稿，立项时以全文扫描为准）**：ConfirmationGate→确认后才会同步（设定确认）；C1–C6 徽标→仅高级视图；Remote 未挂载→服务暂时不可用，请重试；entryId/C1 id→名称选择器/自动维护（衔接 R18-5）；派生索引/统计→搜索/统计会自动更新；reparse/parser/fan-out→同步到人物状态与故事事实；proposal/candidate/adjudicate→修改建议/采纳/放弃；sourceHash/baseHash 错配→内容已变化，请刷新后重试。
- **验收**：`data-novel-*` 锚点与 DOM 契约不变；对照表覆盖 100%（扫描确认清单内术语不再出现在作者可见文案）；五个面板（正文编辑、候选审阅、审校中心、知情、时间线）人工走查无术语残留；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i109`。

### I110：上下文跳转链接（R18-8，候选）

- **目标**：角色/关系/知情/审校问题/时间线节点/搜索命中/场景卡之间稳定双向跳转，返回保留上下文。
- **作者裁决硬约束**：① 链接信息不落盘进 Markdown 正文文件；② 作者编辑/优化正文后链接不被破坏或污染正文文本；③ 回传正文后重新分析再链接（假设 Markdown 输出带链接信息且作者不改链接）；④ 最终 txt 导出无链接信息可直接发布。
- **明确不做**：不改 C5 存储 Schema（`scene.content` 仍是纯正文；链接是派生视图/外部索引或阅读态 UI）；不引入富文本/HTML 存储；不做语义向量跳转（N-2）。
- **交付物**：统一实体链接模型（视图 + id + 可选文本锚点）；来源侧跳转入口（审校/搜索/时间线/大纲/统计）；目标侧打开与高亮；返回恢复上下文；回传重链分析；txt 导出无链接回归断言。
- **验收**：五类跳转 E2E（审校→正文、搜索→正文/层、时间线→知情、大纲→角色、统计→正文）；编辑前后导出 Markdown 正文字节不变；回传重链成功且原文逐字保留；txt 无链接残留；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i110`。

### I111：操作模式分层（R18-9，候选）

- **目标**：正文区按「写作 / AI 候选 / 版本比较 / 场景资料」四个互斥模式页签展示，同一时间只展开一个，解决候选/版本/追踪/校验垂直堆叠过长。
- **明确不做**：不改候选/裁决/版本/追踪的 Host 合同与行为；不新增视图或导航项；不做富文本编辑（N-12）。
- **交付物**：四个互斥模式页签（写作 = 编辑器 + 保存/重解析 + 场景元数据；AI 候选 = 现有 candidatePanel 移入；版本比较 = 现有 branchPanel 移入；场景资料 = summary/细纲卡/beats/canonEvents/notes 只读视图）；候选/硬冲突提醒徽标；键盘切换（保持 I59 纪律）。
- **验收**：四模式互斥（同一时间只显示一个）；候选就绪徽标出现、裁决后清除；既有 `data-novel-candidate-*`/`data-novel-branch-*`/`data-novel-scene-*` 锚点保留（仅移动容器），client 测试迁移等价全绿；就绪场景单屏可完成写作/裁决/对比任一动作；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i111`。

### I112：场景版本聚合视图（R18-10，方案 B，候选）

- **目标**：把全部场景的版本历史汇总为「章节→场景→版本」树，任意场景可切换/对比；不做全书快照与修订线。
- **明确不做**：不做全书级快照与修订线（方案 A/C 排除）；不改 C5 版本 Schema（`scene.branches` 语义不变）。
- **交付物**：Host 聚合投影（章节→场景→版本树，复用 `novelBranches`）；Client 聚合视图（任意场景切换/对比、版本徽标）；与既有分支面板的导航关系。
- **验收**：聚合树与各场景 `branches` 一致；切换/对比行为与既有分支面板等价；chosen 唯一不变式保持；`pnpm test` 全绿。
- **验证**：`pnpm run verify:i112`。

---

## 20. 完成线

I1–I85 均已完成：I45 完成 v2.0 核心闭环，I49 完成首轮创作台 UI，I53 完成 v2.1 作品启动与六层初始化，I59 完成停靠侧板与现有 UI 修复，I65 完成 P0 正文写作闭环，I72 完成 P1 能力可达性，I74 完成剧情时间线，I84 完成 Stage 15 架构债务消除，**I85 完成 Stage 16 DSH family 兼容升级：唯一可复现项目 DSH family pin 已从 `0.1.0-rc.7` 切换为 `0.1.1-rc.2`**。

v2.6 起当前排期：**Stage 18 新增功能迭代（I103–I112）为当前执行**（2026-08-28 作者裁决先行执行，见 §19）；Stage 17 修复迭代（I86–I102）继续排期，随后执行。

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

语义向量检索、C2 items/factions/globalFlags、ST 迁移、已有非空作品合并导入、novel 自有主题引擎、C3 revealAt 直接引用时间线节点 id 的联动，以及 review v2.0 其余中-低/低项（validator 骨架、仓储 primitive、import 格式 descriptor 等）继续后置为 backlog；公开 Remote 服务的破坏性改名（`novelImport`/`novelImportExport`/`novelExport` 三服务合并）已由 **I100** 立项（兼容迁移，见 §18）。

---

## 21. Risks 与 Retirement

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
- **契约漂移风险**：I77/I78 改变 wire 形状推导方式时，必须以 strict codec wire smoke 证明形状等价；禁止继续在接线层以补丁掩盖契约不匹配。
- **大文件拆分风险**：I82/I83 拆 `client.ts` 时保持 DOM 契约与既有测试锚点不变，测试迁移分批提交；禁止一迭代内同时改实现与语义。
- **范围蔓延风险**：重构迭代禁止夹带新功能或领域语义调整；超范围想法记 backlog。
- **命名统一风险**：I84 只统一内部命名，公开 Remote 服务名不动；需改名的破坏性变更另行立项走兼容迁移。
- **Historical record**：Git 历史保留旧提交；v2.2/v2.3 文档记录旧路线与被退役内部路径，不把死代码留在主分支。
