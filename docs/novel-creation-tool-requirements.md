# AI 长篇小说创作器 — 需求与覆盖权威

> 版本：v2.2
> 日期：2026-08-26
> 状态：当前需求、验收与迭代覆盖权威
> 产品身份：DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin；DSH 是唯一宿主

## 0. 权威、优先级与溯源

### 0.1 当前权威引用

权威优先级如下；发生冲突时，前者优先：

1. `docs/novel-creation-tool-design.md` v2.2：产品与架构设计权威，尤其是 §0.1 宪法级宿主基线。
2. 本文件 v2.2：需求 ID、验收证据、迭代覆盖与非目标权威。
3. `docs/novel-creation-tool-development-plan.md` v2.2：I1–I74 的执行卡片、交付物与命令细节。
4. `AGENTS.md` v2.2：执行纪律。
5. `docs/aegis/plans/2026-08-19-dsh-plugin-baseline-reset.md`：本次基线重置的决策与任务 provenance，不替代前三项产品权威。

### 0.2 v1.x supersession 与 provenance

- 本文件完全取代历史 v1.4 覆盖文档。v1.1–v1.4 保留的价值仅是需求来源 provenance：13 层、核心引擎、ConfirmationGate、创作环境、样本治理、受控写回和规模 smoke 等产品要求继续有效。
- v1.x 的独立 Node/Vite 应用、浏览器 LLM、旧里程碑和旧迭代编号已经失效；历史 `I1a–I28b2` 不得用于当前排期、执行、验收或完成声明。
- 当前迭代身份只有本文件定义的 **I1–I74**：I1–I53 已完成，I54–I72 已批准，I73–I74 剧情时间线（R15）已批准。任何保留需求必须能追溯到其中至少一个迭代和一个精确验证命令。
- H0 是宪法级最高优先级。H0 未满足时，不得以任何 R0–R14 产品能力的通过抵消；I2 兼容性门失败时必须执行停止线。

### 0.3 统一验收纪律

1. 单迭代验证命令固定为 `pnpm run verify:iN`；阶段累积验证固定为 `pnpm run verify:stage-N`。表中列出的命令是最低证据，不得用手工演示替代。
2. 每项验收必须同时包含正向断言、相关负向断言和可检查产物；地基切片还须有下游消费者夹具。
3. LLM 集成先以 fake backend/mock parser 做确定性接线，再跑真实模型样本。所有 LLM 调用只能走 Host 的 `ctx.llm`；禁止直接调用 OpenAI/Anthropic/兼容 endpoint，禁止读取或传递直接 API key。
4. 硬检测器：canonical 违规样本 **100% 命中**且整体准确率 **≥90%**；正史解析器准确率 **≥85%**；其他 LLM 模块准确率 **≥80%**。
5. 样本、held-out 子集和 gold 均为不可变验收资产；不得为过关修改样本、held-out、gold 或阈值。dev 可用于调优，held-out 只用于收尾验收。
6. **LLM 样本优先是规范性顺序**：任何 prompt/schema 变更前必须先建立或更新样本集及其 held-out 子集，再实施变更并运行样本回归；回归低于既定 gold/阈值即失败，不得降低阈值或改写不可变样本过关。此横切纪律逐迭代纳入回归义务：I17—`pnpm run verify:i17`；I21—`pnpm run verify:i21`；I22—`pnpm run verify:i22`；I24—`pnpm run verify:i24`；I25—`pnpm run verify:i25`；I26—`pnpm run verify:i26`；I27—`pnpm run verify:i27`；I28—`pnpm run verify:i28`；I29—`pnpm run verify:i29`；I38—`pnpm run verify:i38`；I41—`pnpm run verify:i41`；I42—`pnpm run verify:i42`；I43—`pnpm run verify:i43`；I44—`pnpm run verify:i44`；I45—`pnpm run verify:i45`；I52—`pnpm run verify:i52`；I62—`pnpm run verify:i62`。
7. 所有用户确认复用 I11 ConfirmationGate。未确认不得写回；重复确认必须幂等。
8. 每个迭代只有在对应 `verify:iN` 通过后才可完成；每个阶段只有在全部迭代验证和 `verify:stage-N` 通过后才可完成。

### 0.4 v2.2 阶段与验证命令

| 阶段 | 迭代 | 累积门 |
|---|---|---|
| Stage 0 宿主合同门 | I1–I2 | `pnpm run verify:stage-0` |
| Stage 1 数据与核心原语 | I3–I11 | `pnpm run verify:stage-1` |
| Stage 2 上下文与生成 | I12–I19 | `pnpm run verify:stage-2` |
| Stage 3 一致性 | I20–I24 | `pnpm run verify:stage-3` |
| Stage 4 解析与受控写回 | I25–I30 | `pnpm run verify:stage-4` |
| Stage 5 配置与内部 Extension | I31–I32 | `pnpm run verify:stage-5` |
| Stage 6 DSH Slot 创作工作区 | I33–I36 | `pnpm run verify:stage-6` |
| Stage 7 导入、可移植与索引 | I37–I40 | `pnpm run verify:stage-7` |
| Stage 8 索引分类与写作辅助 | I41–I45 | `pnpm run verify:stage-8` |
| Stage 9 创作台 UI 重设计 | I46–I49 | `pnpm run verify:stage-9` |
| Stage 10 作品启动与六层初始化 | I50–I53 | `pnpm run verify:stage-10` |
| Stage 11 侧板化与现有 UI 修复 | I54–I59 | `pnpm run verify:stage-11` |
| Stage 12 P0 正文写作闭环 | I60–I65 | `pnpm run verify:stage-12` |
| Stage 13 P1 能力可达性 | I66–I72 | `pnpm run verify:stage-13` |
| Stage 14 剧情时间线 | I73–I74 | `pnpm run verify:stage-14` |

---

## H0. 宪法级宿主要求（最高优先级）

| ID | 规范性要求 | 可机器验收与证据 | 计划迭代 | 精确验证 |
|---|---|---|---|---|
| H0-1 | 发布 package 必须是**所选 DSH profile 的 `package.json` 依赖**；权威 lockfile 锁定其解析版本。不得依赖 home patch 的虚构独立依赖目录。 | manifest/lockfile 断言 package 从 selected profile dependency chain 解析；删除依赖后 boot 必须失败。 | I1 | `pnpm run verify:i1`; `pnpm run verify:stage-0` |
| H0-2 | 本项目选择唯一 **bundle path**：package manifest 声明 `dsh.bundle.patch`，且同一 package 明确列入所选 profile 的有序 `dsh.profile.bundles`。plugin row 只能有一个 insertion owner；不得再由 profile/home patch 重复插入。仓库 `cordis.yml` 仅可用于本地 Loader smoke。 | 静态检查 manifest/profile；selected-profile boot 断言仅一个 row；重复 owner 夹具必须失败；仅安装而未列 bundle 时不得激活。 | I1 | `pnpm run verify:i1`; `pnpm run verify:stage-0` |
| H0-3 | 交付物必须是 ordinary persistent Cordis Plugin：npm/仓库 package 与 composition 配置跨 DSH 重启存在。动态 `cordis_define` 只可临时原型，绝非安装、发布或生产装载路径。 | 安装→启动→停止→DSH 重启→再次启动 smoke 均由 selected profile 完成；发布文件与脚本零动态定义依赖。 | I1 | `pnpm run verify:i1`; `pnpm run verify:stage-0` |
| H0-4 | Host 是作品文件 I/O、路径、YAML/jsonl、SQLite、凭据、`ctx.llm`、领域 Service/Event/Tool、导入导出和业务校验的唯一 owner；Client 不得持有领域真相。 | Host service 契约测试；Client bundle 负向扫描禁止 file/secret/LLM endpoint；越权调用被拒绝。 | I1, I2 | `pnpm run verify:i1`; `pnpm run verify:i2`; `pnpm run verify:stage-0` |
| H0-5 | Client 只拥有注册到经核验 DSH Web GUI Slot 的视图、交互状态和视图适配，并只使用已证明的公共 Host–Client 合同。 | 最小 probe 只注册一个 Slot；无文件、凭据、领域实现；卸载后 Slot 消失。 | I2 | `pnpm run verify:i2`; `pnpm run verify:stage-0` |
| H0-6 | Service、Event、Tool、Slot、样式、监听、任务及全部副作用必须归属当前 Cordis Fiber；停止、更新、卸载后完整 dispose。 | 生命周期测试记录注册数归零；stop/restart 后不得重复监听或残留 UI/Service。 | I1, I2 | `pnpm run verify:i1`; `pnpm run verify:i2`; `pnpm run verify:stage-0` |
| H0-7 | **I1 严格 Host-only**：只建立 package/profile/bundle/Host Service/Fiber 地基；不得产生 Client 代码、Client seam、probe、产品 UI、伪 RPC 或 standalone fallback。 | I1 构建产物和源码负向扫描无 client/Slot/Remote/UI 入口；Host selected-profile lifecycle smoke 通过。 | I1 | `pnpm run verify:i1`; `pnpm run verify:stage-0` |
| H0-8 | **I2 仅为 gate-only Client probe**：只证明公共 client bundle、公共 Remote、selected-profile boot、单一 Slot 注册与 Fiber 卸载；probe 必须非产品、不得演化为工作区。 | 真实 package build + selected-profile boot + 单一 Slot mount/unmount smoke；产品术语、领域读取/写入和多 Slot 均为负向失败。 | I2 | `pnpm run verify:i2`; `pnpm run verify:stage-0` |
| H0-9 | **公共合同停止线**：I2 必须证明受支持的普通 out-of-tree plugin 公共 Remote 与 client bundling/装载合同。不得使用动态 `harness.handle`/`host.call`，不得以内置或未发布 builder/`clientBundle` API fallback。证明失败即 I2 失败，禁止开始 I33–I36 及任何产品 Client 工作。 | 依赖/API allowlist 与 forbidden-symbol 扫描；公开 contract 集成 smoke；缺公共合同夹具必须 fail closed，且产品 Client 构建任务保持阻塞。 | I2 | `pnpm run verify:i2`; `pnpm run verify:stage-0` |
| H0-10 | 禁止 standalone UI：无独立 HTML、`createRoot()` 自挂载、独立 SPA/Vite server 或第二主路径；禁止浏览器直连 LLM、直接文件访问、长期 key/secret。 | repository 与 Client bundle 负向扫描；核心能力只能在现有 DSH GUI/Host 中启动。 | I1, I2, I33 | `pnpm run verify:i1`; `pnpm run verify:i2`; `pnpm run verify:i33`; `pnpm run verify:stage-0`; `pnpm run verify:stage-6` |
| H0-11 | 工具链 pin：Node.js **22+**、pnpm、TypeScript strict、ESM；项目 manifest 固定 DSH family/Cordis 兼容范围，lockfile 固定精确解析版本。 | engines/packageManager/type/module/tsconfig/lockfile 静态断言；Node 低版本、npm lock、CJS 输出夹具失败。 | I1 | `pnpm run verify:i1`; `pnpm run verify:stage-0` |
| H0-12 | 必须具备可重复的 install/build/selected-profile boot/stop/restart 验证；stop 后消失，restart 后恰好恢复一次。 | 干净安装、Host build、首次 boot、stop、同进程 restart、DSH 重启后 boot 的脚本日志与断言。 | I1, I2 | `pnpm run verify:i1`; `pnpm run verify:i2`; `pnpm run verify:stage-0` |

---

## R0. 产品身份与总体目标

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R0-1 | 产品解决扁平聊天范式的无状态、无时间线、无正史、无知情边界和长线漂移问题。 | Stage 4 walkthrough 展示正文接受后 C1/C2/C3/C4 结构化累积，而非只追加聊天文本。 | I19, I30 | `pnpm run verify:i19`; `pnpm run verify:i30`; `pnpm run verify:stage-4` |
| R0-2 | 产品等于结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链，并且只作为 DSH 插件运行。 | Host pipeline、Slot 工作区和写作工具的累积 smoke 全部在 selected profile 内完成。 | I1, I19, I33, I45 | `pnpm run verify:i1`; `pnpm run verify:i19`; `pnpm run verify:i33`; `pnpm run verify:i45`; `pnpm run verify:stage-8` |
| R0-3 | 支持短篇快起稿、长篇一致、多视角不串味、生成可校验四种核心使用形态。 | 四个固定场景分别证明快速生成、跨章状态保持、POV 过滤和硬/软校验。 | I19, I22, I24, I30 | `pnpm run verify:i19`; `pnpm run verify:i22`; `pnpm run verify:i24`; `pnpm run verify:i30`; `pnpm run verify:stage-4` |
| R0-4 | 设计目标必须保持：长线一致、叙事可控、多视角安全、可解释可回滚、模型无关、可移植。 | 分别由正史/状态、大纲、KnowledgeFilter、快照/审计、A2 配置、包导入导出契约覆盖。 | I4, I5, I15, I18, I31, I39 | `pnpm run verify:i4`; `pnpm run verify:i5`; `pnpm run verify:i15`; `pnpm run verify:i18`; `pnpm run verify:i31`; `pnpm run verify:i39`; `pnpm run verify:stage-7` |
| R0-5 | 本地单用户、中文优先；不引入多用户服务或模型微调要求。 | 中文项目夹具端到端通过；无账户/租户/训练 pipeline。 | I3, I19 | `pnpm run verify:i3`; `pnpm run verify:i19`; `pnpm run verify:stage-2` |

## R1. 三轴与 13 层数据模型

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R1-A1 | A1 引擎核心：统一 Host Service 读写、Schema、流水线和 `{{user}}`/`{{pov}}` 宏；Client/Extension 不得绕过。 | 宏展开无残留；受控 Service 消费者夹具；越权路径失败。 | I1, I3, I12 | `pnpm run verify:i1`; `pnpm run verify:i3`; `pnpm run verify:i12`; `pnpm run verify:stage-2` |
| R1-A2 | A2 可插拔系统：模型/采样、PromptTemplate、InstructPreset、主题与内部 Extension 配置可替换。 | 配置切换不改上层调用；SecretRef 不出 Host；注册表生命周期可测试。 | I31, I32 | `pnpm run verify:i31`; `pnpm run verify:i32`; `pnpm run verify:stage-5` |
| R1-B1 | B1 规则层含 scope/kind/priority/immutable/examples；immutable 是硬约束输入。 | YAML round-trip、非法值拒绝、检测器消费夹具。 | I7, I13, I21 | `pnpm run verify:i7`; `pnpm run verify:i13`; `pnpm run verify:i21`; `pnpm run verify:stage-3` |
| R1-B2 | B2 世界观含 kind/title/keywords/triggerMode/parent/mutable/status/supersededBy/version，支持触发注入和确认式改写。 | keyword/regex/constant 注入；改写生成新版本并经 Gate；vector 触发延后。 | I8, I13, I29, I34 | `pnpm run verify:i8`; `pnpm run verify:i13`; `pnpm run verify:i29`; `pnpm run verify:i34`; `pnpm run verify:stage-6` |
| R1-B3 | B3 角色核心含性格/背景/动机/能力/口吻/弧光，必须与 C2 可变状态分离。 | Schema 快照断言无 C2 可变字段混叠；编辑与 serializer round-trip。 | I9, I13, I34 | `pnpm run verify:i9`; `pnpm run verify:i13`; `pnpm run verify:i34`; `pnpm run verify:stage-6` |
| R1-B4 | B4 风格含人称/时态/POV/文风/章节格式/禁用表达，可全局设定和章节覆盖。 | Schema、恒定 serializer、forbidden 检查和覆盖优先级断言。 | I10, I13, I20 | `pnpm run verify:i10`; `pnpm run verify:i13`; `pnpm run verify:i20`; `pnpm run verify:stage-3` |
| R1-B5 | B5 大纲预设含结构、幕、beat、伏笔、结局候选；细纲是 beat 的 detailBeats 子结构而非第 14 层。 | 嵌套 Schema/引用负测；场景卡含 pov/wordTarget/points/status。 | I14, I35, I43 | `pnpm run verify:i14`; `pnpm run verify:i35`; `pnpm run verify:i43`; `pnpm run verify:stage-8` |
| R1-C1 | C1 关系含 from/to/type/affinity/trust/milestones/knownTo；`knownTo` 只表达关系公开性。 | 边界注释与契约测试；范围校验；摘要注入；解析机械应用。 | I16, I27, I35 | `pnpm run verify:i16`; `pnpm run verify:i27`; `pnpm run verify:i35`; `pnpm run verify:stage-6` |
| R1-C2 | C2 当前交付子集含基础 id/version/seq/storyTime、scene 与 characters；快照 seq 单调、可事务、diff、回滚。items/factions/globalFlags 仍是目标模型但按 N-8 后置，不得由 Stage 10 偷渡。 | 当前 Schema round-trip；非法 seq/引用失败；事务失败不产生半快照；Client/初始化输出无未交付扩展字段。 | I4, I25, I36, I50, I52 | `pnpm run verify:i4`; `pnpm run verify:i25`; `pnpm run verify:i36`; `pnpm run verify:i50`; `pnpm run verify:i52`; `pnpm run verify:stage-10` |
| R1-C3 | C3 揭示/知情含 fact/holders/revealPlan/KnowledgeState；知情只增不可倒退。 | 逆向 status/holder 删除失败；POV 过滤和 parser 复用同一不变量。 | I18, I22, I28 | `pnpm run verify:i18`; `pnpm run verify:i22`; `pnpm run verify:i28`; `pnpm run verify:stage-4` |
| R1-C4 | C4 正史为 append-only CanonEvent，seq 单调；更正只可新增 supersedes 事件并确认。 | 旧行改写失败；查询/追加/更正/低置信确认测试；UI 只读。 | I5, I26, I36 | `pnpm run verify:i5`; `pnpm run verify:i26`; `pnpm run verify:i36`; `pnpm run verify:stage-6` |
| R1-C5 | C5 生成文本按 chapter/scene 存储，可编辑、重写和保留分支；手工固定段范围编辑必须逐字精确持久化。I42 提供可选 reparse 路径，经 ConfirmationGate 确认后调用 I25–I29 parsers，将接受的文本变化同步到 C2/C4 等结构化状态与正史；未选择 reparse 时不得隐式改写其他层。 | Markdown 文本与手工范围内容 exact round-trip；branch chosen 约束；非目标段哈希不变；可选 reparse 未确认时 C1/C2/C3/C4/B2 均不变，确认后 parser fan-out 与逐层受控写回可追溯。 | I6, I25–I29, I42, I43 | `pnpm run verify:i6`; `pnpm run verify:i25`; `pnpm run verify:i26`; `pnpm run verify:i27`; `pnpm run verify:i28`; `pnpm run verify:i29`; `pnpm run verify:i42`; `pnpm run verify:i43`; `pnpm run verify:stage-4`; `pnpm run verify:stage-8` |
| R1-C6 | C6 大纲执行态含 currentBeat/completedBeats/deviations/tension，记录偏差而非强制纠回。 | 进度引用校验；偏差可记录/调和；导航器不自动篡改 B5。 | I15, I35, I45 | `pnpm run verify:i15`; `pnpm run verify:i35`; `pnpm run verify:i45`; `pnpm run verify:stage-8` |

## R2. 核心引擎与 ConfirmationGate

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R2-1 | StateEngine 提供 C2 读写、事务、快照、回滚和 diff。 | 确定性单测覆盖 seq、回滚、diff、事务失败。 | I4 | `pnpm run verify:i4`; `pnpm run verify:stage-1` |
| R2-2 | CanonLedger 提供 append-only、关键词/角色/时间查询和 supersede 通道。 | 旧记录不可变；correction 新增且走 Gate。 | I5, I11 | `pnpm run verify:i5`; `pnpm run verify:i11`; `pnpm run verify:stage-1` |
| R2-3 | OutlineNavigator 定位 beat、检查前置条件、生成导航提示并记录结构性偏差。 | 纯函数夹具覆盖满足/不满足前置条件和偏差。 | I15 | `pnpm run verify:i15`; `pnpm run verify:stage-2` |
| R2-4 | KnowledgeFilter 按 POV 确定性过滤注入信息。 | POV A 不得获得仅 B 持有的条目。 | I18 | `pnpm run verify:i18`; `pnpm run verify:stage-2` |
| R2-5 | RelationshipEngine 是默认关闭的可选内部 relationship-rule Extension；显式启用时可计算 relationship-value changes，并为每项变化记录规则、输入与来源 provenance。parser 始终是默认自动路径中唯一的 C1 writer，禁止第二个默认 writer。 | 默认注册表无关系规则写入且默认路径只有 parser 写 C1；显式启用后，规则计算出的关系值变化及 provenance 可追溯，并经同一事务/领域 Service 应用。 | I32 | `pnpm run verify:i32`; `pnpm run verify:stage-5` |
| R2-6 | ContextAssembler 按层顺序、预算和 serializer 组装，展开宏。 | 相同输入得到确定快照；超预算按既定压缩策略处理。 | I12–I16, I18 | `pnpm run verify:i12`; `pnpm run verify:i13`; `pnpm run verify:i14`; `pnpm run verify:i15`; `pnpm run verify:i16`; `pnpm run verify:i18`; `pnpm run verify:stage-2` |
| R2-7 | NarrativeParser 独立于正文生成，逐层查看、严格结构化输出、机械应用。 | 每个 parser 只接收目标层；非法字段/op 被拒绝；不做二次自然语言解释。 | I25–I29 | `pnpm run verify:i25`; `pnpm run verify:i26`; `pnpm run verify:i27`; `pnpm run verify:i28`; `pnpm run verify:i29`; `pnpm run verify:stage-4` |
| R2-8 | ConsistencyValidator 分离检测与确定性三态裁决，并在生成后和落库前各运行一次。 | hard→拒绝、soft→警告、空→通过；两道关口调用计数可断言。 | I20–I24, I30 | `pnpm run verify:i20`; `pnpm run verify:i21`; `pnpm run verify:i22`; `pnpm run verify:i23`; `pnpm run verify:i24`; `pnpm run verify:i30`; `pnpm run verify:stage-4` |
| R2-9 | ConfirmationGate 是唯一确认原语：propose→pending→accept/reject，幂等且可恢复。 | 未确认不应用、重复确认不重复应用、拒绝后不可应用、重启恢复 pending。 | I11 | `pnpm run verify:i11`; `pnpm run verify:stage-1` |
| R2-10 | **保留的规模 smoke**具有明确 owner：I5 负责 canonical 10k-event latency smoke；I45 负责 ordinary persistent Cordis Plugin 的完整 install→upgrade→uninstall lifecycle smoke；两者分别受 Stage 1 与 Stage 8 累积门约束。 | I5 产出并断言 10,000 CanonEvent 下的既定查询/追加延迟预算与可检查报告；I45 在 selected profile 中完成安装、升级、卸载并断言启停、版本切换、Fiber 清理及卸载后零残留；单迭代和对应阶段门均须通过。 | I5, I45 | `pnpm run verify:i5`; `pnpm run verify:i45`; `pnpm run verify:stage-1`; `pnpm run verify:stage-8` |

## R3. 生成、注入与 LLM

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R3-1 | ContextAssembler kernel 支持固定 section 顺序、serializer 注册、宏和预算。 | prompt snapshot、顺序和预算负测。 | I12 | `pnpm run verify:i12`; `pnpm run verify:stage-2` |
| R3-2 | B3/B2/C2 以角色恒定压缩、世界观触发、状态结构化快照方式序列化。 | 命中/未命中与缺字段夹具；无散文式状态。 | I13 | `pnpm run verify:i13`; `pnpm run verify:stage-2` |
| R3-3 | B5/C6 只注入当前导航目标/细纲卡；C1 注入相关关系摘要；C3 经 POV 过滤；C4/C5 使用近期原文、远期摘要和检索。 | 各层最小上下文快照，不得塞入整本大纲或未授权知识。 | I14–I16, I18 | `pnpm run verify:i14`; `pnpm run verify:i15`; `pnpm run verify:i16`; `pnpm run verify:i18`; `pnpm run verify:stage-2` |
| R3-4 | 正文生成只由 Host 调用 `ctx.llm`，Client 不得选择直接 endpoint/key；模板/模型配置只传受控引用。 | fake `ctx.llm` 接线测试 + 真实 smoke；源码/产物无 OpenAI endpoint、API key 或浏览器 fetch seam。 | I17, I31 | `pnpm run verify:i17`; `pnpm run verify:i31`; `pnpm run verify:stage-5` |
| R3-5 | 完整生成集成读取导航、状态、知情、正史并组装上下文，产出候选 C5 文本。 | 固定夹具改变状态/POV/beat 后 prompt 与候选结果相应改变。 | I19 | `pnpm run verify:i19`; `pnpm run verify:stage-2` |
| R3-6 | 用户裁决支持接受、重写、分支；只有接受内容进入解析写回。 | reject/rewrite 不写层；accept 恰好触发一次 parser fan-out。 | I19, I30 | `pnpm run verify:i19`; `pnpm run verify:i30`; `pnpm run verify:stage-4` |

## R4. 一致性机制

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R4-1 | 确定性 adjudicator 将结构化违规项映射为通过/警告/拒绝。 | hard/soft/empty/非法 severity 全覆盖。 | I20 | `pnpm run verify:i20`; `pnpm run verify:stage-3` |
| R4-2 | B1 immutable 违反和 C4 正史矛盾是硬约束。 | canonical 100% 命中且整体 ≥90%，输出严格 Schema。 | I21 | `pnpm run verify:i21`; `pnpm run verify:stage-3` |
| R4-3 | POV 知情泄漏是硬约束。 | canonical 泄漏 100% 命中且整体 ≥90%，经 adjudicator 为拒绝。 | I22 | `pnpm run verify:i22`; `pnpm run verify:stage-3` |
| R4-4 | 大纲偏差、悬空实体等可确定问题形成软警告。 | 纯函数夹具只产 soft，不阻断。 | I23 | `pnpm run verify:i23`; `pnpm run verify:stage-3` |
| R4-5 | 关系漂移、风格偏离等语义问题形成软警告。 | held-out 准确率 ≥80%，经 adjudicator 为警告。 | I24 | `pnpm run verify:i24`; `pnpm run verify:stage-3` |

## R5. 解析与结构化写回

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R5-1 | C2 parser 输出严格 ops 并由 StateEngine 机械应用。 | 准确率 ≥80%；非法 op/field 拒绝；低置信走 Gate。 | I25 | `pnpm run verify:i25`; `pnpm run verify:stage-4` |
| R5-2 | C4 parser 只追加 CanonEvent；低置信追加必须确认。 | 准确率 ≥85%；任何更新/删除旧正史失败。 | I26 | `pnpm run verify:i26`; `pnpm run verify:stage-4` |
| R5-3 | C1 parser 是默认唯一关系写入机制。 | 准确率 ≥80%；默认路径无 RelationshipEngine 双写。 | I27 | `pnpm run verify:i27`; `pnpm run verify:stage-4` |
| R5-4 | C3 parser 只增知情，不得使 holder/status 倒退。 | held-out ≥80%；知情倒退失败，低置信变更走 Gate。 | I28 | `pnpm run verify:i28`; `pnpm run verify:stage-4` |
| R5-5 | B2 parser 之外，B3/B4/B5/C5 不因正文接受被隐式改写；B2/C1/C2/C3/C4 为明确 fan-out 边界。 | 非目标层哈希保持不变。 | I29, I30 | `pnpm run verify:i29`; `pnpm run verify:i30`; `pnpm run verify:stage-4` |
| R5-6 | B2 世界观由专用 parser 以 supersededBy 改写并确认，且严格逐层。 | held-out ≥80%；未确认改写失败；输入不包含其他层私有对象。 | I29 | `pnpm run verify:i29`; `pnpm run verify:stage-4` |
| R5-7 | 完整生命周期为生成→生成后校验→裁决→逐层解析→落库前校验→受控写回；每个层内业务事务必须原子，但文件式跨层 fan-out 不宣称全局原子。任一层失败须保留已成功层并进入明确 pending-compensation，绝不静默成功或用删除已写数据伪造回滚。 | fake 全管道故障注入 + 真实 e2e；逐层成功/失败清单、pending-compensation 可恢复、拒绝零写与无静默成功。 | I30 | `pnpm run verify:i30`; `pnpm run verify:stage-4` |

## R6. 模型配置与内部 Extension

> **术语硬约束**：Extension 是小说产品内部扩展点，不是 Cordis Plugin，不具有独立宿主、文件、凭据、LLM、composition 或 UI owner 身份。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R6-1 | A2 提供模型引用、采样参数、PromptTemplate、InstructPreset；长期凭据仅为 Host SecretRef。 | 配置持久化/切换测试；Client 序列化结果无 secret；生成只走 `ctx.llm`。 | I31 | `pnpm run verify:i31`; `pnpm run verify:stage-5` |
| R6-2 | 内部 Extension registry 支持 Provider、Injector、Validator、Parser、关系规则和后端策略扩展。 | 每类注册/冲突/卸载测试；重复 ID 拒绝；Fiber dispose 后注册归零。 | I32 | `pnpm run verify:i32`; `pnpm run verify:stage-5` |
| R6-3 | Extension 只能经 Host 注册表和领域 Service 工作，不得直读文件、解析凭据、直调 LLM 或自挂 UI。 | 能力对象 allowlist；越权 Extension 夹具失败；需要视图时只能贡献产品允许的 Slot 内容。 | I32 | `pnpm run verify:i32`; `pnpm run verify:stage-5` |
| R6-4 | UI 主题可作为 A2 配置后置，不阻塞产品工作区；不得引入 standalone shell。 | 无主题时工作区完整可用；主题配置缺失不触发第二 UI。 | I31, I33 | `pnpm run verify:i31`; `pnpm run verify:i33`; `pnpm run verify:stage-6` |

## R7. DSH Slot 创作工作区

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R7-1 | 首个产品 Client 是 I2 门后注册到已核验 DSH Slot 的工作区；只经已证明公共 Remote 调 Host。 | I2 pass 作为构建前置；Slot mount/unmount；无独立页面。 | I33 | `pnpm run verify:i33`; `pnpm run verify:stage-6` |
| R7-2 | B3 角色与 B2 世界观提供列表/详情编辑，保存走 Host 校验与持久化。 | 编辑 round-trip、非法字段错误展示、Client 不直接写文件。 | I34 | `pnpm run verify:i34`; `pnpm run verify:stage-6` |
| R7-3 | B5/细纲与 C1 关系提供精确编辑；细纲仍是 B5 子结构。 | 列表/详情/保存/冲突夹具；不产生第 14 层。 | I35 | `pnpm run verify:i35`; `pnpm run verify:stage-6` |
| R7-4 | C2 提供快照查看与回滚入口；C4 为只读，更正必须走 supersede + ConfirmationGate。 | 回滚后新当前快照正确；直接编辑正史控件不存在且 Remote 拒绝。 | I36 | `pnpm run verify:i36`; `pnpm run verify:stage-6` |
| R7-5 | 工作区可触发生成、重写、续写、灵感，但领域逻辑与任务状态在 Host。 | Client 只发送受控 command；刷新/卸载不丢 Host 状态、不残留监听。 | I33, I42, I44, I45 | `pnpm run verify:i33`; `pnpm run verify:i42`; `pnpm run verify:i44`; `pnpm run verify:i45`; `pnpm run verify:stage-8` |

## R8. 导入、导出、可移植与索引

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R8-1 | Host 确定性读取 txt/md/docx，规范化后交拆分 agent；路径安全、大小和类型受控。 | 三格式 gold 文本一致性夹具；越界路径/伪扩展/损坏 docx 失败。 | I37 | `pnpm run verify:i37`; `pnpm run verify:stage-7` |
| R8-2 | 拆分 agent 分两步产出大纲/世界观候选与 detailBeats；低置信逐条确认，不自动生成 C1/C2/C3/C4。 | 各阶段 ≥80%；候选进入 Gate；非目标层哈希不变。 | I38 | `pnpm run verify:i38`; `pnpm run verify:stage-7` |
| R8-3 | 自定义单文件包导出/导入**全部 11 个作品数据层**（B1–B5、C1–C6）；`shareable-template` 档案排除 C5 文本；可重建项目；round-trip 以规范化语义等价校验，不比较含 `exportedAt` 的字节。 | export→clean import 语义等价；版本、校验和、冲突 diff；破损包失败；A1/A2 不入包。 | I39 | `pnpm run verify:i39`; `pnpm run verify:stage-7` |
| R8-4 | C5 按章节导出 txt/md/docx；设定可导出可读 Markdown/YAML，不锁定专有格式。 | gold 比对含完整开头/结尾/顺序；再次导出确定。 | I39, I43 | `pnpm run verify:i39`; `pnpm run verify:i43`; `pnpm run verify:stage-8` |
| R8-5 | 文件式 YAML/jsonl 是唯一 source of truth；SQLite 仅为不变设定的可重建精确索引。 | 删除 DB 后从文件重建得到等价查询；DB 直接改动不改变源文件。 | I3, I40 | `pnpm run verify:i3`; `pnpm run verify:i40`; `pnpm run verify:stage-7` |
| R8-6 | 索引覆盖 B1 immutable、B2 mutable:false 和已确认分类项；支持增量同步和 supersededBy。 | 重建/增量/删除/更正夹具；悬空 sourceId 失败。 | I40, I41 | `pnpm run verify:i40`; `pnpm run verify:i41`; `pnpm run verify:stage-8` |

## R9. 写作辅助能力

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R9-1 | 分类 agent 对可确认、单一定位、反复引用且不变的设定分类去重，经确认后写索引。 | held-out ≥80%；未确认不入索引；重复候选合并可追溯。 | I41 | `pnpm run verify:i41`; `pnpm run verify:stage-8` |
| R9-2 | 支持固定段/场景局部编辑和快速重写：手工固定范围编辑按用户输入逐字精确持久化且不触碰范围外文本；用户可选 reparse，经 ConfirmationGate 确认后通过 I25–I29 parsers 同步 C1/C2/C3/C4/B2（含 state/canon），不选择或不确认则只保存 C5 文本。 | 手工范围 exact round-trip、目标范围 diff、非目标哈希不变；可选 reparse 的未确认负测与确认后 parser fan-out/逐层受控写回断言；硬约束仍阻断；LLM ≥80%。 | I42 | `pnpm run verify:i42`; `pnpm run verify:stage-8` |
| R9-3 | 支持按章节与 detailBeat `wordTarget` 软引导生成，并导出最终 txt/md/docx。 | 报告字数误差分布而非硬凑字数；完整章节 gold 导出。 | I43 | `pnpm run verify:i43`; `pnpm run verify:stage-8` |
| R9-4 | 续写 agent 基于当前状态/正史/大纲/细纲生成下一段，并进入标准校验→裁决→解析写回流程。 | held-out ≥80%；fake 管道断言写回只发生在接受后。 | I44 | `pnpm run verify:i44`; `pnpm run verify:stage-8` |
| R9-5 | 灵感 agent 给出 2–3 个可区分方向，默认不写正史；选择后调整 B5/C6 必须确认。 | held-out ≥80%；未选择时所有层不变；选择后 Gate 控制大纲/细纲变更。 | I45 | `pnpm run verify:i45`; `pnpm run verify:stage-8` |

---

## R10. 创作台 UI 重设计（视觉与信息架构）

> 历史定位：R10/I46–I49 已完成，记录首轮创作台信息架构与视觉体系；其中居中浮动面板是已交付历史合同，将由 R12/I54 按 D20 退役为 DSH 内停靠侧板。Client 职责边界（H0-5）与 Host 数据所有权（H0-4）继续有效。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R10-1 | 创作台为可识别、美观的分层编辑面板：品牌头栏 + 左侧层级导航 + 内容区，六层一桌（B3/B2/B5/C1/C2/C4）；保留 `shell.overlay` 落点，入口为主页面右上角悬浮圆形按钮（点击打开创作台并隐藏自己，UI 打磨补强），不替换 root/sidebar/conversation/details 单槽。 | 渲染断言含品牌头栏与六层导航；悬浮圆形入口可发现且点击自隐；单槽未被替换。 | I46 | `pnpm run verify:i46`; `pnpm run verify:stage-9` |
| R10-2 | 视觉体系为编辑台/书斋：纸/墨/朱砂三色 + 系统衬线标题层级 + 8px 网格；中性色/边框/hover/状态色消费宿主 `--dsw-alias-*` token，明暗随宿主主题自动适配。 | 样式常量引用 `--dsw-alias-*` 断言；明暗切换夹具；零外部字体/网络资产。 | I46 | `pnpm run verify:i46`; `pnpm run verify:stage-9` |
| R10-3 | 渲染保持 `React.createElement` + 包内 `<style>`（归属 Fiber），不引入 JSX runtime；样式随卸载回收。 | 构建扫描无 JSX runtime；Fiber 卸载后 Slot/样式/监听归零。 | I46 | `pnpm run verify:i46`; `pnpm run verify:stage-9` |
| R10-4 | B3/B2 列表/详情编辑：角色真表单与世界观改写（supersede），数据仅经 Host Remote。 | round-trip + 非法写展示 Host 错误；无 fs API。 | I47 | `pnpm run verify:i47`; `pnpm run verify:stage-9` |
| R10-5 | B5/C1 结构化编辑器替换裸 JSON：大纲（幕→节→细纲）与关系对，序列化后仍走既有 Host 契约。 | 结构化编辑 round-trip；序列化与既有 `outlineSave`/`relationshipSave` 兼容。 | I48 | `pnpm run verify:i48`; `pnpm run verify:stage-9` |
| R10-6 | C2 快照时间线/回滚/diff 与 C4 只读账本 + supersede 更正（走 ConfirmationGate）。 | 回滚走 StateEngine；正史无普通写入口；更正确认后才追加。 | I49 | `pnpm run verify:i49`; `pnpm run verify:stage-9` |

---

## R11. 作品启动与六层初始化

> 定位：修复“插件/Remote ready 但作品六层未 open”的 operational bootstrap 缺口，并让新作品通过 DOCX、自由文本或纯空白三种入口进入创作台。I37–I38 的 B2/B5 通用导入合同保持不变；Stage 10 只扩展新作品初始化。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R11-1 | Host project lifecycle 是作品 list/create/open/readiness 的唯一 owner；支持多作品选择，Client 只持有经 Host 复核的 selected projectId，所有硬编码 `default` 删除。空作品的 B3/B2/C1/C4 为空、B5 uninitialized、C2 为确定性 `initial-state` seq 0 空快照；公开 ConfirmationService 与 workspace 复用同一实例。 | 空 root、新建、两作品切换、stop/restart/reopen、并发 open、unsafe/unknown ID、legacy `{}` 与 corrupt 文件夹具；旧 Remote descriptor 行为兼容；selected-profile 真实打开六层。 | I50 | `pnpm run verify:i50`; `pnpm run verify:stage-10` |
| R11-2 | 创作台文件选择器只做受限分块上传；Host 校验大小、块序、SHA-256、DOCX 包结构、entry/解压量/压缩比，并用成熟解析器产生规范文本块。临时文件在成功/取消/失败/卸载后清理，作品数据不删除；手写 parser 退役且无 fallback。 | Word/LibreOffice gold fixture；坏 ZIP、伪扩展、加密、乱序/重复块、超限与 zip bomb 负向夹具；临时目录归零；Client bundle 无 ZIP/XML/fs；lingering-reference 扫描。 | I51 | `pnpm run verify:i51`; `pnpm run verify:stage-10` |
| R11-3 | DOCX 规范文本与自由文本经 Host `ctx.llm` 生成绑定 projectId/onboardingSessionId/sourceHash 的 B3/B2/B5/C1/C2/C4 六个带来源、confidence 与 warnings 的严格候选包；自由文本须非空、UTF-8/NFC、无 NUL、默认 ≤2 MiB。B3.relationships/knowledgeIds/arc.keyBeats 强制为空；C2 表示输入终点/故事起点且只含当前 scene/characters 子集；C4 只含明确事件且可空；禁止 C3/items/factions/globalFlags。支持带反馈的单层重生成，其他层候选不变。 | prompt/schema 前冻结 ≥10 个 dev/held-out 样本；fake backend 接线；输入边界、逐层 schema、来源与哈希隔离断言；模型不可用/取消/非法输出零写；每层 held-out ≥80%。 | I52 | `pnpm run verify:i52`; `pnpm run verify:stage-10` |
| R11-4 | 六层分别支持直接接受、手动修改后接受、整层打回重生成或显式跳过。每项提案绑定 projectId/onboardingSessionId/layer/sourceHash；修改/重生成先 reject 当前提案再建立带 `replacesId` 的后继，跳过 reject 且无后继；pending 不等于 skip。六层均达 accepted/skipped 后，final apply 才消费任意 accepted 子集，经既有 Domain Service 按 B3→B2→B5→C2→C4→C1 写入；I11 三态不变。 | project/session/sourceHash 错配拒绝；pending 阻止 apply；旧提案不可静默应用；单层打回隔离；B2/B5 独立失败；B3.relationships/knowledgeIds/arc.keyBeats 必须为空；B2.parent 校验本层引用并 parent-first 稳定拓扑 create，环/缺失 parent 失败；B5.prerequisites/C4.consequences 对完整候选 ID 集预检；B5.charactersInvolved/detailBeats.pov/foreshadowing.knownBy、C1.from/to/knownTo、C2.characters.characterId、C4.participants→B3，C1.milestones→已先落地 C4；悬空引用只阻止自身及依赖层；结构化 partial-retryable 结果、重复 apply 幂等、C4 append-only；DOCX/自由文本 selected-profile E2E；Fiber dispose 零残留。 | I53 | `pnpm run verify:i53`; `pnpm run verify:stage-10` |

---

## R12. DSH 停靠侧板与现有 UI 修复

> 定位：I1–I53 已完成后的第一优先级修复。先消除“居中独立浮窗”形态和现有 UI 正确性缺口，不新增正文领域能力；Slot 选择必须服从设计 D20。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R12-1 | I54 执行前核验所选 DSH 与当时最新版公开 Slot tree；若存在 additive 侧区内容 Slot，停止并通知用户升级、更新兼容基线后再实现；否则将 `shell.overlay` 创作台退役为贴右、全高、非模态停靠侧板。禁止接管 root/sidebar/conversation/details 单槽，禁止双落点 fallback。 | Slot manifest/Inspect 证据；当前 `0.1.0-rc.7` 与已核验 `0.1.1-rc.2` 均走右侧板；selected-profile mount/unmount；扫描无第二路径和居中浮窗样式。 | I54 | `pnpm run verify:i54`; `pnpm run verify:stage-11` |
| R12-2 | 当前作品持续可见，并可返回作品列表、新建/切换；跨项目切换清空旧 Client draft，由 Host 重新 open/验证，脏表单有明确裁决。项目目录层始终提供「空白创建 + 文档导入」新增入口（不受已有作品影响）；文档导入新建独立作品后，六层初始化审阅在项目目录层展示，apply 成功才进入创作台。 | 两作品往返、脏表单、失败 open、重启恢复与零串写断言；目录层空白创建/文档导入、审阅上移与 apply 后进入创作台断言。 | I55 | `pnpm run verify:i55`; `pnpm run verify:stage-11` |
| R12-3 | 六层“修改后接受”必须提交用户编辑后的 `editedValue`；重生成必须提交 feedback；空候选、pending 和错绑定阻止裁决/apply。 | Remote payload 精确断言；Host 不得回退使用旧值；六层终态门与负向夹具。 | I56 | `pnpm run verify:i56`; `pnpm run verify:stage-11` |
| R12-4 | 初始化分析显示进度并支持取消/失败重试；final apply 成功后刷新六层并进入创作台，partial-retryable 只重试未完成层。 | progress/cancel/retry、apply refresh、失败隔离、Fiber dispose 零任务残留。 | I57 | `pnpm run verify:i57`; `pnpm run verify:stage-11` |
| R12-5 | 创作台导航改为“写作/策划/连续性/作品设置”任务分组，技术层编号只作辅助标识；现有六层与设置页不丢失。 | IA 渲染与导航可达性断言；旧九项扁平导航退役扫描。 | I58 | `pnpm run verify:i58`; `pnpm run verify:stage-11` |
| R12-6 | 侧板具备响应式、键盘、焦点恢复、`focus-visible`、`aria-live`、保存状态和防重复提交；窄屏仍使用同一 DSH Slot。 | 键盘/焦点/异步播报/窄屏夹具；无 `outline:none` 无替代焦点；重复提交最多一次。 | I59 | `pnpm run verify:i59`; `pnpm run verify:stage-11` |

## R13. P0 正文写作闭环

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R13-1 | Host 提供 C5 章节/场景最小只读 Remote；侧板提供章节树、场景列表和正文读取，不暴露文件路径。 | 多章/空章/坏引用/跨项目读取；Client bundle 无 fs；重载语义一致。 | I60 | `pnpm run verify:i60`; `pnpm run verify:stage-12` |
| R13-2 | 正文编辑器支持固定范围逐字保存和可选 reparse；范围外哈希不变，未选择或未确认 reparse 时结构层不变。 | exact round-trip、范围 diff、Gate 未确认/确认 fan-out 与撤销失败路径。 | I61 | `pnpm run verify:i61`; `pnpm run verify:stage-12` |
| R13-3 | 生成、续写、按场景卡写作和局部重写共用 Host 候选命令合同；调用只产生绑定 project/chapter/scene/sourceHash 的候选，不预先接受或写层。 | fake backend 消费者夹具；错绑定/取消/非法输出零写；旧能力复用而非复制。 | I62 | `pnpm run verify:i62`; `pnpm run verify:stage-12` |
| R13-4 | Client 在正文、diff 和校验结果可见后才允许接受、拒绝或重写；接受进入标准生命周期，拒绝零写，退役生成前 `decision=accept` 产品语义。 | accept/reject/rewrite E2E；双击幂等；旧预先接受入口零引用。 | I63 | `pnpm run verify:i63`; `pnpm run verify:stage-12` |
| R13-5 | 一致性审校中心统一展示规则、正史、知情、关系与风格五类问题，包含严重度、引用和正文定位；硬冲突阻止接受，软警告需显式裁决。 | 五类问题投影消费者夹具；定位引用；硬/软策略与审计记录。 | I64 | `pnpm run verify:i64`; `pnpm run verify:stage-12` |
| R13-6 | Host 持有可恢复自动生成队列；支持场景范围、暂停/继续/取消、重试、字数/token 预算和硬/软停止策略。每场景独立候选，不绕过 Gate、不静默改 B5/C6。 | stop/restart 恢复、任务幂等、预算、硬停/软停、取消和 Fiber 清理 E2E。 | I65 | `pnpm run verify:i65`; `pnpm run verify:stage-12` |

> **迁移说明（I63 退役生成前预先 accept 的产品路径）**：`novel_continue` 不再接受
> `decision=accept` —— 它只产生绑定 project/chapter/scene/sourceHash 的候选（零写，
> R13-3）。接受/拒绝/重写统一经 `novel_adjudicate`（candidateId + decision）或 GUI
> 「写作候选」审阅面板（`novelWriting` Remote）裁决；accept 才进入标准校验→解析→
> 受控写回，reject 零写，rewrite 产生后继候选且旧候选不可静默接受。对话入口与 GUI
> 共用同一 Host owner（`novelWritingAdjudication`）；I44 续写引擎不再被任何产品入口
> 引用（其单元测试仍作为已交付模块回归）。

## R14. P1 能力可达性

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R14-1 | C3 UI 按事实/角色展示 holders、revealPlan、status；揭示与 holder 变更遵守知情不倒退并复用 Gate。 | 角色/事实双视图、逆向状态失败、POV 边界与确认断言。 | I66 | `pnpm run verify:i66`; `pnpm run verify:stage-13` |
| R14-2 | B1/B4 UI 支持规则优先级/immutable 与人称、时态、POV、禁用表达等；Client 不复制领域校验。 | round-trip、非法枚举/immutable 改写失败、生成消费者仍读 Host 真相。 | I67 | `pnpm run verify:i67`; `pnpm run verify:stage-13` |
| R14-3 | C6 UI 展示当前幕/节/场景卡与偏差；灵感默认只读，用户选定后才经 Gate apply 到 B5/C6。 | 未选择零写、选择确认、拒绝/重复 apply、导航刷新断言。 | I68 | `pnpm run verify:i68`; `pnpm run verify:stage-13` |
| R14-4 | 创作台暴露 I37–I38 通用导入与 I39 项目包/纯文本导出及 round-trip 备份恢复；Client 不拥有源路径，不扩张非空作品合并语义。 | 格式选择、下载/恢复、round-trip、路径与 N-7 负向扫描。 | I69 | `pnpm run verify:i69`; `pnpm run verify:stage-13` |
| R14-5 | C5 建立 Host-owned 版本/分支模型；候选可保留为分支并比较，chosen 唯一；切换分支不隐式修改结构层。 | Schema/迁移/重开、chosen 约束、分支 diff、未 reparse 结构层哈希不变。 | I70 | `pnpm run verify:i70`; `pnpm run verify:stage-13` |
| R14-6 | 支持跨正文与结构层全局搜索、实体交叉引用和生成上下文追踪；追踪解释注入层、触发原因与裁剪，不泄露 secret 或未授权 POV 知识。 | 搜索索引可重建；引用跳转；注入解释与知识边界/secret 负测。 | I71 | `pnpm run verify:i71`; `pnpm run verify:stage-13` |
| R14-7 | 展示章节字数、目标完成度、场景卡状态、POV 分布和任务历史；统计可重建且不成为 source of truth。 | 重建一致性、空作品、大规模作品和删除派生数据后恢复断言。 | I72 | `pnpm run verify:i72`; `pnpm run verify:stage-13` |

## R15. 剧情时间线（方案 A）

> 定位：现有 C2/C4 `storyTime` 与 C3 `revealAt` 均为自由文本、无统一排序轴，无法回答「当前时间点」；C1 关系全量注入不符合设计 §8「相关角色对」。时间线把 B5 结构展开为有序剧情时间轴，支撑关系注入与知情层按「当前时间」过滤，作者可手动编辑保存。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R15-1 | 时间线文档（timeline.yaml）：从 B5 大纲确定性生成有序骨架（acts→beats→detailBeats 展开），节点含 label/storyTime/beatId/detailBeatId/reveals/relationships/currentNodeId；大纲就绪前 fail-closed 不自建空时间线。 | 骨架节点顺序/绑定/空大纲负测；repository save→read round-trip；损坏文档 fail loudly。 | I73 | `pnpm run verify:i73`; `pnpm run verify:stage-14` |
| R15-2 | 关系注入按当前时间线节点过滤：只注入「≤ 当前节点 order 已建立」的关系；未被时间线安排的关系始终保留（兼容旧数据）；时间线缺失/未锚定回退全量。 | `effectiveRelationshipIds`/`filterRelationshipsByTimeline` 正向/负向夹具；writing-context 消费者夹具（时间线缺席全量、当前节点过滤、手动锚定覆盖）。 | I73 | `pnpm run verify:i73`; `pnpm run verify:stage-14` |
| R15-3 | 当前时间线节点双锚定：手动选择（currentNodeId）优先，否则按当前写作位置（细纲卡 detailBeatId → beatId）自动匹配；未命中不过滤。 | `anchorNodeId` 手动/自动/未知负测；服务层 setCurrentNode 校验未知节点。 | I73 | `pnpm run verify:i73`; `pnpm run verify:stage-14` |
| R15-4 | onboarding finalApply 落地 B5 后自建时间线骨架（不覆盖已存在的手动编辑）；时间线可手动编辑保存（reveals/relationships/storyTime/currentNodeId）。 | finalApply 成功自建、已存在不覆盖、面板编辑→save 只经 novelTimeline Remote。 | I73, I74 | `pnpm run verify:i73`; `pnpm run verify:i74`; `pnpm run verify:stage-14` |
| R15-5 | Client 提供时间线面板：有序节点列表（当前节点标记）、每节点编辑、手动设当前节点（null 恢复自动）、一键自建、保存；Client 不持有时间线真相。 | 面板渲染/自建/节点列表/保存断言；Remote 挂载失败降级；Client bundle 无 node:fs。 | I74 | `pnpm run verify:i74`; `pnpm run verify:stage-14` |

---

## 覆盖矩阵

### M-H0. 宿主覆盖矩阵

| 宿主面 | 需求 ID | 迭代 | 必须证明的证据 |
|---|---|---|---|
| selected-profile dependency + pins | H0-1, H0-11 | I1 | profile manifest、项目 lockfile、Node22+/pnpm/strict ESM |
| chosen bundle composition + one owner | H0-2 | I1 | `dsh.bundle.patch` + `dsh.profile.bundles` + 单 row |
| ordinary persistent lifecycle | H0-3, H0-12 | I1–I2 | install/build/boot/stop/restart |
| Host ownership | H0-4, H0-7 | I1 | Host-only Service/Fiber；无 Client 产物 |
| Client ownership and gate | H0-5, H0-8 | I2 | 非产品单 Slot probe |
| Fiber cleanup | H0-6 | I1–I2 | Host/Client 副作用归零 |
| public contract stop line | H0-9 | I2 | 公共 Remote/bundle；失败即停 |
| no standalone/browser LLM | H0-10 | I1, I2, I33 | forbidden-path scans + DSH-only smoke |

### M-13. 13 层覆盖矩阵

| 层 | Schema/存储 | 注入/运行 | 解析/编辑/输出 |
|---|---|---|---|
| A1 | I1, I3 | I12 | I30 |
| A2 | I31 | I31–I32 | I33 |
| B1 | I7 | I13, I21 | I32, I67 |
| B2 | I8 | I13 | I29, I34, I38, I47, I52–I53 |
| B3 | I9 | I13 | I34, I47, I52–I53 |
| B4 | I10 | I13, I20, I24 | I31, I67 |
| B5 | I14 | I15 | I35, I38, I43, I45, I48, I52–I53, I68 |
| C1 | I16 | I16 | I27, I35, I48, I52–I53 |
| C2 | I4 | I13 | I25, I36, I49, I50, I52–I53 |
| C3 | I18 | I18, I22 | I28, I66 |
| C4 | I5 | I18, I21 | I26, I36, I39, I49, I50, I52–I53 |
| C5 | I6, I70 | I18–I19, I62–I65 | I42–I44, I60–I63, I69–I72 |
| C6 | I15 | I15 | I35, I45, I68 |

### M-E. 引擎覆盖矩阵

| 引擎/原语 | 迭代 | 对应需求 |
|---|---|---|
| StateEngine | I4 | R2-1 |
| CanonLedger | I5 | R2-2 |
| ConfirmationGate | I11 | R2-9 |
| ContextAssembler | I12–I16, I18 | R2-6, R3-1–R3-3 |
| OutlineNavigator | I15 | R2-3 |
| KnowledgeFilter | I18 | R2-4 |
| RelationshipEngine（可选内部 Extension） | I32 | R2-5 |
| ConsistencyValidator | I20–I24 | R2-8, R4-1–R4-5 |
| NarrativeParser | I25–I29 | R2-7, R5-1–R5-6 |
| Pipeline/lifecycle | I19, I30 | R3-5–R3-6, R5-7 |

### M-P. 产品能力与 I1–I74 全覆盖矩阵

| 能力 | 迭代 | 需求组 |
|---|---|---|
| Host package/profile/bundle/service/Fiber | I1 | H0 |
| Client public bundle/Remote/Slot gate probe | I2 | H0 |
| project/schema/path/YAML foundation | I3 | R1, R8 |
| StateEngine C2 | I4 | R1, R2 |
| CanonLedger C4 | I5 | R1, R2 |
| C5 text storage | I6 | R1 |
| B1 rules | I7 | R1 |
| B2 worldview | I8 | R1 |
| B3 character core | I9 | R1 |
| B4 style | I10 | R1 |
| ConfirmationGate | I11 | R2 |
| ContextAssembler kernel | I12 | R2, R3 |
| B3/B2/C2 serializers | I13 | R3 |
| B5 outline/detail beats | I14 | R1, R3 |
| C6/OutlineNavigator | I15 | R1, R2, R3 |
| C1 relationships | I16 | R1, R3 |
| `ctx.llm` generation | I17 | R3 |
| C3/KnowledgeFilter | I18 | R1, R2, R3 |
| full context/generation integration | I19 | R0, R3 |
| deterministic adjudicator | I20 | R4 |
| rule/canon hard detector | I21 | R4 |
| knowledge leak detector | I22 | R4 |
| deterministic soft checks | I23 | R4 |
| LLM soft checks | I24 | R4 |
| C2 parser | I25 | R5 |
| C4 parser | I26 | R5 |
| C1 parser | I27 | R5 |
| C3 parser | I28 | R5 |
| B2 parser | I29 | R5 |
| full lifecycle/writeback | I30 | R0, R5 |
| A2 model/template config | I31 | R1, R3, R6 |
| internal Extension registry | I32 | R2, R6 |
| product Client Slot workspace | I33 | R0, R7 |
| B3/B2 editors | I34 | R1, R7 |
| B5/C1 editors | I35 | R1, R7 |
| C2 rollback/C4 read-only | I36 | R1, R7 |
| deterministic txt/md/docx import | I37 | R8 |
| split agents | I38 | R8 |
| export/import portability | I39 | R0, R8 |
| SQLite rebuildable index | I40 | R8 |
| classifier | I41 | R8, R9 |
| localized edit/rewrite | I42 | R9 |
| chapter wordTarget/final export | I43 | R8, R9 |
| continuation | I44 | R9 |
| inspiration | I45 | R9 |
| 创作台地基 + 视觉体系 | I46 | R10 |
| B3/B2 编辑面板 | I47 | R10 |
| B5/C1 结构化编辑器 | I48 | R10 |
| C2/C4 面板 | I49 | R10 |
| 多作品选择与 Host project bootstrap | I50 | R11 |
| 受控 DOCX 上传与真实文本提取 | I51 | R11 |
| 六层初始化分析器 | I52 | R11 |
| 六层审阅、逐层确认与幂等落地 | I53 | R11 |
| Slot 版本门 + 右侧停靠侧板 | I54 | R12 |
| 作品切换与上下文隔离 | I55 | R12 |
| 初始化裁决正确性 | I56 | R12 |
| 初始化进度、取消、重试与刷新 | I57 | R12 |
| 任务型创作台信息架构 | I58 | R12 |
| 响应式、可访问性与保存反馈 | I59 | R12 |
| C5 章节/场景读取与导航 | I60 | R13 |
| C5 正文编辑与可选 reparse | I61 | R13 |
| 统一写作候选命令合同 | I62 | R13 |
| 候选预览与生成后裁决 | I63 | R13 |
| 一致性审校中心 | I64 | R13 |
| 可恢复自动生成队列 | I65 | R13 |
| C3 知情/揭示 UI | I66 | R14 |
| B1/B4 控制面 | I67 | R14 |
| C6 进度与灵感 apply | I68 | R14 |
| 导入导出与备份 UI | I69 | R14 |
| C5 正文版本/分支 | I70 | R14 |
| 全局搜索与上下文追踪 | I71 | R14 |
| 写作进度面板 | I72 | R14 |
| 剧情时间线数据层与服务 | I73 | R15 |
| 剧情时间线面板 | I74 | R15 |

---

## Deferred / 非目标

| ID | 项目 | 约束与理由 |
|---|---|---|
| N-1 | SillyTavern 迁移/格式适配 | 明确排除 ST 一键迁移及世界书兼容导入导出。导入到已有作品的通用 B2/B5 候选走 I37–I38；新建/空作品的 DOCX/自由文本六层初始化走 I50–I53；自定义可移植包走 I39。可参考字段思想，不建立兼容 owner。 |
| N-2 | 向量检索 | 语义向量检索和 B2 `vector` trigger 延后；当前使用关键词/正则/全文与 I40 精确 SQLite 索引。文件始终是 source of truth。 |
| N-3 | standalone host/UI | 不做独立 Node/Vite 应用、独立 Web server、SPA、HTML 入口、浏览器 LLM、浏览器直读/直写作品文件或 DSH 之外的受支持主路径。I51 文件选择器只允许把受限用户输入运输到 Host 临时区，Client 不解析且不成为文件 owner。 |
| N-4 | 多用户服务与模型微调 | 起步为本地单用户、中文优先；不含租户、账号系统或训练 pipeline。 |
| N-5 | 自动强制改写大纲 | 偏差先记录；接受新方向或调整细纲必须由用户选择并经 ConfirmationGate。 |
| N-6 | UI 主题完整体系 | A2 可配置但后置，不阻塞 I33–I36 工作区；不得借此引入第二 UI shell。I46–I49 创作台视觉体系消费宿主 `--dsw-alias-*` token 明暗适配，不建立 novel 自有主题引擎，A-7 保持后置。 |
| N-7 | 已有非空作品合并导入 | Stage 10 仅初始化新建/空作品；不静默合并或覆盖已有六层。未来若支持必须单独定义冲突、迁移、备份与逐项确认合同。 |
| N-8 | C2 扩展对象 | `items`、`factions`、`globalFlags` 仍属设计 §5.9 目标模型，但当前 `worldStateSchema` 只交付 scene/characters。扩展须单独进行 schema/storage/迁移/UI 迭代；I50–I53 不生成这些字段。 |

---

## 结论

**直接结论：I1–I53 已完成并形成 v2.1 基线；v2.2 将现有 UI 修复、P0 正文写作闭环与 P1 能力可达性拆为 I54–I72，并为每个迭代和 Stage 11–13 定义可机器执行的验证门。新增 Stage 14（I73–I74）剧情时间线（方案 A），为关系注入与知情层提供确定性时间轴（R15）。新计划不改写 I1–I53 的历史合同，也不以 UI 扩展改变 Host source-of-truth。**

H0 是不可被产品功能抵消的最高优先级；I1 必须保持 Host-only，I2 必须保持 gate-only。I54 还必须执行 D20 Slot 兼容门：若新版出现 additive 侧区公共 Slot，先通知升级并更新兼容基线；否则使用单一 `shell.overlay` 右侧停靠侧板路径。内部 Extension 始终只是产品内部能力点。当前执行、验收与完成声明不得使用历史 `I1a–I28b2`；它们仅存在于 Git 历史和 v1.x provenance 中，不是当前权威。
