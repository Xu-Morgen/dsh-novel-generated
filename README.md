# AI 长篇小说创作器（novel-creation-tool）

AI 长篇小说创作器是一个运行在 **DeepSeek Harness（DSH）** 中的 **ordinary persistent Cordis bundle plugin**。它以 13 层结构化叙事状态引擎为核心，提供分层上下文组装、LLM 生成、正史账本、一致性检测、导入导出以及 DSH Slot UI 编辑台等能力。

> **重要**：本项目的唯一运行宿主和主交付形态是 DeepSeek Harness。它**不是**一个独立 Node/Vite 应用，也没有独立的第二前端或浏览器直连 LLM。文件、凭据、LLM 与领域真相全部由 Host 拥有；Client 只拥有注册到 DSH Slot 的 UI。

- 权威设计文档：`docs/novel-creation-tool-design.md`（v3.1）
- 权威开发计划：`docs/novel-creation-tool-development-plan.md`（v3.1；I1–I149 已完成，当前执行 I150，Stage 20–21 排期至 I161）
- 需求与验收矩阵：`docs/novel-creation-tool-requirements.md`（v3.1）
- 架构审查记录：`docs/novel-creation-tool-architecture-review.md`（v1.0）与 `docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0；均为立项输入，非设计权威）

---

## 最终产品目标与唯一主要交付流程

本产品的最终目标不是提供一组需要作者理解数据层、索引和任务队列的技术工具，而是让作者在保留最终裁决权的前提下，沿一条连续流程快速完成“想法 → 大纲 → 细纲 → 正文 → 全书检查 → 交稿”。以下 12 步是产品的**唯一主要交付流程**，也是产品级端到端测试的规范顺序：

1. 导入创作思路、故事梗概、幕后设定或已有正文；系统建议来源类型，作者确认“原文是什么、希望把它变成什么”以及适用的 POV/揭示意图。
2. AI 按已确认的来源语义生成大纲候选：幕后素材按主角可体验的调查与揭示顺序叙事化，已有正文保持原文并反向整理大纲；作者审阅并确认。
3. 作者选择某一幕、某一章或全书，由 AI 生成细纲。
4. 作者修改细纲，并将近期场景设为“生成基线”。
5. AI 按一张细纲卡生成一个正文候选。
6. 作者接受为草稿、要求重写或手工微调；接受为草稿只保存正文，不提前改写故事状态。
7. 系统分析作者最终保存的正文：自动更新可确定性派生的信息，并展示人物状态、关系、知情、正史等变化以及对后续细纲的影响和调整建议。
8. 作者在一个汇总预览中一次确认需要应用的变化；未确认、拒绝或失败均不得修改叙事真相。
9. 当前细纲标记为“正文已完成”，系统自动进入下一张有效细纲卡。
10. 下一次生成只使用当前有效细纲、作者最终保存的正文、已确认的故事状态，以及当前 POV 有权知道的信息。
11. 所有细纲完成后进行全书一致性检查，存在阻断问题时不得进入正式导出。
12. 系统生成章节目录并导出一份完整 TXT 或 Markdown；DOCX 仅作为未来可选能力。

系统自动处理的范围仅包括可重建的镜像/索引/统计、影响分析、建议生成、确认后的进度推进和上下文组装；人物命运、剧情方向、后续细纲语义、正史等作者语义必须先展示再确认。系统不得因普通保存或纯措辞修改而静默改写后续细纲。

> **交付状态**：I1–I149 已完成，以上 12 步主流程、细纲范围生成、统一定稿、全书完成门、单文件合稿、来源确认、幕后 POV 叙事化与 C3/C4 安全边界均已交付。Stage 20 / I150–I154 将重构导入地基，Stage 21 / I155–I161 才交付已有正文保真导入；当前阶段不把已有正文表述为已可保真进入 C5。

### 完整产品级测试流程

| 步骤 | 必须观察到的作者结果 | 主要迭代证据 |
| --- | --- | --- |
| 1–2 解释来源并确认大纲 | 步骤 1 导入来源并确认来源角色、当前目标处理以及适用 POV/揭示意图；步骤 2 按确认意图生成大纲候选并审阅，幕后素材形成读者体验与揭示计划；已有正文在 Stage 21 前只进入既有拆纲，不直接进入 C5；候选确认前零写，非空作品不被静默覆盖 | I37–I38、I50–I53、I119–I120；增强 I141–I149、I155–I161 |
| 3 按范围生成细纲 | 可选幕、章节或全书；只改选中范围，已有卡与稳定 ID 默认受保护 | I133–I134 |
| 4 修改并建立基线 | 作者保存的细纲是唯一真相；基线可重启恢复，细纲变化后旧基线失效 | I108 |
| 5 每卡生成一个候选 | 候选绑定准确的章、场景、细纲卡与基线；过期落点不得写入 | I62–I63、I105、I109–I110 |
| 6 接受为草稿并微调 | 接受、重写、手改互不混淆；最终正文逐字保存，候选不会提前更新其他叙事层 | I61、I70、I135 |
| 7 分析最终正文 | 展示五层结构变化、确定性引用变化和逐卡细纲影响；纯措辞不触发剧情调和 | I109–I118、I135 |
| 8 一次确认 | 一份定稿计划、一次 ConfirmationGate 裁决、一个 Host 请求；失败不得半应用 | I135–I136 |
| 9 完成并前进 | 当前卡完成且下一张基线被创建；无合法目标时明确提示，不创建幽灵场景 | I114、I136 |
| 10 只用有效上下文 | 不注入旧草稿、失效基线或 POV 不应知道的信息 | I18、I121 |
| 11 全书检查 | 仅在全部必需细纲完成后运行全书扫描；阻断项关闭导出门 | I137 |
| 12 单文件导出 | 章节顺序、目录、标题和正文确定性一致；TXT/Markdown 各是一份完整稿件 | I138 |
| 主流程整体 | 默认进入作者流程，技术工具不干扰主线；固定 fake LLM 端到端覆盖成功、拒绝、陈旧和失败路径；来源感知与正文保真增强仍汇入同一流程 | I139–I140；增强 I149、I161，统一运行 `pnpm run verify:product-flow` |

### 功能暴露边界

| 层级 | 作者看到什么 | 处理原则 |
| --- | --- | --- |
| 主要流程 | 导入、大纲、细纲、生成基线、正文候选与编辑、定稿同步、全书检查、导出 | 作为默认入口和连续步骤展示；恢复作品时回到当前步骤 |
| 进阶工具 | 角色、世界观、关系、状态、正史、知情、时间线、审校、版本、搜索、统计、队列、备份、模型设置 | 功能保留，收纳到“故事资料 / 进阶工具 / 设置”，不与主要流程并列争夺注意力 |
| 内部能力 | B/C 层编号、fingerprint/sourceHash、技术 ID、索引重建/删除、Gate/UoW、原始错误与合同字段 | 默认不暴露；仅在诊断或高级视图中按需展示，普通作者不必手工操作 |

现有大纲、进度、正文、审校、队列等模块不会被删除，但同一任务不得同时由两个主入口拥有。例如“细纲生成”归大纲步骤，“正文版本”归正文步骤，“定稿后的状态与细纲同步”统一归定稿步骤；底层分层编辑器只作为进阶校正入口。

---

## 目录

- [最终产品目标与唯一主要交付流程](#最终产品目标与唯一主要交付流程)
- [环境要求](#环境要求)
- [快速开始：构建插件](#快速开始构建插件)
- [安装到 DSH（唯一生产安装合同）](#安装到-dsh唯一生产安装合同)
  - [方式一：Bundle 路径（推荐，本项目采用）](#方式一bundle-路径推荐本项目采用)
  - [方式二：Plugin patch 路径（二选一，不可混用）](#方式二plugin-patch-路径二选一不可混用)
- [安装“小说创作助手”Agent Preset](#安装小说创作助手agent-preset)
- [可选进阶：使用小说创作助手](#可选进阶使用小说创作助手)
- [验证安装](#验证安装)
- [本地 smoke 验证](#本地-smoke-验证)
- [插件提供的服务](#插件提供的服务)
- [项目结构](#项目结构)
- [开发与测试](#开发与测试)
- [常见问题（FAQ）](#常见问题faq)

---

## 环境要求

| 依赖 | 版本要求 |
| --- | --- |
| Node.js | `>= 22` |
| pnpm | `11.22.0`（见 `package.json` 的 `packageManager` 字段） |
| DeepSeek Harness（DSH） | `0.1.1-rc.2`（I85 起的唯一可复现项目 pin，见设计 §0.1.3） |

> 若未安装 pnpm，可先执行 `corepack enable`（Node 22 自带 corepack）或 `npm install -g pnpm@11.22.0`。

---

## 快速开始：构建插件

```bash
# 1. 克隆仓库
git clone <repo-url> novel-creation-tool
cd novel-creation-tool

# 2. 安装依赖
pnpm install

# 3. 构建（TypeScript 编译 + esbuild 打 Client bundle）
pnpm build
```

构建产物位于 `lib/` 目录：

| 产物 | 说明 |
| --- | --- |
| `lib/index.js` | Host 插件入口（由 `main` 字段导出） |
| `lib/client.js` | Client（浏览器）插件 bundle |
| `lib/remote.js` / `lib/client.d.ts` 等 | Remote 合同、类型声明 |

---

## 安装到 DSH（唯一生产安装合同）

本插件作为 **ordinary persistent Cordis bundle plugin** 交付，其生产安装遵循设计文档 **§0.1.1** 中定义的**唯一规范合同**。关键规则概括如下：

1. **Bundle 路径（本项目采用）**：package manifest 声明 `dsh.bundle.patch`，且该 bundle 必须**显式列入所选 profile** 的有序 `dsh.profile.bundles`。仅安装 package 不会自动激活。
2. **Plugin patch 路径（二选一）**：composition row 的插入必须**恰好由一个 composition layer** 拥有。
3. Bundle 路径与 Plugin patch 路径对同一 deployment **必须互斥**，只能择一作为当前安装合同。
4. 仓库根目录的 `cordis.yml` **仅**用于本地 Loader smoke，**不是**生产安装/发现/组合入口；DSH 随附（shipped）的 composition **永不编辑**。

### 方式一：Bundle 路径（推荐，本项目采用）

Bundle 路径意味着：把本插件作为 dependency 安装到「所选 profile」，并在该 profile 的 `dsh.profile.bundles` 中显式列出。

#### 步骤 1：确定你的 profile

DSH 的 profile 位于 `${DSH_HOME:-$HOME/.dsh}/profiles/<profile-name>/`。每个 profile 是一个独立的 npm 包（拥有自己的 `package.json` 与 `node_modules`）。

以 Windows 为例，默认 DSH home 为 `C:\Users\<你>\.dsh`；profile 目录形如：

```text
.dsh/
└── profiles/
    └── <profile-name>/
        ├── package.json      # profile 的 manifest（在这里声明本插件）
        └── node_modules/
```

#### 步骤 2：把本插件加入 profile 依赖并列入 bundles

编辑 profile 的 `package.json`，把 `novel-creation-tool` 加入 `dependencies`，并在 `dsh.profile.bundles` 数组中显式列入：

```jsonc
{
  "name": "dsh-profile-我的profile",
  "private": true,
  "dependencies": {
    "@deepseek-ai/dsh-base": "0.1.1-rc.2",
    "@deepseek-ai/dsh-web-app": "0.1.1-rc.2",
    "novel-creation-tool": "file:../novel-creation-tool"   // 你的本地 clone 路径
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "novel-creation-tool"
      ]
    }
  }
}
```

> **关于依赖写法**：
>
> - 本地开发/验证：使用 `"file:../novel-creation-tool"`（指向你 clone 出来的仓库根目录）。
> - 发布后安装：使用 `"novel-creation-tool": "2.0.0"`（或对应的 registry 版本）。
> - `dsh.profile.bundles` 是**有序数组**，插件的 Client bundle 需在 `@deepseek-ai/dsh-web-app` 等基础 bundle 之后加载（本插件是 pure Client patch，对顺序不敏感，但保持表意顺序更清晰）。

一个完整的 profile 示例见 [`examples/selected-profile.package.json`](examples/selected-profile.package.json)。

#### 步骤 3：安装依赖

在 profile 目录内执行：

```bash
cd <DSH_HOME>/profiles/<profile-name>
pnpm install --prefer-offline
```

#### 步骤 4：启动 DSH 并选定该 profile

```bash
dsh --profile <profile-name>
```

启动后，本插件应作为 `novel-creation-tool` 这一条 composition row 被组合（bundle 声明 → bundle patch 读取 → 唯一命名 row 插入），并解析出 `novelCreation` 等 Host 服务。

### 方式二：Plugin patch 路径（二选一，不可混用）

如果不想走 bundle 机制，可改为「plugin patch」路径：在**所选 profile 的 `cordis.patch.yml`**（或优先级更高的 home `cordis.patch.yml`）中插入一条 row。**两种路径对同一 deployment 必须互斥。**

```yaml
# 所选 profile 的 cordis.patch.yml
- insert:
    - id: novel-creation-tool
      name: novel-creation-tool
```

> 注意：profile/home 的 `cordis.patch.yml` **没有独立的 dependency 解析位置**，package 仍必须从所选 profile 或 DSH 依赖链中解析。因此即便使用 plugin patch 路径，通常也需要在 profile 的 `package.json` 中安装本插件。仓储中的 `cordis.patch.yml` 已经是用于 bundle 路径的 patch 层，**不要**把它直接复制进 shipped DSH composition。

---

## 安装“小说创作助手”Agent Preset

仓库同时提供一份面向日常写作的 DSH Agent Preset：

- Preset ID：`novel-writer`
- 显示名称：**小说创作助手**
- 源文件：[`examples/agent-presets/novel-writer/`](examples/agent-presets/novel-writer/)
- 用户安装目录：`${DSH_HOME:-$HOME/.dsh}/.agent-presets/novel-writer/`（若部署显式配置了 harness-home 覆盖，则以该覆盖目录为准）

> **插件与 Preset 是两个不同层面。** `novel-creation-tool` 插件必须先按上一节安装到所选 profile，它在 Host 注册作品服务和 `novel_*` 工具；`novel-writer` Preset 只定义该会话使用的人设、提示词和通用 Agent 工具。只复制 Preset 而没有装载插件时，Agent 不会获得小说工具。
>
> 当前示例以 DSH 的完整 `standard` Agent 能力为基础，除小说工具外还包含 shell、文件系统、Web、子 Agent、workflow 等工具；它不是“只允许写小说”的最小权限 Preset。实际执行仍受 DSH 会话权限/沙箱控制。安装前请审阅 [`agent.cordis.yml`](examples/agent-presets/novel-writer/agent.cordis.yml)，并按部署需要删减工具。

### 前置条件

1. 已完成 `pnpm install && pnpm build`，并已按 Bundle 路径把 `novel-creation-tool` 装入当前 DSH profile。
2. 插件配置未把 `agentTools` 设为 `false`；默认值为 `true`。
3. DSH 已配置可用模型及凭据。LLM 调用由 Host 的 `ctx.llm` 执行，Preset 不保存 API key。

### 复制到用户 Preset 目录

不要编辑 DSH 安装目录中随附的 `standard`、`code`、`minimal` 或 `cordis` Preset；升级 DSH 会覆盖它们。把本仓库提供的 Preset 复制到用户自有目录。以下命令均从本仓库根目录执行。

**Windows PowerShell：**

```powershell
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$PresetRoot = Join-Path $DshHome '.agent-presets'
$Target = Join-Path $PresetRoot 'novel-writer'

if (Test-Path $Target) {
  throw "Preset 已存在：$Target；请先备份并合并修改，不要直接覆盖。"
}

New-Item -ItemType Directory -Force $PresetRoot | Out-Null
Copy-Item -Recurse '.\examples\agent-presets\novel-writer' $Target
```

**Linux / macOS：**

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_ROOT="$DSH_HOME/.agent-presets"
TARGET="$PRESET_ROOT/novel-writer"

test ! -e "$TARGET" || { echo "Preset 已存在：$TARGET；请先备份并合并修改。" >&2; exit 1; }
mkdir -p "$PRESET_ROOT"
cp -R examples/agent-presets/novel-writer "$TARGET"
```

复制后目录必须包含：

```text
<DSH_HOME>/.agent-presets/novel-writer/
├── preset.yml
└── agent.cordis.yml
```

标准 DSH Web 组合默认扫描该用户目录。若部署显式设置了 `agent-presets.includeUserRoot: false`，请改为复制到部署配置的第一个可写 `user` Preset root。

### 让 DSH 发现 Preset

Preset roster 每次读取时都会重新扫描磁盘，但不会主动向浏览器推送变更。复制完成后，打开或刷新 **设置 → Agent Presets**（或新建会话界面），即可看到“小说创作助手”；如仍未出现，再让 Web GUI 重新连接 Host 或重启 DSH 进程。

如需把“小说创作助手”设为新会话默认，可在 Agent Presets 管理界面中设置默认值；具体入口以当前 DSH 版本的设置页为准。

> Preset 只能在新会话或尚未产生消息的空白会话中切换。已有对话一旦运行过，就不能更换 Preset；请新建会话。

---

## 可选进阶：使用小说创作助手

Agent Preset 是自然语言快捷入口和进阶工具，不是上述 12 步产品流程的第二条主路径。普通作者应在“创作流程”中完成大纲、细纲、逐卡正文、统一定稿、全书检查与导出；Agent 不得绕过候选审阅、生成基线、一次确认或发布门。

### 1. 先在创作台准备作品

1. 在 DSH Web GUI 左侧栏底部点击 **创作台**。
2. 在 **LLM 设置**中检查当前模型/模板配置；模型凭据仍由 DSH Host 管理。
3. 新建空白作品，或上传 `.docx`；打开作品后也可在六层初始化页粘贴原文并执行分析。
4. 审阅 B3 角色、B2 世界观、B5 大纲/细纲、C1 关系、C2 状态、C4 正史候选，并完成接受、修改后接受、重生成或跳过。
5. 应用已接受层后，再进入使用 `novel-writer` Preset 的新会话。

默认作品目录为 `~/.dsh/novel-projects/<projectId>/`，也可以通过插件配置 `projectsRoot` 修改。不要直接编辑该目录中的 YAML、JSONL 或正文文件；所有写入应走创作台或 `novel_*` Host 工具，以保留 Schema 校验、ConfirmationGate 和 C4 append-only 约束。

### 2. 新建小说创作助手会话

1. 点击 DSH 的新建会话。
2. 在新会话界面的 Preset 选择 chip 中选择 **小说创作助手**。
3. 选择模型和工作目录后创建会话。
4. 先让 Agent 列出作品，再使用返回的准确 `projectId` 打开目标作品。

推荐的首次指令：

```text
请先列出所有小说作品，等我选择后再打开，不要续写。
```

### 3. 常用自然语言指令与工具

Preset 会引导 Agent 使用以下 Host 工具；用户通常只需用自然语言下达任务：

| 想做什么 | 示例指令 | 对应工具 | 是否写入作品 |
| --- | --- | --- | --- |
| 列出作品 | `列出所有小说作品和当前就绪状态。` | `novel_status` | 否 |
| 打开作品 | `打开作品 my-book，并汇报各层是否就绪。` | `novel_open` | 否 |
| 查看下一场景上下文 | `读取 my-book 的下一场景、当前细纲、状态和最近正文。` | `novel_context` | 否 |
| 获取灵感 | `为 my-book 给出三个不同的发展方向，不要写入。` | `novel_inspire` | 否 |
| 只生成预览 | `按当前细纲续写下一场景，只预览，不落盘。` | `novel_continue`，`decision=reject` | 否 |
| 生成并落盘 | `按当前细纲续写下一场景并落盘。` | `novel_continue`，`decision=accept` | 是 |

建议每次续写前先读取 `novel_context`，确认当前细纲、目标字数、POV、角色状态和最近正文。若 Agent 报告低置信结构化变更需要 ConfirmationGate，请回到创作台完成确认，不要要求 Agent 反复重试绕过确认。

### 4. 当前版本的重要限制

- I1–I149 已交付完整 12 步主流程，以及来源确认、幕后素材叙事化和 C3/C4 安全边界；混合幕后资料已由 Stage 19 的来源感知流程处理。Stage 21 / I155–I161 完成前，已有正文仍只能拆纲或手工录入，不能保真进入 C5。
- `novel_continue decision=accept` 属兼容快捷路径，不等同于主流程的“接受为草稿 → 作者微调 → 最终正文分析 → 一次确认定稿”；需要作者最终文本驱动故事状态时，应使用创作流程的统一定稿路径。
- 六层初始化与逐层裁决仍应在创作台 GUI 完成；Preset 不绕过该流程。
- 修改已有 Preset 的 `agent.cordis.yml` 只影响此后创建的新会话；已经运行的会话继续使用其创建时挂载的版本。若浏览器没有刷新新增 Preset 的 roster 或展示元信息，再重新连接 Host。

---

## 验证安装

安装并启动后，可通过以下任一方式确认插件已正确装载：

1. **Host 服务存在**：插件暴露一个只读状态服务 `novelCreation`（`{ version: '2.0.0', ready: true }`）。在 DSH 组合上下文中可解析到该服务即代表 Host 已成功装载。

2. **Fiber dispose 完整性**：停止/卸载插件后，`novelCreation` 等所有由插件提供的服务应随之从上下文移除（这是 H0-6 验收要求）。

3. **Client Slot UI**：在 DSH Web GUI 左侧栏底部应能看到 **创作台** 入口。

4. **Preset roster**：在 **设置 → Agent Presets** 中应能看到 **小说创作助手**（ID 为 `novel-writer`），且没有“Failed to load”标记。

5. **Agent 工具**：使用该 Preset 创建新会话并发送“列出所有小说作品，不要续写”，Agent 应调用 `novel_status`；如果工具不存在，先确认插件 bundle 已在当前 profile 中激活且 `agentTools` 未关闭。

---

## 本地 smoke 验证

仓库自带两档 smoke，用于在**不触碰 live profile** 的前提下证明插件能正确组合与装载。它们依赖已安装的 DSH（需要 `DSH_HOME` 中存在 `@deepseek-ai/dsh-app-boot`）：

```bash
# I1：通过仓库本地 cordis.yml（Loader smoke）装载 Host 插件
pnpm run smoke:i1

# I1：在隔离的一次性 profile 中走「真实 selected-profile bundle」完整装载路径
pnpm run smoke:i1:profile
```

> `smoke:i1:profile` 会在临时目录里创建一个隔离 profile、以 `file:` 依赖安装本插件、按 `dsh --profile` 的方式组合并 `boot()`，解析 `novelCreation` 服务，最后 Fiber dispose 验证完整卸载。它是对 §0.1.1 唯一生产合同的端到端可复现证据。

---

## 插件提供的服务

插件在 Host 组合中提供一系列以 `novel*` 命名空间区分的 Cordis 服务（完整契约见 `src/index.ts` 的 JSDoc 与各 `src/host/*-service.ts`）：

| 服务名 | 职责 |
| --- | --- |
| `novelCreation` | I1 只读状态探针（版本与 ready 标志） |
| `novelProject` | 作品（project）存储门面 |
| `novelState` | C2 可变叙事状态层 |
| `novelCanon` | C4 正史账本 |
| `novelText` | C5 章节/场景受控文本 |
| `novelRule` | B1 硬约束规则 |
| `novelWorldview` | B2 世界观 |
| `novelCharacter` | B3 角色核心 |
| `novelStyle` | B4 风格档案 |
| `novelConfirmation` | I11 幂等的「提议 → 接受/拒绝」确认门 |
| `novelOutline` | B5 大纲/细纲 + C6 进度导航 |
| `novelRelationship` | C1 关系层 |
| `novelKnowledge` | C3 知识层与 POV 过滤 |
| `novelGeneration` / `novelStoryGeneration` | LLM 候选生成路径 |
| `novelSettings` | A2 模板/预设/路由设置（经 Host credentials seam 解析密钥） |
| `novelExtension` | Fiber 持有的内部扩展点注册表 |
| `novelImport` / `novelExport` | 受控文本导入 / 导出 |
| `novelClassifier` / `novelLocalizedEdit` / `novelChapterWriting` / `novelContinuation` / `novelInspiration` | 分类、局部编辑、章节续写、续写与灵感辅助 |
| 各类 `novel*Detection` / `novel*Parser` | 一致性检测、知识泄漏检测、各层解析器（均 confirmation-first） |

---

## 项目结构

```text
src/
├── core/          # Host 领域核心（project/state/canon/confirm/assemble/…）
├── llm/           # Host LLM（port/parse/validate/template）
├── host/          # Host 领域服务（*Service）
├── client/        # Client Slot UI 与样式
├── ui/            # 编辑台 UI（Slot 工作区）
├── extensions/    # 内部扩展点（非外层 Cordis Plugin）
├── import/ / export/ / write/ / agents/
├── index.ts       # Host 插件入口（apply(ctx)）
├── client.ts      # Client 插件入口
└── remote.ts      # Host–Client Remote 合同（Typert）
scripts/           # smoke 与构建脚本（smoke-i*.mjs、build-client.mjs）
samples/           # LLM 样本集（含 held-out 子集）
docs/              # 权威设计/计划/需求文档
examples/          # 安装组合与 Agent Preset 示例（selected-profile.package.json、agent-presets/novel-writer/）
cordis.yml         # 本地 Loader smoke 组合（非生产入口）
cordis.patch.yml   # bundle patch 层（生产组合贡献，package.json dsh.bundle.patch 引用）
```

---

## 开发与测试

```bash
# 类型检查
pnpm run typecheck

# 全量确定性测试
pnpm test

# 构建（Host + Client）
pnpm build

# 单迭代验证（Ixx，见 package.json scripts）
pnpm run verify:i1
pnpm run verify:i2
# … 以此类推

# 阶段累积验证
pnpm run verify:stage-0
```

> **开发纪律**（详见仓库 `AGENTS.md` 与开发计划）：一迭代一任务、确定性模块先回归测试、LLM 模块先建样本集再改 prompt/schema、集成点先接 mock、所有副作用必须归属 Cordis Fiber 并在卸载时完整 dispose。

---

## 常见问题（FAQ）

<details>
<summary><b>为什么我把插件 <code>pnpm install</code> 了，但 DSH 没加载它？</b></summary>

仅安装 package **不会自动激活**。必须把 `novel-creation-tool` 显式列入所选 profile 的有序 `dsh.profile.bundles`（bundle 路径），或走 plugin patch 路径插入 composition row。参见[安装到 DSH](#安装到-dsh唯一生产安装合同)。这是设计 §0.1.1 的硬性要求。
</details>

<details>
<summary><b>我可以直接编辑仓库根目录的 <code>cordis.yml</code> 来生产安装吗？</b></summary>

不可以。仓库 `cordis.yml` 仅用于本地 Loader smoke，不是生产安装、发现或组合入口；DSH 随附的 shipped composition 也永不编辑。生产安装唯一入口见 §0.1.1。
</details>

<details>
<summary><b>Bundle 路径和 Plugin patch 路径能同时用吗？</b></summary>

不能。两种路径对同一 deployment 必须互斥，只能择一作为当前安装合同；同一 plugin row 的插入 owner 必须恰好为一个 composition layer。
</details>

<details>
<summary><b>构建产物在哪里？我需要在 DSH 里指向哪个文件？</b></summary>

构建后产物在 `lib/`。Host 入口是 `lib/index.js`（`package.json` 的 `main`），Client bundle 是 `lib/client.js`。DSH 通过 package 的 `exports` / `files` 字段自动解析，无需手动指定文件路径。
</details>

<details>
<summary><b>如何确认插件真的装载成功了？</b></summary>

解析 `novelCreation` 服务应得到 `{ version: '2.0.0', ready: true }`；或运行 `pnpm run smoke:i1:profile` 查看隔离 profile 的端到端装载证据。
</details>

---

## 许可证

见 [LICENSE](LICENSE)。
