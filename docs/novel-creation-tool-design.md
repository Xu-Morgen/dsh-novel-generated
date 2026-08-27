# AI 长篇小说创作器 — 完整设计文档

> 版本：v2.2
> 状态：v2.2 当前设计权威；I1–I53 已完成，I54–I72 为已批准待执行计划；以 DeepSeek Harness/Cordis 普通持久插件为唯一当前实现方向
> 定位：DeepSeek Harness 内具备持久化叙事状态的 AI 长篇小说创作器（不是独立前端）

## 0. 版本变更记录

| 版本 | 变更 |
|---|---|
| v1.1（历史来源） | provenance only：设计定稿（13 层模型 + 7 引擎 + 生成/注入/一致性/存储/扩展）；不构成 v2.2 当前执行权威。 |
| v1.2（历史来源） | provenance only：产品升级为「创作环境」，引入细纲、世界观一级能力、辅助 agent、导入导出/编辑 UI、不变设定索引层等；不构成 v2.2 当前执行权威。 |
| v1.3（历史来源） | provenance only：曾将计划细分为 57 个迭代并引入 ConfirmationGate、thin 闭环等执行安排；这些 v1.x 迭代标签与顺序不构成 v2.2 当前执行权威。 |
| v1.4（历史来源） | provenance only：曾将计划细分为 68 个迭代并补充真实 LLM thin 切片、原子性、规模 smoke 与样本金标规则；这些 v1.x 迭代标签与顺序不构成 v2.2 当前执行权威。 |
| **v2.0** | **架构重置**：将 v1.x 的独立 Node/Vite 应用方向记为历史且已被取代；DeepSeek Harness（DSH）成为唯一运行宿主和主交付形态，产品作为 ordinary persistent plugin（普通持久插件）交付；生产安装/组合合同唯一见 §0.1.1。13 层叙事模型、引擎、存储、导入导出、编辑与 agent 产品设计继续有效，唯有与宿主边界冲突的实现方式失效。 |
| **v2.0（增补 2026-08-24）** | 新增 §14.6「创作台」UI 重设计：在 I33–I36 已交付的 Slot 工作区之上，重做信息架构与视觉体系（编辑台/书斋方向），记录决策 D11–D14 与迭代 I46–I49；§0.1 宿主基线不变，A-7 novel 自有主题系统仍后置。 |
| **v2.1（2026-08-24）** | 新增 §14.7「作品启动与六层初始化」及 Stage 10（I50–I53）：修复缺失的 Host-owned 作品启动编排，增加多作品选择、空白作品、受控 DOCX 上传、自由文本六层分析、逐层裁决与幂等落地；记录 D15–D19。§0.1 宿主基线不变。 |
| **v2.2（2026-08-26）** | 将 I1–I53 同步为已完成；新增 Stage 11–13（I54–I72），先把居中浮窗退役为 DSH 内右侧停靠侧板并修复现有 UI，再交付 P0 正文写作闭环与 P1 能力可达性；记录 D20。§0.1 宿主基线不变。 |

> **v2.2 supersession / 同步状态**：`novel-creation-tool-development-plan.md`、`novel-creation-tool-requirements.md` 与 `AGENTS.md` 已同步为 v2.2 当前执行材料；当前迭代身份为 I1–I72，其中 I1–I53 已完成，I54–I72 已批准但须按单迭代纪律逐项执行。历史 v1.x 文本只保留 provenance，尤其不得恢复旧 React/Vite 独立应用计划。
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
- **过渡期已观测安装证据（非项目 pin）**：当前已安装环境的观测证据是 DSH `0.1.0-rc.7` 与 Cordis `4.0.1`；该证据尚不是可复现的项目 pin，过渡期间不得称为 project baseline。I1 必须先在项目根权威 `package.json` 中加入 DSH family 与 Cordis 的明确 pin/经验证兼容范围，并生成、提交与之对应且锁定精确解析版本的权威 lockfile；只有二者齐备并经可复现安装验证后，才可称为项目依赖基线。任何后续升级都必须进入专门的兼容性迭代，并重新执行 selected profile boot 与完整 Client gate。
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

## 6. 运行时引擎设计

引擎由核心协作模块组成（v1.2 新增四类辅助 agent，见 §6.7）：

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
| C1 关系 | 摘要 | ~5% | 相关角色对 |
| C2 状态 | 结构化快照 | ~15% | 始终 |
| C3 知情 | POV 过滤后事实 | ~5% | POV 已知 |
| C4 正史 | 检索 + 摘要 | ~20% | 相关性检索 |
| C5 生成文本 | 原文/摘要 | 剩余 ~15% | 近期原文 + 远期摘要 |

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
| D20 | 创作台侧区落点与兼容门 | 替换 `sidebar`/`details` 单槽 / 居中浮窗继续存在 / DSH additive 侧区 Slot 优先、否则 `shell.overlay` 右侧停靠侧板 | ✅ 已定（I54）：I54 执行前先核验所选 DSH 版本及最新公开 Slot 合同；若新版已有 additive 侧区内容 Slot，停止并先通知用户升级、更新项目兼容基线后再实现；若仍无，则使用 `shell.overlay` list Slot 渲染贴右、全高、非模态停靠侧板。当前安装 `0.1.0-rc.7` 的 live Slot tree，以及最新版 `0.1.1-rc.2` 发布包 `dsh-client-ui-slots`、`dsh-client-ui-sidebar`、`dsh-client-ui-layout`、`dsh-client-ui-workspace` 的静态合同核验，均未发现该公共 Slot，故当前目标为右侧停靠侧板（发布参考：https://github.com/deepseek-ai/DeepSeek-Harness/releases/tag/dsh-v0.1.1-rc.2）。禁止接管 `sidebar`/`details` 单槽，禁止保留居中浮窗与停靠侧板双路径。 |

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

---

## 14. 创作环境功能设计（v1.2 provenance；v2.2 持续增补）

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

- Client 挂载 Remote 后必须先请求作品列表；无作品时显示新建入口，有作品时由用户选择后调用 Host `projectOpen(projectId)`。Client 可记住上次选择作为 UI 偏好，但每次启动都必须由 Host 重新验证；不得写入 `project.yaml` 或建立进程级全局 current project。
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
- **作品上下文（I55）**：侧板头部持续显示当前作品，可返回作品列表并新建/切换；切换前处理脏表单，切换后清空旧作品 Client draft 并由 Host `projectOpen` 重新验证，禁止跨作品串写。
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
