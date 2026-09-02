# AI 长篇小说创作器 — 需求与覆盖权威

> 版本：v3.5
> 日期：2026-09-02
> 状态：当前需求、验收与迭代覆盖权威
> 产品身份：DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin；DSH 是唯一宿主

## 0. 权威、优先级与溯源

### 0.1 当前权威引用

权威优先级如下；发生冲突时，前者优先：

1. `docs/novel-creation-tool-design.md` v3.5：产品与架构设计权威，尤其是 §0.1 宪法级宿主基线、D24、D25、I150 范围细纲修复裁决、§14.18 查漏补缺、§14.26–§14.29 作者入口/ID/术语/来源片段裁决与后置 F1/F2 边界。
2. 本文件 v3.5：需求 ID、验收证据、迭代覆盖与非目标权威。
3. `docs/novel-creation-tool-development-plan.md` v3.5：I1–I162 与 Stage 29 的完成事实，以及 v3.2 原 I151–I162 后置卡片的 provenance；Stage 19（I141–I149）卡片保留为已完成执行记录。
4. `AGENTS.md` v3.5：执行纪律。
5. `docs/aegis/plans/2026-08-19-dsh-plugin-baseline-reset.md`：本次基线重置的决策与任务 provenance，不替代前三项产品权威。
6. `docs/novel-creation-tool-architecture-review.md`（v1.0）与 `docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0）：架构审查记录；v1.0 为 Stage 15（R16）重构立项输入，v2.0 为 Stage 17 修复迭代（I86–I102）立项输入；review record，非设计权威，不覆盖上述产品权威。

### 0.2 v1.x supersession 与 provenance

- 本文件完全取代历史 v1.4 覆盖文档。v1.1–v1.4 保留的价值仅是需求来源 provenance：13 层、核心引擎、ConfirmationGate、创作环境、样本治理、受控写回和规模 smoke 等产品要求继续有效。
- v1.x 的独立 Node/Vite 应用、浏览器 LLM、旧里程碑和旧迭代编号已经失效；历史 `I1a–I28b2` 不得用于当前排期、执行、验收或完成声明。
- 当前迭代身份：**I1–I162 全部完成**。当前没有后续执行卡；新增工作须先立项并给出精确验证命令。v3.2 原 I151–I162 已后置为 F1/F2 设计包，原编号只作非执行 provenance、不占用当前连续编号。
- H0 是宪法级最高优先级。H0 未满足时，不得以任何 R0–R31 或未来产品能力的通过抵消；I2 或专门兼容性门失败时必须执行停止线。

### 0.3 统一验收纪律

1. 单迭代验证命令固定为 `pnpm run verify:iN`；阶段累积验证固定为 `pnpm run verify:stage-N`。表中列出的命令是最低证据，不得用手工演示替代。
2. 每项验收必须同时包含正向断言、相关负向断言和可检查产物；地基切片还须有下游消费者夹具。
3. LLM 集成先以 fake backend/mock parser 做确定性接线，再跑真实模型样本。所有 LLM 调用只能走 Host 的 `ctx.llm`；禁止直接调用 OpenAI/Anthropic/兼容 endpoint，禁止读取或传递直接 API key。
4. 硬检测器：canonical 违规样本 **100% 命中**且整体准确率 **≥90%**；正史解析器准确率 **≥85%**；其他 LLM 模块准确率 **≥80%**。
5. 样本、held-out 子集和 gold 均为不可变验收资产；不得为过关修改样本、held-out、gold 或阈值。dev 可用于调优，held-out 只用于收尾验收。
6. **LLM 样本优先是规范性顺序**：任何 prompt/schema 变更前必须先建立或更新样本集及其 held-out 子集，再实施变更并运行样本回归；回归低于既定 gold/阈值即失败，不得降低阈值或改写不可变样本过关。此横切纪律逐迭代纳入回归义务：I17—`pnpm run verify:i17`；I21—`pnpm run verify:i21`；I22—`pnpm run verify:i22`；I24—`pnpm run verify:i24`；I25—`pnpm run verify:i25`；I26—`pnpm run verify:i26`；I27—`pnpm run verify:i27`；I28—`pnpm run verify:i28`；I29—`pnpm run verify:i29`；I38—`pnpm run verify:i38`；I41—`pnpm run verify:i41`；I42—`pnpm run verify:i42`；I43—`pnpm run verify:i43`；I44—`pnpm run verify:i44`；I45—`pnpm run verify:i45`；I52—`pnpm run verify:i52`；I62—`pnpm run verify:i62`；I112—`pnpm run verify:i112`；I113—`pnpm run verify:i113`；I118—`pnpm run verify:i118`；I119—`pnpm run verify:i119`；I123—`pnpm run verify:i123`；I128—`pnpm run verify:i128`；I134—`pnpm run verify:i134`；I143—`pnpm run verify:i143`；I145—`pnpm run verify:i145`；I146—`pnpm run verify:i146`；I150—`pnpm run verify:i150`；I151—`pnpm run verify:i151`。I109–I111、I135–I137 与 I147–I149 复用既有 parser/detector 时仍须运行对应既有 held-out 回归，不得以“未改 prompt”跳过集成回归；v3.2 后置卡片中的原 I157–I158 只作 provenance，不占用当前验证命令。I151 必须先冻结 dev/held-out/gold，再改 prompt/schema，每类准确率不低于 80%。
7. 所有用户确认复用 I11 ConfirmationGate。未确认不得写回；重复确认必须幂等。
8. 每个迭代只有在对应 `verify:iN` 通过后才可完成；每个阶段只有在全部迭代验证和 `verify:stage-N` 通过后才可完成。

### 0.4 当前阶段与验证命令

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
| Stage 15 架构债务消除 | I75–I84 | `pnpm run verify:stage-15` |
| Stage 16 DSH family 兼容升级 | I85 | `pnpm run verify:stage-16` |
| Stage 17 架构债务修复（review v2.0 立项） | I86–I102 | `pnpm run verify:stage-17` |
| Stage 18 合同地基、作者主流程与新增功能（R18） | I103–I140 | `pnpm run verify:stage-18` |
| Stage 19 来源确认与幕后素材 POV 叙事化（R19） | I141–I149 | `pnpm run verify:stage-19` |
| Stage 20 查漏补缺（R18-12、R18-15、R22） | I150–I151 | `pnpm run verify:stage-20` |
| Stage 21 DSH credentials seam 兼容修复（R23） | I152 | `pnpm run verify:stage-21` |
| Stage 22 目录层首次受控导入接线修复（R24） | I153 | `pnpm run verify:stage-22` |
| Stage 23 来源审阅解释提示（R25） | I154 | `pnpm run verify:stage-23` |
| Stage 24 既有作品归档（R26） | I155 | `pnpm run verify:stage-24` |
| Stage 25 来源审阅 session 持久化恢复（R27） | I156 | `pnpm run verify:stage-25` |
| Stage 26 来源主角语义恢复（R28） | I157 | `pnpm run verify:stage-26` |
| Stage 27 来源 Remote Host 注册修复（R29） | I158 | `pnpm run verify:stage-27` |
| Stage 28 作者入口、ID 与中文术语收口（R30） | I159–I161 | `pnpm run verify:stage-28` |
| Stage 29 来源片段裁决闭环（R31） | I162 | `pnpm run verify:stage-29` |
| 后置设计包 F1 导入基础设施重构（v3.2 原 R20 / I151–I155） | 待重新编号 | 无当前执行命令 |
| 后置设计包 F2 已有正文保真导入（v3.2 原 R21 / I156–I162） | 待重新编号 | 无当前执行命令 |

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
| H0-11 | 工具链 pin：Node.js **22+**、pnpm、TypeScript strict、ESM；项目 manifest 固定 DSH family/Cordis 兼容范围，lockfile 固定精确解析版本。唯一项目 DSH family pin 已由 I85 切换为 `0.1.1-rc.2`（此前为 `0.1.0-rc.7`）。 | engines/packageManager/type/module/tsconfig/lockfile 静态断言；DSH family 直接依赖、selected profile 与 lockfile 同版本；Node 低版本、npm lock、CJS 输出、混装版本夹具失败。 | I1, I85 | `pnpm run verify:i1`; `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| H0-12 | 必须具备可重复的 install/build/selected-profile boot/stop/restart 验证；stop 后消失，restart 后恰好恢复一次。宿主升级还必须在真实 base+web+plugin 组合中重跑完整 Client gate。 | 干净安装、Host build、首次 boot、Client mount、Remote 往返、stop、同进程 restart、DSH 重启后 boot 的脚本日志与断言。 | I1, I2, I85 | `pnpm run verify:i1`; `pnpm run verify:i2`; `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| H0-13 | DSH family 升级必须是单一专门兼容迭代：manifest、selected profile 与 lockfile 原子切换至同一精确版本；不得保留旧宿主 fallback，不得用运行时观测冒充已验证项目基线。I85 已按此完成：唯一项目 pin 现为 `0.1.1-rc.2`。 | `0.1.1-rc.2` 同版本断言；rc.7 残留/混装负向扫描；真实 base+web+plugin selected-profile boot；完整 Client/Remote/Tools/LLM 合同与生命周期门。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |

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
| R12-1 | I54 执行前核验所选 DSH 与当时最新版公开 Slot tree；若存在 additive 侧区内容 Slot，停止并通知用户升级、更新兼容基线后再实现；否则将 `shell.overlay` 创作台退役为贴右、全高、非模态停靠侧板。禁止接管 root/sidebar/conversation/details 单槽，禁止双落点 fallback。 | Slot manifest/Inspect 证据；I54 所选 `0.1.0-rc.7` 与当时已核验 `0.1.1-rc.2` 均走右侧板；selected-profile mount/unmount；扫描无第二路径和居中浮窗样式。 | I54 | `pnpm run verify:i54`; `pnpm run verify:stage-11` |
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

## R16. 架构质量与债务消除（Stage 15 重构）

> 定位：I1–I74 功能交付后，按 `docs/novel-creation-tool-architecture-review.md`（v1.0，review record，非设计权威）§9 路线图消除系统级架构债务——霰弹枪修改、god file / god service、契约/形状手写多重复声明与边界类型安全侵蚀。重构只消除复制与接线债务，不改变任何领域契约、公开 Remote/wire 形状与产品能力；领域所有权设计（core 归 core、接线归组合根、真相单 owner）与 §0.1 宿主基线保持不变。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R16-1 | 接线层类型安全恢复：生产代码不得依赖 `as Parameters<...>`/`as never`/`as unknown as` 断言接线签名或领域输入；方法签名变更必须在接线层产生编译错。 | grep 断言归零；方法签名变更负向夹具；`pnpm test` 全量绿。 | I75, I80 | `pnpm run verify:i75`; `pnpm run verify:i80`; `pnpm run verify:stage-15` |
| R16-2 | 全仓库最大复制源归零：parse-JSON 样板（9 份）、`confidenceSchema`（7 份）、violation schema（3 份）、C2→C1→C3→C4→B2 五层写回器（2 份）、文本管道 normalize/chunk（2 份）、SHA-256→hex（3 份）各自只保留一份实现。 | grep 定义唯一断言 + DRY 扫描；既有 parser 样本回归（含 held-out）阈值不变；`pnpm test` 全量绿。 | I76, I79, I84 | `pnpm run verify:i76`; `pnpm run verify:i79`; `pnpm run verify:i84`; `pnpm run verify:stage-15` |
| R16-3 | 契约单一来源：host/remote wire schema 从 core schema 派生；`contracts/` 存形状本体而非空 shapeIds；Client 投影 shape 为可打包纯 zod 直用；schema 字段单一变更影响面 ≤3 文件。 | characters 层字段改名横切面 ≤3；strict codec wire smoke；契约锁一致性断言。 | I77, I78 | `pnpm run verify:i77`; `pnpm run verify:i78`; `pnpm run verify:stage-15` |
| R16-4 | god file / god service 消除：`client.ts`（~2876）、`index.ts`（~581）、writing/onboarding adjudication service（588/648 行）按职责拆分；行数护栏成立；`$mount` 块与 `WorkbenchActions`/`WorkbenchState`/`ProjectSessionActions` 三接口重复声明归零。 | 行数护栏断言；接口重复归零；既有 UI/service 测试迁移后等价全绿。 | I79, I80, I82, I83 | `pnpm run verify:i79`; `pnpm run verify:i80`; `pnpm run verify:i82`; `pnpm run verify:i83`; `pnpm run verify:stage-15` |
| R16-5 | 分层边界纪律保持并显式化：core→host/client 反向 import 保持 0；分层倒置边（`core/settings-index→llm/port`、`core/upload→import`、`llm/template→core/settings-index` 往返）修复；可入 client 图的 core 纯模块白名单显式化并受构建扫描约束。 | 反向 import 扫描 0；倒置边扫描 0；白名单外 core 引用负测失败。 | I78, I84 | `pnpm run verify:i78`; `pnpm run verify:i84`; `pnpm run verify:stage-15` |
| R16-6 | 重构不改变领域行为与公开契约：I1–I74 全部既有验收（`pnpm test` + stage verify + LLM 样本阈值）在重构后保持绿；公开 Remote/wire 契约形状不变。 | 全量测试 + 全 held-out 回归 + 既有 stage 累积门全绿；契约形状快照不变。 | I75–I84（全部） | `pnpm run verify:stage-15`（含 I75–I84 各迭代 verify 全绿） |

## R17. DSH family `0.1.1-rc.2` 兼容升级（Stage 16）

> 定位：消除当前已安装运行时 `0.1.1-rc.2` 与项目可复现 pin `0.1.0-rc.7` 的漂移。升级只验证并切换宿主公共合同，不新增产品功能，不改变领域语义、公开 Remote/wire 形状或作品数据。
>
> ✅ **I85 已完成（2026-08-28）**：唯一项目 DSH family pin 已切换为 `0.1.1-rc.2`，完整 base+web+plugin、Client/Remote/Tools/LLM 与生命周期门全绿（`verify:i85` / `verify:stage-16`）。

| ID | 需求 | 验收/证据 | 迭代 | 验证 |
|---|---|---|---|---|
| R17-1 | DSH family 直接依赖、selected-profile 示例与 lockfile 必须统一精确固定为 `0.1.1-rc.2`；Cordis 保持已验证 `4.0.1` 兼容线。 | manifest/profile/lockfile 同版本断言；`0.1.0-rc.7` 残留与 rc.7/rc.2 混装夹具失败。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| R17-2 | 兼容门必须在一次性 `DSH_HOME` 中安装真实 base+web+plugin 组合，证明 bundle 只有一个 insertion owner，Host 可 boot/stop/restart，卸载后副作用归零。 | clean install、compose、boot、stop、restart、DSH 重启、upgrade/uninstall 日志与断言。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| R17-3 | Client 必须通过 `0.1.1-rc.2` ModuleLoader 装载，在 live `shell.overlay` 唯一注册、卸载后消失，并完成 Typert Remote 往返；不得以 Host-only artifact scan 代替浏览器合同。 | 真实 Client graph/ModuleLoader smoke；Slot mount/unmount；Remote 成功/错误/卸载负测。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| R17-4 | Tools 与 `ctx.llm` 必须按 `0.1.1-rc.2` 公共合同验证：Tools 参数执行前 fail closed；LLM request/text-delta/finish/cancel 与 provider-specific stop 能力有确定性断言。 | 真实 ToolRuntime 注册/执行/非法参数测试；真实 LLM runtime fake adapter；stop 支持/拒绝均显式，不静默承诺。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |
| R17-5 | 升级不得改变领域行为、prompt、样本/gold/阈值、公开 Remote/wire 形状或作品 source of truth；修复兼容测试所暴露的两处 Vitest 未 await 警告。 | 全量 723+ 回归、build、held-out、contract lock、生命周期门全绿；作品目录零迁移/删除；Vitest 无未 await 警告。 | I85 | `pnpm run verify:i85`; `pnpm run verify:stage-16` |

---

## 覆盖矩阵

### M-H0. 宿主覆盖矩阵

| 宿主面 | 需求 ID | 迭代 | 必须证明的证据 |
|---|---|---|---|
| selected-profile dependency + pins | H0-1, H0-11, H0-13 | I1, I85 | profile manifest、项目 lockfile、DSH family 同版本、Node22+/pnpm/strict ESM |
| chosen bundle composition + one owner | H0-2 | I1, I85 | `dsh.bundle.patch` + `dsh.profile.bundles` + 单 row |
| ordinary persistent lifecycle | H0-3, H0-12, H0-13 | I1–I2, I85 | install/build/base+web+plugin boot/Client mount/stop/restart/upgrade/uninstall |
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

### M-P. 已交付产品能力 I1–I85 覆盖矩阵（I86–I102 为等价修复，见计划 §18）

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
| 共享 Remote 接线层与组合根收敛 | I75 | R16 |
| llm 解析/检测公共基座 | I76 | R16 |
| wire schema 单一来源与契约补丁修复 | I77 | R16 |
| 契约锁落地与 Client shape 收敛 | I78 | R16 |
| writing-adjudication 拆分与共享写回器 | I79 | R16 |
| onboarding-adjudication 拆分与类型断言消除 | I80 | R16 |
| core 高优先文件拆分 | I81 | R16 |
| client.ts 拆分（一）store/ops | I82 | R16 |
| client.ts 拆分（二）panels/mount/harness | I83 | R16 |
| 低优先级债务清零 | I84 | R16 |
| DSH family `0.1.1-rc.2` 兼容升级 | I85 | H0, R17 |

---

## R18. Stage 18 作者主流程与新增功能需求（I103–I140）

> 定位：R18-1–R18-15 是稳定产品需求 ID，不等同于实现迭代。v2.9（2026-08-31）把 README 的 12 步作者工作流提升为唯一主要交付流程，并在 v2.8 的 I103–I132 之后追加 I133–I140；Stage 18 已由 I140 完整收口并成为 Stage 19 的代码基线。既有 invocation 向后兼容，允许经过 strict schema、contract lock、返回类型耦合与真实 binder E2E 的 additive Remote；§0.1 宿主基线与 13 层叙事模型不变。
>
> 产品方向：**导入思路/梗概/长稿 → 审阅 AI 大纲候选 → 按幕/章/全书生成并修改细纲 → 建立近期场景生成基线 → 每卡生成正文候选 → 接受为草稿/重写/手改 → 分析最终正文 → 一次确认结构化变化与后续细纲调和 → 完成当前卡并进入下一张 → 仅消费有效正文/状态/POV 知情 → 全书一致性检查 → 带目录的单一 TXT/Markdown**。正文保持轻量纯文本；DOCX 编译仍为未来可选项。
>
> Stage 18 只面向本地单用户、单 Host 进程运行，不为多用户、跨进程并发或分布式事务建立额外基础设施。凡一次操作同时修改多个叙事真相层，必须在同一 Host 请求内实时完成，并以稳定 proposal/candidate/operation ID 保证重复调用幂等；失败不得留下后台异步补写叙事层的任务。派生索引与 Markdown 镜像继续遵守各自既有可重建/outbox 合同，不提升为叙事真相层。

### R18-P0 合同前置门

| 要求 | 验收 | 计划迭代 | 精确验证 |
|---|---|---|---|
| 在新增 Stage 18 Remote 前修复 `novelBranches.list` 返回漂移，并建立 Remote/C5/Writing/Review/Branch 当前基线锁。 | Domain→adapter→strict result codec→真实 Client binder 返回一致；非法结果必须在 Host/binder 边界失败；旧 Client 调用保持兼容。 | I103 | `pnpm run verify:i103` |

| ID | 需求与已裁决行为 | 可机器验收与边界 | 计划迭代 |
|---|---|---|---|
| R18-1 | 场景/章节完整 CRUD、元数据、项目级排序；GUI 绑定场景与细纲卡并选择候选落点。绑定由独立 Host `SceneOutlineBinding` 持久化，不改 C5/B5 Schema。非空硬删除必须展示影响并经 I11，不提供垃圾箱。删除按本地单进程模型实现，不新增持久 deletion saga、删除账本、全局 recovery barrier 或 reservation。 | CRUD/排序重开一致；多章排序无中间重复 index；未确认、fingerprint 变化、活动任务/候选时删除零写；确认后同一请求内幂等清理 binding 并删除 C5，重复 apply 不重复副作用；Markdown 镜像复用 I104 outbox；既有历史记录保留，读取时按目标存在性投影 stale；重复/悬空/跨项目绑定拒绝；candidate-production、queue task targeting 与相关 Client projection 不再业务硬编码 `chapter-1`。 | I104–I106 |
| R18-2 | 兼容的 writing candidate 结构化 accept 或 reparse 在写回前展示 C1/C2/C3/C4/B2 diff；会话内冻结 parser outputs、适用时的 I108 细纲基线引用与全部层基线，并精确重放。I135 起普通作者候选主路径先 adopt 为 C5 草稿，最终正文的五层 diff 复用同一纯预览组件并汇入 FinalizationPlan。按细纲卡生成必须有 baseline；历史未绑定正文可显式无 baseline，但不得进入 B5 调和。 | `preview delta == committed delta`；sourceHash、适用的细纲基线或任一层基线变化、parser 失败、取消、拒绝均零写；无 baseline 路径不能伪造 B5 impact；结果有界且无 live object/完整层泄漏；legacy candidate、reparse 与 finalization 三类消费者夹具分别成立。 | I109–I111、I135 |
| R18-3 | Review 问题定位到稳定文本锚点并发起 rewrite 修复候选；接受后复扫。resolved 不持久化，当前 Client 会话保留 resolved 卡，完整重扫/重开后消失。 | UTF-16 range/quote/sourceHash 定位准确；stale 锚点拒绝；硬冲突阻止接受；复扫确认问题消失后才显示 resolved；无 Host resolved 第二真相。 | I128–I129 |
| R18-4 | 当前章节提供语言润色、压缩精简、扩写细节；Client 在当前会话内按 scene.index 逐个创建独立 rewrite candidate，不建立持久章节批次或恢复状态机。 | 每场景绑定独立 sourceHash；三模式均先候选零写；接受/拒绝/失败只影响对应场景；重复裁决沿用既有 candidate 幂等；刷新或重启后不恢复章节级进度，已接受正文保持；硬约束仍执行；不承诺整章原子提交或全书批量。 | I122–I123 |
| R18-5 | 确定性引用在写回获授权后、landing UoW commit 前参与同一事务；禁止 post-commit 第二写入器。需要语义推断的引用只生成 I11 修正候选。提供 operational audit、错误标记与 LLM 修正回路，验证新 owner 后退役旧手填 ID 主路径。 | 维护矩阵逐字段区分派生/作者语义/禁止自动项；幂等、单调知情、未知 ID、跨项目、失败补偿负测；后台 LLM 零静默写；旧 `listField` ID 输入零主路径引用。 | I115–I118 |
| R18-6 | 长稿拆纲和初始化仅用于新建/空作品；非空项目在调用 LLM 前继续按 N-7 fail closed。逐章循环适用于所有项目，下一章消费当前有效细纲生成基线与按叙事顺序选择的作者已保存正文。 | 拆纲样本/held-out ≥80%，fake backend 先行，I11 接受前零写；非空项目拒绝；取消/恢复/重复 apply 幂等；context 消费 chapter.index/scene.index 顺序及当前 baseline，且不注入旧草稿或 stale baseline。 | I119–I121 |
| R18-7 | 作者可见工程术语必须映射为作者语言；动态错误经单一 presentation mapper；技术徽标仅高级视图。I132 先覆盖既有 Stage 18 面板，I140 对最终主流程再次做全量终检。 | denylist/allowlist 机器扫描；aria/title/error/empty state 覆盖；`novel_*`、wire 字段、测试夹具和 `data-novel-*` 锚点不变。 | I132、I140 |
| R18-8 | 角色、关系、知情、审校、时间线、搜索、场景卡之间稳定导航，返回恢复上下文。链接为可重建派生数据，不进入 C5、Markdown、txt 或归档；回传后重新分析。 | 每类 source→target 与返回 E2E；sourceHash stale 安全降级；正文/导出逐字不污染；txt/Markdown/归档零内部链接；回传重建不改原文。 | I124–I127 |
| R18-9 | 章节区按 writing/candidate/versions/materials 四种互斥模式展示，由 `ChaptersLayerState.mode` 单一拥有，不新增顶层 view。 | 四模式互斥；切场景时候选按 target 清理/绑定；隐藏面板零请求/零重复注册；焦点、快捷键、既有 DOM 锚点和窄屏行为保持。 | I107 |
| R18-10 | Host 聚合全部章节→场景→版本的只读树，Client 可比较并显式切换任意场景版本；不做全书快照/修订线。 | Host 单次聚合、按 chapter.index/scene.index 排序、无正文泄漏；`branches.length===0 || chosenCount===1`；diff 后调用新 additive `chooseFresh(..., sourceHash)`，既有四参数 choose 不变；旧局部分支面板无第二 owner。 | I130–I131 |
| R18-11 | 生成前以不可变 `OutlineGenerationBaseline` 冻结 project/chapter/scene/detailBeat、B5 fingerprint 和目标场景卡；作者最终保存正文后，按有界文本 delta 将变化分为 wording-only、story-fact、plot-direction，后两类才可生成对未来细纲的逐卡调和候选。B5 仍是唯一当前细纲真相，任何 AI 调整必须逐卡预览并经 I11；普通保存、纯措辞修改和未确认提案不得调整未来 B5 语义，显式 finalize 只可确定性更新当前卡完成状态。 | baseline 重启恢复且 B5/binding/sourceHash 变化时 stale；分类与调和 held-out 均 ≥80% 且证据锚点准确；已完成/当前/未授权卡、稳定 ID、幕/节顺序不可改；keep/manual/AI/pending 可混合裁决；apply 在同一 Host 请求中按 B5 freshness 原子写回，失败/拒绝零写；“定稿并继续”幂等完成当前绑定卡/C6 并创建下一张有效 baseline，不自动接受正文。 | I108、I112–I114 |
| R18-12 | 作者可选择某一幕、某一章或全书生成细纲候选。Host 范围合同支持幕、B5 章节规划节拍、已绑定 C5 章节和全书，并统一解析为稳定 act/beat/detailBeat 集合；已绑定章节只能通过 SceneOutlineBinding 解析，不允许 Client 猜测。默认 fill-missing 继续只补齐缺失细纲；I150 增加显式 selected-beat append mode，作者从当前已保存节直接输入生成要求并调用 LLM 生成新的追加候选。已有卡、范围外内容、稳定 ID 和顺序始终受保护；新候选可逐卡编辑并选择保留，显式重生成原卡仍需逐卡预览并经 I11。 | act/outline-beat/bound-chapter/all 正向夹具；当前选中节零手填技术 ID；未知、未绑定、脏草稿、空范围和 stale source 负向；append 即使已有卡也有一次有界 LLM 调用；LLM 样本/held-out ≥80%；作者可编辑、重生成、逐卡保留或拒绝；确认前 B5 零写，应用后只向授权节追加所选候选，原卡与范围外 byte/fingerprint 不变。 | I133–I134、I150 |
| R18-13 | 写作候选的主要作者路径必须先“接受为草稿”：只把候选保存到 C5 供作者微调，不提前解析或写回 C1/C2/C3/C4/B2/B5/C6；可重建的正文镜像、索引和统计随 C5 保存自动更新，不进入作者确认。作者保存最终正文后，Host 形成一份统一 `FinalizationPlan`，汇总五层结构变化、作者语义引用变化、未来细纲调和和完成/前进动作，并只要求一次 I11 确认。既有 candidate `accept` invocation 保持兼容但不再是主 UI 路径。 | adopt 后只有 C5 及其可重建派生物变化且正文逐字一致；final plan 绑定最终 sourceHash、generation baseline 与各层 freshness；一份预览覆盖全部叙事真相变化；一次 Gate/一个 Host 请求幂等应用，拒绝、stale、取消或任一子操作失败均不得半应用；不得嵌套第二次作者确认。 | I135–I136 |
| R18-14 | 全部必需细纲卡完成后，系统运行全书一致性与发布就绪检查；未完成卡、待裁决变化、阻断问题或缺失正文关闭正式导出门。通过后按章节/场景真实顺序生成章节目录和单一完整 TXT/Markdown，正文逐字保持；DOCX 不在当前范围。 | 完成门与跨章检查覆盖角色、状态、关系、知情、正史、硬规则、绑定和顺序；阻断/警告分级；编译结果含确定性目录/标题/正文且每种格式恰好一个主稿；重复导出 byte-stable（允许受控元数据除外）；零内部链接、技术 ID 和设定 sidecar 混入正文。 | I137–I138 |
| R18-15 | 创作台默认暴露唯一作者流程“导入 → 大纲 → 细纲 → 生成基线 → 正文 → 定稿同步 → 全书检查 → 导出”，并恢复当前作品的当前步骤。角色/世界观/关系/状态/正史/知情/时间线/审校/版本/搜索/统计/队列/备份/模型设置保留为故事资料、进阶工具或设置；内部 ID、fingerprint、索引维护、Gate/UoW 与层编号不进入普通主路径。I150 进一步要求大纲工作区以当前选择代替技术 ID 输入，全部下拉框显示中文作者术语但保持 canonical wire 值。最终产品必须有覆盖 README 12 步的固定 fake LLM E2E。 | 默认视图为流程而非任一技术层；每个主步骤只有一个 owner/入口，进阶入口不丢能力；普通路径零手填技术 ID/索引操作/重复确认；大纲结构、冲突类型、细纲状态、生成范围等下拉框中文标签与英文 canonical 值逐项映射；端到端覆盖成功、拒绝、stale、硬阻断、失败回滚、重开恢复、POV 过滤、完成门和双格式合稿；产物可查。 | I139–I140、I150 |

### R18 作者功能暴露边界

| 暴露层级 | 功能 | 约束 |
|---|---|---|
| 主要流程 | 来源导入、大纲候选、范围细纲、生成基线、逐卡正文、最终正文分析与一次确认、全书检查、单稿导出 | 默认可达、连续导航、恢复当前步骤；不得要求作者理解内部层编号或技术 ID。 |
| 故事资料/进阶工具 | 角色、世界观、关系、状态、正史、知情、时间线、审校、版本、搜索、统计、生成队列、备份、LLM 设置 | 保留全部能力但不与 12 步并列；同一业务动作只有一个主流程 owner。 |
| 内部/诊断 | 原始 B/C 层徽标、sourceHash/fingerprint/seq、ConfirmationGate/UoW、索引 rebuild/drop、裸 Remote 名与原始错误 | 普通作者界面不可见、不可作为必填输入；只允许高级诊断按需查看。 |

---

## R19. Stage 19 来源确认与幕后素材 POV 叙事化（I141–I149）

> 定位：R19 只修复已交付主流程步骤 1–2 的来源语义与 POV 泄漏缺口。来源中的“客观真相顺序”不等于“读者应直接看到的大纲顺序”。Stage 19 不写 C5、不交付 `preserve-prose`，只把来源解释、作者意图、B5/C3 投影和 C4 安全边界接入既有 `workflow`。

| ID | 需求与已裁决行为 | 可机器验收与边界 | 计划迭代 |
|---|---|---|---|
| R19-1 | 来源角色与目标处理是两根独立轴。来源角色包含想法、梗概/计划、背景/幕后资料、已有正文和混合文档；Stage 19 目标处理只有 `expand-outline|adapt-pov`。`limited` 必须绑定现有角色或稳定待创建主角候选；`omniscient` 不强制单一主角。I141 只建纯合同，I142 才建立 session owner 与 Remote。 | 非法组合、缺 limited POV、未知且无候选 ID 的主角、低置信自动选择、跨项目或 sourceHash 变化全部拒绝；fingerprint byte-stable；I141 不发布无服务语义 Remote；I142 新增 Remote 具 strict schema、contract lock、真实 binder 和非法结果负测。 | I141–I142 |
| R19-2 | Host 对稳定 paragraph ID 生成来源解释建议，分类 `world-truth/plot-plan/prose/author-instruction/presentation-note`；offset 由 Host 投影，混合文档由作者逐段修正并确认。解释结果是 operational evidence，不是第 14 层或素材库。 | 先冻结 dev/held-out/gold，整体与段落分类准确率均 ≥80%；paragraph ranges 有序、无重叠、完整覆盖；取消、非法 JSON、未知段落、超限、模型失败零写；Client 可访问地审阅，未裁决段阻止下一步。 | I143–I144 |
| R19-3 | `background-material|hybrid + adapt-pov` 的 B5 必须按确认视角的行动、调查、误判、冲突和揭示顺序生成；I52 原 B5 不得直接复用。I157 以 R28-2 将同一合同 additive 扩展到 `idea`。 | held-out ≥80%；第一幕直接答案泄漏、硬编码主角、按幕后年表复述、作者指令进入 beat 均失败；B5 带 paragraph evidence，重新生成保持确认意图不变；《灰烬圣典》为真实消费 fixture。 | I145、I157 |
| R19-4 | 幕后事实形成 C3 secret/backstory/foreshadow/plotpoint、holders/KnowledgeState/revealPlan；C4 只允许故事开始时已公开/已建立事件。C3 生成与 C4 确定性 guard 分卡交付。 | C3 held-out ≥80%；holders↔knows 一致；主角未持有隐藏事实；幕后/未来/presentation/作者指令进入 C4 必须失败；reveal 前 POV leak detector 零容忍。 | I146–I147 |
| R19-5 | `NarrativeImportPlan` 明确组合 I52 的 B3/B2/C1/C2 地基候选、Stage 19 B5/C3 与安全 C4，只允许新建/空作品，经一次 I11 预览并按既有逐层语义幂等应用。Stage 19 技术失败允许显式 `partial-failure` 与同 operation 恢复，但不得谎报成功；共享 UoW 机械迁移已后置至 F1。 | 写前全量引用/readiness/freshness 预检；pending/reject/stale 零写；writer 故障准确记录已完成阶段并可重开恢复；重复 apply 不重复实体、知情或正史；成功后 B5 为读者体验、C4 无幕后泄漏、POV context 安全；产品 E2E 与 I1–I140 product-flow 全绿。 | I148–I149 |

### R19 十二步流程调整

README 仍为唯一 12 步，不增加步骤数量：

1. 步骤 1 改为“导入来源并确认来源角色、当前目标处理以及适用 POV/揭示意图”；系统建议不可替代作者确认。
2. 步骤 2 改为“按确认意图生成大纲候选并审阅”；幕后素材生成读者体验 B5 与 C3 揭示候选。Stage 19 识别已有正文但不写 C5；保真路径已后置至 F2。
3. 步骤 3–12 的细纲、生成基线、逐卡正文、一次确认定稿、有效上下文、全书检查和单稿导出编号与 owner 均不变。

## Deferred Package F1. 导入基础设施重构（v3.2 原 R20 / I151–I155）

> v3.3 裁决：本组需求整体后置。下表的迭代号只记录 v3.2 原排期，不是当前执行覆盖；恢复时必须重新编号。原目标仍为将 Stage 19 行为迁移到结构化来源、共享 import operation/checkpoint 与空作品初始化 UoW。

| ID | 需求与已裁决行为 | 可机器验收与边界 | 计划迭代 |
|---|---|---|---|
| R20-1 | Host 建立 canonical `StructuredImportSource`：格式、规范文本、稳定 paragraph ID、heading level、source range 与 sourceHash；既有纯文本/chunks 都是它的兼容投影。 | DOCX/TXT/Markdown 正负 fixture；标题/段落证据稳定；`readDocxText` 与现有 import contract lock 不变；不可靠标题不猜测；Client 不解析文件。 | v3.2 原 I151（后置） |
| R20-2 | 提取共享 `ImportOperation` envelope、checkpoint store、project write lane、freshness/replay 与 plan participant 接口，禁止 Narrative/Manuscript 两套状态机复制。 | canonical schema、持久重开、跨项目/sourceHash/plan 变化 fail closed、重复 operation replay；地基具 NarrativeImportPlan 消费者夹具；不新增作者可见能力。 | v3.2 原 I152（后置） |
| R20-3 | 空作品初始化 UoW 冻结所有 participant 基线和目标快照；失败恢复，恢复中断进入 `pending-recovery`，重启先收敛到全旧或全新状态。 | 每个阶段与恢复阶段故障注入；恢复前禁止普通写；无成功响应对应半应用；不建立分布式事务或后台 LLM 补写器。 | v3.2 原 I153（后置） |
| R20-4 | NarrativeImportPlan 机械迁移到共享 operation/UoW，并删除旧编排和 checkpoint owner；Stage 19 产品行为、公开 contract、样本与结果形状不变。 | delete-first 后零旧引用/双 owner；I141–I150、binder、contract lock、held-out、product-flow 全绿；后置架构 smoke 证明正文 participant 可插入。 | v3.2 原 I154–I155（后置） |

## Deferred Package F2. 已有正文保真导入（v3.2 原 R21 / I156–I162）

> v3.3 裁决：本组需求整体后置，下表编号只作 v3.2 provenance。恢复时必须依赖已重新编号并完成的 F1。原产品目标仍为新增 `existing-prose + preserve-prose`，仅面向新建/空作品并汇入同一十二步 workflow。

| ID | 需求与已裁决行为 | 可机器验收与边界 | 计划迭代 |
|---|---|---|---|
| R21-1 | Host 通过新的 strict additive V2 确认方法开放 `existing-prose + preserve-prose`，再根据 StructuredImportSource 标题/段落证据形成有序 chapter/scene manuscript candidate；I142 旧方法仍只接受/返回 Stage 19 两种 treatment，规范化后的 C5 文字与顺序保真。 | 新旧 Remote 分别具 contract lock/binder；ranges 完整覆盖且无重叠，可确定性重建；重复标题稳定异 ID；不可靠层级降级单章/单场景；空正文、超限、hybrid 未决、非空作品在 LLM 前拒绝；模型伪造 C5 字段严格失败。 | v3.2 原 I156（后置） |
| R21-2 | 反向 B5/SceneOutlineBinding 与其他 B/C 候选分开生成并携带 paragraph evidence；复用 I52/I119 与 Stage 19 C3/C4 owner，不修改其 prompt 语义。 | B5 与 chapter/scene range 映射可解析；无法可靠绑定保持 pending；既有 held-out 全绿；结构候选改变不能改变 C5；POV context 不泄漏。 | v3.2 原 I157–I158（后置） |
| R21-3 | `ManuscriptImportPlan` 分离预览 Host-owned C5、B/C 候选和 binding，冻结全部 ID/range/fingerprint，并只经一次 I11。 | 未确认/reject/stale/非空项目零写；跨层引用与全文 fidelity 在提案前通过；Client 双预览可访问且不复制文件解析。 | v3.2 原 I159（后置） |
| R21-4 | TextRepository 提供后置 F1 UoW participant，在一个目标快照中创建章节/场景/chosen C5 并复用 mirror/outbox；不得伪装成 AI candidate accept/finalization。 | participant prepare/commit/restore/replay 故障注入；正文、分支与镜像不重复；重开后 chapter.index→scene.index 与源一致。 | v3.2 原 I160（后置） |
| R21-5 | ManuscriptImportPlan 通过共享 UoW 应用 C5+B/C+已确认 binding，主流程自动路由并完成产品 E2E。 | 任一 participant 或恢复故障不暴露可用半项目；重复 apply 为 replay；已有正文从导入、全书检查到最终单稿保持一致；背景/混合/正文三路、拒绝、stale、恢复与累积 product-flow 全绿。 | v3.2 原 I161–I162（后置） |

## R22. 查漏补缺（I150–I151）

> 定位：先收口已交付作者主流程的明确缺口，再考虑恢复 F1/F2。I150 仍只属 R18-12/R18-15；I151 实现首次导入的 B1/B4 一次性初始化。

| ID | 需求与已裁决行为 | 可机器验收与边界 | 计划迭代 |
|---|---|---|---|
| R22-1 | 仅在 Host 确认的新建/空作品**首次受控导入事件**中，同时启动一个 Host-owned“规则与文风初始化” LLM 任务。它是独立于 I52 六层 analyzer 的单次 strict B1+B4 候选任务，不改 `ONBOARDING_LAYER_KEYS`。候选可编辑，规则初稿强制 `immutable:false`，经唯一 I11 确认和 freshness 复验后由 Host 分别写入 `rules/*.yaml` 与 `style.yaml`；成功后不再提供 LLM 重生成，后续只经 I67 控制面手工改写。 | 先冻结 dev/held-out/gold 和 fake backend，B1/B4 每类 ≥80%；首次导入精确一次 LLM，同 operation 重试/重放不重复启动；应用启动、Client 挂载、`projectOpen`、重开、空白创建、后续导入和“B1/B4 文件为空”均零 LLM；跨 project/source/session、stale、reject/cancel、非空 B1/B4、非法结果和任一写入失败零覆盖/不伪成功；重启只从本地文件读取。 | I151 |

## R23. DSH credentials seam 兼容修复（I152）

| ID | 需求 | 验收/证据 | 迭代 |
|---|---|---|---|
| R23-1 | `novelLlmConfig` 不得直接解析或改写 `$DSH_HOME/.credentials.yaml`；Host 必须经 DSH `ctx.credentials` 的 `describe/set` 管理 `NOVEL_CUSTOM_API_KEY`。`novel-custom` provider id、Remote 形状、A2 路由及生成参数保持不变。 | 真实 rc.2 `LocalCredentialProvider` 消费者夹具生成 `version: 1` + `refs` 合法文档并可立即 resolve；其他 refs/records 保留；缺 seam、环境只读遮蔽、写入失败均 fail closed 且零 settings/A2 写；源码负向扫描无凭据文件直写；全量测试与 I85 宿主兼容回归全绿。 | I152 |

## R24. 目录层首次受控导入入口修复（I153）

| ID | 需求 | 验收/证据 | 迭代 |
|---|---|---|---|
| R24-1 | 目录层 DOCX 创建并打开新作品后必须先启动既有来源语义审阅，不得直接进入旧六层分析；来源审阅不得依赖 `OnboardingState` 才可见。背景资料、已有正文来源选项及背景资料→按视角重构→限知下的已有主角入口必须可达。I151 仍只在首个来源 session 确认后启动。 | Client 产品夹具从空目录完成上传、新建/打开、来源选择、已有主角、段落裁决、确认和 I151 begin；确认前旧六层 begin=0 且 I151 begin=0，确认后 I151 begin=1；无 OnboardingState 仍渲染审阅；非法 Host chunks 与陈旧项目回调 fail closed；I150/Remote/schema/enum contract lock 零变化。 | I153 |

## R25. 来源审阅解释提示（I154）

| ID | 需求 | 验收/证据 | 迭代 |
|---|---|---|---|
| R25-1 | 来源角色、段落来源类型、段落处理与“合并此分类”旁必须显示统一帮助按钮；hover 与键盘 focus 展开详细说明，原生 title 降级并以 tooltip ARIA 关联。提示必须解释全部选项、来源片段的当前 chunk 语义以及“合并”零拼接/零领域写副作用。 | Client 纯渲染夹具断言四类 help、详细文案、`type=button`、`aria-describedby`、`role=tooltip`、hover/focus CSS；点击真正“合并此分类”仍只产生 accepted 决策；全量/product-flow 绿。分段、enum、Host/Remote、prompt/schema/样本零变化。 | I154 |

## R26. 既有作品归档与恢复（I155）

| ID | 需求 | 验收证据 | 迭代 |
|---|---|---|---|
| R26-1 | 活动作品可归档；归档作品不在主项目列表显示，独立归档区只允许恢复。归档后 `projectOpen` 与新旧项目级仓储写均必须 fail closed；恢复后作品内容、ID 与名称原样可打开。 | Host 仓储夹具证明活动树→`.archive`→活动树的往返及元数据字节不变；墓碑阻断已缓存编辑器迟到写；Client 夹具证明主列表零归档项、归档区零打开入口、归档/恢复刷新双目录；三个 strict additive Remote 通过 descriptor/result lock、真实 binder 正负向测试。永久删除、自动/批量归档、归档内编辑与 ProjectMeta schema 变化均为零。 | I155 |

## R27. 来源审阅 session 首次落盘恢复（I156）

| ID | 需求 | 验收证据 | 迭代 |
|---|---|---|---|
| R27-1 | Windows 下来源审阅 session 的原子 rename 遇到瞬时 `EPERM/EBUSY/EACCES` 必须有界重试；失败后作者可在不重新上传 DOCX 的情况下原地重试。普通提示不得泄漏工程细节，但高级详情必须保留原始原因。 | Host 故障注入证明 transient 错误后同一合法 session 落盘、非 transient/耗尽仍拒绝；Client 产品夹具证明首次 create 失败后按钮可达、第二次只复用原 Host chunks/sourceHash 并进入分析，已有 session 的分析失败不创建第二 session；公开 Remote/schema/lock、I151 触发、LLM 与分段零变化。 | I156 |

## R28. 来源主角作者语义与视角叙事化（I157）

| ID | Requirement | Acceptance | Iteration |
|---|---|---|---|
| R28-1 | session-create 失败后的原地重试必须保留作者已填写的来源角色、处理目标、POV、揭示节奏和逐段裁决；来源审阅 UI 不得要求手填角色或知情信息技术 ID。 | 产品夹具在失败后修改全套审阅选择，再重试并断言界面与 create 输入均保持；DOM 中无“主角 ID”“候选 ID”“初始已知信息 ID”输入；已有角色仅显示名称，空作品默认“AI 创建主角”。 | I157 |
| R28-2 | `idea|background-material|hybrid + adapt-pov` 均允许 LLM 提议并串联新的限知主角；内部 candidate ID 由 Client 按 project/source 确定性生成且不展示。`synopsis|existing-prose` 维持拆纲边界。 | 新 i157 dev/held-out/gold ≥80%；idea strict Remote/schema round-trip；LLM 输出缺主角、ID 漂移或 B5 未引用新主角均失败；contract locks/binder 更新且旧字段兼容；未确认仍零写。 | I157 |

## R29. 来源导入 Remote 的 Host 网关可达性（I158）

| ID | Requirement | Acceptance | Iteration |
|---|---|---|---|
| R29-1 | 所有已由产品 Client 挂载的来源导入 strict Remote descriptors 必须同时登记在唯一 Host Typert face，使 DSH Gateway 能认领 `/api/<namespace>/<method>`。不得用 REST fallback、动态 handler 或第二注册 owner 掩盖遗漏。 | 集合守卫证明 import interpretation、analysis、rule/style initialization、narrative adaptation/reveal/import-plan 六组 Client descriptors 在 Host face 中零缺失/零重复；真实 Registry+Gateway+plugin 完成 `novelImportInterpretation/create` 往返并在卸载后撤销；未知 endpoint 保持不认领；既有 contract locks 不变。 | I158 |

## R30. 作者入口、技术 ID 与中文术语收口（I159–I161）

R30-1 取代 R12-2 中“目录层直接展示六层初始化审阅”的产品入口要求；R12-2 其余作品切换、脏表单与目录层新增作品能力继续有效。

| ID | Requirement | Acceptance | Iteration |
|---|---|---|---|
| R30-1 | `workflow` 的“导入”必须成为唯一普通作者入口；目录层新作品、已打开空作品的 DOCX/自由文本均先进入来源语义审阅。产品 Client 不得再直接启动旧六层 analyzer，进阶导航不得再公开“六层初始化审阅”；非空作品仍按 N-7 引导新建独立作品。 | DOM/路由消费者夹具证明 workflow import、目录 DOCX、空作品 DOCX/文本均进入同一 source review；旧 `data-novel-onboarding-start`、旧入口文案和产品 Client `startAnalysis/analyzeText` 调用归零；确认前旧六层 begin=0/I151 begin=0，确认后既有 import session 后续链不回归；legacy route deep-link 收敛到新入口。 | I159 |
| R30-2 | 所有作者操作不得要求填写章节、场景、POV、规则、父条目、细纲目标、调和计划或其他技术 ID。新实体 ID 隐藏生成；引用字段使用名称/实体选择器或当前上下文派生，未知/已删除引用只显示只读缺失态。 | 全量 DOM 扫描无文本型 ID 控件和“请输入/填写 ID”文案；章节/场景/规则新建、POV、B2 parent、B5 binding、reconciliation、搜索过滤均以真实实体消费者夹具往返 canonical ID；重名可区分、未知引用不丢失且不能自由输入；Remote/schema/持久值逐字段不变。 | I160 |
| R30-3 | 全部作者可见控件、枚举、状态、帮助和 ARIA 使用中文作者术语；canonical 英文值不得作为 label/fallback。旧原始 JSON 编辑器改为中文结构化表单。只允许文件格式、模型标识、服务地址与作者内容等窄 allowlist。 | 机器扫描覆盖静态/动态文本、option、placeholder、ARIA、fallback 和真实 DOM，`holder/revealPlan/status/Gate/ConfirmationGate/supersede/seq/diff/Stage/Ixx/N-x` 与 raw enum 归零；角色/世界观/关系等枚举中文往返；旧六层及规则/文风初稿无 JSON textarea；allowlist 不误伤 canonical wire/data 锚点。 | I161 |

## R31. 来源片段裁决闭环（I162）

| ID | Requirement | Acceptance | Iteration |
|---|---|---|---|
| R31-1 | 保留段落来源类型作为 POV/泄密安全边界；系统在类型建议旁给出确定性处理建议。作者可在规范原文范围内拆分当前片段或与下一片段合并，变更后必须重新分析；实际改分类自动形成 edited，不能把 edited 当作与 accepted 同义的手选项。 | 纯函数证明拆分/合并逐字保真、range 有序无重叠且非法边界 fail closed；DOM 消费夹具证明类型与处理建议同屏、光标拆分/相邻合并可达、decision 下拉退役；controller 证明重分段会 discard 旧 session 并新建/重跑，确认摘要携带最终 role；旧无 role session 仍兼容；prompt/样本、B/C/C5、I11 与来源原文不变。 | I162 |

---

## Deferred / 非目标

| ID | 项目 | 约束与理由 |
|---|---|---|
| N-1 | SillyTavern 迁移/格式适配 | 明确排除 ST 一键迁移及世界书兼容导入导出。导入到已有作品的通用 B2/B5 候选走 I37–I38；新建/空作品的作者入口由 I159 统一进入 I141–I149 来源语义审阅，I50–I53 旧六层只保留兼容合同；正文保真初始化保留于后置 F2，当前无迭代号；自定义可移植包走 I39。可参考字段思想，不建立兼容 owner。 |
| N-2 | 向量检索 | 语义向量检索和 B2 `vector` trigger 延后；当前使用关键词/正则/全文与 I40 精确 SQLite 索引。文件始终是 source of truth。 |
| N-3 | standalone host/UI | 不做独立 Node/Vite 应用、独立 Web server、SPA、HTML 入口、浏览器 LLM、浏览器直读/直写作品文件或 DSH 之外的受支持主路径。I51 文件选择器只允许把受限用户输入运输到 Host 临时区，Client 不解析且不成为文件 owner。 |
| N-4 | 多用户服务与模型微调 | 起步为本地单用户、中文优先；不含租户、账号系统或训练 pipeline。 |
| N-5 | 自动强制改写大纲 | 偏差先记录；R18-11 只允许系统分析影响并生成逐卡调和候选。接受新方向或调整未来细纲必须由用户逐卡选择并经 ConfirmationGate；wording-only、普通保存、未确认和后台扫描均不得修改未来 B5 语义，只有显式 finalize 可确定性推进当前卡完成状态。 |
| N-6 | UI 主题完整体系 | A2 可配置但后置，不阻塞 I33–I36 工作区；不得借此引入第二 UI shell。I46–I49 创作台视觉体系消费宿主 `--dsw-alias-*` token 明暗适配，不建立 novel 自有主题引擎，A-7 保持后置。 |
| N-7 | 已有非空作品合并导入 | Stage 10、Stage 19、I151 与后置 F2 均只面向新建/空作品；不静默合并或覆盖已有 B/C 层或 C5。未来若支持必须单独定义冲突、迁移、备份与逐项确认合同。 |
| N-8 | C2 扩展对象 | `items`、`factions`、`globalFlags` 仍属设计 §5.9 目标模型，但当前 `worldStateSchema` 只交付 scene/characters。扩展须单独进行 schema/storage/迁移/UI 迭代；I50–I53 不生成这些字段。 |
| N-9 | 重构改变领域契约与产品能力 | Stage 15（I75–I84）重构只消除复制与接线债务：不改变任何领域契约、公开 Remote/wire 形状、LLM 样本/gold/阈值与产品功能；公开服务改名属破坏性变更，另行立项走兼容迁移。 |
| N-10 | 作者笔记/批注/素材库 | P1.6 作者裁决：不在本项目考虑范围。R19 可把一次受控导入来源解释为幕后素材，但不会建立长期素材收藏、批注、标签或第二内容 owner。 |
| N-11 | 独立“继续写作”仪表盘 | 不另建与创作流程竞争的首页；R18-15 的唯一流程壳必须恢复当前作品、当前步骤与选中场景，这属于主流程连续性而非第二个首页。 |
| N-12 | 富文本/专注写作编辑器 | P0.3 作者裁决：正文编辑非重要内容，保持轻量 textarea 编辑（微调即发布），不立项。 |
| N-13 | 正式 DOCX 交稿编译 | P1.11 作者裁决：Markdown 交付可接受，DOCX 编译不做。 |
| N-14 | P2 系列（C2 items/factions/globalFlags 扩展、语义向量检索、写作计划/截止日/日更节奏） | 作者裁决：P2 全部暂不考虑；items/factions/globalFlags 与向量检索分别维持 N-8/N-2 的后置定位。 |

---

## 结论

**直接结论：I1–I158 已完成。当前顺序执行 Stage 28 / I159，统一 workflow、目录层与作品内 DOCX/自由文本来源导入入口；I160–I161 依次收口作者手填技术 ID 与中文术语/结构化表单。v3.2 原 I151–I162 仍只作后置 F1/F2 provenance。**

H0 是不可被产品功能抵消的最高优先级；I1 必须保持 Host-only，I2 必须保持 gate-only。I54 已按 D20 选定单一 `shell.overlay` 右侧停靠侧板路径；I85 不重开该产品决策，只验证其在 `0.1.1-rc.2` live Slot 合同中的装卸与零 fallback。内部 Extension 始终只是产品内部能力点。当前执行、验收与完成声明不得使用历史 `I1a–I28b2`；它们仅存在于 Git 历史和 v1.x provenance 中，不是当前权威。
