# AI 长篇小说创作器 — 开发计划（DSH 插件版）

> 版本：v2.1
> 日期：2026-08-24
> 状态：当前执行权威（I1–I49 已交付；Stage 10 I50–I53 待执行）
> 配套设计文档：`docs/novel-creation-tool-design.md` v2.1（本计划是它的执行层）
> 配套需求权威：`docs/novel-creation-tool-requirements.md` v2.1（需求 ID、验收、迭代覆盖）

---

## 0. 文档头与 v1.x supersession

### 0.1 本版变更

- 历史 v1.x（v1.1–v1.4，I1a–I28b2，独立 Node/Vite 应用路线）**整体失效**，仅保留为 provenance；不再作为当前排期、执行、验收或完成声明依据。
- 本项目当前唯一身份是 **DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin**，宿主基线不可修改（见设计 §0.1）。
- 当前排期为 **11 个阶段、53 个迭代（I1–I53）**：I1–I49 已建立插件核心与创作台；v2.1 新增阶段 10（I50–I53），补齐作品启动、多作品选择、受控 DOCX 上传、六层初始化分析与逐层确认落地。

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
| DSH | `0.1.0-rc.7` 观测基线，I1 在 manifest+lockfile 建立可复现 pin | 设计 §0.1.3 |
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

### 0.7 全局执行纪律（贯穿 I1–I53）

1. 一迭代一任务、一次干净 commit；失败即阻塞下一迭代。
2. 确定性迭代必须含：正向断言 + 负向断言 + 脚本化 smoke；schema/存储地基切片必配下游消费者夹具。
3. 集成点先 mock/fake，再换真实；LLM 集成先 fake backend/mock parser 跑通管道。
4. LLM 样本优先：改 prompt/schema 前先建/更新样本集及 held-out；gold 不可变，低于阈值即失败。
5. 阈值：硬检测器 canonical 违规 100% 命中 + 整体 ≥90%；正史解析 ≥85%；其他 LLM ≥80%。
6. I11 起所有「用户确认」复用 ConfirmationGate；未确认不写回，重复确认幂等。
7. 安装/卸载/装载 smoke 使用一次性 `DSH_HOME` 与测试 profile，不污染现有 profile。
8. 提交自检：`git status` 只含本迭代文件；`git diff` 无 console.log/临时文件/死代码；无真实 key。
9. 阶段收尾跑全量 `pnpm test` + 本阶段全部 held-out 回归 + `pnpm run verify:stage-N`。

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
- **交付物**：`shell.overlay` 创作台面板（折叠/关闭）、`sidebar.footer.action` 启动入口、`src/client/styles.ts` 包内样式（消费 `--dsw-alias-*`）、`el()` 助手与组件基础、六层空态占位、迁移后的测试锚点。
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

## 12. 完成线

I45 通过时 v2.0 核心闭环完成，I49 通过时创作台 UI 重设计完成，I53 通过时 v2.1 作品启动与六层初始化闭环完成：

- ordinary persistent DSH/Cordis Host+Client 插件可安装、装载、升级、卸载；
- Host 是作品文件与 LLM 唯一 owner；Client 只经 DSH Slot 与受管 Remote 工作；
- A1/A2、B1–B5、C1–C6 共 13 层均有明确契约；
- `生成→校验→裁决→解析→受控写回` 闭环成立；单层事务保持既有原子性，跨层 fan-out 与 Stage 10 初始化按明确的 partial/pending-retry 语义报告；
- 所有用户确认统一经 ConfirmationGate；
- 卸载不删除作品数据且零运行时残留。
- 创作台以「编辑台/书斋」视觉体系 + 六层 IA（B3/B2/B5/C1/C2/C4）提供可识别、美观的分层编辑，复用宿主主题 token 自动明暗适配；
- 多作品由 Host 统一启动，DOCX/自由文本只生成可审阅六层候选，纯空白模式不依赖模型；
- 六层可分别接受、修改后接受、打回重生成或跳过；跨文件部分失败显式为 `partial-retryable`，不以删除已写数据伪造原子性。

导入导出、SQLite 索引、高级编辑器、写作辅助与新作品六层初始化已纳入；语义向量检索、C2 items/factions、ST 迁移、已有非空作品合并导入与 UI 主题继续后置为 backlog。

---

## 13. Risks 与 Retirement

- **Client 公开合同风险**：I2 若无法证明公开 out-of-tree Client bundling/Remote，则按停止线停止，不使用动态 RPC 或 internal builder fallback。
- **DSH 版本漂移**：任何 DSH/Cordis 升级进入专门兼容性迭代，重跑 selected-profile boot 与完整 Client gate。
- **旧路径残留**：旧 I1a/I1b 独立 Vite/浏览器 LLM 路径必须零引用；不保留双主路径兼容层。
- **作品数据安全**：卸载/回退不删除作品 source of truth；只退役 tracked 固定 mock 产物，不触碰未跟踪存档或真实作品目录。
- **创作台 UI 重设计风险**：I46 将测试锚点从 `data-novel-editors` 迁移到新契约并重写 `client.test.ts`；I33–I36 既有 Host 契约（`novelWorkspace` Remote）不得回退，样式必须归属 Fiber 并在卸载后归零。
- **作品启动风险**：I50 必须由 Host project lifecycle 统一证明 readiness；禁止在 Client、Remote 转发层或六个面板增加各自的自动建目录/吞错 fallback。现有 `default` 与重复 ConfirmationService owner 在 I50 主路径通过后 delete-first 退役。
- **DOCX 安全与退役**：I51 的临时上传只属派生数据；真实作品文件不可删除。成熟解析器主路径通过后删除手写 parser 并扫描零引用，不保留兼容双路径。
- **六层推断风险**：I52–I53 只面向新建/空作品，C4 仅允许文本明确事件，C3 始终禁止；未确认候选零写，跨层引用先预检，跨文件失败必须可重试而非补偿性删除。
- **Historical record**：Git 历史保留旧提交；v2.1 文档记录旧路线与被退役内部路径，不把死代码留在主分支。
