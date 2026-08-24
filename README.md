# AI 长篇小说创作器（novel-creation-tool）

AI 长篇小说创作器是一个运行在 **DeepSeek Harness（DSH）** 中的 **ordinary persistent Cordis bundle plugin**。它以 13 层结构化叙事状态引擎为核心，提供分层上下文组装、LLM 生成、正史账本、一致性检测、导入导出以及 DSH Slot UI 编辑台等能力。

> **重要**：本项目的唯一运行宿主和主交付形态是 DeepSeek Harness。它**不是**一个独立 Node/Vite 应用，也没有独立的第二前端或浏览器直连 LLM。文件、凭据、LLM 与领域真相全部由 Host 拥有；Client 只拥有注册到 DSH Slot 的 UI。

- 权威设计文档：`docs/novel-creation-tool-design.md`（v2.0）
- 权威开发计划：`docs/novel-creation-tool-development-plan.md`（v2.0）
- 需求与验收矩阵：`docs/novel-creation-tool-requirements.md`（v2.0）

---

## 目录

- [环境要求](#环境要求)
- [快速开始：构建插件](#快速开始构建插件)
- [安装到 DSH（唯一生产安装合同）](#安装到-dsh唯一生产安装合同)
  - [方式一：Bundle 路径（推荐，本项目采用）](#方式一bundle-路径推荐本项目采用)
  - [方式二：Plugin patch 路径（二选一，不可混用）](#方式二plugin-patch-路径二选一不可混用)
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
| DeepSeek Harness（DSH） | `0.1.0-rc.7`（当前观测安装证据，见设计 §0.1.3） |

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
    "@deepseek-ai/dsh-base": "0.1.0-rc.7",
    "@deepseek-ai/dsh-web-app": "0.1.0-rc.7",
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

## 验证安装

安装并启动后，可通过以下任一方式确认插件已正确装载：

1. **Host 服务存在**：插件暴露一个只读状态服务 `novelCreation`（`{ version: '2.0.0', ready: true }`）。在 DSH 组合上下文中可解析到该服务即代表 Host 已成功装载。

2. **Fiber dispose 完整性**：停止/卸载插件后，`novelCreation` 等所有由插件提供的服务应随之从上下文移除（这是 H0-6 验收要求）。

3. **Client Slot UI（若已通过 I2 及后续门禁构建）**：在 DSH Web GUI 中应能看到本插件注册的创作台工作区入口。

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
examples/          # 安装组合示例（selected-profile.package.json）
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
