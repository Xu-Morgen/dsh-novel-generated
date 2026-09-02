# AI 长篇小说创作器 — 完整设计文档

> 版本：v3.3
> 状态：v3.3 当前设计权威；**I1–I154 全部完成**；当前顺序执行 I155，为既有作品提供 Host-owned 归档/恢复与强制只读边界；v3.2 原 I151–I162 保持后置 provenance 且不占用当前连续编号；以 DeepSeek Harness/Cordis 普通持久插件为唯一当前实现方向
> 定位：DeepSeek Harness 内具备持久化叙事状态的 AI 长篇小说创作器（不是独立前端）

## 0. 版本变更记录

| 版本 | 变更 |
|---|---|
| v1.1（历史来源） | provenance only：设计定稿（13 层模型 + 7 引擎 + 生成/注入/一致性/存储/扩展）；不构成当前执行权威。 |
| v1.2（历史来源） | provenance only：产品升级为「创作环境」，引入细纲、世界观一级能力、辅助 agent、导入导出/编辑 UI、不变设定索引层等；不构成当前执行权威。 |
| v1.3（历史来源） | provenance only：曾将计划细分为 57 个迭代并引入 ConfirmationGate、thin 闭环等执行安排；这些 v1.x 迭代标签与顺序不构成当前执行权威。 |
| v1.4（历史来源） | provenance only：曾将计划细分为 68 个迭代并补充真实 LLM thin 切片、原子性、规模 smoke 与样本金标规则；这些 v1.x 迭代标签与顺序不构成当前执行权威。 |
| **v2.0** | **架构重置**：将 v1.x 的独立 Node/Vite 应用方向记为历史且已被取代；DeepSeek Harness（DSH）成为唯一运行宿主和主交付形态，产品作为 ordinary persistent plugin（普通持久插件）交付；生产安装/组合合同唯一见 §0.1.1。13 层叙事模型、引擎、存储、导入导出、编辑与 agent 产品设计继续有效，唯有与宿主边界冲突的实现方式失效。 |
| **v2.0（增补 2026-08-24）** | 新增 §14.6「创作台」UI 重设计：在 I33–I36 已交付的 Slot 工作区之上，重做信息架构与视觉体系（编辑台/书斋方向），记录决策 D11–D14 与迭代 I46–I49；§0.1 宿主基线不变，A-7 novel 自有主题系统仍后置。 |
| **v2.1（2026-08-24）** | 新增 §14.7「作品启动与六层初始化」及 Stage 10（I50–I53）：修复缺失的 Host-owned 作品启动编排，增加多作品选择、空白作品、受控 DOCX 上传、自由文本六层分析、逐层裁决与幂等落地；记录 D15–D19。§0.1 宿主基线不变。 |
| **v2.2（2026-08-26）** | 将 I1–I53 同步为已完成；新增 Stage 11–13（I54–I72），先把居中浮窗退役为 DSH 内右侧停靠侧板并修复现有 UI，再交付 P0 正文写作闭环与 P1 能力可达性；记录 D20。§0.1 宿主基线不变。 |
| **v2.2（增补：剧情时间线）** | 新增剧情时间线层（§5.13）：把 B5 大纲结构展开为有序剧情时间轴（timeline.yaml），节点可安排揭示信息与关系建立时机；C1 关系注入改为按「当前时间线节点之前已建立」过滤（§8），C3 revealAt 可对齐时间线节点；onboarding 落地 B5 后自建骨架，作者可手动编辑保存。记录 R15/I73–I74。§0.1 宿主基线不变。 |
| **v2.3（2026-08-27）** | 依据 `docs/novel-creation-tool-architecture-review.md`（v1.0）§9 新增 **Stage 15 架构债务消除（I75–I84）**：共享 Remote 接线层、llm 解析/检测公共基座、契约单一来源、两个 god service 拆分、client.ts 拆分、core 高优先文件拆分与低优先级债务清零；记录 D21–D22。重构只消除复制与接线债务，不改变任何领域契约与公开 Remote/wire 形状。§0.1 宿主基线不变。 |
| **v2.4（2026-08-28）** | 同步 I1–I84 已完成事实与当前 DSH `0.1.1-rc.2` 运行时观测；新增 **Stage 16 / I85 DSH family 兼容升级**，由专门迭代把项目 pin、selected profile 与 lockfile 从 `0.1.0-rc.7` 切换到 `0.1.1-rc.2`，并补齐真实 base+web+plugin、Client ModuleLoader、Slot、Typert Remote、Tools 与 `ctx.llm` 兼容门；记录 D23。I85 完成前，运行时观测版本不得冒充可复现项目依赖基线。 |
| **v2.7（2026-08-29）** | 同步 **Stage 17 / I86–I102 已完成**的代码与 Git 事实；将 R18 十个产品 epic 拆为 **Stage 18 / I103–I128** 的 26 个合同地基与垂直切片。记录 D24：既有 Remote invocation 向后兼容，允许经 strict schema、contract lock、返回类型耦合与真实 binder E2E 验证的 additive 合同；记录 D25：Stage 18 的持久化、候选、链接、审校、润色与导入边界按 §14.14 冻结。旧 I103–I112 十张大卡与“Stage 18 先于 Stage 17”声明被本版取代。§0.1 宿主基线与既有 13 层叙事模型不变。 |
| **v2.7 范围修订（2026-08-31）** | 按本地单用户运行边界收缩 I106 与当时编号 I118（v2.8 现 I122）：删除 I106 durable deletion saga/journal/audit/reservation/recovery barrier，改为现有 project write lane 内实时幂等的 binding→C5 删除；章节润色编排退回 Client 会话级逐场景状态，不持久化章节批次。新增横切裁决：多叙事真相层写回必须同一 Host 请求内实时且幂等，派生 mirror/index 继续复用既有 outbox/可重建合同。 |
| **v2.8（2026-08-31）** | 同步 I103–I105 已完成事实；核查确认现有 C5 分支、C2 快照、B2 版本、B5 `version` 字段与会话级 parser baseline 均不构成可复用的“细纲生成版本化基线”，现有受控写回也明确不自动写 B5。新增 **R18-11 正文变更影响分析与后续细纲调和**，以 I108 建立不可变生成基线，以 I112–I114 交付变更分类、下游影响、调和候选和确认式应用；原 I108–I128 依赖顺延并重编号，Stage 18 扩展为 I103–I132 共 30 个迭代。§0.1 宿主基线与既有 13 层叙事模型不变。 |
| **v2.9（2026-08-31）** | 将 README 的 12 步作者工作流提升为唯一主要产品、交付和端到端验收流程。新增 R18-12–R18-15 与 I133–I140：按幕/章/全书生成细纲、候选接受为可编辑草稿、最终正文的一次确认式统一定稿、全书完成与一致性门、带目录的单一 TXT/Markdown、作者优先流程壳和产品级 E2E。既有能力按“主流程 / 进阶工具 / 内部诊断”重新裁决暴露边界；§0.1、13 层真相和旧 Remote invocation 保持不变。 |
| **v3.0（2026-09-01）** | 同步 I106–I140 全部完成事实；新增 Stage 19 / R19 与 I141–I149，修复“来源中客观幕后真相被直接当作读者可见大纲”的语义缺口。导入先确认来源类型与目标处理方式，再分别执行幕后素材的 POV 叙事化、C3 秘密/揭示规划或已有正文 C5 保真导入；混合文档按段审阅。README 仍保持 12 步唯一主流程，只扩充步骤 1–2；§0.1、13 层模型和 I1–I140 历史保持不变。 |
| **v3.1（2026-09-01）** | 按设计审查收缩 Stage 19：I141–I149 只交付来源确认、幕后素材 POV 叙事化、C3/C4 安全边界与主流程 E2E，不再夹带 C5 保真导入。新增 Stage 20 / R20（I150–I154）以纯重构建立结构化来源、共享 import operation 与空作品初始化 UoW；新增 Stage 21 / R21（I155–I161）在该地基上交付已有正文保真导入。修复原 I141 过早冻结 Remote、I146 隐含通用 UoW、I147 隐含结构化 DOCX reader 及后半段大卡过重问题；§0.1、13 层模型和 I1–I140 历史保持不变。 |
| **v3.2（2026-09-01）** | 在原 I150 前插入范围细纲生成修复 I150：当前选中节直接成为生成范围，作者可提交生成要求并对已有节显式追加新的 LLM 候选，逐卡选择是否保留；已有卡与范围外内容保持保护。大纲工作区下拉框显示中文标签但不改变 canonical 枚举。原 Stage 20 顺延为 I151–I155，原 Stage 21 顺延为 I156–I162；22 个 Stage 与宿主基线不变。 |
| **v3.3（2026-09-01）** | 将 v3.2 原 I151–I162 导入基础设施与正文保真卡片整体改为后置设计包，原编号只作 provenance，恢复时必须重新编号。当前路线切换为查漏补缺：I150 已完成范围细纲修复，I151 只在作品首次导入事件中启动一次 Host-owned“规则与文风初始化” LLM 任务，候选经 I11 后分别落地 `rules/*.yaml` 与 `style.yaml`，后续只允许用户经现有 B1/B4 控制面手工改写。应用启动/打开作品不得被视为初始化事件。§0.1 宿主基线与 I1–I150 交付事实不变。 |
| **v3.3 宿主兼容修订（2026-09-02）** | 同步 I151 已完成事实；按连续编号新增 I152，修复 `novelLlmConfig` 直接按旧扁平布局改写 `.credentials.yaml` 的宿主合同违例。凭据状态与保存只经 `ctx.credentials.describe/set`；`novel-custom` provider、公开 Remote、A2 路由及生成行为不变。v3.2 后置卡片的旧编号只作 provenance，不占用当前编号。 |
| **v3.3 导入入口修订（2026-09-02）** | 同步 I152 已完成事实；新增 I153 修复目录层 DOCX 新作品入口仍直接启动旧六层分析、且来源审阅渲染错误依赖 `OnboardingState` 的接线回归。新作品上传后先进入既有 Stage 19 来源审阅；背景资料/已有正文与已有主角入口可达，确认后才触发 I151。I150 仍只属于范围细纲生成，不重写其历史边界。 |
| **v3.3 来源审阅提示修订（2026-09-02）** | 同步 I153 已完成事实；新增 I154，在来源角色、段落来源类型、段落处理和“合并此分类”旁提供统一 hover/focus 帮助，解释所有枚举与真实副作用。“段落”明确为当前 Host 来源片段而非 Word 段落一一映射；不改变分段、分类、裁决或 Host 合同。 |
| **v3.3 作品归档修订（2026-09-02）** | 同步 I154 已完成事实；新增 I155，为既有作品增加 Host-owned 归档/恢复。归档树移出活动目录，主列表不再显示；活动位置墓碑阻断归档前缓存仓储的迟到写，所有新项目访问经统一路径 seam 拒绝归档 ID。新增 strict additive lifecycle Remote 与只恢复、不打开的归档区。 |

> **v3.2 historical supersession / 历史同步状态**：本段只记录 v3.2 曾将剩余排期定为 I150–I162；该排期已被下方 v3.3 current supersession 取代。README 的 12 步主流程已由 I140 交付，I150 只修复步骤 3 的范围细纲体验。历史 v1.x 文本、旧 I103–I112 大卡及 v2.7 的 I107–I128 编号只保留 provenance，不得恢复旧 React/Vite 独立应用计划、旧编号或“Stage 18 先行”顺序。两份 architecture review 仍只是已完成 Stage 15 / Stage 17 的立项输入，不修改本文件 §0.1 宿主基线。
>
> **v3.3 current supersession / 同步状态**：I1–I154 已完成，当前顺序执行 I155 作品归档与恢复。v3.2 原 Stage 20/21 与原 I151–I162 只作后置设计 provenance，不得以历史身份执行且不占用当前连续编号；I155 不恢复 F1/F2。
>
> 本文后续保留的“v1.x”“v1.2 新增/降级”等标签仅标记需求与决策的**历史来源（provenance）**；它们不恢复旧里程碑、旧迭代顺序或旧宿主实现的当前执行权威。

## 0.1 宪法级宿主基线（不可由普通变更修改）

> **NON-MODIFIABLE HOST BASELINE / 非可修改宿主基线**
>
> 1. **DeepSeek Harness 是本项目唯一运行宿主和主交付形态。** 创作器必须是 DSH 进程中的普通、持久、可组合 Cordis Plugin，并严格采用 §0.1.1 的唯一生产安装/组合合同。它不是、也不得附带第二个独立应用主路径。
> 2. 发布物必须是 **ordinary persistent plugin（普通持久插件）**。这是本项目对“其 npm/仓库 Cordis plugin package 与 composition row 均跨 DSH 重启持续存在”的工程术语，**不是 DSH 定义的一种 artifact kind**。动态 `cordis_define` 仅可用于临时原型和设计验证，**永远不是 release、安装或生产装载路径**；生产安装、组合与本地 smoke 的边界唯一见 §0.1.1。
> 3. 本基线不得因普通迭代、重构、兼容性工作、迁移便利或临时交付而放宽。若未来决定让其他宿主或独立应用成为主路径，必须明确终止本项目的当前身份并建立新项目，而不是在本项目中增加第二条主路径或兼容 fallback。

### 0.1.1 外层组成与运行边界

> **唯一规范性生产安装/组合合同**（其他章节只能引用本节，不得另立或复制规则）：
>
> 1. **Plugin patch 路径**：plugin package dependency 必须声明在**所选 profile 的 `package.json`**。composition row 的插入必须恰好由一个 composition layer 拥有：只能由该 profile 的 `cordis.patch.yml` 或优先级更高的 home `cordis.patch.yml` 之一插入，绝不能两者同时插入；更高优先级 layer 可按 id 覆盖既有 row 的配置，但不得重新插入或复制该 row。home patch **没有独立的 dependency location**，package 仍必须从所选 profile/DSH dependency chain 解析。
> 2. **Bundle 路径**：bundle package dependency 必须显式安装并声明在**所选 profile 的 `package.json`**；package manifest 必须声明 `dsh.bundle.patch`，且该 bundle 必须在**所选 profile** 的有序 `dsh.profile.bundles` 中显式列入。仅安装 package 不会自动激活 bundle patch。
> 3. **仓库 composition 边界**：仓库 `cordis.yml` 如存在，**只**用于本地 Loader smoke；它不是生产安装、发现或组合入口。DSH 随附（shipped）composition 永不编辑。
>
> Bundle 路径与直接插入 plugin row 的 Plugin patch 路径对同一 deployment 必须互斥，只能择一作为当前安装合同；任何 deployment 中 plugin row 的插入 owner 都必须恰好为一个 composition layer。装载、停用与组合均由 DSH/Cordis 管理。

| 概念 | 规范性职责 |
|---|---|
| **Composition** | 严格执行本节上述唯一生产安装/组合合同；不存在 home patch 专属依赖目录、自动 bundle 激活或仓库 `cordis.yml` 生产发现等第三条路径。 |
| **外层 Cordis Plugin** | 产品的运行与发布单元，提供 Host 面以及可选 Client 面。它与 §11 的小说内部 Extension 不是同一概念。 |
| **Host** | 唯一拥有作品文件 I/O、目录选择后的路径使用、凭据/SecretRef 解析、LLM 调用、持久化与索引、领域 Services、Events、模型 Tools、导入导出和业务校验。Host 通过 DSH/Cordis 公共契约向 Client 暴露最小能力。 |
| **Client** | 只拥有注册到 DSH Web GUI **Slot** 的界面、交互状态和视图适配；只调用 Host 暴露的受控能力，不拥有领域真相。 |
| **Fiber** | 每项 Service、Event 监听、Tool、Slot 注册、样式、定时任务及其他副作用都必须归属当前 Cordis Fiber，并在停止、更新或卸载时可完整 dispose。 |

### 0.1.2 数据、LLM、凭据与 UI 的所有权

- 文件式作品数据仍是 source of truth（§10）；文件读写、SQLite/向量索引和导入导出全部在 Host。
- LLM 后端选择、请求、流式处理、重试和解析全部在 Host；Client 不得直接连接 OpenAI/Anthropic/兼容端点。
- 长期凭据只可由 Host 经 DSH credentials/settings seam 或环境变量引用解析；不得进入 Client bundle、浏览器存储或界面 props。
- UI 必须作为 Client Plugin 注册到经核验的 DSH Slot。Client **禁止**自带独立 HTML、调用 `createRoot()` 自挂载、启动独立 Vite Web 应用、直接访问作品文件或复制 Host 业务逻辑。
- 生产 Host–Client 接口必须采用当前 DSH 对普通 out-of-tree 持久插件公开并受版本约束的正式契约；动态插件示例中的 `harness.handle` / `host.call` **不得被发明或推定为生产 RPC 合同**。

### 0.1.3 包、构建、发现与 Host–Client 兼容性门

- 生产安装与发现严格引用 §0.1.1 的唯一合同，不在本节另立依赖、patch、bundle 或仓库 composition 规则。
- **运行时观测与项目 pin 必须分离（I85 已完成切换）**：I85 把唯一可复现项目 DSH family pin 从 `0.1.0-rc.7` 原子切换为 `0.1.1-rc.2`——manifest（根 `package.json`）、selected-profile 示例与权威 lockfile 现全部精确固定 `0.1.1-rc.2`（Cordis 保持已验证 `4.0.1` 兼容线），并通过真实 selected-profile base+web+plugin boot、完整 Client gate 与生命周期验证。`0.1.1-rc.2` 现为唯一项目 pin，不再是运行时观测版本。任何后续升级仍必须进入专门兼容性迭代。
- **I1（Host-only 地基）**：package manifest 必须通过 I1 建立并验证的项目 DSH 基线公共入口暴露 Host；Host 构建必须能被实际安装并由所选 profile 启动。I1 严格为 Host-only，**不尝试 Client gate**，不得预建 Client seam、伪 RPC、Client probe、产品 UI 或独立 UI fallback。
- **I2（专用兼容性门迭代）**：I2 是唯一获准在门禁通过前产生 Client 代码的例外，但只可构建证明普通 out-of-tree plugin 公共合同所必需的**最小、非产品 Client probe**。该 probe 仅用于证明公共 client bundling/装载、按 §0.1.1 完成 selected profile boot、向一个经核验 Slot 注册以及 Fiber dispose 后完整卸载；不得加入任何产品 UI、领域行为、产品 Host–Client seam、独立 HTML、独立 SPA 或其他 standalone 路径。
- **I2 通过条件与停止线**：I2 必须针对 I1 的项目依赖基线证明普通 out-of-tree plugin 可用且受支持的**公共 Remote 合同与公共 client bundling/装载合同**，并留下真实 package build、selected profile boot、单一 Slot 注册/卸载 smoke 的可执行证据。不得以动态插件的 `harness.handle` / `host.call`（动态 RPC）代替证明，也不得采用未发布或 internal 的 builder/`clientBundle` API 作为 fallback。若该公开、受支持的 out-of-tree 合同不能被证明，I2 判失败并停止，**不得开始任何产品 Client 工作**。
- **产品 Client 起点**：只有 I2 兼容性门全部通过后，后续迭代才可依据已证明的公共 contracts、Client exports、manifest 与 bundle 形态开始产品 Client 实现；I2 probe 本身不得演化为产品 UI。
- 仓库不得把独立 Vite HTML app、第二个 Web server、独立 SPA shell 或浏览器直接 LLM/file seam 作为运行、开发验收或发布前提。构建工具即使内部复用 Vite，也不得产出或要求独立应用入口。

### 0.1.4 负向架构验收与 falsifiers

出现下列任一项即判定架构不合格，而不是“兼容模式”：

1. 离开 DeepSeek Harness 后仍存在被支持的主要运行路径，或必须另启 Web 应用才能使用核心能力；
2. release 依赖动态 `cordis_define`，或不能按 §0.1.1 的唯一合同完成生产安装、装载、停用和再次装载；
3. Client 包含独立 HTML/`createRoot()`、持有长期密钥、直连 LLM、直接读写作品文件或绕过 Host 修改状态；
4. Host 的 Service/Event/Tool、Client 的 Slot 或任一副作用在 Fiber dispose 后仍残留；
5. 除 I2 最小非产品 Client probe 外，在 §0.1.3 兼容性门通过前实现任何产品 Client；I2 probe 超出公共合同证明范围、加入产品 UI/standalone 路径，或门禁证据缺少真实 build、selected profile boot、单一 Slot 注册/卸载 smoke 中任一项；
6. 把小说内部 Extension 当作可独立装载的外层 Cordis Plugin，或为 v1.x 独立应用保留第二 owner/fallback。

---

## 1. 文档概述

### 1.1 目标

本文件定义一款 **AI 辅助长篇小说创作器**（下称「创作器」）的完整架构。它要解决的核心问题是：

> 现有 AI 角色扮演工具（以 SillyTavern 为典型）本质是**无状态聊天器**，把「世界观、角色、关系、时间线、物品状态」等一切信息**降维成一段扁平文本**交给模型，一致性完全依赖模型在上下文窗口内自行推断。当故事超过上下文窗口、或需要长线伏笔/多视角/可校验状态时，这一范式必然失效。

创作器通过**把叙事信息重新结构化、分层管理**，让模型每次生成都建立在一个**可查询、可校验、可持久化的叙事状态**之上。

### 1.2 范围

- ✅ 本文覆盖：分层模型、数据 Schema、运行时引擎、生成流程、注入策略、一致性机制、存储、扩展性、路线图。
- ⚠️ 本文不覆盖：具体 UI 交互细节、具体 LLM 后端协议实现、模型微调。

### 1.3 术语表

| 术语 | 含义 |
|---|---|
| **层（Layer）** | 一类职责边界清晰、可变频率与可逆性明确的叙事信息集合 |
| **正史（Canon）** | 已发生且不可逆的叙事事实，append-only |
| **状态（State）** | 可随时改写的、描述「当下」的信息快照 |
| **揭示/知情（Knowledge）** | 秘密、真相以及「哪个角色知道什么」 |
| **大纲（Outline）** | 预设剧情骨架，作为生成方向的「引力」而非「牢笼」 |
| **注入（Injection）** | 把某层信息序列化为文本、拼入 LLM 上下文的动作 |
| **Cordis Plugin** | 由 DSH Composition 装载、在 Cordis Fiber 中运行的外层产品/发布单元 |
| **Extension** | 创作器领域内部的可插拔能力点（Provider/Injector/Validator/Parser/规则/后端等），不等于外层 Cordis Plugin |
| **Host / Client** | Host 拥有数据、LLM、凭据与业务能力；Client 只拥有 DSH Slot UI |
| **POV** | 叙事视角（point of view），决定某角色视角下可见哪些信息 |

---

## 2. 背景与问题定义

### 2.1 SillyTavern 范式的本质

SillyTavern 的运行时模型可概括为：

```
用户输入
  → 组装一段扁平文本（系统提示词 + 角色卡 + 世界书命中条目 + 聊天历史 + 作者备注）
  → 一次性发给 LLM 后端
  → 流式返回 → 追加进聊天历史
```

其关键特征与缺陷：

| 特征 | 带来的问题 |
|---|---|
| 无状态（只有聊天历史） | 没有「世界状态」；角色在哪、带了什么、心情如何全凭模型记忆 |
| 扁平文本上下文 | 所有信息在同一平面竞争 token，无法分层管理 |
| 无时间线引擎 | 无法表达「预设剧情骨架 vs 实际涌现事件」的偏差 |
| 无正史账本 | 已发生事实可能被模型遗忘或矛盾，无校验 |
| 无关系/知情管理 | 无法做多视角叙事，秘密会泄漏到不该知道它的角色 |
| 一致性靠模型 | 超出上下文窗口后必然漂移 |

### 2.2 目标产品定位

创作器 = **「结构化的叙事状态引擎」 + 「分层上下文组装器」 + 「LLM 生成器」** + 「创作环境工具链」。

它不是一个「更花哨的聊天框」，而是一个**把故事当作可管理数据**的创作环境：

- 短篇：像聊天一样快速起稿；
- 长篇：状态、正史、大纲、关系、揭示全程受管，跨章节保持一致；
- 多视角：每个角色拥有独立的「知情集合」，POV 切换不串味；
- 可校验：生成结果能被自动检查是否违反规则、正史、知情约束；
- 可起步：导入既有文本，由 agent 自动拆分大纲/世界观/细纲（§14.2）；
- 可编辑：分层编辑界面精确调整设定（§14.1）；
- 可落地：依据大纲按章节/字数写作，快速重写、固定段编辑，落地为 txt/docs 文件（§14.4）；
- 可分享：自定义单文件包导入/导出 + 纯文本导出（§14.3）；
- 可持续：独立调用的续写/灵感 agent 帮助突破卡文，随剧情调整大纲与细纲（§14.5）。

---

## 3. 设计目标与原则

### 3.1 设计目标

1. **长线一致性**：超出上下文窗口仍能保持角色、关系、状态、伏笔的一致。
2. **叙事可控性**：大纲提供方向牵引，但不剥夺用户的涌现自由。
3. **多视角安全**：秘密与知情按 POV 隔离。
4. **可解释、可回滚**：每一条状态/正史变更可追溯、可撤销（在可逆性允许范围内）。
5. **模型无关**：分层是数据模型层，与具体 LLM 后端解耦。
6. **可移植**：全部内容可导出为纯文本/标准格式，不锁定专有格式。

### 3.2 核心原则

| 原则 | 说明 |
|---|---|
| **分层职责分离** | 每类信息归入唯一定义好的层，互不混叠 |
| **状态结构化** | 用字段而非散文存状态，注入时再序列化为摘要 |
| **正史只增不改** | 已发生事实 append-only，更正需显式 `supersedes` |
| **大纲是引力不是牢笼** | 大纲牵引方向，偏差被记录而非被强制纠回 |
| **POV 感知** | 信息按视角过滤注入，防止上帝视角泄漏 |
| **可逆性分级** | 不同层有不同的可逆性：状态可改、正史不可改、规则不可违 |
| **一切可序列化** | 任何层都能降级为纯文本，保证模型可消费、可导出 |
| **宿主与所有权唯一** | DSH/Cordis 是唯一宿主；Host 持有业务与 I/O，Client 只持有 Slot UI，所有副作用随 Fiber 回收 |

---

## 4. 总体架构：三轴分层模型

### 4.1 三根正交的轴

任何一条叙事信息，都可以用三根轴定位：

```
轴一 归属轴（谁拥有）：   系统 ──────────→ 用户
轴二 稳定性轴（多稳定）： 固定 ── 替换 ── 定义
轴三 可变性轴（多常变）： 不变 ── 渐变 ── 每回合变 ── 只增不改
```

- **轴一 × 轴二** 回答「这层是谁的、能换吗」——对应引擎机制的分层；
- **轴三** 回答「这层在故事推进中怎么变」——对应叙事内容的分层。

### 4.2 最终层清单（13 层）

按归属与职责归为三大类：

```
A. 系统机制层（与具体作品无关，工具提供）
   A1 引擎核心层       （系统固定）
   A2 可插拔系统层     （系统替换）

B. 作品设定层（用户设一次，作品内基本稳定）
   B1 规则层
   B2 世界观层
   B3 角色核心层
   B4 风格层
   B5 大纲层（预设骨架）

C. 运行时叙事层（随故事推进而变化）
   C1 关系层           （渐变）
   C2 状态层           （每回合变）
   C3 揭示/知情层      （只增）
   C4 正史/记忆层      （只增不改）
   C5 生成文本层       （可编辑、可分支）
   C6 大纲层（执行态）  （执行进度与偏差）
```

> **注（v1.2）**：「细纲」不是第 14 层，而是 B5/C6 大纲层的子结构（beat 下挂场景卡，见 §5.7）；「不变设定索引层」不是叙事层，而是存储层的数据库索引（见 §10.4），均不改动 13 层模型。

### 4.3 层 × 三轴总表

| 层 | 归属 | 稳定性 | 可变性 | 可逆性 | 注入方式 |
|---|---|---|---|---|---|
| A1 引擎核心层 | 系统 | 固定 | 不变 | — | — |
| A2 可插拔系统层 | 系统 | 替换 | 不变 | 可替换 | — |
| B1 规则层 | 用户 | 固定 | 不变 | 不可违 | 恒定 |
| B2 世界观层 | 用户 | 固定 | 低变 | 名义固定，剧情可改写 | 触发+检索 |
| B3 角色核心层 | 用户 | 固定 | 低变（可成长） | 缓变 | 恒定（可压缩） |
| B4 风格层 | 用户 | 固定 | 不变（可局部覆盖） | 覆盖式 | 恒定 |
| B5 大纲层（预设） | 用户 | 固定 | 预设固定 | 可改写 | 导航指令 |
| C1 关系层 | 用户 | 定义 | 渐变 | 可升降 | 摘要 |
| C2 状态层 | 用户 | 定义 | 每回合变 | 可反复改写 | 快照 |
| C3 揭示/知情层 | 用户 | 定义 | 只增 | 不可倒退 | POV 过滤 |
| C4 正史/记忆层 | 用户 | 定义 | 只增不改 | 不可逆（可 supersede） | 检索+摘要 |
| C5 生成文本层 | 用户 | 定义 | 每回合变 | 可编辑、可分支 | 原文/摘要 |
| C6 大纲层（执行） | 用户 | 定义 | 渐变 | 可调和 | 导航指令 |

---

## 5. 分层规格与数据 Schema

> 约定：`string[]` 为字符串数组；`Record<string, any>` 为自由键值（旗帜/变量）。所有实体带 `id`、`version`，供追溯。

### 5.1 A1 引擎核心层（系统固定）

**职责**：引擎本身，正常使用中永不变。

- DeepSeek Harness 的 Node Host 运行时、数据存储结构、分层组装流水线、LLM 代理与流式传输、各层 Schema 定义、变量宏系统（`{{user}}`、`{{pov}}` 等）。

**Schema**：不面向用户，由引擎内部实现决定。仅要求：所有层的读写都经过 Host 引擎提供的统一 Service 接口，禁止 Client 或 Extension 绕过接口直接改文件。

### 5.2 A2 可插拔系统层（系统替换）

**职责**：工具提供、用户可替换的机制件。

- 提示词模板、Instruct/Jailbreak 预设、UI 主题、采样参数、内部 Extensions、LLM 后端适配器。

```yaml
BackendAdapter:
  id: string
  protocol: 'openai' | 'anthropic' | 'kobold' | 'textgen' | 'custom'
  endpoint: string
  model: string
  auth: SecretRef
  samplingDefaults: { temperature: number, top_p: number, ... }
PromptTemplate:
  id: string
  backendRef: string
  roleHeaders: { system: string, user: string, assistant: string }
  sectionOrder: string[]        # 各层注入的先后顺序
  stopSequences: string[]
InstructPreset:
  id: string
  backendRef: string
  systemPrompt: string          # Instruct 模式系统提示词
  jailbreak: string             # Jailbreak 前缀（可选）
  activationRegex: string       # 何时启用（可选）
```

### 5.3 B1 规则层

**职责**：世界的「物理法则」——不可违、违则出戏的硬约束。

**可变频率**：极低（设定即定）。**可逆性**：不可逆（`immutable: true` 时）。

```yaml
Rule:
  id: string
  scope: 'global' | 'faction' | 'location' | 'character' | 'item'
  kind: 'physics' | 'magic' | 'technology' | 'genre' | 'taboo' | 'permission'
  statement: string             # 自然语言规则
  priority: number              # 冲突时数值大者优先
  immutable: boolean            # true = 绝对硬约束，生成校验器拒绝违反
  examples: string[]            # 正例/反例，帮助模型理解
  active: boolean
```

### 5.4 B2 世界观层

**职责**：地理、历史、势力、文化、种族、概念、神器等设定。

**可变频率**：低；名义固定，但剧情可显式改写（如「王国灭亡」）。

```yaml
WorldEntry:
  id: string
  kind: 'geography' | 'history' | 'faction' | 'culture' | 'race' | 'concept' | 'artifact'
  title: string
  content: string               # 主描述
  keywords: string[]            # 触发词
  triggerMode: 'keyword' | 'regex' | 'constant' | 'vector'
  weight: number
  parent: string                # 层级关系（子条目随父条目触发）
  mutable: boolean              # 剧情可否改写它
  status: 'active' | 'obsolete' | 'rewritten'
  supersededBy: string          # 若被改写，指向新条目
  version: number
```

### 5.5 B3 角色核心层

**职责**：角色的「不变内核」——性格、背景、动机、能力、口吻。

**关键区分**：角色核心（不变）与角色状态（C2，随时变）**必须分开**，不可混叠。

```yaml
CharacterCore:
  id: string
  name: string
  aliases: string[]
  kind: 'protagonist' | 'antagonist' | 'supporting' | 'extra' | 'pov'
  personality: string
  background: string
  motivation: string
  goals: string[]
  flaws: string[]
  abilities: string[]
  speechStyle: string           # 口吻/用词习惯
  staticTraits: string[]        # 不可变特质
  arc:                          # 角色弧光，连接大纲层
    startingPoint: string
    desiredEnd: string
    keyBeats: string[]
  relationships: string[]       # 指向 C1 关系层
  knowledgeIds: string[]        # 指向 C3 知情集合
```

### 5.6 B4 风格层

**职责**：叙事人称、时态、POV 范围、文风、章节格式。

**可变频率**：全局固定，可被单个章节覆盖。

```yaml
StyleProfile:
  id: string
  name: string
  person: 'first' | 'second' | 'third-limited' | 'third-omniscient'
  tense: 'past' | 'present'
  povScope: 'single' | 'multi' | 'omniscient'
  tone: string                  # 基调
  proseStyle: string            # 文风
  chapterFormat: string         # 章节结构约定
  dialogueConventions: string   # 对白/独白约定
  forbidden: string[]           # 禁用表达、套路、陈词滥调
```

### 5.7 B5 / C6 大纲层（预设骨架 与 执行态）

**职责**：预设剧情结构、章节目标、伏笔与回收、冲突弧、结局候选。

**分两个子层**：B5 是「预设骨架」（用户固定），C6 是「执行态」（随故事推进变化：当前进度 + 偏差记录）。

```yaml
Outline:
  id: string
  structure: 'three-act' | 'hero-journey' | 'serial' | 'free'
  logline: string
  themes: string[]
  acts:
    - id: string
      index: number
      title: string
      goal: string              # 本幕戏剧目标
      beats:
        - id: string
          title: string
          description: string
          charactersInvolved: string[]
          conflictType: 'internal' | 'external' | 'relational' | 'world'
          prerequisites: string[]   # 前置条件（依赖其他 beat）
          optional: boolean         # 硬性 vs 可选
          detailBeats:              # 细纲（v1.2）：beat 下的场景卡/细 beat
            - id: string
              title: string
              summary: string       # 本场景内容摘要
              pov: string           # 建议视角
              wordTarget: number    # 目标字数（配合 §14.4 按字数写作）
              points: string[]      # 场景要点（发生了什么）
              status: 'planned' | 'writing' | 'done'
  foreshadowing:
    - id: string
      hint: string
      payoff: string
      status: 'unplanted' | 'planted' | 'payed'
      knownBy: string[]         # 知情角色
  endings:
    - id: string
      title: string
      conditions: string[]      # 触发条件
      description: string

# C6 执行态
OutlineProgress:
  outlineId: string
  currentAct: string
  currentBeat: string
  completedBeats: string[]
  deviations:
    - id: string
      planned: string           # 原计划
      actual: string            # 实际发生
      reason: string
      reconciled: boolean       # 是否已调和回大纲
  tensionLevel: number          # 当前冲突强度
```

### 5.8 C1 关系层

**职责**：角色间/势力间的关系网络，随剧情渐变。

**可变频率**：渐变。**可逆性**：可升降（数值调整）。

```yaml
Relationship:
  id: string
  from: string                  # 角色/势力 id
  to: string
  type: 'kin' | 'romantic' | 'friendship' | 'rivalry' | 'enmity' | 'allegiance' | 'mentor' | 'subordinate'
  affinity: number              # -100 ~ +100
  trust: number                 # 0 ~ 100
  status: string                # 自由文本补充
  milestones: string[]          # 关系里程碑，指向 C4 正史
  knownTo: string[]             # 哪些角色知道这段关系
```

### 5.9 C2 状态层

**职责**：描述「当下」的世界快照——谁在哪、带了什么、心情如何、天气时间、旗帜开关。

**可变频率**：每回合变。**可逆性**：可反复改写（支持快照回滚）。

```yaml
WorldState:
  id: string
  seq: number                   # 单调递增，可回溯
  storyTime: string             # 故事内时间
  scene:
    location: string
    timeOfDay: string
    weather: string
    season: string
    atmosphere: string
  characters:
    - characterId: string
      location: string
      alive: boolean
      health: string
      mood: string
      inventory: string[]
      condition: string         # 自由文本：受伤/醉酒/伪装…
      currentGoal: string
      flags: Record<string, any>
  items:
    - id: string
      name: string
      holder: string            # 在谁身上
      location: string
      state: string             # 完好/损坏/遗失…
      properties: Record<string, any>
      history: string[]         # 流转记录，指向 C4 正史
  factions:
    - factionId: string
      territory: string[]
      resources: Record<string, any>
      stance: Record<string, 'ally' | 'neutral' | 'hostile'>
      flags: Record<string, any>
  globalFlags: Record<string, any>
```

> **v2.1 已交付子集（v2.2 保持）**：现有 `worldStateSchema` 与 Stage 10 六层初始化只覆盖 `scene`、`characters` 及基础 `id/version/seq/storyTime`；`items`、`factions`、`globalFlags` 保留为 C2 目标模型，但须进入后续独立 schema/storage 迭代后才可由 UI、parser 或初始化分析器产出，I50–I53 不得以自由字段偷渡。

### 5.10 C3 揭示/知情层

**职责**：秘密、伏笔、真相，以及「哪个角色知道什么」——多视角叙事的安全阀。

**可变频率**：只增。**可逆性**：知情不可倒退。

```yaml
KnowledgeEntry:
  id: string
  fact: string                  # 秘密/真相/信息
  kind: 'secret' | 'foreshadow' | 'plotpoint' | 'backstory'
  holders: string[]             # 当前知情角色
  revealPlan:
    revealTo: string[]          # 计划揭示对象
    revealAt: string            # 计划揭示时机
  status: 'hidden' | 'partially-revealed' | 'revealed'

KnowledgeState:
  characterId: string
  knows: string[]               # 指向 KnowledgeEntry id
```

### 5.11 C4 正史/记忆层

**职责**：已发生且不可逆的事实账本——一致性的真正载体。

**可变频率**：只增。**可逆性**：不可逆；极少数更正走 `supersedes`（需显式确认）。

```yaml
CanonEvent:
  id: string
  seq: number                   # 全局单调递增，append-only
  storyTime: string
  kind: 'event' | 'decision' | 'revelation' | 'statechange' | 'dialogue'
  summary: string               # 事实摘要（不可篡改）
  detail: string                # 详细记录
  participants: string[]
  location: string
  consequences: string[]        # 后果，链到后续事件
  affectedLayers: string[]      # 影响了哪些层（state/relationship/knowledge/…）
  immutable: true
  supersedes: string            # 极少数：更正旧事件时指向被更正者
```

### 5.12 C5 生成文本层

**职责**：正文/对话本身——最终产物，可编辑、可重写、可分支。

```yaml
Chapter:
  id: string
  index: number
  title: string
  pov: string                   # 本章视角角色
  status: 'draft' | 'revised' | 'canon'
  scenes:
    - id: string
      index: number
      content: string           # 正文
      summary: string           # 场景摘要（用于压缩注入）
      beats: string[]           # 对应的大纲 beat
      canonEvents: string[]     # 本场景产生的正史事件
      branches:                 # 草稿/分支
        - id: string
          content: string
          chosen: boolean
      notes: string
```

---

### 5.13 剧情时间线层（方案 A，R15 / I73–I74）

**职责**：把 B5 大纲结构展开为一条有序剧情时间轴（`timeline.yaml`），为「哪些关系在什么时候建立、哪些信息在什么时候被谁知晓」提供确定性锚点——C1 关系注入按「当前时间线节点之前已建立」过滤（§8），C3 的 `revealAt` 可对齐时间线节点 label；解决 C2/C4 `storyTime` 与 C3 `revealAt` 均为自由文本、无统一排序轴的问题。

```yaml
Timeline:
  id: string
  version: number
  currentNodeId: string | null   # 手动选择的当前节点；null = 按写作位置自动锚定
  nodes:                         # 有序节点（order 全局严格递增，0 起）
    - id: string
      order: number
      label: string              # 生成时 = 幕 · 节 · 细纲卡；可编辑
      storyTime?: string         # 故事内时间标注（自由文本，作者可填）
      beatId?: string            # 绑定 B5 beat（可选）
      detailBeatId?: string      # 绑定 B5 细纲卡（可选）
      reveals:                   # 该节点揭示的信息（作者安排）
        - entryId: string
          revealTo: string[]
      relationships: string[]    # 该节点建立/公开的关系（C1 id，作者安排）
```

契约与不变式：

- 骨架由 `buildTimelineFromOutline` 确定性生成：按 acts → beats → detailBeats 展开，细纲卡逐卡成节点，无卡的 beat 自成一节点；`reveals`/`relationships` 初始为空，等待作者在面板安排。
- 「当前时间线节点」锚定双模式：手动选择（`currentNodeId` 优先，作者在面板设置）或自动按当前写作位置（当前细纲卡 detailBeatId → beatId）匹配；均未命中则不过滤（兼容时间线未配置的数据）。
- 关系过滤语义：只保留「≤ 当前节点 order 已建立」的关系（`effectiveRelationshipIds`）；已被时间线安排的关系按时间过滤，**未被安排的关系始终保留**（旧数据不因时间线出现而消失）。
- 时间线是可编辑的规划文档，不成为 C1/C3 的写 owner：作者安排的 `reveals`/`relationships`/`storyTime`/`currentNodeId` 保存后，写作上下文按同一文档过滤；C1/C3 本体仍由既有 Domain Service 与 ConfirmationGate 控制。
- onboarding `finalApply` 落地 B5 后自建骨架（大纲就绪前 fail-closed，不生成空时间线）。

---

## 6. 运行时引擎设计

| 模块 | 职责 |
|---|---|
| **状态引擎 StateEngine** | 状态层（C2）的读写、事务、快照回滚 |
| **正史账本 CanonLedger** | C4 的 append-only 落库、一致性查询、supersede 确认 |
| **大纲导航器 OutlineNavigator** | 定位当前 beat、计算偏差、生成导航提示 |
| **知情过滤器 KnowledgeFilter** | 按 POV 过滤可注入的揭示/知情信息 |
| **关系引擎 RelationshipEngine** | （v1.2 降级为**可选增强**）依据正史事件规则计算关系数值变化；默认关系变更由解析 agent 唯一写入 |
| **上下文组装器 ContextAssembler** | 按分层注入策略把各层序列化为提示词，展开 `{{user}}`/`{{pov}}` 变量宏 |
| **叙事解析器 NarrativeParser** | 独立 agent 逐层解析正文 → 结构化增删改，机械写回各层 |
| **辅助 agent（§6.7）** | 拆分/分类/续写/灵感四类独立 agent，支撑创作环境工具链 |

### 6.1 状态引擎（StateEngine）

- 状态每次变更产生新 `WorldState` 快照（`seq` 递增），支持**回滚到任意快照**。
- 提供事务接口：一个用户行为触发的多字段变更要么全部生效，要么全部回滚。
- 提供「状态 diff」：对比两个快照，供正史账本抽取变更事实。

### 6.2 正史账本（CanonLedger）

- **只追加**：新事件只能 `append`，不能修改已落库事件。
- 提供查询：按角色、地点、时间、关键词、语义向量检索。
- **更正通道**：发现旧事件错误时，不修改原记录，而是新增一条 `kind: 'correction'` 且带 `supersedes` 的事件，并需用户显式确认。旧记录保留，标记为「被更正」。

### 6.3 大纲导航器（OutlineNavigator）

- 输入当前状态 + 正史，判断「下一个未完成 beat」是什么、其前置条件是否满足。
- 生成**导航提示**（而非强制指令）注入上下文，例如：

```
[当前剧情目标] 主角尚未取得关键信物（Beat: "寻得信物"），前置条件已满足。
```

- 检测偏差：用户行为偏离预设 beat 时，记录 `Deviation`，让用户选择「拉回大纲」或「接受新方向并改写大纲」。

### 6.4 知情过滤器（KnowledgeFilter）

- 生成某 POV 时，只注入该角色 `KnowledgeState.knows` 集合内的条目。
- 生成后做「泄漏检测」：若输出里出现了该角色本不该知道的信息，提示用户（而非静默通过）。

### 6.5 关系引擎（RelationshipEngine，v1.2 降级为可选增强）

> **决策（D9）**：关系变更的主路径由 §6.6 的关系解析 agent 唯一写入；本引擎**后置为可选的可解释性增强（内部 Extension）**，默认不启用，避免双机制写 C1 打架。

- （可选）定义规则：某类正史事件触发关系数值变化。例：`kind:'betrayal'` → 相关关系 `trust -= 30`。
- 数值变化记录来源（链到正史事件），保证「为什么关系变了」可解释。
- 启用时作为 §11.1 的「关系规则」扩展点挂载，与解析 agent 的写回通过「同一事务、先 agent 后规则（规则仅补充解释）」仲裁。

### 6.6 叙事解析器（NarrativeParser）

**设计原则（D3 已定）**：叙事解析**独立于正文生成**——用**单独的解析对话（agent）**提交给 LLM，**逐层查看**、**规则化输出**、**机械应用**。

- **独立对话**：解析使用专属系统提示词的 agent 完成，与正文生成分离，不占用、不污染正文上下文。
- **逐层解析（仅单层查看）**：一次只针对**一个层**，比较「新正文」与「该层当前内容」，只输出该层需要的**增 / 删 / 改**。
- **规则化输出要求**：每个解析 agent 收到严格的输出 Schema，只允许输出 Schema 定义的字段（`op`、`target`、`field`、`action`、`value`、`confidence`），不做自由发挥。
- **机械应用**：引擎按返回的结构化结果，**确定性执行**对应层的增删改，不再二次解读。

**解析流水线**（每段被接受的正文触发，各 agent 独立、可并行）：

```
正文 ──→ [状态解析 agent]   → 状态层(C2) 增删改
      ──→ [关系解析 agent]   → 关系层(C1) 增删改
      ──→ [知情解析 agent]   → 知情层(C3) 增删改
      ──→ [正史解析 agent]   → 正史账本(C4) 追加（append-only）
      ──→ [世界观解析 agent] → 世界观层(B2) 改写（需用户确认，可选）
```

**输出契约示例**（状态解析 agent）：

```yaml
input:
  prose: "爱丽丝从长桌上拿起铜钥匙，转身走出大厅。"
  layer: state
  current: { 爱丽丝: { location: 大厅, inventory: [] } }
output:                 # 仅允许以下字段
  ops:
    - op: modify
      target: 爱丽丝
      field: inventory
      action: add
      value: 铜钥匙
      confidence: high
    - op: modify
      target: 爱丽丝
      field: location
      value: 未知
      confidence: medium
```

**职责边界**：解析 agent 只负责「识别变更」，不负责「判断合理性」——合理性由第 9 章一致性校验器在落库前把关；低置信（尤其正史写入）的变更走用户确认。

### 6.7 辅助 agent（v1.2 新增）

除「正文生成 agent」与「叙事解析 agent」外，创作环境工具链新增四类**独立调用**的辅助 agent，均复用分层 Schema 与存储接口，与正文/解析上下文隔离：

| Agent | 触发 | 职责 | 对应需求 |
|---|---|---|---|
| **拆分 agent** | 用户导入既有文本 | 文本 → 大纲/世界观/细纲 的初始拆分，产出结构化条目供用户确认 | D-1/D-2 |
| **分类 agent** | 拆分/解析产出「可确认、单一定位、反复引用不变」的设定时 | 把设定分类、去重后写入「不变设定索引层」（§10.4），供按需检索 | D-6 |
| **续写 agent** | 用户显式调用 | 基于当前状态/正史/大纲/细纲续写下一段，避免卡文 | D-7 |
| **灵感 agent** | 用户显式调用（灵感时刻） | 给出 2–3 个可选的剧情发展方向，并可随剧情调整大纲与细纲 | D-7 |

---

## 7. 生成流程（请求生命周期）

```
① 用户输入（写正文 / 对话 / 指令）
        │
② 大纲导航器 → 定位当前 beat，生成导航提示
        │
③ 状态引擎 → 读取当前世界状态快照
        │
④ 知情过滤器 → 按当前 POV 过滤揭示/知情信息
        │
⑤ 正史账本 → 检索相关历史（关键词 + 向量）
        │
⑥ 上下文组装器 → 按分层注入策略拼装提示词
        │
⑦ 调用 LLM 后端 → 生成候选文本
        │
⑧ 一致性校验器 → 校验规则/正史/知情约束
        │
⑨ 用户裁决 → 接受 / 重写 / 分支
        │
⑩ 叙事解析器 → 独立 agent 逐层解析（状态/关系/知情/正史），输出结构化增删改
        │
⑪ 写回：更新状态层(C2) / 关系层(C1) / 正史账本(C4) / 知情层(C3)
        │
        └──→ 回到 ①
```

关键点：**⑩⑪ 是创作器与聊天器的本质区别**——每段被接受的文本都会经过「解析 → 结构化写回」，让状态、正史、关系持续累积，而不是只追加一段话。

> **辅助流程（v1.2，见 §14）**：上述十步是「正文生成」主流程；「续写」走同一流程但以大纲/细纲当前 beat 为导航目标，「灵感」只产出方向选项（不写回正史），「快速重写」是对 C5 已生成段落的重生成，「导入拆分」是 §14.2 的一次性初始化流程。它们复用同一引擎，不新增第二套核心闭环。

---

## 8. 分层注入策略（上下文组装）

不同层用不同方式进上下文，受控分配上下文预算（示意比例，可调）：

| 层 | 注入方式 | 预算占比 | 触发条件 |
|---|---|---|---|
| B1 规则层 | 恒定注入 | ~5% | 始终 |
| B4 风格层 | 恒定注入 | ~5% | 始终 |
| B3 角色核心 | 恒定（可压缩） | ~15% | 当前场景相关角色 |
| B2 世界观 | 触发 + 检索 | ~10% | 关键词/正则/向量命中 |
| B5 大纲 | 导航指令 | ~5% | 当前 beat 摘要 |
| C1 关系 | 摘要 | ~5% | 相关角色对，且 ≤ 当前时间线节点已建立（R15，见 §5.13） |
| C2 状态 | 结构化快照 | ~15% | 始终 |
| C3 知情 | POV 过滤后事实 | ~5% | POV 已知 |
| C4 正史 | 检索 + 摘要 | ~20% | 相关性检索 |
| C5 生成文本 | 原文/摘要 | 剩余 ~15% | 近期原文 + 远期摘要 |

> **剧情时间线（方案 A，R15）**：C1 关系注入由时间线文档（§5.13）控制「何时建立」——
> 写作上下文只注入「当前时间线节点之前已建立」的关系（未安排关系始终保留，
> 兼容旧数据）。当前节点锚定 = 手动选择优先，否则按当前细纲卡/beat 自动匹配；
> 时间线缺失/未锚定时回退为全量注入（行为不变）。

### 8.1 注入策略要点

1. **恒定层**（规则/风格/角色核心）永远在最前，建立「故事地基」。
2. **结构化层**（状态/关系/知情）序列化为**紧凑的键值/摘要**，而非散文，省 token 且无歧义。
3. **历史层**（正史/生成文本）用「**近期原文 + 远期摘要 + 向量检索**」三档压缩，长故事也不爆上下文。
4. **大纲**只注入「当前目标」一句导航提示，不把整本大纲塞进去。
5. **变量宏展开（v1.2）**：ContextAssembler 在序列化前展开 `{{user}}`（当前用户/作者名）、`{{pov}}`（当前 POV 角色名）等宏，注入文本不残留宏占位符。
6. **I12 固定预算边界**：在尚无模型 tokenizer/configuration owner 的 I12，B1 rules 固定为 4,000 UTF-16 code units、B4 style 固定为 3,000、两 section 合计固定为 6,000；调用方不得覆盖这些值，任何变更必须由后续专门迭代更新本契约。
7. **细纲（v1.2）**：当前 beat 若有「细纲·场景卡」，仅注入当前场景卡摘要与目标字数，作为写作导航指令的一部分（§14.4）。

---

## 9. 一致性机制

分两档处理（D6 已定）：

| 档 | 触发条件 | 违反时行为 |
|---|---|---|
| **硬约束（阻断）** | ① 违反 B1 规则层 `immutable: true`；② 与 C4 正史直接矛盾；③ POV 知情泄漏 | 校验器**拒绝**输出/落库，要求重写；或用户**显式改设定**（如「升级为已揭示」）后放行 |
| **软约束（提示）** | 关系数值漂移、大纲偏差、风格偏离、实体小瑕疵 | 标黄警告，用户可「接受并继续」覆盖 |

### 9.1 一致性校验器（ConsistencyValidator）

在**生成后（校验正文）**与**落库前（校验解析出的结构化增删改）**两道关口各跑一次：

1. **规则检查**：是否违反任何 `immutable: true` 规则 → 硬约束。
2. **正史检查**：是否与已落库正史事实矛盾（关键词/实体/语义比对）→ 硬约束。
3. **知情检查**：是否泄漏当前 POV 未持有的 `KnowledgeEntry` → 硬约束。
4. **关系/大纲/风格/实体检查**：数值漂移、偏差、小瑕疵 → 软约束。

结果以「通过 / 警告 / 拒绝」三态返回：硬约束违例=拒绝，软约束违例=警告，供用户裁决。

---

## 10. 存储与持久化

### 10.1 方案：文件式（默认，推荐）

一个作品 = 一个目录，与 SillyTavern 的 `data/` 哲学一致，天然可移植、可 git 版本化：

```
project/
├── project.yaml              # 元数据 + 全局配置 + 引用各层文件
├── rules/                    # B1 规则层
│   └── *.yaml
├── worldview/                # B2 世界观层
│   └── *.yaml
├── characters/               # B3 角色核心层
│   └── *.yaml
├── style.yaml                # B4 风格层
├── outline.yaml              # B5 大纲（预设骨架）
├── relationships/            # C1 关系层（当前态）
│   └── *.yaml
├── state/                    # C2 状态层（快照）
│   └── state-{seq}.yaml
├── knowledge/                # C3 揭示/知情层
│   └── *.yaml
├── canon/                    # C4 正史账本（append-only）
│   └── canon-{seq}.jsonl
└── text/                     # C5 生成文本层
    ├── chapter-001.md
    └── ...
```

### 10.2 方案：数据库式（可选）

- 单文件 **SQLite**：适合需要强事务、频繁检索、规模大时。
- 建议：状态/正史用表 + 索引（支持向量扩展），设定类仍用 YAML 文件。

### 10.3 权衡建议

- 首选**文件式**起步（简单、可移植、可 diff），正史账本用 `jsonl` 保证 append-only 语义清晰；
- 当作品规模增大、检索成为瓶颈时，再引入 SQLite / 向量库作为**索引缓存**，文件仍是源事实（source of truth）。

### 10.4 不变设定索引层（v1.2，D-6 落地）

文件式是 source of truth，但「**可确认、可单一定位、反复引用且不随剧情变更**」的设定，值得单独入 SQLite 建索引，保证稳定检索、不被正文检索噪声稀释。典型：诡秘之主的晋升条件（魔药配方 + 仪式流程）、组织关系表、固定地理/势力条目。

| 项 | 说明 |
|---|---|
| **存储内容** | B1 规则 `immutable:true` 项、B2 世界观 `mutable:false` 项、以及分类 agent 确认的「确定数据/单一定位物品」 |
| **写入方** | 分类 agent（§6.7）+ 用户确认；文件 YAML 仍是权威来源，SQLite 为其索引快照 |
| **Schema** | `SettingEntry: { id, sourceLayer, sourceId, title, content, tags[], immutable, supersededBy?, version }` |
| **读取** | 组装上下文 / 一致性校验时按需精确检索；不参与正文的模糊语义检索（那是向量层，后置） |
| **与文件关系** | 文件改动后重建/增量同步索引；索引丢失可从文件重建，无数据风险 |

---

## 11. 内部扩展性（Extensions）

### 11.1 Extension points（Provider 模式）

本项目只有一个外层产品身份：由 DSH Composition 装载的 Cordis Plugin。以下接口是该产品**内部的小说领域 Extension points**，不是新的 Cordis Plugin 类型，也不赋予 Extension 独立宿主、文件、凭据、LLM 或 UI 所有权。

借鉴 SillyTavern 扩展体系，但把核心从「文本拼接」升级为「层管理」后，内部 Extension 可注册到以下扩展点：

| Extension point | 说明 |
|---|---|
| **层 Provider** | 定义新的自定义层（如「经济层」「战斗层」） |
| **注入器 Injector** | 自定义某层如何序列化进上下文 |
| **校验器 Validator** | 注册额外的生成后检查 |
| **叙事解析器 Parser** | 为某层注册自定义解析 agent 与输出 Schema |
| **关系规则 Extension** | 自定义「事件 → 关系数值变化」规则 |
| **后端适配器 Extension** | 新增 LLM 后端协议，但仍由 Host 解析凭据和发起调用 |

所有 Extension 通过 Host 定义的注册表/Service 合同接入，受同一校验、事务和 Fiber 生命周期管理；需要 UI 的 Extension 只能贡献外层 Client Plugin 所允许的 Slot 内容，不能自挂载页面。

### 11.2 与 SillyTavern 的关系

- 可复用：角色卡/世界书的数据格式思路、扩展体系、多后端适配。（UI 不借鉴，见 D1）
- 必须重写：核心从「一段扁平文本」改为「分层受管状态 + 结构化写回」。
- **迁移（D7，v1.2）**：不做 SillyTavern 数据的一键迁移导入工具；仅参考其「角色卡 → B3、世界书 → B2」的字段思路。既有文本/设定统一走 §14.2「文本导入 → 拆分 agent」与 §14.3「自定义单文件包导入导出」。

---

## 12. 决策记录（已定稿）

| # | 决策点 | 候选 | 定稿 |
|---|---|---|---|
| D1 | 产品宿主与交付形态 | 独立自建应用（v1.x provenance，非执行权威） / DSH 原生插件 | ✅ **v2.0 已重置**：独立自建应用方向已被取代，不再是当前或兼容决策；当前唯一方向是 DeepSeek Harness/Cordis 普通持久插件，生产安装/组合唯一见 §0.1.1，Client 前置门见 §0.1.3，UI 边界见 §14.1。 |
| D2 | 存储：文件 vs 数据库 | 文件式 / SQLite | ✅ 已定：文件式起步 + 后期加 SQLite/向量索引（v1.2：新增「不变设定索引层」，见 D8） |
| D3 | 叙事解析的实现方式 | LLM 抽取 / 规则 / 混合 | ✅ 已定：独立于正文的解析 agent，逐层查看、规则化输出、机械应用增删改 |
| D4 | 单用户本地 vs 多用户服务 | 本地 / 服务 | ✅ 已定：本地单用户（起步） |
| D5 | 语言支持 | 中文优先 / 多语言 | ✅ 已定：中文优先 |
| D6 | 一致性校验的严格度 | 仅提示 / 硬阻断 | ✅ 已定：硬约束阻断 + 软约束提示 |
| D7 | 导入导出的范围 | 自定义包 + 纯文本 / ST 迁移 | ✅ 已定（v1.2）：自定义单文件包 + 纯文本导出；**不做 ST 迁移导入** |
| D8 | 不变设定如何存储 | 数据库主存储 / 索引层 | ✅ 已定（v1.2）：文件仍是 source of truth，SQLite 作「不变设定索引层」（§10.4） |
| D9 | 关系引擎的定位 | 移除 / 主路径 / 可选增强 | ✅ 已定（v1.2）：**后置为可选可解释性增强**，主路径由解析 agent 写入 |
| D10 | 细纲如何建模 | 新层 / 子结构 | ✅ 已定（v1.2）：大纲 beat 下的「细纲·场景卡」子结构（§5.7），不新增层 |
| D11 | 创作台 Slot 落点与入口 | `shell.overlay` 单层 / 替换 `sidebar` 或 `details` 单槽 / overlay + 侧栏入口 | ✅ 已定（I46，UI 打磨补强）：保留 `shell.overlay`（运行时唯一可叠加的 list 槽）作创作台主体，重做为「品牌头栏 + 左侧层级导航 + 内容区」浮动面板；入口为主页面右上角悬浮圆形按钮（同 `shell.overlay` 内自渲染，点击打开创作台并隐藏自己）。不替换 root/sidebar/conversation/details 单槽。 |
| D12 | 创作台主题与明暗 | novel 自有主题引擎（A-7）/ 借用宿主主题 token | ✅ 已定（I46）：视觉体系消费宿主 `ctx.theme` 的 `--dsw-alias-*` token 自动明暗适配，另加一层包内品牌色（纸/墨/朱砂）；不新建 novel 自有主题引擎或设置页，A-7 仍后置。 |
| D13 | 创作台渲染与样式 | 引入 JSX runtime / 保持 `React.createElement` + 包内 `<style>` | ✅ 已定（I46）：保持 `React.createElement`（+ 小型 `el()` 助手），不引入 JSX runtime，避免重开 I2 已证明的 `window.__ModuleLoader__` 公开契约；样式为包内 `<style>` 注入、归属 Fiber 生命周期。 |
| D14 | 创作台迭代切分 | 一次重写 / 分四迭代 | ✅ 已定：I46 地基 + 视觉体系；I47 B3/B2 表单；I48 B5/C1 结构化编辑；I49 C2/C4 面板。一迭代一任务一 commit。 |
| D15 | 作品启动的 canonical owner | Client 各层兜底 / Remote 隐式打开 / Host project lifecycle 编排 | ✅ 已定（I50）：Host project lifecycle facade 统一 list/create/open，先验证 `project.yaml`，再打开六层与 ConfirmationGate；Client 只持有经 Host 复核的 selected projectId，不存在进程级全局 current project。 |
| D16 | 新作品入口 | 固定 `default` / 单一导入 / DOCX + 自由文本 + 纯空白 | ✅ 已定（I50–I53）：移除硬编码 `default`，提供多作品选择和三种新建入口；模型不可用时纯空白作品仍可手工编辑。 |
| D17 | 六层初始化裁决 | 自动写入 / 整包确认 / 六层独立裁决 | ✅ 已定（I52–I53）：B3/B2/B5/C1/C2/C4 分别允许直接接受、手动修改后接受、整层打回重生成或显式跳过；pending 不等于 skip。每项 Gate 提案绑定 projectId + onboardingSessionId + layer；accepted 只授权随后由 final apply 执行业务副作用，修改/重生成先 reject 当前提案再建立带 `replacesId` 的后继提案。 |
| D18 | DOCX 浏览器入口与解析 owner | Host 路径输入 / Client 解析 / Client 受控运输 + Host 解析 | ✅ 已定（I51）：文件选择器只做限额分块运输；Host 校验 SHA-256、压缩/解压上限与包结构并提取文本。使用成熟 ZIP/XML 解析依赖，退役手写最小 parser，不保留双路径 fallback。 |
| D19 | Stage 10 切分与失败恢复 | 巨型 I50 / 两迭代压缩 / 四迭代分层 | ✅ 已定：I50 启动编排、I51 上传提取、I52 六层分析、I53 审阅落地；跨文件写入不伪装为原子事务，先全量预检，部分失败报告 `partial-retryable`，重试以确定性 ID 和现值比较继续，禁止补偿性删除作品数据。 |
| D20 | 创作台侧区落点与兼容门 | 替换 `sidebar`/`details` 单槽 / 居中浮窗继续存在 / DSH additive 侧区 Slot 优先、否则 `shell.overlay` 右侧停靠侧板 | ✅ 已定（I54）：I54 执行前先核验所选 DSH 版本及最新公开 Slot 合同；若新版已有 additive 侧区内容 Slot，停止并先通知用户升级、更新项目兼容基线后再实现；若仍无，则使用 `shell.overlay` list Slot 渲染贴右、全高、非模态停靠侧板。I54 执行时 `0.1.0-rc.7` 的 live Slot tree，以及 `0.1.1-rc.2` 发布包 `dsh-client-ui-slots`、`dsh-client-ui-sidebar`、`dsh-client-ui-layout`、`dsh-client-ui-workspace` 的静态合同核验，均未发现该公共 Slot，故当前目标为右侧停靠侧板（发布参考：https://github.com/deepseek-ai/DeepSeek-Harness/releases/tag/dsh-v0.1.1-rc.2）。禁止接管 `sidebar`/`details` 单槽，禁止保留居中浮窗与停靠侧板双路径。 |
| D21 | 架构债务治理策略 | 不立项（继续功能优先）/ 一次巨型重构 / 按架构审查 §9 性价比排序的分阶段重构 | ✅ 已定（v2.3，Stage 15 立项）：新增 Stage 15（I75–I84）分阶段重构；纯机械重构优先（共享 Remote 接线层、llm 公共基座、core 文件拆分），结构性拆分一次一个切片（两个 god service、client.ts）；重构只消除复制与接线债务，不改变领域契约与公开 Remote 形状；每个迭代以「既有验收回归全绿 + 本迭代负向扫描断言」为完成条件，禁止夹带新功能。 |
| D22 | 契约单一来源方式 | 继续手写多重复声明 / 引入独立 codegen 工具链 / 复用 core schema 派生 + 启用 `contracts/` 形状本体 | ✅ 已定（v2.3，I77–I78）：wire schema 从 core schema 派生（沿用 timeline/editor 直接复用先例）；`contracts/` 存形状本体并加一致性断言；Client 投影 shape 用可打包纯 zod 直用；**不引入独立 codegen 工具链**（避免第二构建面）。 |
| D23 | DSH `0.1.1-rc.2` 基线切换方式 | 直接改文档声称已升级 / 回写已完成 I54 / 新增专门兼容迭代 | ✅ 已定并完成（v2.4，Stage 16 / I85）：先诚实记录“当前运行时观测 `0.1.1-rc.2`、项目 pin 仍为 `0.1.0-rc.7`”双状态；I85 一次性更新 DSH family manifest/profile/lockfile 并重跑完整 Host+Client+Remote+Tools+LLM 兼容门，全部通过后切换唯一项目 pin（现为 `0.1.1-rc.2`）。未改写 I54 历史，不保留 rc.7 运行时 fallback，未触碰作品 source of truth。 |

---

## 13. 路线图（DSH-first）

> v1.x 的独立 Node/Vite 应用顺序仅属 provenance，已被本路线取代且不具当前执行权威。任何领域里程碑开始前，必须先满足 §0.1.1 的唯一生产安装/组合合同；Host 是数据与 LLM owner。Client 工作还必须先通过 §0.1.3 兼容性门，首个浏览器界面只能是 DSH Slot Client，而不是独立页面。

| 里程碑 | 内容 | 产出 |
|---|---|---|
| **M0** | DSH/Cordis Host Plugin 地基 + 数据模型 + 状态层(C2) + 正史账本(C4) 最小原型 | 满足 §0.1.1；Fiber 可卸载；Host 内能存、能查、能回溯叙事状态 |
| **M1** | Host 上下文组装器 + 分层注入（规则/风格/角色核心/状态/世界观）+ 正式 LLM/凭据 seam | 在 DSH Host 内基于受管状态生成，Client 不接触密钥 |
| **M2** | §0.1.3 门禁通过后交付 DSH Client bundle + Slot UI 地基；大纲导航器 + 细纲 + 关系层(C1) | executable build + selected profile boot + Slot smoke；现有 DSH GUI 内的原生入口 + 方向牵引、细纲规划、关系网络 |
| **M3** | 知情过滤器 + 揭示层(C3) | 多视角安全叙事 |
| **M4** | 一致性校验器 | 规则/正史/知情自动检查 |
| **M5** | 叙事解析器 + 结构化写回闭环（含世界观解析） | 完整「解析→写回」闭环 |
| **M6** | 内部 Extensions + 后端适配（含 Provider/Injector/Validator/Parser/规则/模板/Instruct 预设） | 在外层 Cordis Plugin 内可扩展、模型无关 |
| **M7** | Slot 编辑 UI（角色/世界观/大纲/关系）+ 快速重写与落地 | DSH 创作环境编辑体验，不产生独立 SPA |
| **M8** | Host 导入管线（拆分 agent）+ 导出管线（单文件包 + 纯文本） | 可起步、可分享，文件 I/O 不越过 Host |
| **M9** | Host 不变设定索引层 + 分类 agent | 确认设定稳定检索 |
| **M10** | 续写 + 灵感 agent | 突破卡文、随剧情调大纲/细纲 |
| **M11** | 多作品启动 + DOCX/自由文本/空白三入口 + 六层初始化审阅 | 创作台可从零启动，导入或输入只形成可追溯候选，逐层确认后经既有 Host owner 落地 |
| **M12** | DSH 内右侧停靠侧板 + 现有 UI 正确性/恢复性修复 | 不创建新窗口、不替换宿主单槽；作品切换、初始化裁决、异步恢复、任务型导航和可访问性闭环 |
| **M13** | C5 正文工作台 + 候选裁决 + 一致性中心 + 自动生成队列 | 作者可在 DSH 内完成章节/场景写作、审校、接受与可恢复批量生成 |
| **M14** | C3/B1/B4/C6、导入导出、正文分支、搜索与进度可达性 | 已有 Host 能力进入作者工作流，长篇知识边界、版本和交付路径可视化 |
| **M15** | 架构债务消除（Stage 15，I75–I84）：共享 Remote 接线层、llm 解析/检测公共基座、契约单一来源、god file/god service 拆分、client.ts 拆分与低优先级债务清零 | 霰弹枪修改、契约多重复声明与边界类型安全侵蚀消除；公开契约与领域行为不变 |
| **M16** | DSH family `0.1.1-rc.2` 兼容升级（Stage 16，I85） | manifest/profile/lockfile 唯一 pin 同步；真实 base+web+plugin、Client ModuleLoader/Slot、Typert Remote、Tools、`ctx.llm` 与生命周期兼容门通过 |
| **M17** | architecture review v2.0 修复（Stage 17，I86–I102） | Remote binder、组合根、UoW、TextRepository、Client 切片与 schema 单点化成为稳定代码基线 |
| **M18** | 合同地基、作者主流程与新增功能（Stage 18，I103–I140） | 章节/场景、基线/预览/调和、引用、润色、版本、全书发布与 README 十二步产品 E2E 完整交付 |
| **M19** | 来源确认与幕后素材 POV 叙事化（Stage 19，I141–I149） | 幕后素材不再直接冒充读者大纲；混合来源可审阅；C3/C4 与 POV 上下文在揭示前不泄密 |
| **M20** | 查漏补缺（I150–I151） | 修复已发现的作者流程缺口；首次导入可一次性生成 B1/B4 初稿，经确认写入作品本地文件，后续只手工维护 |
| **Deferred Package F1** | 导入基础设施重构（v3.2 原 Stage 20 / I151–I155） | 后置；保留结构化来源、共享 operation/checkpoint/UoW 设计，恢复时重新编号 |
| **Deferred Package F2** | 已有正文保真导入（v3.2 原 Stage 21 / I156–I162） | 后置；保留 Host 保真 C5 与结构候选分离设计，恢复时重新编号 |

---

## 14. 创作环境功能设计（v1.2 provenance；v3.3 持续增补）

> 本章源自 v1.2「创作环境」产品升级，并由 v2.0–v2.2 继续增补用户可见能力。它们复用 §6–§9 的引擎与 §10 的存储，不引入第二套核心闭环。

### 14.1 分层编辑 UI

- **定位**：D1「DSH 原生插件」的可见形态——仅在 §0.1.3 Host–Client 兼容性门通过后，由 Client Plugin 向经核验的 DSH Slot 交付**关键层**可视化编辑，覆盖 B2 世界观、B3 角色核心、B5 大纲（含细纲）、C1 关系；不创建独立页面或第二前端。
- **职责边界**：Client UI 只做「设定与状态的精确调整」与「生成/重写/续写触发」，不做核心引擎逻辑；所有读取和写入走 Host 的统一接口（§0.1、§5.1），不直接访问文件、LLM 或凭据。
- **交互要点**：每层一个编辑面板 + 列表/详情；改动即存，状态层显示快照/回滚入口；正史（C4）只读（append-only），更正走 supersede 确认。
- **范围外（后置）**：UI 主题/深色模式（A-7 后置）、items/factions 大对象编辑（P2）。

### 14.2 导入管线（拆分 agent）

- 用户向已有/活动作品执行通用内容导入（txt/md/docx）→ 拆分 agent 产出**大纲、世界观、细纲**的候选结构化条目 → 用户逐条确认/修正后写入对应层；新建/空作品的六层初始化改走 §14.7。
- 分两阶段：先「大纲 + 世界观」粗拆分（D-1），再「大纲 → 细纲」细拆分（D-2）。
- 低置信条目标黄，需用户确认；此 I37–I38 **通用内容导入**合同仍不生成正史/状态/关系/知情。v2.1 新作品初始化所需的 B3/B2/B5/C1/C2/C4 六层候选由 §14.7 的独立合同承担，不修改或偷渡扩张 I38 的既有输出语义。

### 14.3 导出管线（单文件包 + 纯文本）

- **自定义单文件包**：默认 `full-project` 档案覆盖**全部 11 个作品数据层**（B1 规则、B2 世界观、B3 角色核心、B4 风格、B5 大纲/细纲、C1 关系、C2 状态、C3 知情、C4 正史、C5 生成文本、C6 执行态），可再导入重建项目；另提供 `shareable-template` 档案，仅含非生成设定（B1–B5 与 C1–C4、C6），排除 C5 生成文本，用于分享模板。单文件含版本号；round-trip 以**规范化语义等价（canonical semantic equality）**校验，不比较含 `exportedAt` 的原始字节（D-3）。A1/A2 是机制层，不作为作品数据序列化。
- **纯文本导出**：C5 生成文本按章节导出 txt/docs；设定层导出为可读 Markdown/YAML（A-6）。
- **明确不做**：SillyTavern 世界书格式的导入导出适配（D7）。

### 14.4 快速重写与本地落地

- **快速重写**：对 C5 已生成的某段/某场景重生成，复用同一生成流程与校验。
- **固定段手动编辑**：对 C5 段落直接编辑，编辑后可选「重新解析该段」同步状态/正史。
- **依据大纲写作**：按当前 beat 的细纲场景卡生成，支持「按章节」「按目标字数（wordTarget）」两种控制。
- **本地落地**：完成章节导出为 txt/docs 文件，含完整开头结尾。

### 14.5 续写与灵感 agent

- **续写 agent**：用户显式调用，基于当前状态/正史/大纲/细纲续写下一段，输出走标准「校验 → 用户裁决 → 解析写回」。
- **灵感 agent**：用户显式调用（「灵感时刻」），产出 2–3 个可选发展方向（不写回正史，仅作选项）；用户选定后可选「随剧情调整大纲与细纲」（写 B5/C6 的偏差或细纲改动，走用户确认）。

### 14.6 创作台 UI 重设计（I46–I49，v2.0 增补）

> 历史定位：I46–I49 已完成，在 I33–I36 Slot 工作区之上把「三裸面板 + JSON 文本框」升级为可识别、美观的分层编辑创作台。本节记录已交付合同；其“居中浮动面板”呈现将在 I54 按 D20/§14.8 退役，其他 Host/Client 职责边界继续有效。

- **落点与入口（D11，UI 打磨补强）**：创作台主体注册到 `shell.overlay`，形态为品牌头栏 + 左侧层级导航 + 内容区的浮动面板，带折叠/关闭；入口为主页面右上角悬浮圆形按钮（同 `shell.overlay` 内自渲染，点击打开创作台并隐藏自己，关闭后重新出现）。不替换 root/sidebar/conversation/details 单槽。
- **信息架构（六层一桌）**：左侧层级导航对应六层——B3 角色、B2 世界观、B5 大纲（含细纲）、C1 关系、C2 状态、C4 正史；主区为「列表 + 详情」。B5/C1 由裸 JSON 文本框改为结构化编辑器（幕→节→细纲场景卡 / 关系对），Client 侧序列化后仍走既有 `outlineSave`/`relationshipSave` 整文档契约，Host 契约不变。
- **视觉体系（编辑台/书斋）**：砚台三色——纸（暖白底）、墨（近黑暖灰字）、朱砂（印泥红强调色，用于品牌标记/激活导航/主按钮）；层级标题与品牌用系统衬线栈（`Georgia, 'Songti SC', 'SimSun', serif`，零外部字体与网络资产）建立文学感，表单正文用系统无衬线 UI 栈；8px 网格、宽松留白、1px 细边、分层卡片与软阴影。中性色/边框/hover/状态色消费宿主 `--dsw-alias-*` token，明暗经 `body[data-ds-dark-theme]` 自动适配（D12）。
- **样式 seam（D13）**：样式写为包内 `<style>`（独立 `src/client/styles.ts` 常量），在 `apply()` 内经 `ctx.effect` 持有 disposer，Fiber 卸载即回收；渲染保持 `React.createElement` + `el()` 助手，不引入 JSX runtime。
- **测试契约**：测试锚点从旧 `data-novel-editors` 迁移到稳定新契约 `data-novel-workspace`（loading/ready/error）+ `data-novel-layer="characters|worldview|outline|relationship|state|canon"` + 每层 loading/error/empty 断言。
- **范围外（保持后置）**：novel 自有主题引擎/深色模式（A-7）、items/factions 大对象编辑（P2）、独立页面/SPA。

### 14.7 作品启动与六层初始化（Stage 10，I50–I53，v2.1）

> 定位：补齐创作台在「插件已就绪」与「具体作品六层已可读」之间缺失的 Host-owned operational bootstrap，并为新作品提供 DOCX、自由文本、纯空白三种入口。它复用 §10 文件 source of truth、I11 ConfirmationGate 与既有六层 Domain Service；不建立第二套仓库、Client 文件解析或浏览器 LLM 路径。

#### 14.7.1 作品选择与 operational bootstrap（I50 / D15–D16）

- Client 挂载 Remote 后必须先请求作品列表；无作品时显示新建入口，有作品时由用户选择后调用 Host `projectOpen(projectId)`。项目目录层（作品选择/返回列表视图）**始终**暴露「空白创建 + 文档导入」两个新增入口，不受已有作品数量影响；文档导入新建作品后，六层初始化审阅直接在项目目录层展示（审阅部分提到项目目录），apply 成功后才进入创作台。Client 可记住上次选择作为 UI 偏好，但每次启动都必须由 Host 重新验证；不得写入 `project.yaml` 或建立进程级全局 current project。
- Host project lifecycle facade 是 list/create/open/readiness 的唯一编排 owner：先加载并校验 `project.yaml`，再统一打开 B3/B2/B5/C1/C2/C4 与 ConfirmationGate；Remote 只转发最小 JSON，六层面板不得各自创建目录或吞错兜底。
- `projectOpen` 返回每层 `ready | empty | uninitialized | corrupt`。空列表/空账本是合法 empty；B5 缺失或精确 legacy `{}` 是 uninitialized，Client 显示空表单且首次合法保存后才形成正式大纲；非空非法文件是 corrupt，禁止静默覆盖。
- 纯空白作品不伪造小说内容：B3/B2/C1/C4 为空，B5 未初始化；C2 仅建立确定性的 seq 0 空快照作为回滚基线：`id: initial-state`、`version: 1`、`storyTime: ''`、scene 五个字符串字段均为空、`characters: []`。模型未配置时仍可进入创作台手工编辑。
- 现有六层 Remote 方法继续显式携带 projectId；所有硬编码 `default` 必须移除。公开 `novelConfirmation` 与 workspace 更正/初始化路径必须复用同一 Service 实例。

#### 14.7.2 受控 DOCX 上传与文本提取（I51 / D18）

- 创作台文件选择器通过严格 Remote 执行 `uploadStart → uploadChunk → uploadFinalize`；Client 只运输受限字节，不解析 ZIP/XML、不持有作品文件路径或领域真相。
- Host 必须校验文件名、声明大小、块序号、块大小、总大小与 SHA-256；压缩文件默认上限 10 MiB，并限制 entry 数、解压后总量与压缩比，拒绝路径穿越、加密、损坏、伪扩展、乱序/重复块与 zip bomb。
- DOCX 使用成熟 ZIP/XML 解析依赖读取真实 Office/LibreOffice 文档；当前手写最小 parser 属内部 code-retirement，I51 主路径通过后 delete-first，禁止保留 fallback。
- 上传临时文件是可重建派生数据，成功、取消、失败或 Fiber 卸载后清理；作品 source of truth 绝不随清理删除。原始 DOCX 默认不长期保存，只保留文件名、摘要哈希与候选审阅所需的最小证据片段。

#### 14.7.3 六层初始化分析器（I52 / D17）

- DOCX 规范文本与用户自由文本共用一个 Host 分析入口：`规范化/分块 → 每块提取六层证据 → 按层归并 → 六个严格候选包`。共享证据允许只重跑某一层归并，不重复上传或解析原文。自由文本必须非空、UTF-8/NFC 规范化、拒绝 NUL，默认上限 2 MiB，超限在进入 LLM 前失败；分块沿用 Host 确定性段落边界语义。
- 六层语义固定为：B3 角色核心；B2 世界观事实；B5 大纲/幕/节/细纲；C1 关系与里程碑；C2 输入结束位置的当前状态（梗概输入为故事起点状态，且只使用 §5.9 v2.1 已交付、v2.2 保持的 scene/characters 子集）；C4 文本明确陈述的历史/剧情事件。未提供明确事件时 C4 可为空；禁止推断 C3。为消除循环/越界引用，Stage 10 的 B3 候选（包括手动修改后的提案）强制 `relationships: []`、`knowledgeIds: []`、`arc.keyBeats: []`：关系只进入 C1，C3 知情与 B3↔B5 弧光链接保持后置。
- 分析开始时由 Host 生成 onboardingSessionId 并绑定已验证的 projectId 与 sourceHash；status/cancel/regenerate 必须同时匹配 project/session/sourceHash。每层候选直接复用既有层 Schema，并携带相同绑定、confidence、来源块/证据摘要和校验警告；不得复制出第二套层模型。所有 LLM 调用只经 Host `ctx.llm`，支持进度、取消与 Fiber 卸载中止。
- I52 是 LLM 迭代：必须先冻结不少于 10 个样本及 held-out 子集，再实现 prompt/schema；先以 fake backend/mock parser 锁定管道，其他 LLM 模块阈值规则适用，各层验收不得低于 80%。

#### 14.7.4 六层独立裁决与幂等落地（I53 / D17–D19）

- 每个候选提案 payload 必须携带精确 `projectId`、`onboardingSessionId`、`layer`、`sourceHash`、schema version、候选值与证据；后继提案另带 `replacesId` 和 `mode: edited | regenerated`。任何 Remote 裁决与 final apply 都必须同时匹配 project/session/sourceHash，禁止以 Client 当前选择替代 payload 绑定。
- 每层可独立选择：直接接受、手动修改后接受、整层打回重生成、显式跳过。直接接受把当前 active proposal 置为 accepted；手动修改/重生成先 reject 当前提案，再建立带 `replacesId` 的后继提案，分别使用用户校验值或只重跑该层并可附带反馈；显式跳过 reject 当前提案且不建立后继。pending 绝不等于 skip，六层 active proposal 全部进入 accepted 或显式 skipped 终态后，final apply 才可启用。
- I11 Gate 不解释或执行领域副作用：在 Stage 10 中，accepted 是对候选的持久授权，Domain 写入只由用户随后触发的「应用已接受层并进入创作台」消费。修改/重生成/跳过完全映射到既有 pending→accept/reject 状态机，不修改 I11 状态集合；accepted 后重复 final apply 由业务 owner 保证幂等。
- 六层是六个独立失败域，应用顺序严格为 B3 → B2 → B5 → C2 → C4 → C1。写入前逐层完成 Schema、ID、内部引用与跨层依赖预检：B2.parent 必须引用本层既有/候选条目且候选按 parent-first 稳定拓扑序调用既有 create Service（环与缺失 parent 失败）；B5.prerequisites 与 C4.consequences 可引用同一整层候选 ID 集，B5 以完整 Outline Domain Service 保存，C4 按候选稳定顺序 append；B5.charactersInvolved、detailBeats.pov、foreshadowing.knownBy，C1.from/to/knownTo，C2.characters.characterId 与 C4.participants 只能引用作品既有或本次已接受且可落地的 B3；C1.milestones 只能引用此时已存在的 C4。B3.relationships/knowledgeIds/arc.keyBeats 已按初始化合同强制为空，因此没有 B3↔B5 或 B3→C1/C3 写入环。某层 blocked 不撤销无依赖层，但依赖该层的后继层也标记 blocked。
- 新编排器只能调用既有 Domain Service 写入，不能直接改 YAML/jsonl。C4 只能 append/supersede；禁止普通覆写。确认接受本身不等于绕过领域校验。
- 不新增第二份 applied journal：以确定性 ID、Gate lineage 和领域现值比较实现重试幂等。语义相同视为已完成，语义冲突则 fail closed。final apply 返回最小结构 `{ projectId, onboardingSessionId, appliedLayers, skippedLayers, blockedLayers, pendingLayers, retryable, errors }`；任何 pendingLayers 都阻止首次 apply，跨文件中途失败返回 `partial-retryable`，重试只继续未完成层，不执行补偿性数据删除。
- 本阶段仅初始化新建/空作品；向已有非空作品合并导入、C3 推断、静默覆盖、跨六文件强制回滚与独立 SPA 均不在范围内。

### 14.8 DSH 内停靠侧板与 UI 修复（Stage 11，I54–I59，v2.2）

> 定位：不再把创作台呈现为 DSH 上方的居中独立浮窗，而是在不替换宿主单槽的前提下，将其呈现为 DSH 内贴右、全高、可收起的非模态停靠侧板；随后修复 I50–I53 暴露出的项目切换、裁决、异步恢复和可访问性缺口。Host/Client owner 不变。

- **Slot 兼容门（I54 / D20）**：执行前重新核验所选 DSH 与最新公开 Slot tree。若新版已提供 additive 侧区内容 Slot，I54 必须停止并先通知用户升级，更新依赖 pin、lockfile 与 selected-profile gate 后再重新定稿落点；若仍无公共 Slot，则只使用 `shell.overlay` list Slot。不得同时实现两种落点，不得接管 `sidebar`、`details`、`conversation` 或 `root` 单槽。
- **停靠形态（I54，UI 打磨补强）**：退役居中浮窗几何与阴影窗口隐喻，改为贴右、全高、非模态侧板；保留主页面右上角悬浮圆形按钮作为开关入口（点击打开并隐藏自己）；面板整体宽度可经左边缘拖柄拖动调整（`--nv-panel-width`，钳制 640–1600px），导航侧栏宽度同样可拖（`--nv-nav-width`）；面板拖到过窄（< 720px）时侧边路由栏自动折叠为横向滚动横条（`data-novel-nav-collapsed`，与窄屏响应式同形态）。窄屏允许占据主视区但仍由同一 Slot/Fiber 管理，不创建新 window、第二 shell 或独立页面。
- **作品上下文（I55）**：侧板头部持续显示当前作品，可返回作品列表并新建/切换；切换前处理脏表单，切换后清空旧作品 Client draft 并由 Host `projectOpen` 重新验证，禁止跨作品串写。返回后的项目目录层始终提供「空白创建 + 文档导入」两个新增入口；文档导入一律新建独立作品（不并入当前作品），六层初始化审阅直接在项目目录层展示，apply 成功后才进入创作台。
- **初始化正确性与恢复（I56–I57）**：修改后接受必须提交真实 `editedValue`，重生成必须提交用户 feedback；pending/空候选阻止 apply。分析提供进度、取消和失败重试；final apply 成功后刷新六层并切入创作台，partial-retryable 只重试未完成层。
- **任务型 IA 与基础体验（I58–I59）**：导航从九项扁平入口改为「写作 / 策划 / 连续性 / 作品设置」分组；补齐响应式、键盘、焦点恢复、`focus-visible`、`aria-live`、保存中/已保存/失败和防重复提交。技术层编号只作为辅助徽标，不作为作者的首要导航语言。

### 14.9 P0 正文写作闭环（Stage 12，I60–I65，v2.2）

> 定位：把已有 C5、生成、续写、重写和一致性能力从 Host 孤立能力提升为创作台的首要作者工作流。所有正文、候选、任务和校验真相继续由 Host 拥有；Client 只显示和提交受控命令。

- **C5 正文工作台（I60–I61）**：Host Remote 提供章节/场景最小读取合同；侧板提供章节树、场景列表与正文编辑。固定范围手工修改逐字保存，范围外哈希不变；可选 reparse 仍复用 I42 与 I11 Gate，不选择或不确认时不得隐式修改结构层。
- **候选优先（I62–I63）**：生成、续写、按场景卡写作和局部重写统一先产生绑定 project/chapter/scene/sourceHash 的候选；用户看到正文、diff、校验结果后才能接受、拒绝或要求重写。退役 `novel_continue` 的“生成前预先 accept”产品语义；接受才进入标准校验→解析→写回，拒绝零写。
- **一致性审校中心（I64）**：统一展示规则、正史、知情、关系、风格五类问题；每项包含严重度、来源引用、正文定位和可执行动作。规则/正史/知情硬冲突阻止接受，关系/风格等软警告保留显式裁决记录。
- **可恢复自动生成队列（I65）**：Host 是持久任务状态 owner；用户可选择场景卡范围并配置暂停/继续/取消、重试、字数/token 预算和硬/软停止策略。每个场景仍独立产生候选并经过既有裁决，不允许以“自动化”为由绕过 ConfirmationGate 或静默改写 B5/C6。

### 14.10 P1 能力可达性（Stage 13，I66–I72，v2.2）

- **C3 知情与揭示（I66）**：按事实和角色查看 holders/revealPlan/status，手动揭示或 holder 变更复用现有知情不倒退约束与 ConfirmationGate。
- **B1/B4 控制面（I67）**：提供规则优先级/immutable 与人称、时态、POV、禁用表达等文风表单；Host Schema/Service 仍是唯一校验 owner。
- **C6 与灵感落地（I68）**：可视化当前幕/节/场景卡进度和偏差；灵感方向被用户选定后，才允许经 Gate 调整 B5/C6，默认只读不写层。
- **导入、导出与备份（I69）**：把 I37–I38 的通用导入管线与 I39 的项目包/纯文本导出及 round-trip 恢复能力接入作品设置；浏览器只发命令/接收受控下载，不拥有源文件路径，不扩张 N-7 的非空作品合并语义。
- **正文版本与分支（I70）**：补齐 C5 分支/版本的 canonical Schema 与 Host owner，候选可保留为分支并做版本比较；chosen 分支唯一，切换不隐式改写 C1–C4/B2，结构化同步仍需显式 reparse/Gate。
- **搜索与上下文追踪（I71）**：提供跨正文、角色、世界观、正史、知情和大纲的全局搜索与实体交叉引用；同时解释本次生成注入了哪些层、触发原因与裁剪结果，但不得泄露密钥、完整内部对象或未授权 POV 知识。
- **写作进度（I72）**：以 Host 可重建统计展示章节字数、目标完成度、场景卡状态、POV 分布和任务历史；统计是派生视图，不成为第二份作品真相。

### 14.11 剧情时间线（Stage 14，I73–I74，方案 A）

> 定位：为「关系何时建立、信息何时被谁知晓」提供确定性时间轴，修正 C1 全量注入与自由文本时间字段无法排序的问题；时间线是作者可编辑的规划文档，不改变 C1/C3 的写 owner。

- **时间线数据层与服务（I73）**：新增 `core/timeline`（schema + `timeline.yaml` 仓库 + 从 B5 确定性生成骨架 + 当前节点锚定/关系过滤纯函数）；`host/timeline-service` + `novelTimeline` Remote（read/ensureFromOutline/setCurrentNode/save）；onboarding `finalApply` 落地 B5 后自建；`writing-context` 关系注入按当前时间线节点过滤（未安排关系始终保留）。
- **时间线面板（I74）**：策划组新增「时间线」视图——有序节点列表（含当前节点标记）、每节点的 storyTime/关系/揭示安排编辑、手动设当前节点（null 恢复自动锚定）、一键自建与保存；Client 只提交受控命令，时间线文档由 Host 持有。
- **知情联动（后置）**：C3 `revealAt` 仍为自由文本，作者可手动对齐时间线节点 label；后续迭代可让 revealAt 直接引用节点 id 并联动展示。

### 14.12 架构债务消除（Stage 15，I75–I84，v2.3）

> 定位：I1–I74 功能交付后，按 `docs/novel-creation-tool-architecture-review.md`（v1.0，review record，非设计权威）§9 的性价比路线图立项消除系统级架构债务——霰弹枪修改、god file / god service、契约/形状手写多重复声明与边界类型安全侵蚀。重构只消除复制与接线债务，保持 §0.1 宿主基线、领域所有权设计（core 归 core、接线归组合根、真相单 owner）与全部公开 Remote/wire 契约不变。

- **执行策略（D21）**：纯机械重构优先（共享 Remote 接线层、llm 公共基座、core 文件拆分），结构性拆分一次一个切片（两个 god service、client.ts）；每个重构迭代以「重构前后领域行为等价」为完成条件（既有全量测试 + stage 回归 + LLM 样本阈值不变 + 负向扫描断言）；禁止夹带新功能。
- **工作线映射（对应架构审查 §9 #1–#6）**：① 共享 Remote 接线层 `defineRemote(serviceKey, methods[])`（收敛 19 份 `param()`/`xxxInvocation()`、16 个 bindRemote 适配块、27 个 dispose 钩子，消除 `as Parameters<...>`/`as never`）→ I75；② llm 解析/检测公共基座（`llm/parse/shared.ts` / `llm/validate/shared.ts`，收敛 9 份 parse 样板、7 份 `confidenceSchema`、3 份 violation schema）→ I76；③ 契约单一来源（wire schema 从 core schema 派生、修复组合根契约补丁、`contracts/` 存形状本体、Client 投影纯 zod 直用、可入 client 图 core 纯模块白名单显式化）→ I77–I78；④ 拆分两个 god service（含 C2→C1→C3→C4→B2 五层写回器提取共享）→ I79–I80；⑤ core 高优先文件拆分（statistics/analyzer/search/schema-onboarding）→ I81；⑥ client.ts 拆分（store/ops/panels/mount + 测试 harness 抽取）→ I82–I83；⑦ 低优先级债务清零（文本管道、SHA-256、分层倒置边、杂项与内部命名统一）→ I84。
- **类型安全恢复要求**：接线层与领域边界不得依赖 `as Parameters<...>`/`as never`/`as unknown as` 断言掩盖签名漂移；方法签名变更必须在接线层产生编译错（review §3.3）。
- **Client 纯模块白名单（I78 显式化）**：允许进入 client 图的 core 纯模块（只含 zod schema/纯函数，无 node 内置模块、无领域运行时副作用）显式列入白名单并受构建扫描约束（`scripts/scan-client-core-whitelist.mjs` 以 esbuild metafile 实测 `src/client.ts` 导入图，双向断言：白名单外 core 引用失败、白名单条目未被使用也失败）。白名单单一来源为 `src/client-bundle-whitelist.ts`，当前共 26 项：
  `src/core/knowledge/actions.ts`、`src/core/queue/schema.ts`、`src/core/review/issue.ts`、`src/core/schema/{base,canon,characters,confirm,generation-settings,inspiration,knowledge,llm-config,onboarding,outline-progress,outline,project-lifecycle,relationship,rules,state,style,text,upload,workbench-settings,worldview}.ts`、`src/core/text/projection.ts`、`src/core/timeline/schema.ts`、`src/core/validate/index.ts`（review §8#5）。
- **`contracts/` 形状本体契约锁（I78 落地）**：`contracts/stage10/{docx-upload,project-lifecycle}.json` 与 `contracts/stage15/client-projection.json` 以 JSON Schema（zod `z.toJSONSchema` 生成）存形状本体，不再是只含字符串 shapeIds 的空壳（review §6.3）；一致性断言（`src/contract-lock.ts` + `src/contract-lock.test.ts`）重新生成本体并逐字节比较 —— 实现或锁任何一侧漂移即失败。有意识改契约的唯一入口是 `pnpm run update:contracts`（`scripts/update-contract-locks.ts`，非构建步骤，不引入第二构建面，D22）。
- **Client 投影 shape 纯 zod 直用（I78 收敛）**：`CharacterShape`/`OutlineShape`/`RelationshipShape`/`WorldShape` 等编辑器表单模型统一收拢到 `src/client/shapes.ts`，从 canonical core schema 派生的纯 zod 直用（`characterCoreSchema`/`outlineSchema` 等 `.omit().partial()`/`.extend()`），消除手写「全 optional + `[key: string]: unknown` + `kind: string` 失型」接口（review §6.2 #6）；枚举下拉选项同样从 core 枚举派生，硬编码副本归零。表单模型是 canonical 输入类型的放宽（草稿可部分填写），类型关系由 `src/client-shape-contract.test.ts` 编译期断言锁定。
- **完成线**：接线层类型安全恢复、全仓库最大复制源归零、契约单一来源生效（schema 字段单一变更影响面 ≤3 文件）、god file/god service 消除、分层边界保持、I1–I74 全部既有验收回归保持绿、公开契约形状不变。

### 14.13 DSH family `0.1.1-rc.2` 兼容升级（Stage 16，I85，v2.4）

> 定位：I1–I84 完成后，消除当前运行时 `0.1.1-rc.2` 与项目可复现 pin `0.1.0-rc.7` 的版本漂移。该阶段只升级并验证宿主公共合同，不新增产品功能、不改变领域或公开 Remote/wire 契约。**I85 已完成（2026-08-28）：唯一项目 DSH family pin 已切换为 `0.1.1-rc.2`，`verify:i85` / `verify:stage-16` 全绿。**

- **基线切换（D23）**：同步 `package.json` 的 DSH family 直接依赖、`examples/selected-profile.package.json` 与 `pnpm-lock.yaml` 至精确 `0.1.1-rc.2`；DSH family 必须同版本，不允许 rc.7/rc.2 混装或运行时 fallback。Cordis 继续为已验证的 `4.0.1` 兼容线。
- **完整兼容门**：一次性临时 `DSH_HOME` 中安装真实 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `novel-creation-tool`，证明 bundle 单 owner、Host boot/stop/restart、Client ModuleLoader 装载、`shell.overlay` mount/unmount、Typert Remote 往返、Tools 真实注册/非法参数拒绝以及 `ctx.llm` 请求/finish/cancel 合同。
- **已知修复边界**：补齐两处 Vitest 未 `await` 的 `resolves`；Tools 参数必须在执行前按 JSON Schema fail closed；`stopSequences` 按 `0.1.1-rc.2` provider 能力显式处理，不再提供与实际路由不一致的静默承诺。不得借机改 prompt、样本、gold、阈值或领域生成语义。
- **安全与回退**：升级失败时回退 manifest/profile/lockfile 与兼容测试代码到 I84 commit；不迁移、不删除、不改写任何作品 source of truth。兼容旧作品属于数据合同，不等于保留 rc.7 宿主路径。
- **完成线**：`verify:i85` 与 `verify:stage-16` 全绿（✅ I85 已达成），既有 `pnpm test`、build、held-out、安装→升级→卸载生命周期回归全绿；四份权威文档与 README 已把唯一项目 DSH family pin 声明为 `0.1.1-rc.2`。

---

### 14.14 Stage 18 新增功能与合同地基（I103–I140，v2.9）

> 定位：Stage 17 / I86–I102 与 Stage 18 / I103–I140 均已完成并成为真实代码基线；R18 十五项产品需求是 epic，不与实现迭代一一绑定。v2.9 将 Stage 18 扩展为 I103–I140，并已按合同地基→领域 owner→Host/Remote→Client 消费者→完整作者流程验收的依赖顺序交付。Stage 18 保持 §0.1 宿主基线和既有 13 层叙事模型，不建立独立应用、第二文件 owner 或第二裁决器。
>
> **本地运行与同步边界**：Stage 18 只支持本地单用户、单 Host 进程，不为跨进程竞争、分布式事务或任意崩溃点恢复新增全局协调设施。涉及多个叙事真相层的授权写入必须在同一 Host 请求中同步执行，并以稳定 proposal/candidate/operation ID 幂等；任一层失败时由既有 UoW 返回失败，不创建后台叙事层补写器。派生索引和 Markdown 镜像继续复用既有可重建/outbox 语义。

#### 14.14.1 D24：公开合同兼容政策

- 既有 Remote invocation 的 service/namespace/method、参数顺序与结果形状保持向后兼容；禁止借新功能静默改变旧结果。
- 新功能允许新增 strict additive method/namespace。每个新增或修复的公开面必须同时具备 canonical zod schema、descriptor 与 adapter 返回类型耦合、结果 contract lock、真实 DSH binder E2E、非法参数/非法结果负测。
- caller-side `unknown` cast、缺字段 fallback、静默 envelope 整形不得承担兼容责任；适配只能位于 Host Remote adapter 的单一明确 seam。
- I103 先修复已发现的 `novelBranches.list` Domain 裸数组与 wire `{ branches }` 漂移，并建立 Writing/Review/Branch/C5/Remote 基线锁；Stage 18 其他 additive 合同均依赖该门。

#### 14.14.2 D25：Stage 18 owner 与行为裁决

- **R18-1 场景/章节管理（I104–I106）**：C5 真相仍由 `TextRepository` 持有；章节/场景 CRUD、元数据与项目级排序在 C5 owner 内串行、预检并提交。ID 永久不变，“重命名”只修改作者元数据。非空章节/场景硬删除先展示绑定/候选/任务/分支影响并经 I11；活动任务/候选或 fingerprint 变化时拒绝，未确认零写，不建立垃圾箱。apply 只在本地 project write lane 内最终复验，使用 proposalId 幂等地先清理绑定、再删除 C5；成功响应前两项必须完成，重复 apply 返回 already-deleted。删除不新增持久 saga、删除 audit、reservation、全局 recovery barrier 或特殊启动恢复路径；失败后由用户重试同一 proposal，最坏安全状态是绑定已解除而正文仍在。既有历史记录不修改，读取时依据目标是否存在投影 stale。Markdown 镜像复用 I104 outbox。场景↔细纲卡仍由独立 Host `SceneOutlineBinding` 项目文档拥有；不改 C5/B5 Schema。候选落点显式携带 chapterId/sceneId，退役生产路径的 `chapter-1` 业务硬编码。
- **R18-2 生成变更逐层预览（I109–I111、I135）**：writing-adjudication 内新增会话级 `StructuralPreviewPlan`，冻结 C1/C2/C3/C4/B2 parser outputs、源正文 hash、适用时的 I108 细纲生成基线引用与各层基线；兼容的 candidate 结构化 accept/reparse 只能重放同一 plan。I135 起普通作者主路径先 adopt 为 C5 草稿，作者最终正文再复用同一纯预览组件并汇入 `FinalizationPlan`。按细纲卡生成必须有 baseline，历史未绑定正文的 rewrite/reparse 可显式投影 `no-outline-baseline`，但不得进入 R18-11 的 B5 调和。任一适用基线变化即 stale/零写；plan 不持久化，Host 重启后必须重新预览，它是候选运行态而不是第 14 层。
- **R18-3 审校→定位→修复（I128–I129）**：文本锚点采用 UTF-16 半开区间、quote 与 sourceHash；正文变化后旧锚点 stale 并要求重扫，不猜测偏移。修复复用 rewrite candidate 与既有硬冲突裁决。`resolved` 不落 Host 账本：接受后复扫确认问题消失，Client 在当前会话保留 resolved 卡与证据；完整重扫、重开或重启后该卡消失。
- **R18-4 单章三种润色（I122–I123）**：Client 仅在当前会话按 scene.index 逐个调用既有 rewrite candidate；每个场景使用独立 sourceHash，语言润色、压缩精简、扩写细节共用参数化 pipeline。章节级进度不持久化，不新增 batch journal、pause/resume/cancel 状态机或恢复 coordinator；刷新/重启后作者可重新发起，已接受场景保持。单场景接受继续复用既有 validation→preview→landing，并在同一 Host 请求内实时、幂等完成获授权的多层写回；不承诺整章原子落地，不引入全书批处理。
- **R18-5 自动引用联动（I115–I118）**：先冻结“可确定性派生镜像 / 作者语义引用 / 禁止自动修改”的维护矩阵。确定性引用在 candidate/reparse 已获授权后、landing UoW commit 前参与同一受控事务，禁止 post-commit 第二写入器；需要 LLM 推断的作者语义只形成修正候选，经 I11 ConfirmationGate 接受后写回，禁止后台静默 LLM 写层。operational audit/outbox 只记录机制状态，不成为叙事层；新 owner 验证后 delete-first 退役旧 `listField` 手填 ID 主路径，不保留双 owner fallback。
- **R18-6 长稿→大纲与逐章循环（I119–I121）**：长稿拆纲分析和初始化仅允许新建/空作品，Host 在调用 LLM 前完成 readiness preflight，继续遵守 N-7 非空项目 fail closed；拆纲只形成 outline candidate，先样本/held-out、后 prompt/schema、再经 I11 落地。逐章循环适用于所有项目：下一章上下文必须按 chapter.index/scene.index 选择已保存的作者修订正文与 I108 当前有效细纲基线，禁止文件名顺序、旧草稿、已失效基线或 caller 自建 context fallback。
- **R18-7 作者术语（I132、I140）**：I132 先扫描当时已存在的 Stage 18 作者可见正文、aria/title、错误与空态；I140 在最终流程 UI 完成后再做一次全量终检。技术合同名、wire 字段和 `data-novel-*` 锚点保持不变。动态 Host 错误经单一 presentation mapper 映射，技术徽标只在高级视图显示。
- **R18-8 上下文链接（I124–I127）**：链接由 core `EntityLink/TextAnchor` 合同、Host resolver/可重建派生索引和 Client router/back-stack 共同实现；不进入 C5、Markdown、txt 或可移植归档。sourceHash 不符即 stale；外部编辑回传后按纯正文重新分析重建，不假设 Markdown 携带链接。支持角色、关系、知情、审校、时间线、搜索和场景卡的稳定来源/目标导航，返回恢复来源视图、选择、筛选、模式与焦点。
- **R18-9 操作模式（I107）**：`ChaptersLayerState.mode` 是唯一 mode owner，取值 writing/candidate/versions/materials；不新增顶层 Workbench view。切场景时候选必须按 target 绑定或清理，隐藏面板不得继续请求或重复注册。
- **R18-10 版本聚合（I130–I131）**：`TextRepository` 与 `scene.branches` 继续是真相，`NovelBranchService` 只提供有界聚合投影；Host 一次读取并按 chapter.index/scene.index 排序，Client 不做 N+1 聚合。聚合树先 diff 后显式调用新 additive `chooseFresh(..., sourceHash)`，不新增 ConfirmationGate；既有四参数 `choose` invocation 保持不变，`chooseFresh` 拒绝并发陈旧切换。旧场景分支面板保持局部消费者，不成为第二版本 owner。
- **R18-11 正文变更影响分析与后续细纲调和（I108、I112–I114）**：`OutlineGenerationBaseline` 是绑定 project/chapter/scene/detailBeat、B5 fingerprint 与冻结场景卡的不可变生成意图快照；B5 `outline.yaml` 仍是唯一当前细纲真相，baseline 不提供第二编辑面、不自动覆盖 B5，B5 或绑定变化只会使旧 baseline stale。作者最终保存正文后，Host 以生成前正文/基线与当前正文形成有界 delta，先确定性排除纯格式噪声，再由 LLM 将其分类为 `wording-only`、`story-fact` 或 `plot-direction` 并给出原文证据；仅后两类可产生未来 detailBeat 影响候选。调和计划逐卡提供 keep、AI replacement、manual replacement 或 pending，禁止修改已完成/当前场景、稳定 ID、幕/节顺序和未授权卡；任何语义调整必须预览并经 I11 后在同一 Host 请求内以 B5 freshness 原子应用。普通保存和 wording-only 不得调整未来 B5 语义；显式“定稿并继续”只允许确定性完成当前绑定卡/C6 进度并创建下一场景的新 baseline，不自动接受下一段正文。
- **R18-12 范围细纲生成（I133–I134，I150 修复）**：Host `OutlineGenerationScope` 统一表达 act/outline-beat/bound-chapter/all；创作 C5 章节前可选择 B5 中承担章节规划职责的 beat，已有 C5 时 chapter 只能经 `SceneOutlineBinding` 解析为 B5 范围，Client 不复制映射。既有生成默认只补齐缺失 detailBeat；显式重生成必须保留稳定 ID/顺序并逐卡预览。I150 把大纲编辑器当前已保存的 selectedBeat 直接接入范围，不再要求手填 beatId，并增加严格 `append-to-selected-beat` 意图：作者 guidance 进入有界 Host LLM prompt，即使当前节已有卡也只生成新的追加候选；原卡不进入替换集。新候选逐卡编辑并选择是否保留，经唯一 I11 proposal 只追加到该节；范围外与未授权已有卡不可写。
- **R18-13 统一定稿（I135–I136）**：新增“接受为草稿”主路径，只把候选逐字落到 C5 供作者修改，不运行五层 parser、作者语义引用联动、B5 调和或 C6 推进；C5 已有的 Markdown 镜像、搜索索引和统计等可重建派生物仍随保存自动维护，不进入确认。既有 candidate `accept` Remote 保持兼容，但从主 UI 退为旧/进阶路径。作者最终保存后，Host 以当前 C5、I108 baseline 和各层 freshness 形成单一 `FinalizationPlan`，聚合 I109–I118 的五层变化/作者语义引用变化、I112–I114 的细纲调和及完成/前进动作。I136 由一个外层 I11 proposal 和一个 Host UoW 应用整份计划；子组件消费已授权计划，不再弹出嵌套确认。
- **R18-14 全书完成与发布（I137–I138）**：`BookCompletionService` 以 B5/C6/binding/C5 和未决提案为真相判断是否完成，复用既有 detector 对全书有界分片并汇总跨章问题；硬阻断、缺正文、未完成卡或待定调和关闭发布门。`ManuscriptCompiler` 只消费通过门禁的 chosen C5，按 chapter.index/scene.index 编译一份带章节目录的 TXT 和一份 Markdown；不混入设定 sidecar、内部链接、旧分支或技术 ID，不新增 DOCX。
- **R18-15 作者主流程与产品 E2E（I139–I140，I150 修复）**：新增稳定 `workflow` 视图作为默认入口，以“导入、大纲、细纲、生成基线、正文、定稿同步、全书检查、导出”八个作者阶段承载 README 12 步；同一业务动作只有一个主流程 owner。既有十九项能力不删除，分流到故事资料、进阶工具和设置；内部层编号、fingerprint、索引维护、Gate/UoW 和裸错误不进入普通路径。I150 要求步骤 3 只从当前选择派生技术 ID，脏草稿先保存；结构、冲突类型、细纲状态、生成范围等大纲工作区下拉框显示中文作者术语，提交和持久化仍使用既有 canonical 英文枚举。I140 固定 fake LLM 产品流在 I150 累积回归中保持通过。

#### 14.14.3 产品方向与非目标

唯一产品主路径按 README 的 12 步执行：导入思路/梗概/长稿 → AI 大纲候选并由作者确认 → 按幕/章/全书生成细纲 → 作者修改并建立近期场景生成基线 → 每卡生成一份正文候选 → 接受为草稿/重写/手工微调 → 系统分析最终正文并展示确定性派生、五层变化和后续细纲建议 → 作者一次确认 → 当前卡完成并进入下一张 → 下一次只消费有效细纲、最终正文、已确认状态与 POV 可知信息 → 全书一致性检查 → 带目录的单一 TXT/Markdown。

功能暴露分三层：

1. **主要流程**：上述八个作者阶段是默认入口，必须恢复当前作品的当前步骤；所有必需操作均在流程内可达。
2. **故事资料/进阶工具/设置**：角色、世界观、关系、状态、正史、知情、时间线、审校、版本、搜索、统计、队列、备份和模型设置继续可用，但不与主要流程并列为十九个同权任务。
3. **内部诊断**：B/C 层号、raw ID、sourceHash/fingerprint/seq、索引 rebuild/drop、ConfirmationGate/UoW 术语和原始异常默认不暴露，不得成为作者完成主流程的手工前置条件。

不另立独立“继续写作”仪表盘；恢复当前步骤属于唯一流程壳本身。笔记素材库（N-10）、富文本/专注编辑器（N-12）、当前阶段 DOCX 编译（N-13）、P2 系列（N-14）、非空作品合并导入（N-7）、正文内嵌链接和全书快照/修订线均不进入 Stage 18。

---

### 14.15 Stage 19 来源确认与幕后素材 POV 叙事化（I141–I149，v3.1）

> 定位：I140 已交付 README 十二步作者主流程，但既有 I52 六层分析与 I119 长稿拆纲只接收规范文本，不知道“来源是什么、作者想把它变成什么”。《灰烬圣典》一类文档同时包含幕后时间线、跑团/场景控制语句、作者待办和少量叙事段，现有模型会把客观真相顺序误当成读者应直接经历的 B5。Stage 19 只修复这项来源语义与 POV 泄漏缺口；不写 C5、不建立正文保真导入、不新增第 14 层、第二导入主流程或通用素材库。

#### 14.15.1 D26：来源角色与当前处理目标是两根独立轴

- **来源角色 `sourceRole`**：`idea`（创作想法）、`synopsis`（故事梗概/预定剧情）、`background-material`（世界设定/幕后真相/作者设计资料）、`existing-prose`（已有可用正文）、`hybrid`（混合文档）。系统可以给出建议与置信度，但作者必须显式确认；低置信或多角色来源不得静默选择。
- **Stage 19 处理目标 `treatment`**：`expand-outline`（沿既有 I119/I52 能力扩展为大纲）与 `adapt-pov`（按指定 POV 重构读者体验）。Stage 19 识别到 `existing-prose` 时可以明确路由到 `expand-outline`，也可以提示正文保真导入尚未交付，但不得假装已把原文写入 C5。后置 F2 保留了通过 strict additive V2 确认方法开放 `preserve-prose` 的设计；I142 的旧方法继续只接受并返回两个 Stage 19 取值，避免旧 Client 的穷举分支被静默扩宽。
- **叙事意图 `narrativeIntent`**：仅在 `adapt-pov` 时存在。`limited` 必须绑定现有角色或带稳定候选 ID 的待创建主角；`omniscient` 可以不指定单一主角，但若指定 focal character 仍必须可解析。主角初始已知信息与 `revealPacing`（slow/balanced/fast）一同冻结，禁止硬编码 fallback。
- I141 只冻结 canonical schema、合法组合与稳定 fingerprint，不提前发布没有服务语义的 Remote。I142 的 import session owner 才负责把确认意图与 `projectId/sourceHash/importSessionId` 绑定，并提供 strict additive Remote；重新生成、恢复、提案与应用必须消费同一绑定。

#### 14.15.2 D27：先解释来源，再投影叙事层

导入在同一主流程内形成两个零写阶段：

1. **来源解释候选**：Host 先建立稳定段落 ID 与规范文本范围，LLM 只对段落分类为 `world-truth`、`plot-plan`、`prose`、`author-instruction` 或 `presentation-note`，并给出整体 `sourceRole` 建议、置信度与证据；offset 始终由 Host 从段落 ID 投影，禁止模型直接决定不可信的字符边界。
2. **叙事投影候选**：只使用作者确认的解释生成 B/C 层候选。`author-instruction` 与 `presentation-note` 只能作为规划约束/证据，不得逐字成为正文、正史或读者可见 beat；任何未裁决 hybrid 段阻止下一步。

来源解释是绑定一次导入操作的 operational evidence，不是作品第 14 层，也不长期替代 B2/B3/B5/C3/C4/C5 真相。最小 checkpoint 只保存恢复所需的 sourceHash、意图、段落裁决摘要和 operation/proposal 状态；原始 DOCX 仍遵守 §14.7.2 的临时文件清理政策。

#### 14.15.3 D28：幕后素材按“客观真相—读者体验—知情揭示”分离

当 `background-material|hybrid + adapt-pov` 时：

- I52 既有六层分析只提供 B3/B2/C1/C2 的故事地基候选；它原有的 B5/C4 结果不得直接进入 Stage 19 plan。B5 必须由 POV adaptation 重新生成，C4 必须经过 public-at-start guard，C3 则由专门 reveal planner 生成。
- B5 只表达所选视角可经历的行动、调查、误判、冲突和揭示顺序，不按幕后事件发生顺序直接复述答案。
- 幕后事实进入 C3 `secret|backstory|foreshadow|plotpoint` 候选，`holders/KnowledgeState` 表达故事起点谁知道，`revealPlan` 表达计划向谁、何时揭示；主角未持有的事实不得出现在其可见 C3 投影。
- C4 初始化候选只接收故事开始时已经公开/已建立给读者的事件。仅存在于幕后说明、未来计划、presentation note 或作者指令中的真相不得提前写入 C4；等正文实际建立后仍由既有 finalization 追加。
- B5 当前 beat、B2 trigger 与 C3/C4 上下文必须共同通过确定性 POV 泄漏负测，不得靠 prompt 礼貌要求模型保密。
- 《灰烬圣典》作为 canonical consumer fixture：卢西恩创立焚书会、真实自杀、助手操纵三方及群体信念复活等不得在第一幕直接讲解；B5 必须先建立调查者体验，并按线索、错误判断、确认仍活着、归来、最终机制揭示组织。

#### 14.15.4 D29：Stage 19 应用与主流程边界

- `NarrativeImportPlan` 组合 I52 的 B3/B2/C1/C2 地基候选、Stage 19 的 B5/C3 与受 guard 限制的 C4；只面向新建/空作品，并在一次 I11 中汇总预览。
- Stage 19 先复用既有逐层 apply 语义：全量引用/readiness/freshness 预检后按稳定顺序幂等落地；中途 writer 失败必须返回可见 `partial-failure`、持久记录已完成阶段并允许以同一授权 operation 恢复，禁止把部分写入谎报为成功。机械迁移到共享空作品初始化 UoW 的设计已后置至 F1，恢复时仍不得改变公开结果形状或领域语义。
- README 仍保持 12 步：步骤 1 扩展为“导入并确认来源语义/目标处理/适用 POV”，步骤 2 扩展为“按确认意图生成和审阅读者体验大纲与揭示计划”。步骤 3–12 不改编号、不建立第二 workflow route。
- I37–I38、I50–I53、I119–I120 的既有 invocation、参数和结果保持兼容。I149 后普通作者主流程必须先经过来源语义确认；`existing-prose` 在后置 F2 未重新排期并交付前仍不写 C5。

### 14.16 后置设计包 F1：导入基础设施重构（v3.2 原 Stage 20 / I151–I155）

> v3.3 裁决：本包整体后置，原 I151–I155 只作 provenance，不是当前可执行卡。未来恢复时须重新分配迭代号和验证命令。原定位保留：以纯重构消除 Stage 19 的 import session、checkpoint、plan 编排重复，并补齐结构化 DOCX 证据与跨 owner 空作品初始化 UoW；不改 Stage 19 公开 Remote/wire、候选语义、样本、gold 或阈值。

#### 14.16.1 D30：结构化来源与兼容文本投影

- canonical `StructuredImportSource` 由 Host 持有格式、规范文本、稳定 paragraph ID、heading level、source range 与 sourceHash。DOCX reader 解析段落/标题样式；TXT/Markdown 使用确定性标题规则。
- 既有 `readDocxText()`、`readImportedText().text/chunks` 行为保持逐字段兼容，它们改为结构化来源的纯投影，禁止保留第二套 XML/text parser。
- 不可靠标题不由模型猜测；消费者必须显式降级。F1 恢复时仍只建立证据，不创建 chapter/scene 或写 C5。

#### 14.16.2 D31：共享 import operation 与空作品初始化 UoW

- 提取单一 `ImportOperation` envelope、checkpoint store、project write lane、freshness/replay 规则和 plan participant 接口；NarrativeImportPlan 与未来 ManuscriptImportPlan 只提供类型化 payload/participants，不各自复制 propose/accept/reject/recover 状态机。
- UoW 在写前冻结所有受影响 owner 的基线与完整目标快照，记录 durable operation journal；成功响应前所有 participant 必须完成。失败时恢复基线；若恢复本身中断，状态必须为 `pending-recovery`，重启先恢复到全旧或全新状态，禁止继续普通写作或谎报成功。
- Stage 19 coordinator 的共享地基迁移保留为 F1-4（v3.2 原 I154）；合法成功、拒绝、stale、replay 与作者可见结果必须保持不变，旧临时实现 delete-first 退役且零引用。F1 不得改变 B/C/C5 owner，也不建立分布式事务或后台叙事补写器。

### 14.17 后置设计包 F2：已有正文保真导入（v3.2 原 Stage 21 / I156–I162）

> v3.3 裁决：本包整体后置，原 I156–I162 只作 provenance，不是当前可执行卡。未来须先恢复 F1 地基并为本包重新分配迭代号。原定位保留：在 F1 地基上新增 `existing-prose + preserve-prose`，解决“已有小说只能拆纲、不能成为正式正文”；不回填 I141–I149。

#### 14.17.1 D32：C5 只能由 Host 受控来源构造

- Host 依据 `StructuredImportSource` 的 DOCX heading/paragraph 或 TXT/Markdown 标题证据形成有序 chapter/scene manuscript candidate；正文在既有 NFC/换行规范化之后逐字保留，LLM 不得返回、改写、补写、润色或重排 C5 content。
- 标题与正文 ranges 必须有序、无重叠并完整覆盖可导入规范来源，且能按同一投影规则重建。重复标题按来源顺序生成不同稳定 ID；不可靠层级确定性降级为单章/单场景并警告。
- 保真只针对规范化文字与顺序，不保留 DOCX 字体、图片、批注、修订、脚注或富文本样式。

#### 14.17.2 D33：正文与反向结构候选分离

- Host-owned C5 candidate 与 AI 反向生成的 B3/B2/B5/C1/C2/C3/C4 候选分别展示；结构分析复用既有 I52/I119 与 Stage 19 C3/C4 owner，必须携带来源证据，任何结构候选错误都无权改变 C5。
- B5 与 chapter/scene ranges 建立稳定映射，SceneOutlineBinding 只在 plan 中引用已预检的 detailBeat；无法可靠绑定时明确 pending，不伪造细纲卡。
- `ManuscriptImportPlan` 只允许新建/空作品，经一次 I11 和 F1 UoW 幂等应用 C5、结构候选与已确认 binding；拒绝、stale、非空项目、任一 participant 失败或恢复未完成都不得暴露半部正文/半套结构为可用项目。
- 导入后按 chapter.index→scene.index 汇入同一十二步流程。通用非空作品合并、富文本、自动润色、版本树与 DOCX 正式导出仍不在范围。

### 14.18 查漏补缺序列（I150–I151，v3.3）

> 定位：在继续大型导入重构与正文保真能力前，先修复已交付作者流程中可直接观察的缺口。I150 保持 §14.14 已冻结的范围细纲修复边界；I151 交付首次导入的一次性规则与文风初始化。

#### 14.18.1 I151 触发边界：首次导入事件，不是应用初始化

- 唯一自动触发点是 Host 确认的“新建/空作品的首次受控导入”事件。该导入的规范化来源、projectId、sourceHash 与 import/onboarding session 必须由 Host 绑定，Client 不得自行推断“首次”。
- 插件启动、Client 挂载、作品列表刷新、`projectOpen`、重启后重开、纯空白创建和对已有作品的后续导入都不是初始化事件，必须零 LLM 调用。B1/B4 文件为空也不能在 open 时反推并触发任务。
- Host 为首次导入建立 durable one-shot checkpoint，至少冻结 projectId/sourceHash/importSessionId、任务状态、候选 fingerprint 与 Gate lineage。重试只能继续同一任务，不得因刷新、重开、重复 finalize 或应用重放再启动第二个 LLM 任务。该 checkpoint 是 operational evidence，不是第 14 层作品真相。

#### 14.18.2 I151 一次性规则与文风 LLM 任务

- 首次导入进入可分析状态时，Host 同时启动一个专用“规则与文风初始化”任务；它是独立于 I52 六层 package 的单次 LLM 调用，不得扩充或改写现有 `ONBOARDING_LAYER_KEYS`、I52 prompt/schema 或 I53 六层 apply 结果。
- 输入只能来自 Host 绑定的首次导入规范文本与已确认创作意图；输出为 strict envelope：B1 `Rule[]` 初稿与单一 B4 `StyleProfile` 初稿。模型不得输出文件路径、持久化命令、其他 B/C 层或第二份风格 owner。
- 为保证“后续交由用户手工改写”，LLM 生成的规则初稿必须为 `immutable: false`；只有用户在编辑/确认时才可把某条规则升级为不可变。本任务不提供日常“重新生成”入口。
- 本迭代属 LLM 模块：先冻结 dev/held-out/gold（含无法推断硬规则、人称/POV 约束冲突和恶意文件指令），再实现 prompt/schema；先 fake backend/mock parser 跑通，held-out 每类不低于 80%。

#### 14.18.3 I151 确认、本地文件与后续手工维护

- LLM 结果只是可编辑初稿；Client 展示 B1/B4 双分区预览，用户可手工修改或拒绝。接受必须复用唯一 I11 ConfirmationGate，待 project/source/session/fingerprint freshness 复验后由 Host 经现有 `NovelRuleService`/`NovelStyleService` 落地，Client 不得读写文件。
- B1 的唯一作品真相仍是 `rules/*.yaml`，B4 的唯一作品真相仍是 `style.yaml`。成功响应前必须证明所有选中规则文件与风格文件已完整写入；拒绝、取消、stale、非空 B1/B4 或任一写入失败不得返回伪成功，也不得静默覆盖作者现值。
- 首次成功落地后，后续修改只经 I67 已有 B1/B4 控制面与 Host 领域校验进行；再次打开应用只读取本地文件，不启动 LLM。模型未配置或任务失败时，明确显示可重试同一首次导入任务或转手工录入，不阻塞作品数据打开。

### 14.19 I152：自定义 LLM 凭据的 DSH seam 所有权修复

- `novel-custom` 是本项目为了把作者填写的 OpenAI-compatible endpoint 接入 DSH `llm-pi-ai` 而创建的固定 provider route；它不是新模型实现，也不拥有另一套作品数据读取或 prompt 流程。小说所有生成仍经同一 A2 active backend、上下文组装器与 `ctx.llm`，差异仅在最终 provider/model/endpoint 路由。
- `.credentials.yaml` 的 schema、文件权限、跨进程锁、热重载和来源优先级属于 DSH `CredentialProvider`。小说插件只保存引用名 `NOVEL_CUSTOM_API_KEY`，配置状态经 `describe()`，新值经 `set()`；禁止直接读取、合并或整体回写凭据文件。
- 修复不得改变 `novelLlmConfig` Remote 形状、`novel-custom` provider id、A2 `modelRef`/`secretRef`、采样参数或任何 prompt/schema。缺失 credentials seam、环境只读遮蔽或 provider 写失败必须在 settings/A2 改写前 fail closed。

### 14.20 I153：目录层 DOCX 首次受控导入入口

- 目录层上传 DOCX 并创建新作品后，Client 必须以 Host 返回的 `sourceHash`、原文和 paragraph chunks 直接建立既有 `ImportInterpretationReview`；不得先启动旧 I52 六层分析。来源审阅必须独立于 `OnboardingState` 渲染，否则无六层任务时会把真实审阅状态隐藏。
- 作者必须在这条真实产品路径中看到既有 Stage 19 来源角色，包括“背景设定 / 幕后资料”和“已有正文”；选择背景资料、按视角重构、限知视角后，既有主角 ID 与待创建主角候选入口必须可达。本迭代不新增 enum，也不把“已有主角”误建为来源类型。
- I151 仍只由首个已确认 import session 触发：确认前零规则/文风 LLM，确认后精确一次 begin，并继续经 I11 才写入 B1/B4。I153 只修 Client 入口接线，不改变 I150 范围细纲、I151 Host/Remote/schema、上传/项目 Remote 或后置正文保真边界。

### 14.21 I154：来源审阅分类与操作解释提示

- 来源角色、段落来源类型、段落处理和“合并此分类”必须使用同一视觉与可访问交互：标签或操作旁显示经典帮助按钮，鼠标 hover、键盘 focus 均显示详细 tooltip，并保留原生 `title` 降级与 `role=tooltip`/`aria-describedby` 关联。
- 来源角色提示必须解释五类材料及当前边界；段落来源类型提示必须解释 `world-truth/plot-plan/prose/author-instruction/presentation-note`；段落处理提示必须解释 pending/accepted/edited/rejected。“合并此分类”明确等价于接受当前分类，不拼接相邻文本、不触发领域写入。
- 当前目录 DOCX 路径的审阅单元来自 Host 4000 字符 chunk，可能包含多个 Word 段落；UI 文案称其为“来源片段”，不得承诺 Word 段落一一对应。I154 不修改 DOCX reader、chunkText、paragraph ID、分类/裁决 enum、Host/Remote、LLM prompt/schema 或样本。

### 14.22 I155：既有作品归档与强制只读

- 项目归档是 Host-owned 生命周期转换，不是删除或 `project.yaml` 状态字段。完整作品树从活动 `<projectsRoot>/<projectId>` 原子迁入 `<projectsRoot>/.archive/<projectId>`；活动主列表仍只枚举安全的直接项目目录，因此归档作品天然退出主列表。
- 归档后在原活动位置写入 Host 墓碑文件。它不是作品真相，只用于让归档前已经缓存旧路径的仓储实例在文件系统层 fail closed，禁止迟到写重新创建活动树；统一 `projectDirectory()` 同时因归档树存在而拒绝新打开与新项目级访问。恢复校验墓碑后移除并原样迁回完整树，不改任何 B/C 层内容。
- 公开合同只做 strict additive 扩展：`projectArchiveList()`、`projectArchive(projectId)`、`projectRestore(projectId)`。Client 主列表的活动作品可以打开/归档；独立归档区只展示名称与恢复，不提供打开、编辑或任何领域操作。未知 ID、重复归档/恢复、冲突活动目录、非法 ID、损坏/符号链接目录均 fail closed。
- I155 不提供永久删除、自动归档、批量归档、云同步、归档内搜索/导出，也不修改 `ProjectMeta` schema、作品内容、LLM prompt/schema/样本或后置 F1/F2。

---

## 15. 附录：与 SillyTavern 的层映射速查

| SillyTavern 组件 | 本设计对应层 | 说明 |
|---|---|---|
| 引擎 / 数据目录 / 提示词流水线 | A1 引擎核心层 | 保留思路，重写实现 |
| 提示词模板 / 主题 / 扩展 / 后端 / 采样 | A2 可插拔系统层 | 基本可复用 |
| （无对应） | B1 规则层 | 新增 |
| World Info / Lorebook | B2 世界观层 | 映射，增强层级与改写追踪 |
| 角色卡 | B3 角色核心层 | 映射，拆分出可变状态 |
| （无对应） | B4 风格层 | 新增（ST 仅作者备注近似） |
| （无对应） | B5/C6 大纲层 | 新增 |
| （无对应） | C1 关系层 | 新增 |
| （无对应） | C2 状态层 | 新增（核心增量） |
| （无对应） | C3 揭示/知情层 | 新增 |
| 聊天历史 | C4 正史 + C5 生成文本 | 拆分：事实 vs 文本 |
