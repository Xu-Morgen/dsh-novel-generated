# DeepSeek Harness 插件权威基线重置与重新开发计划

## Goal

将 AI 长篇小说创作器从“独立 Node/Vite 应用”重置为 **DeepSeek Harness（DSH）上的普通、持久、可组合 Cordis 插件**。重写设计、需求、开发计划与执行约定，退役旧 I1a/I1b 独立应用路径，并交付新的 I1 Host 插件骨架及装载/卸载证据。

## Architecture

- DeepSeek Harness 是唯一运行宿主和主交付形态；该约束是项目宪法级不变量。
- 项目以普通仓库插件交付：插件包安装为所选 DSH profile 的依赖，并由唯一的 profile/home `cordis.patch.yml` 插入 owner 或显式列入 `dsh.profile.bundles` 的 bundle patch 组合；仓库 `cordis.yml` 仅用于本地 Loader smoke。动态 `cordis_define` 只可用于原型，不是发布路径。
- Host 负责文件、凭据、LLM、持久化、业务服务与模型工具；Client 负责 DSH Web GUI Slot UI。
- Client 不拥有独立 HTML、`createRoot()`、浏览器直连 LLM 或文件访问；Client UI 只能注册到经核验的 DSH Slot。
- 一切副作用归属 Cordis Fiber，停止/卸载后必须撤销。
- 小说产品内部扩展点改称 Extension，避免与外层 Cordis Plugin 身份混淆。

## Tech Stack

- Runtime: Node.js 22+，并以所选 DSH profile 的实际支持版本为准。
- Language: TypeScript strict，ESM。
- Package manager: pnpm；插件包作为所选 profile 的依赖安装。
- Plugin framework: `@deepseek-ai/cordis`；当前观测基线为 DSH `0.1.0-rc.7` / Cordis `4.0.1`，I1 在根 manifest 与 `pnpm-lock.yaml` 建立可复现 pin。
- Production composition: profile/home `cordis.patch.yml` 或显式 `dsh.profile.bundles`；同一部署只有一个插入 owner。
- Local composition smoke: 仓库 `cordis.yml` + `@deepseek-ai/cordis-plugin-loader` + `@deepseek-ai/cordis-plugin-include`。
- Host build: TypeScript compiler 输出 ESM 与声明文件。
- Client build: I2 仅做 public-contract gate probe（React 18 + DSH Runtime/Slots + DSH-compatible bundle）；产品 Client 在 I2 通过后开始，禁止独立 Vite HTML 应用。
- Test: Vitest；LLM 模块继续使用固定样本集和 held-out 阈值。
- Storage: Host 侧文件式 YAML/jsonl 为作品 source of truth，SQLite 仅作可重建索引。
- Secrets: DSH credentials/settings seam 或环境变量引用；Client 永不持有长期密钥。

## Baseline / Authority Refs

1. `docs/novel-creation-tool-design.md`（当前 v1.4，重置为 v2.0）
2. `docs/novel-creation-tool-development-plan.md`（当前 v1.4，重置为 v2.0）
3. `docs/novel-creation-tool-requirements.md`（当前 v1.4，重置为 v2.0）
4. `AGENTS.md`
5. DSH installed contract evidence:
   - `@deepseek-ai/dsh-web-app/cordis.patch.yml`
   - `@deepseek-ai/dsh-client-ui-directory-picker-native/package.json`
   - `@deepseek-ai/dsh-client-hmr/README.md`
   - `@deepseek-ai/cordis/README.md`
   - `@deepseek-ai/cordis-plugin-include/README.md`

## Compatibility Boundary

- 保留：13 层叙事模型、结构化写回闭环、ConfirmationGate、样本治理、文件式作品数据、导入导出、编辑与辅助 agent 产品目标。
- 退役：独立 Vite HTML、自挂载 React、浏览器直连 OpenAI、旧 I1a/I1b demo 与测试。
- 不保留旧独立应用兼容层，不建立“双主路径”。
- 不修改或删除用户未提交的 `.gitignore` 变化与被忽略的 `birthday-party-planner.js`。
- 旧 `projects/demo/text/chapter-001.md` 是 I1a 固定 mock 产物，按 derived-state 退役；真实用户作品数据不在本次删除范围。

## TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: minimum implementation + post-change regression
- Reason: 项目基线明确 TDD off；本轮以契约测试、装载 smoke 和文档一致性检查验证。
- Verification: `pnpm run typecheck`、`pnpm test`、`pnpm run build`、`pnpm run smoke:i1`、文档关键词与反向禁用词检查。

## Requirement Ready Check

- Requirement source refs: 用户本轮直接指令 + 当前三份权威文档。
- Goals and scope refs: 本计划 Goal/Architecture/Compatibility Boundary。
- User/scenario: DSH 用户在现有 Harness 进程中装载、使用、停止小说创作插件，而不是启动第二个前端。
- Acceptance: 三份文档与 AGENTS 对 DSH 身份一致；旧主路径移除；新 I1 可构建、装载、发现服务、卸载并清理。
- Open blocker questions: none。
- Decision: ready。

## Change Necessity

- User-visible need: 项目必须实际成为 DSH 插件，而非只在文档中改名。
- No-change option: 只改文档会让现有独立 UI/浏览器直连实现继续成为事实主路径，不能满足要求。
- Why code change is necessary: 必须退役旧 I1 并建立 Cordis package/composition/lifecycle 的最小可执行证据。
- Minimum change boundary: 权威文档、AGENTS、根插件 manifest/锁文件、profile patch 示例、仅用于本地 Loader smoke 的 `cordis.yml`、`src/index.ts`、I1 测试与 smoke。
- Decision: code-change。

## Existence Check

- Proposed new surface: 普通 DSH/Cordis 仓库插件外壳。
- Existing owner/reuse candidate: Cordis Plugin + DSH composition/client manifest contract。
- Why existing project surface is insufficient: 当前 Vite app 不可被 DSH composition 装载，也无 Fiber 生命周期。
- Creation proof: DSH shipped packages以 Cordis `apply`、profile/bundle patch rows、package exports 与可选 `dsh.client` 交付；当前仓库缺失这些生产契约。
- Entropy/retirement impact: 新外壳取代旧独立 app，不保留 fallback。
- Decision: add-with-proof。

## Architecture Integrity Lens

- Invariant: 产品只能作为 DSH 插件运行和交付。
- Canonical owner/contract: 设计文档声明宿主；profile dependency + 唯一 patch/bundle insertion owner 与 package manifest 声明生产装载，仓库 `cordis.yml` 仅验证本地 Loader；Host/Client 各自拥有正确职责。
- Responsibility overlap: 旧独立 Vite/浏览器 LLM 路径与新插件边界重复，必须删除。
- Higher-level simplification: 在宿主/组合层解决装载、服务、UI 与生命周期，不在页面或调用方增加适配分支。
- Retirement/falsifier: 若最终仍需独立 HTML、`createRoot()` 或浏览器密钥才能工作，则重置失败。
- Verdict: proceed。

## ADR Signal

- Decision candidate: DeepSeek Harness/Cordis 是不可变且唯一的产品宿主。
- Hard to reverse: yes。
- Surprising without context: yes；现有历史曾走向独立应用。
- Real trade-off: yes；独立应用自由度与 DSH 原生组合/生命周期/工具/Slot 集成之间已明确选择后者。
- Action: 完成并验证后创建项目 ADR；当前计划只保留信号，不提前把未执行方案写成已完成事实。
- Baseline sync: 必须同步设计、需求、开发计划、AGENTS 与实现。

## Anti-Entropy Decision

- Path: delete-first。
- Old owner: 独立 Vite shell、浏览器 OpenAI client、旧 I1 demos/tests。
- New owner: DSH Host Cordis plugin；Client Slot 后续迭代接入。
- Preserved behavior: 小说领域目标、分层模型和后续生成闭环。
- Retired behavior: 第二前端、浏览器直接持有连接配置、旧 I1 编号与验收。
- Non-edits: `.gitignore`、`birthday-party-planner.js`、任何真实用户作品数据。

## Execution Readiness View

- Intent Lock: DSH/Cordis 唯一宿主，不允许独立应用兼容路径。
- Scope Fence: 文档 v2.0、旧 I1 退役、新 I1 Host 插件骨架；不实现完整编辑 UI/LLM/13 层。
- Baseline Lock: 三份权威文档 + AGENTS 必须同步。
- Approved Behavior: composition 可装载，Host 服务可发现，卸载后服务消失。
- Owner/Contract Constraints: Host 拥有业务与 I/O；Client 仅 Slot UI；Fiber 拥有副作用。
- Compatibility Boundary: 保留领域需求，不保留独立 app。
- Retirement Boundary: 删除 tracked 旧 I1 代码和派生 demo；不触碰未跟踪存档与用户状态。
- Task Batches: 文档基线 → 旧路径退役 → 新 I1 → 验证/审查/ADR。
- Test Obligations: typecheck、unit、composition smoke、lingering-reference negative check。
- Review Gates: 文档交叉一致性；独立架构审查；验证后 ADR/baseline sync。
- Drift/Rewind Rules: 任何新增独立 HTML、浏览器 LLM、兼容 fallback 都回到计划修正。
- Evidence Required Before Completion: fresh 命令输出、Git diff、旧路径零引用、composition 生命周期证据。
- Advisory Boundary: 本视图是执行指导，不是 GateDecision 或完成授权。

## Tasks

### Task 1：同步权威设计基线

**Files**
- Modify: `docs/novel-creation-tool-design.md`

**Why**
最高权威设计必须先声明 DSH 插件身份、平面划分与不可变约束，后续需求和计划才能引用唯一 owner。

**Steps**
1. 将版本升级为 v2.0，加入“宪法级宿主基线”。
2. 明确普通持久插件与动态插件的差异。
3. 新增 Host/Client/Composition/Service/Event/Tool/Slot/Fiber 架构。
4. 把 D1 从“全新自建独立应用”改为“DSH 原生插件”；保留领域模型。
5. 增加禁止独立前端、浏览器直连 LLM、绕过 Host I/O 的负面约束。

**Verification**
- 搜索 `DeepSeek Harness`、`Cordis`、`Host`、`Client`、`Slot`、`Fiber` 均有规范性定义。
- 搜索“全新自建独立应用”不再作为当前决策存在。

### Task 2：重申需求与覆盖矩阵

**Files**
- Modify: `docs/novel-creation-tool-requirements.md`

**Why**
把宿主身份从隐含视觉偏好提升为 R0 最高优先级、可机器验收的产品约束。

**Steps**
1. 升级为 v2.0，新增 H0 宿主锁定需求组。
2. 为 composition、Host/Client、生命周期、凭据、LLM、Slot、Tool、测试定义验收。
3. 保留 13 层、闭环、存储、导入导出、内部 Extension 需求。
4. 明确内部 Extension 不等于 Cordis 外层 Plugin。
5. 建立需求→新迭代→验收命令矩阵。

**Verification**
- 每条 H0 需求都有迭代与命令。
- “独立前端可作为主路径”必须出现在禁止项而非候选项。

### Task 3：重排开发计划与技术栈

**Files**
- Modify: `docs/novel-creation-tool-development-plan.md`
- Modify: `AGENTS.md`

**Why**
旧计划将 React/Vite 独立 UI 锁在 I1b，必须整体失效并由 DSH-first 顺序替代。

**Steps**
1. 将旧 68 迭代标记为 v1.x 历史失效，不再执行。
2. 定义新阶段：插件地基 → Host 数据/设置 → Client Slot → 核心层 → 生成闭环 → 扩展/导入导出/写作工具。
3. 新 I1 只验证普通 Cordis Host 插件 package、composition、service lifecycle。
4. I2 再建立 DSH Client bundle + Slot；I3 起进入 Host 数据和凭据。
5. 重申一迭代一任务、ConfirmationGate、样本治理、负向测试和提交纪律。
6. 更新 AGENTS 中版本、目录结构、权威基线和禁止路径。

**Verification**
- 新计划首个用户可见 UI 迭代只能是 Slot，不得出现独立 HTML/Vite server。
- AGENTS 与三份文档版本和宿主基线一致。

### Task 4：退役旧 I1a/I1b

**Files**
- Delete: `.env.example`
- Delete: `scripts/demo-i1a.mjs`
- Delete: `scripts/demo-i1b.mjs`
- Delete: `src/core/io/append-text.ts`
- Delete: `src/core/io/append-text.test.ts`
- Delete: `src/llm/backend/openai-compat.ts`
- Delete: `src/llm/backend/openai-compat.test.ts`
- Delete: `src/ui/App.tsx`
- Delete: `src/ui/App.test.tsx`
- Delete: `src/ui/index.html`
- Delete: `src/ui/main.tsx`
- Delete: `src/ui/styles.css`
- Delete: `vite.config.ts`
- Delete: `projects/demo/text/chapter-001.md`（固定 mock 派生产物）
- Replace: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Delete: `package-lock.json`
- Create: `pnpm-lock.yaml`

**Why**
不允许旧独立应用继续成为隐形第二 owner 或兼容 fallback。

**Verification**
- `git grep` 不再命中 `createRoot(`、`VITE_OPENAI_`、`dev:ui`、独立 `index.html`。
- `.gitignore` 与 `birthday-party-planner.js` 不在 task diff 中。

### Task 5：实现新 I1 Cordis Host 插件骨架

**Files**
- Create: `cordis.yml`（仅本地 Loader smoke）
- Create: `examples/profile.cordis.patch.yml`（生产 profile 插入示例）
- Create: `tsconfig.build.json`
- Replace: `src/index.ts`
- Create: `src/index.test.ts`
- Create: `scripts/smoke-i1.mjs`
- Replace: `package.json`, generate `pnpm-lock.yaml`

**Why**
文档重置必须由最小可执行插件证据支撑。

**Steps**
1. 导出标准 Cordis `apply(ctx)` Host 插件。
2. 在 Fiber 下提供只读 `novelCreation` 状态服务。
3. 用仓库 `cordis.yml` 通过相对 package 路径做本地 Loader smoke；另提供 selected-profile `cordis.patch.yml` 唯一插入 row 示例，不声称仓库 composition 是生产入口。
4. 单测断言服务激活、重复行为边界和 dispose 后消失。
5. smoke 通过 Loader/Include 读取本地 composition，并断言装载/卸载。
6. 根 manifest 与 `pnpm-lock.yaml` 固定 DSH/Cordis 兼容基线；构建输出 `lib/index.js` 与类型声明。

**Verification**
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run smoke:i1`

### Task 6：一致性审查、ADR 与提交

**Files**
- Create after verified execution: `docs/aegis/adr/ADR-0001-deepseek-harness-is-exclusive-host.md`
- Update: Aegis work evidence/checkpoint/reflection files

**Why**
该决定通过 ADR gate，并改变宿主兼容、owner 与发布边界；完成后必须记录“为什么”，同时由三份权威文档记录“当前是什么”。

**Steps**
1. 运行文档与代码关键词一致性检查。
2. 运行完整验证命令并记录 fresh 输出。
3. 独立审查需求覆盖、架构边界和旧路径退役。
4. 通过 helper 创建 ADR，运行 workspace `bundle` 与 `check`。
5. 检查任务 diff 不含 `.gitignore` 或 ignored archive。
6. 按项目提交格式创建一个 `docs/feat(I1)` coherent reset commit。

**Verification**
- `git diff --check`
- `git status --short`
- Aegis workspace helper `check`
- 读取提交 SHA、消息与文件清单。

## Risks

- DSH 外部 Client bundler 细节未在 I1 实现：通过把 Client Slot 明确放到 I2，避免在宿主骨架阶段伪造 bundle。
- `cordis.yml` 相对 package 解析可能与 DSH Loader 版本相关：以 installed rc.7 Loader/Include 做真实 smoke，失败则修正 composition owner，不增加 fallback。
- 文档重写可能遗漏旧领域需求：需求矩阵保留 13 层与原 R0–R7，并由独立审查核对。
- 旧 demo 文件可能被误认作用户作品：只删除 tracked 固定 mock 文本，不删除任何未跟踪或真实作品目录。

## Retirement

- Old path retirement trigger: 新 I1 composition smoke 通过后，旧 I1a/I1b tracked 路径必须为零。
- No compatibility carrier: 不保留 Vite shell、浏览器 OpenAI client、旧 scripts 或别名命令。
- Historical record: Git 历史保留旧提交；v2.0 文档记录旧路线已失效，不把死代码留在主分支。

## Execution Route

- Decision: subagent-driven for independent design/requirements/roadmap review; coordinator owns integrated writes and code retirement.
- Evidence: 三个文档面可并行研究，但权威一致性、删除与构建配置共享状态，必须由协调者合并。
- Fallback: 子代理不可用时 inline 执行。
- User confirmation required: no；用户已明确授权基线重置与旧 I1 回退。
