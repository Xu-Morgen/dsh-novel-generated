# Stage 10 作品启动与六层初始化实施计划

## Goal

从已批准的 v2.1 规格实现 I50–I53：先修复 3082 创作台“插件 ready 但作品六层未 open”的启动缺口，再交付 DOCX、自由文本、纯空白三种新作品入口；DOCX/文本只生成 B3/B2/B5/C1/C2/C4 六层候选，用户逐层接受、修改后接受、打回重生成或显式跳过，最后经既有 Host Domain Service 幂等落地。

## Architecture

- **Canonical project owner**：扩展现有 `NovelProjectService`，统一 `list/create/open/readiness`；不新增全局 current project，不在 Client、Remote 或六层面板做隐式 open。
- **Canonical file/LLM owner**：Host 继续拥有项目文件、`ctx.llm`、DOCX 解析、ConfirmationGate、领域校验与写入；Client 仅负责 Slot UI、受限字节运输和 selectedProjectId。
- **DOCX path**：Client 分块运输 → Host 临时文件/SHA-256 → `yauzl` ZIP/OPC 安全预检 → `saxes` 流式 WordprocessingML 提取 → 规范文本 handle；不把 Host 路径或全文回传 Client。
- **Analysis path**：规范文本 → 确定性 normalize/chunk → 共享 evidence map → 六个独立 reduce → 六层严格候选；C3 永不生成。
- **Review path**：所有候选复用 I11 Gate。Gate 新增同文件原子 `replace()`，但仍只有 `pending|accepted|rejected` 三态；skip 是 rejected leaf，edit/regenerate 是带 `replacesId` 的 successor lineage。
- **Apply path**：预检全部已接受层，按 B3→B2→B5→C2→C4→C1 调现有 Domain Service；跨层不伪装全局原子，失败返回 `partial-retryable` 证据并以现值比较重试。

## Tech Stack

- TypeScript strict / Node.js ≥22 / ESM / pnpm。
- Cordis ordinary persistent Plugin；Host/Client Remote 继续使用 DSH public Typert contract。
- Zod 4 严格 wire/domain schema。
- DOCX：`yauzl@^3.4.0`、`saxes@^6.0.0`；开发类型 `@types/yauzl@^3.4.0`。
- 测试：Vitest、jsdom/fake DSH Client runtime、built bundle smoke、selected-profile boot smoke。
- 不引入独立 Web server、第二 SPA、动态 Cordis Plugin、Client ZIP/XML parser、浏览器 LLM 或新数据库。

## Baseline / Authority Refs

1. `docs/novel-creation-tool-design.md` v2.1：D15–D19、M11、§14.7。
2. `docs/novel-creation-tool-requirements.md` v2.1：H0、R11、N-7、N-8。
3. `docs/novel-creation-tool-development-plan.md` v2.1：I50–I53 与 Stage 10 gate。
4. `AGENTS.md` v2.1：一迭代一任务、一 commit、TDD off、ConfirmationGate 复用、Fiber cleanup。
5. 当前实现基线：`main@e0224be`；I1–I49 已存在，Stage 10 尚未实现。
6. Aegis work record：`docs/aegis/work/2026-08-24-stage10-project-onboarding/`。

## Fact / Assumption / Unknown

### Facts

- `src/client.ts` 仍硬编码 17 处 `'default'`；`src/index.ts` 创建两份 ConfirmationService。
- `~/.dsh/novel-projects` 当前不存在；六层 Host service 都要求显式 `open(projectId)`。
- `src/import/index.ts` 仍使用 local-header 手写 DOCX parser 和伪 ZIP fixture。
- `src/client.ts` 约 1442 行、`src/client.test.ts` 约 858 行、`src/remote.ts` 约 282 行，继续堆入会越过可维护边界。
- 当前工作树中的 `src/client.ts` / `src/client.test.ts` 修改早于 Stage 10 且与 I50 高度重叠。

### Assumptions locked by the approved spec

- Stage 10 只初始化新建/空作品，不向已有非空作品合并。
- 空作品 B3/B2/C1/C4 为空、B5 uninitialized、C2 为 deterministic `initial-state` seq 0。
- C2 只使用当前 scene/characters 子集；items/factions/globalFlags 后置。
- B3 初始化候选（包括用户编辑版本）强制 `relationships=[]`、`knowledgeIds=[]`、`arc.keyBeats=[]`。

### Known execution unknowns

- 当前未提交 Client 大改的所有权尚未解决；这是 I50 开始前的真实授权边界。
- 本机无 Word/LibreOffice；I51 必须取得有来源记录的真实 Word 与 LibreOffice DOCX fixture，不能用程序生成 ZIP 冒充。
- I52 live held-out 需要 selected DSH profile 有可用的 Host LLM/credential 配置；不可用时 I52 不得虚报阈值通过。

## Compatibility Boundary

- 保持现有 `novelWorkspace` 21 个 descriptor 的 id、method、parameter/result codec 和顺序前缀；Stage 10 descriptor 只在尾部追加。
- 保持现有六层 Remote 方法显式携带 projectId；不增加隐式 open/default fallback。
- I37 txt/md/path import 与 I38 B2/B5/detail-beat 输出语义不变。
- I11 status schema 保持 `pending|accepted|rejected`；只在同一 Gate owner 增加原子 replacement API 和 list facade。
- 现有六层 schema/store 继续是唯一写 owner；Stage 10 不直接写 YAML/jsonl。
- 不删除真实项目、`~/.dsh/novel-projects`、未跟踪用户文件或已应用层。

## TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: minimum implementation + post-change regression + negative fixtures；I52 仍遵守“样本先于 prompt/schema”的规范顺序。
- Reason: 项目权威明确 TDD off；本阶段以 focused regression、negative security tests、held-out、profile smoke 和 full stage gate 验证。
- Verification: `pnpm run verify:i50`、`verify:i51`、`verify:i52`、`verify:i53`、`verify:stage-10`，以及 I37/I38/I49 回归。

## Aegis Visibility

本计划涉及 canonical owner 合并、Remote 公共合同、持久 Gate lineage、DOCX 安全边界、旧 parser/default/重复 owner 退役和跨文件 partial recovery，必须先锁定 owner、兼容和验证路径再执行。

## BaselineUsageDraft

- Required baseline refs: v2.1 design / requirements / development plan / AGENTS。
- Delivered context refs: Stage 10 work record、三轮独立规格审查结果。
- Acknowledged before plan refs: §14.7、R11、I50–I53、D15–D19。
- Cited in plan refs: 本计划 Baseline / Tasks / Compatibility / Retirement。
- Missing refs: none。
- Decision: continue。

## Requirement Ready Check

- Requirement source refs: design §14.7、requirements R11、plan I50–I53。
- Goals and scope refs: 本计划 Goal / Architecture / Compatibility。
- User/scenario refs: 3082 创作台；多作品；DOCX、自由文本、空白；六层独立裁决。
- Requirement item refs: R11-1..R11-4。
- Acceptance refs: 每迭代 `verify:iN`、Stage 10 gate、selected-profile evidence、per-layer ≥80%。
- Open blocker questions: 无产品行为问题；仅有执行前 Git 所有权和 I51 fixture provenance 门。
- Decision: ready；执行须先通过 Task 0。

## Change Necessity

- User-visible need: 当前插件没有 project bootstrap，所有六层读取失败；也没有文件选择、六层分析或审阅落地流程。
- No-change option: 只解释使用方法或只建 `default` 目录不能打开六层 owner、不能安全解析 DOCX、不能满足多项目/确认/恢复。
- Why code change is necessary: 缺失的是 Host lifecycle、受控上传、LLM analyzer、Gate review 和 Domain apply 的运行合同。
- Minimum change boundary: I50–I53 文件图；不扩 I38、不改 C3、不引入新持久数据 owner。
- Decision: code-change。

## Existence Check

### Project lifecycle

- Proposed surface: project lifecycle coordinator。
- Reuse candidate: 现有 `NovelProjectService` + `ProjectRepository`。
- Decision: **reuse-existing**；扩展现有 owner，不创建第二 project manager。

### DOCX parsing/upload

- Proposed surface: controlled upload manager + mature DOCX adapter。
- Reuse candidate: I37 import owner；其路径读取可复用 normalize/chunk，但手写 ZIP parser 与浏览器 transport 不足。
- Decision: **add-with-proof**；upload manager 只持临时派生状态，DOCX adapter 替换旧 parser，无 fallback。

### Six-layer analysis/review

- Proposed surface: onboarding analyzer/review service。
- Reuse candidate: I38 split agent 被权威限制为 B2/B5，不能扩张；I11 Gate 和六层 service 可复用。
- Decision: **add-with-proof**；新增 onboarding owner，但不复制 domain store 或 applied journal。

### Skip/replacement persistence

- Proposed surface: review pointer store。
- Existing owner: ConfirmationGate records 已可持久承载 payload/lineage。
- Decision: **reject new store**；给 Gate 增加同文件 queue-atomic `replace()`，复用其已存在的 core `list()` 并只扩 Host facade，由 rejected leaf / successor lineage 推导状态。

## Ripple Signal Triage

- I50 touches project, outline, relationship, index, Remote and all Client operations；需回归 I3/I11/I33–I49。
- I51 replaces I37 DOCX internals and adds dependencies；需回归 I37/I38、bundle forbidden scan 和 lockfile。
- I52 touches Host LLM/settings and Remote；需回归 I17/I31/I38 但不得修改其 prompt/schema。
- I53 touches ConfirmationGate and all six domain owners；需回归 I8/I9/I11/I14/I16/I4/I5 及 I49 C4 correction。

## Architecture Integrity Lens

- Invariant: Host owns project/files/LLM/validation；Client only owns UI and selectedProjectId。
- Canonical contracts: NovelProjectService、NovelHostImport/DocxUpload、NovelOnboarding、ConfirmationGate、六个 Domain Service。
- Responsibility overlap: `default` Client path、duplicate ConfirmationService、handwritten DOCX parser 必须退役；Remote stays forwarding-only。
- Higher-level simplification: startup 在 project lifecycle 一处修，不在六层 calls 增加 fallback；review lineage 在 Gate 一处原子化，不建第二 journal。
- Falsifier: 任一实现需要 Client fs/ZIP/XML/LLM、隐式 default、直接 YAML/jsonl write、第二 applied journal 或 compensation deletion 即退回设计。
- Verdict: proceed after Task 0。

## Complexity Budget / Plan-Time Complexity Check

| Artifact | Current pressure | Planned boundary | Result |
|---|---:|---|---|
| `src/client.ts` | ~1442 lines, high | Stage 10 UI/driver 分到 `src/client/project-session.ts`、`docx-upload.ts`、`onboarding.ts`、独立 tests/styles | at-risk → split |
| `src/client.test.ts` | ~858 lines, high | 只保留 bundle integration；新增功能各自独立 test | at-risk → split |
| `src/remote.ts` | ~282 lines | I50 把 probe/editor descriptors 移到 `src/host/remote/`、Workspace adapter 移到 `src/host/workspace-service.ts`、可执行 browser-safe Zod schemas 放 `src/core/schema/`，公开 shape 用非运行时 `contracts/stage10/*.json` 锁定；原文件仅兼容 re-export + contribution aggregation | within-budget after split |
| `src/import/index.ts` | ~171 lines | 删除旧 DOCX parser；新 adapter/upload 各自文件 | within-budget |
| `src/index.ts` | ~169 lines | 只接线；业务逻辑不得进入 apply() | within-budget |
| onboarding apply | new/high-risk | `schema` / `analysis` / `preflight` / `apply` / Host facade 分离 | within-budget |

Recommendation: 不在 `client.ts`、`client.test.ts`、`remote.ts` 继续 add-in-place；只保留 wiring/aggregation。

## Plan Pressure Test

- Owner / contract / retirement: owner 唯一，退役触发和 compat regression 已标出。
- Architecture integrity: lifecycle/Gate/import 均在最高可复用 owner 修复，无 caller fallback。
- Verification scope: unit、security fixture、held-out、bundle、profile、stage、3082 refresh 全覆盖。
- Task executability: 路线顺序为 I50→I51→I52→I53，但 AGENTS 要求每次直接指令只执行一个 Ixx；每个迭代单独验收、单 commit、汇报并停止，等待下一条 `执行迭代 Ixx`。
- Pressure result: proceed after dirty-worktree ownership gate。

## File Map

### Shared/new boundaries

- Create `src/host/remote/common.ts`：strict codec/parameter/direct invocation builder + `bindRemote`。
- Create `src/host/remote/probe.ts`、`src/host/remote/editor.ts` + compatibility tests（I50 moves current implementations）。
- Create `src/host/workspace-service.ts` + test（I50 moves `WorkspaceEditorService/createWorkspaceEditorService/workspaceViewModel`）。
- Create `src/host/remote/project-lifecycle.ts` + test（I50）。
- Create `src/host/remote/docx-upload.ts` + test（I51）。
- Create `src/host/remote/onboarding-analysis.ts` + test（I52）。
- Create `src/host/remote/onboarding-review.ts` + test（I53）。All `src/host/remote/*` descriptor modules are browser-bundle-safe（protocol/Zod/core schemas + type-only Host imports, no Node/fs/service construction）；business forwarding stays in `src/host/workspace-service.ts`.
- Create non-runtime `contracts/stage10/{project-lifecycle,docx-upload,onboarding-analysis,onboarding-review}.json` locks in their owning Ixx；descriptor tests compare method ids/schemaVersion/shape ids against these locks, but production code never imports them。
- Keep executable browser-safe Zod schemas/types in `src/core/schema/` so current `tsconfig.build.json` rootDir=`src` and package `lib/index.js`/`lib/client.js` layout remain unchanged；do not modify tsconfig/build/package exports for a second source root。
- Modify `src/remote.ts`：compatibility re-exports + contribution aggregation only；all old invocation symbols remain import-compatible and the old descriptor prefix is exact。

### I50

- Create non-runtime `contracts/stage10/project-lifecycle.json` lock。
- Create `src/core/schema/project-lifecycle.ts`（domain readiness + strict Remote wrappers, browser-safe）。
- Create `src/host/remote/{common,probe,editor,project-lifecycle}.ts` + tests and `src/host/workspace-service.ts` + test；`src/remote.ts` becomes compatibility aggregator。
- Create `src/client/project-session.ts`、`src/client/project-session.test.ts`。
- Create `src/project-lifecycle.test.ts`。
- Create `scripts/smoke-i50.mjs`、`scripts/smoke-i50-profile.mjs`。
- Modify `src/core/project/index.ts` + test。
- Modify `src/core/outline/index.ts` + test。
- Modify `src/core/relationship/index.ts` + test。
- Modify `src/host/project-service.ts` + test。
- Modify `src/host/outline-service.ts` + test。
- Modify `src/index.ts` + test。
- Modify `src/remote.ts`、`src/workspace-remote.test.ts`、`src/editor-remote.test.ts`。
- Modify `src/client.ts`、`src/client.test.ts`、`package.json`。

### I51

- Create non-runtime `contracts/stage10/docx-upload.json` lock and runtime `src/core/schema/docx-upload.ts` + test（browser-safe；不得导入 Node/yauzl/saxes）。
- Create `src/core/io/import-text.ts` + test（从 I37 提取唯一 normalize/chunk owner，I37/I51/I52 共用）。
- Create `src/import/docx.ts` + test。
- Create `src/host/docx-upload-service.ts` + test。
- Create `src/client/docx-upload.ts` + test。
- Create `src/client/onboarding-styles.ts`（I51 先放 upload styles，I53 扩展）。
- Create `src/import/fixtures/i51/{word.docx,word.gold.txt,libreoffice.docx,libreoffice.gold.txt,PROVENANCE.md}` 与小型 negative fixtures。
- Create `scripts/smoke-i51.mjs`、`scripts/smoke-i51-profile.mjs`。
- Modify `src/import/index.ts` + test（删除旧 parser/伪 fixture）。
- Modify `src/index.ts`、`src/remote.ts`、Stage 10 Remote tests、Client integration/contract tests。
- Modify `package.json`、`pnpm-lock.yaml`。

### I52

- Create non-runtime `contracts/stage10/onboarding-analysis.json` lock；strict Remote input/result/ack schemas live with candidate schemas in browser-safe `src/core/schema/onboarding-analysis.ts`。
- Create `samples/i52/dev.json`（10 cases）、`samples/i52/held-out.json`（10 independent cases）。
- Create `src/core/schema/onboarding-analysis.ts` + test。
- Create `src/core/onboarding/source.ts` + test。
- Create `src/llm/parse/onboarding-evidence.ts` + test。
- Create `src/llm/parse/onboarding-reduce.ts` + test。
- Create `src/llm/validate/onboarding-analysis.ts` + test。
- Create `src/host/onboarding-service.ts` + test（I52 先交付 analysis-only canonical owner，I53 在同一 owner 上追加 review/apply）。
- Create `scripts/smoke-i52.mjs`、`scripts/smoke-i52-profile.mjs`、`scripts/eval-i52.mjs`。
- Modify `src/index.ts`、Remote aggregation/tests、`package.json`。

### I53

- Create non-runtime `contracts/stage10/onboarding-review.json` lock；strict Remote input/result/ack schemas live in browser-safe `src/core/schema/onboarding-review.ts`。
- Create `src/core/schema/onboarding-review.ts` + test。
- Create `src/core/onboarding/review.ts` + test。
- Create `src/core/onboarding/preflight.ts` + test。
- Create `src/core/onboarding/apply.ts` + test。
- Modify `src/host/onboarding-service.ts` + test（追加 review/apply；禁止第二 onboarding service）。
- Create `src/client/onboarding.ts` + test。
- Create `scripts/fixtures/i53-fake-llm-plugin.mjs`、`scripts/smoke-i53.mjs`、`scripts/smoke-i53-profile.mjs`。
- Create `docs/novel-creation-tool-usage.md`。
- Modify ConfirmationGate core/schema tests only as needed for `replace/list`（status schema unchanged）。
- Modify `src/host/confirmation-service.ts` + test。
- Modify `src/index.ts`、Remote aggregation/tests、Client integration/contract tests、`package.json`。
- Modify version literals from 2.0.0 to 2.1.0 only in I53 completion slice。

## Execution Readiness View

- Intent Lock: 修复启动 + 三入口 + 六层 reviewed initialization。
- Scope Fence: I50–I53；不做 C3、非空合并、C2 扩展对象、独立 SPA。
- Baseline Lock: v2.1 authority + Task 0 clean ownership baseline。
- Approved Behavior: per-layer accept/edit-accept/regenerate/skip；pending blocks apply。
- Owner Constraints: Project lifecycle / Import / Onboarding / Gate / Domain owners 唯一。
- Compatibility Boundary: old Remote prefix、I37/I38/I11 三态不变。
- Retirement Boundary: only code/default/parser/duplicate owner；never project data。
- Task Batches: Task 0 authorization gate；then four separately authorized executions I50 → stop → I51 → stop → I52 → stop → I53（I53 owns stage/runtime closeout）→ stop。
- Test Obligations: focused/full/build/smoke/profile/held-out/stage + security negatives。
- Review Gates: 每迭代独立 review；I51 security/retirement review；I52 sample review；I53 apply/idempotency review。
- Drift Rules: 发现需改 I38/C3/非空导入或新 persistence owner 时停止并回设计。
- Evidence Required: fresh command output、threshold report、selected-profile boot、zero-reference scan、commit hash。
- Advisory Boundary: 本视图只指导执行，不是完成授权。

## Tasks

### Task 0：工作区所有权与 planning baseline 门（I50 前置；可能产生经用户例外授权的 planning commit）

**Why**

`src/client.ts` / `src/client.test.ts` 的预存大改与 I50 store/mount/reload 完全重叠；worktree 从 HEAD 出发会丢失它们，`git add -p` 也不能证明归属。

**Steps**

1. 记录只读快照：
   ```powershell
   git status --short
   git rev-parse HEAD
   git diff -- src/client.ts src/client.test.ts
   git diff --check
   git worktree list --porcelain
   ```
2. 校验已记录 patch identity：Client patch-id `47bb12329941a0364407dc8177897702667ac0f3`；若变动，重新记录而不是覆盖。
3. 将本次已批准的 v2.1 docs/AGENTS/Aegis/plan 作为独立 planning baseline commit；精确 staging，禁止包含 `src/client*`。该非实现提交使用 `docs(stage10): 锁定作品启动与六层初始化规格`，不得伪装成 I50 交付 commit；若仓库要求 scope 必须为单一 Ixx，则先请求一次明确例外，不把文档混入任何 feat(I50–I53)。
4. 对预存 Client 改动请求 owner 决策：验证并单独 commit、继续由 owner 完成，或明确授权撤回。禁止自动 stash/reset/checkout/clean。
5. 只有 Client baseline 已归属且 `git status` 对 Stage 10 可证明时开始 I50。若无法归属，停止。
6. Worktree decision：只有在 clean committed baseline 已形成且需要保留另一个 checkout 时，才创建一个 task-owned external worktree；否则继续当前 workspace。

**Stop**

任何未解决的 overlapping Client diff、active Git operation、conflict 或 detached HEAD。

---

### Task 1 / I50：作品选择与 Host 启动编排

**Why / Change Necessity**

六层错误来自缺失 operational bootstrap；最小修复必须在现有 project owner 建立 list/create/open，而不是在六层调用点加 fallback。

**Key contracts**

```ts
export const projectLayerReadinessSchema = z.enum(['ready', 'empty', 'uninitialized', 'corrupt']);
export const projectOpenResultSchema = z.object({
  project: projectMetaSchema,
  layers: z.object({
    characters: projectLayerReadinessSchema,
    worldview: projectLayerReadinessSchema,
    outline: projectLayerReadinessSchema,
    relationship: projectLayerReadinessSchema,
    state: projectLayerReadinessSchema,
    canon: projectLayerReadinessSchema,
  }).strict(),
}).strict();

export interface NovelProjectService {
  listProjects(): Promise<ProjectMeta[]>;
  createProject(input: CreateProjectInput): Promise<ProjectMeta>;
  loadProject(projectId: string): Promise<ProjectMeta>;
  openProject(projectId: string): Promise<ProjectOpenResult>;
}
```

C2 bootstrap input exactly:

```ts
const INITIAL_STATE = {
  id: 'initial-state', version: 1, storyTime: '',
  scene: { location: '', timeOfDay: '', weather: '', season: '', atmosphere: '' },
  characters: [],
} satisfies Omit<WorldState, 'seq'>;
```

Remote methods: `projectList()`、`projectCreate(input)`、`projectOpen(projectId)`。

**Steps**

1. Require a fresh direct `执行迭代 I50` instruction；read only the I50 card, create TaskStartSnapshot/DoD, and confirm Task 0 passed.
2. Perform the complete Remote owner split required by AGENTS：move strict codecs/param/direct builder/`bindRemote` to `src/host/remote/common.ts`; move I2 probe descriptors to `src/host/remote/probe.ts`; move current view-model/editor descriptors to `src/host/remote/editor.ts`; move `WorkspaceEditorService/createWorkspaceEditorService/workspaceViewModel` to `src/host/workspace-service.ts`. Keep `src/remote.ts` as compatibility re-export + contribution aggregation only. Keep the existing single-root build unchanged and prove every old export/import and descriptor is unchanged before adding I50 methods.
3. Add domain readiness + browser-safe strict Remote wrappers in `src/core/schema/project-lifecycle.ts`; add non-runtime `contracts/stage10/project-lifecycle.json` as the public shape lock and have descriptor tests compare against it. Production imports only the src schema, never the root lock.
4. Add `ProjectRepository.listProjects()`：missing root→`[]` without mkdir；real directories only；stable projectId sort；every result uses `loadProject()`；bad metadata fails closed。
5. Add project list tests: missing root, sort, file/symlink/unsafe directory, corrupt/mismatched metadata, no phantom writes.
6. Add Outline read-only readiness inspection: missing/exact `{}`→uninitialized；valid→ready；any non-empty invalid→corrupt；never overwrite bytes.
7. Add Relationship missing-file read semantics `[]`; invalid non-empty file still throws.
8. Extend Outline Host facade with readiness passthrough and focused tests.
9. Expand existing Project Host facade with injected six-layer/Confirmation owners; enforce `loadProject()` before any owner `open()`.
10. Implement in-flight-only coalescing (`Map<projectId, Promise<ProjectOpenResult>>` + `finally delete`); no successful-result cache and no global current project.
11. Open Confirmation, then six layers; classify B3/B2/C1/C4 empty/ready, B5 readiness, C2 strict snapshots. Missing C2 may create only the exact seq-0 snapshot through StateEngine.
12. Parameterize corrupt fixtures for all six layers; verify invalid bytes unchanged and other layer statuses remain visible.
13. Rewire `src/index.ts` so one `confirmationService` instance is provided publicly and injected into project/workspace services.
14. Add `src/host/remote/project-lifecycle.ts`; append its three descriptors after the old 21. Define named strict input/result schemas for list/create/open（including strict `CreateProjectInput`, not generic JSON）, assert old array is an exact prefix, and reject unknown result fields.
15. Add project forwarding to Workspace service; no editor method auto-opens.
16. Add `src/client/project-session.ts` with project state/actions/render helpers. Main client only wires it.
17. Startup sequence: mount→viewModel(host ready)→projectList；do not load six layers before explicit projectOpen.
18. Render empty-root create form and multi-project chooser using stable anchors `data-novel-project-*`; do not auto-select first project.
19. On open success, set selectedProjectId, clear six editor/draft/proposal state, then call `reload(projectId, readiness)`.
20. Replace every `'default'` data call with the selected ID; missing ID must throw/fail closed.
21. For B5 uninitialized, skip `outlineRead` and show empty form view; first valid `outlineSave` initializes it. For corrupt layer, disable read/write and show explicit status.
22. Move project-specific unit tests to `src/client/project-session.test.ts`; keep `src/client.test.ts` as Slot integration only.
23. Add consumer fixture `src/project-lifecycle.test.ts` covering real apply→workspace service→list/create/open/read.
24. Load `editing-cordis-compositions`, then add `scripts/smoke-i50.mjs` and selected-profile `scripts/smoke-i50-profile.mjs` using a temporary profile/projects root, never real user projects.
25. Add scripts:
   ```json
   "smoke:i50": "node scripts/smoke-i50.mjs",
   "smoke:i50:profile": "node scripts/smoke-i50-profile.mjs",
   "verify:i50": "pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke:i50 && pnpm run smoke:i50:profile"
   ```
26. Focused verification:
   ```powershell
   pnpm exec vitest run src/host/remote/probe.test.ts src/host/remote/editor.test.ts src/host/remote/project-lifecycle.test.ts src/host/workspace-service.test.ts src/core/project/index.test.ts src/core/outline/index.test.ts src/core/relationship/index.test.ts src/host/project-service.test.ts src/host/outline-service.test.ts src/index.test.ts src/workspace-remote.test.ts src/editor-remote.test.ts src/client/project-session.test.ts src/client.test.ts src/project-lifecycle.test.ts
   pnpm run verify:i50
   ```
27. Scan source/bundle for literal project fallback `'default'`; zero matches in Stage 10/project operations.
28. Independent review: owner uniqueness, old Remote prefix, Client selection isolation, corrupt/no-write behavior.
29. Update the Stage 10 Aegis checkpoint/evidence with I50 fresh outputs; these evidence-file edits belong to the I50 commit.
30. Commit only I50 files + its Aegis evidence:
   ```text
   feat(I50): 编排多作品启动与六层就绪

   - 做了什么：Host list/create/open/readiness、Remote additive、Client 选择/空白入口
   - 为什么：design §14.7 / D15–D16 / R11-1
   - 如何验证：pnpm run verify:i50
   - 明确不做：DOCX、LLM、候选确认、跨层落地
   ```
31. 按 AGENTS §7 汇报 I50 交付物/证据/commit/交接块并**停止**；没有新的 `执行迭代 I51` 不得继续。

**Rollback / retirement**

Revert I50 commit only；created project data remains. Retire all Client `default` and duplicate Confirmation owner only after I50 profile smoke passes; no compatibility fallback.

---

### Task 2 / I51：受控 DOCX 上传与真实文本提取

**Why / Change Necessity**

Client file picker cannot safely hand a local path to Host；现有 parser 不支持 central directory/data descriptor/ZIP64/安全 budgets。必须增加受控 transport 并替换 parser。

**Dependencies**

```powershell
pnpm add yauzl@^3.4.0 saxes@^6.0.0
pnpm add -D @types/yauzl@^3.4.0
```

**Wire and Host-only contracts**

```ts
export const DOCX_UPLOAD_LIMITS = {
  maxCompressedBytes: 10 * 1024 * 1024,
  chunkBytes: 256 * 1024, // provisional upper choice; I51 step 17 must prove or lower it
  maxEntries: 256,
  maxEntryUncompressedBytes: 32 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxActiveTotal: 4,
  maxActivePerProject: 1,
  uploadTtlMs: 10 * 60_000,
  sourceTtlMs: 30 * 60_000,
} as const;

interface DocxUploadStartInput { fileName: string; byteLength: number; sha256: string }
interface DocxUploadReceipt {
  status: 'ready'; projectId: string; uploadId: string; fileName: string;
  sourceHash: string; compressedBytes: number; textCharacters: number;
  chunkCount: number; expiresAt: string;
}
interface DocxNormalizedSource {
  projectId: string; uploadId: string; fileName: string; sourceHash: string;
  text: string; chunks: readonly ImportedChunk[]; expiresAt: string;
}
```

Remote: `uploadStart(projectId,input)`、`uploadChunk(projectId,uploadId,index,base64)`、`uploadFinalize(projectId,uploadId)`、`uploadCancel(projectId,uploadId)`。`getSource()` is Host-only and never serializes text/path to Client。

**Steps**

1. Require a fresh direct `执行迭代 I51` instruction；confirm I50 commit/`verify:i50`, then create TaskStartSnapshot and I51 DoD.
2. Add pinned direct dependencies and inspect lockfile diff; no transitive-only import.
3. Acquire two real fixtures (one saved by Microsoft Word, one by LibreOffice Writer). Record app/version/OS/creation steps/SHA-256/synthetic content/license in `PROVENANCE.md`. If provenance cannot be proved, stop I51; do not use hand-built ZIP.
4. Add gold text and static negative fixtures: truncated, renamed plain file, encrypted, traversal, duplicate entry, 257 entries, >entry/total budgets, ratio>100, macro content type. Keep them small and record expected error code/hash.
5. Add browser-safe runtime upload schemas in `src/core/schema/docx-upload.ts` and non-runtime `contracts/stage10/docx-upload.json` lock；descriptor tests compare the lock；filename is NFC basename, ≤255 UTF-8 bytes, `.docx`, no slash/backslash/NUL/dot segments；sha256 is lowercase 64 hex.
6. Move the existing I37 `normalizeText`/`chunkText` implementation without semantic change into `src/core/io/import-text.ts`, add direct regression tests, and make I37/I51 consume that single exported owner；I52 may add source binding/hash but must not implement another normalizer/chunker.
7. Implement `extractDocxText(path,limits)` with yauzl lazy entries, strict filenames, size validation, ZIP64 support, encrypted/method/path/duplicate/budget rejection.
8. Parse `[Content_Types].xml` and `_rels/.rels` with saxes under their declared namespaces；require exactly one internal `officeDocument` relationship, normalize its target without traversal, resolve the main part（normally `word/document.xml`）, require a non-macro WordprocessingML main content type, and reject external targets/DOCTYPE.
9. Parse the resolved main part with strict or transitional WordprocessingML namespace URIs using saxes streaming；accept only namespace-qualified `w:t/w:p/w:tab/w:br/w:cr` semantics. Count actual stream bytes in addition to central-directory metadata and abort immediately on entry/total/ratio budget overrun；then call the single I37 normalizer/chunker.
10. In one edit, delete `node:zlib`/`xmlText`/`readDocx`/local-header scan and route I37 DOCX through the new adapter. No fallback.
11. Replace `storedDocx()` test helper with real fixtures; preserve txt/md/review semantics.
12. Implement Host upload manager: random temp filename under plugin-owned temp root, per-session serialized queue, active quotas, incremental SHA-256, exact chunk order/length/base64 checks.
13. Finalize only after size/chunk/hash match; compare the compressed upload digest (`uploadSha256`) using fixed-size bytes; parse DOCX；compute `sourceHash` separately from exact normalized-text UTF-8 bytes（I52/Gate binding never uses the compressed digest）；remove raw temp immediately；retain only `DocxNormalizedSource` in Host memory until consumed/TTL/dispose.
14. Implement idempotent cancel, known-session failure cleanup, lazy/owned TTL sweep and awaited Fiber dispose. Project mismatch rejects without cleaning another project session.
15. Add Host tests for concurrency, order, duplicate, bad base64, limits, hash mismatch, parse errors, cancel/TTL/dispose and a sentinel project file never deleted.
16. Add four descriptors in `src/host/remote/docx-upload.ts`; every input/result/ack uses its named `.strict()` schema（start/chunk/finalize/cancel）, append after I50 descriptors, and keep workspace forwarding-only.
17. Before freezing `chunkBytes`, inspect the installed DSH Typert/WebSocket gateway payload limit and record the source/version in I51 evidence；prove one fully expanded base64 chunk plus JSON overhead is below that limit. Keep 256 KiB only if the proof passes；otherwise lower the single shared constant before any fixture/gold is locked.
18. Implement `src/client/docx-upload.ts`: Client early size/extension UX, WebCrypto digest, `File.slice()` sequential `chunkBytes`, bounded base64 conversion, progress and cancel. Host repeats all checks.
19. Export the picker/progress/cancel/receipt component from `src/client/docx-upload.ts` and wire that canonical component into the I50 new/empty-project surface；I53 must import/reuse it rather than replace it with a second picker. I51 stops at extraction receipt metadata；project switch/overlay dispose cancels active upload.
20. Add Client tests with fake File/crypto/Remote and bundle/source negative scans for `node:fs|node:zlib|yauzl|saxes|word/document.xml|PK magic`.
21. Add `scripts/smoke-i51.mjs` to upload both real fixtures, compare gold, prove raw temp cleanup/source handle availability/cancel/dispose/sentinel preservation, scan old parser/client forbidden symbols. Add `scripts/smoke-i51-profile.mjs` to boot a temporary selected profile and dispatch a maximum-size base64 chunk through the registered strict descriptor/workspace service, then finalize a real fixture and dispose.
22. Add scripts:
   ```json
   "smoke:i51": "node scripts/smoke-i51.mjs",
   "smoke:i51:profile": "node scripts/smoke-i51-profile.mjs",
   "verify:i51": "pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke:i51 && pnpm run smoke:i51:profile"
   ```
23. Verification:
   ```powershell
   pnpm exec vitest run src/core/schema/docx-upload.test.ts src/core/io/import-text.test.ts src/import/docx.test.ts src/import/index.test.ts src/host/docx-upload-service.test.ts src/host/remote/docx-upload.test.ts src/editor-remote.test.ts src/client/docx-upload.test.ts src/client.test.ts src/client-contract.test.ts
   pnpm run verify:i37
   pnpm run verify:i50
   pnpm run verify:i51
   ```
24. Zero-reference scan treats grep exit 1 as success: no `inflateRawSync|function readDocx|function xmlText|unsupported docx compression` in src/scripts/bundle.
25. Independent security/retirement review.
26. Update Stage 10 Aegis checkpoint/evidence with dependency versions, fixture provenance, gateway payload proof and fresh I51 outputs；include those evidence edits in I51.
27. Commit only I51 files + its Aegis evidence:
   ```text
   feat(I51): 增加受控 DOCX 上传与 Host 提取

   - 做了什么：分块上传、SHA/budgets、yauzl+saxes、真实 fixtures、旧 parser 退役
   - 为什么：design §14.7.2 / D18 / R11-2
   - 如何验证：pnpm run verify:i51；pnpm run verify:i37；pnpm run verify:i50
   - 明确不做：LLM、六层候选、Gate、作品层写入、原始 DOCX 长期保存
   ```
28. 按 AGENTS §7 汇报 I51 并**停止**；没有新的 `执行迭代 I52` 不得继续。

**Rollback / retirement**

The shipped I51 commit contains only the new parser；old/new fallback never coexist. An emergency full-version rollback may revert the entire I51 commit to the last verified I50/I37 package, which explicitly marks I51 unshipped and reopens the parser-retirement task；it is not a runtime fallback branch. If replacement fails before commit, I51 remains incomplete. Temp cleanup may delete only plugin-created temp roots。

---

### Task 3 / I52：六层初始化分析器

**Why / Change Necessity**

I38 contract explicitly forbids C1/C2/C4 and cannot be expanded. A separate Host onboarding analyzer is required, while reusing current six schemas and configured Host generation seam。

**Candidate contract**

```ts
type InitializationLayer = 'B3' | 'B2' | 'B5' | 'C1' | 'C2' | 'C4';
interface EvidenceItem { chunkIndex: number; quote: string; tags: string[] }
interface CandidateEnvelope<T> {
  schemaVersion: 1;
  projectId: string; onboardingSessionId: string; sourceHash: string;
  layer: InitializationLayer; candidateHash: string;
  candidateStatus: 'proposed' | 'no-evidence';
  value: T;
  confidence: number;
  evidence: EvidenceItem[]; // complete frozen pool for this layer; supports restart regeneration
  citations: EvidenceItem[]; // subset directly supporting the current value
  warnings: string[];
}
```

Layer values：B3 `CharacterCore[]`、B2 `WorldEntry[]`、C1 `Relationship[]`、C2 `worldStateSchema.omit({seq:true})`。B5 is a strict union of `{candidateStatus:'proposed',value:Outline}` and `{candidateStatus:'no-evidence',value:null}`；`no-evidence` cannot be accepted/applied and must be edited to a complete Outline, regenerated, or skipped。C4 uses an onboarding `CanonAppendInput` derived from `CanonEventInput` whose kind enum explicitly excludes `correction`；corrections remain CanonLedger.supersede-only。B3 forbidden reference arrays are always empty。

Remote:

```text
onboardingAnalysisStart(projectId, source) -> AnalysisStartAck
onboardingAnalysisStatus(projectId, onboardingSessionId, sourceHash) -> AnalysisStatusView
onboardingAnalysisCancel(projectId, onboardingSessionId, sourceHash) -> AnalysisCancelAck
onboardingAnalysisRegenerate(projectId, onboardingSessionId, sourceHash, layer, feedback, expectedCandidateHash) -> RegenerateAck
```

Every parameter object and result/ack above has a named `.strict()` Zod schema, includes `schemaVersion:1` plus the binding fields, and rejects unknown keys. `source` is `{kind:'docx',uploadId,sourceHash}` or `{kind:'text',text}`；Host calls the I51 canonical normalizer/chunker, computes sourceHash, and never accepts model/credential/raw key parameters from Client。

**Steps**

1. Require a fresh direct `执行迭代 I52` instruction；confirm I50/I51 verifies, then create TaskStartSnapshot and I52 DoD.
2. **Before prompt/schema implementation**, freeze `samples/i52/dev.json` with 10 reviewed cases and independent `held-out.json` with 10 cases. Cover full synopsis, sparse world-only, character-only, relationship ambiguity, no explicit canon, end-state, outline-rich, aliases, forbidden C3 inference, malformed model output.
3. Define immutable sample format, canonical semantic scorer and per-layer pass rule. Gold never contains C3/items/factions/globalFlags or B3 forbidden refs.
4. Add onboarding source validation/binding only: text non-empty, no NUL, default ≤2 MiB, then call I51 `src/core/io/import-text.ts` for NFC/paragraph-stable normalization/chunking and compute SHA-256 over its exact normalized UTF-8 bytes. Do not add a second normalization owner.
5. Resolve DOCX handles only through I51 Host `getSource(projectId,uploadId,sourceHash)`; release handle after evidence map is owned by analysis session.
6. Add strict layer candidate + analysis Remote input/result/ack schemas in browser-safe `src/core/schema/onboarding-analysis.ts`, derived from existing domain schemas and omitting only ledger-owned fields；add non-runtime `contracts/stage10/onboarding-analysis.json` lock and compare descriptors to it. Do not edit domain schemas.
7. Implement shared evidence map prompt/parser first against fake generator；produce a bounded complete evidence pool per layer（not only selected citations）, each item carrying chunk index + exact quote. Cap serialized per-layer evidence so six Gate proposals stay within the tested Confirmation document budget；never retain whole live objects.
8. Implement six independent reduce prompts/parsers; each reducer consumes frozen evidence and produces one strict envelope.
9. Enforce B3 empty relationship/knowledge/keyBeat arrays, C2 current subset, C4 explicit append events only with `kind !== 'correction'`, B5 no-evidence acceptance prohibition, and no C3 key at any depth.
10. Inject a narrow `ConfiguredGenerator` backed by existing `NovelSettingsService.generate()` so credentials/model route remain Host-owned. Tests inject fake generator before any real route.
11. Implement Host analysis sessions with random onboardingSessionId, bound projectId/sourceHash, statuses `mapping|reducing|ready|failed|cancelled`, progress, AbortController set and Fiber disposal.
12. `start/status/cancel/regenerate` must compare project/session/sourceHash. Start revalidates project is new/empty through project lifecycle；model unavailable/cancel/parse failure performs zero layer writes.
13. Regenerate only in analysis phase: verify expectedCandidateHash, reuse frozen evidence, replace only one candidate after full validation；failure preserves prior candidate and all six hashes. Also expose a Host-only `reduceLayerFromEvidence(binding,layer,evidence,feedback)` seam that is session-independent；I53 uses this seam after restart, while no additional Remote bypass is exposed.
14. Add Stage 10 analysis descriptors and forwarding；every method uses the named strict input/result/ack schema from the contract；old Remote prefix remains unchanged.
15. Add unit tests for normalization/size/hash, schema omissions, fake pipeline, binding mismatch, cancellation, invalid output, single-layer hash isolation and Fiber cleanup.
16. Load `editing-cordis-compositions` before profile/evaluation compositions. Add `scripts/smoke-i52.mjs` for fake-backend pipeline and **dev samples only**；it must not read/score held-out. Add `scripts/smoke-i52-profile.mjs` to boot a temporary selected profile, dispatch a near-2-MiB UTF-8 free-text input through the strict descriptor/workspace service, prove Host limit/zero writes/cancel/dispose, and record the installed gateway payload boundary.
17. Add `scripts/eval-i52.mjs` as the only held-out consumer：load `DSH_PROFILE`（default `novel-gen`）through `dsh-app-boot` without starting a Web server, prepend a config layer that redirects projects/analysis artifacts to a temp root, invoke the real Host onboarding service for all 10 held-out cases, print per-layer score + modelRef only, then dispose/remove temp data. If profile LLM/credential is unavailable or any layer <80%, exit non-zero without fallback or touching the real project root.
18. Add scripts:
   ```json
   "smoke:i52": "node scripts/smoke-i52.mjs",
   "smoke:i52:profile": "node scripts/smoke-i52-profile.mjs",
   "eval:i52": "node scripts/eval-i52.mjs",
   "verify:i52": "pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke:i52 && pnpm run smoke:i52:profile && pnpm run eval:i52"
   ```
19. Verification:
   ```powershell
   pnpm exec vitest run src/core/schema/onboarding-analysis.test.ts src/core/onboarding/source.test.ts src/llm/parse/onboarding-evidence.test.ts src/llm/parse/onboarding-reduce.test.ts src/llm/validate/onboarding-analysis.test.ts src/host/onboarding-service.test.ts src/host/remote/onboarding-analysis.test.ts
   pnpm run verify:i38
   pnpm run verify:i52
   ```
20. Completion gate: held-out remains untouched until `eval:i52` at I52 completion；all 10 cases immutable and every layer score ≥80%；unavailable live evaluator or failed 2-MiB profile dispatch means I52 incomplete, not waived.
21. Independent sample/schema/Host-boundary review.
22. Update Stage 10 Aegis checkpoint/evidence with sample hashes, modelRef, per-layer held-out scores, 2-MiB Remote proof and fresh I52 outputs；include those edits in I52.
23. Commit only I52 files + its Aegis evidence:
   ```text
   feat(I52): 建立六层初始化分析器

   - 做了什么：共享 evidence、六层 reduce、Host analysis session、单层重生成、held-out
   - 为什么：design §14.7.3 / D17 / R11-3
   - 如何验证：pnpm run verify:i52；pnpm run eval:i52（各层阈值）
   - 明确不做：C3、自动接受、层写入、Client LLM、修改 I38
   ```
24. 按 AGENTS §7 汇报 I52（含每层 held-out 准确率）并**停止**；没有新的 `执行迭代 I53` 不得继续。

**Rollback**

Cancel sessions and revert I52 commit；I50/I51 remain usable and blank mode remains available。No project layer data exists to compensate。

---

### Task 4 / I53：六层审阅、Gate lineage 与幂等落地

**Why / Change Necessity**

I52 only creates candidates. User-approved four-way per-layer decisions and partial recovery need a review/apply owner that reuses I11 and six Domain Services without a second applied journal。

**Gate extension**

```ts
interface ConfirmationGate {
  // list() already exists in I11; I53 only exposes it through the Host facade.
  replace(currentId: string, successor: ConfirmationProposalInput):
    Promise<{ rejected: ConfirmationRecord; successor: ConfirmationRecord }>;
}
```

`replace()` runs in the existing Gate queue and calls the existing single-document temp-write/rename persistence once with old=`rejected` + new=`pending`; duplicate successor/current-not-pending fails before write. The claim is queue-level atomic visibility under current I11 persistence semantics, not unproved power-loss durability；tests cover success, pre-write failure, restart and idempotent replay. Status schema remains unchanged。

Proposal payload fields：`schemaVersion,projectId,onboardingSessionId,sourceHash,layer,candidateStatus,candidateHash,value,confidence,evidence,citations,warnings,replacesId?,mode?,operationId?`；the bounded complete per-layer evidence pool is persisted in every current lineage leaf so regenerate remains reconstructable after Host restart without raw source。

Review derivation：root/successor graph per layer；leaf pending→pending；leaf accepted→accepted；leaf rejected with no successor→skipped。No review pointer file and no applied journal。

**Review Remote**

```text
onboardingReviewStart(projectId,session,sourceHash) -> ReviewStateView
onboardingReviewGet(projectId,session,sourceHash) -> ReviewStateView
onboardingLayerAccept(projectId,session,sourceHash,layer,proposalId) -> LayerDecisionAck
onboardingLayerEditAccept(projectId,session,sourceHash,layer,proposalId,operationId,value) -> LayerDecisionAck
onboardingLayerRegenerate(projectId,session,sourceHash,layer,proposalId,operationId,feedback) -> LayerDecisionAck
onboardingLayerSkip(projectId,session,sourceHash,layer,proposalId) -> LayerDecisionAck
onboardingApply(projectId,session,sourceHash) -> OnboardingApplyResult
```

All seven parameter/result/ack objects use named `.strict()` schemas with `schemaVersion:1` and binding fields；unknown fields and stale proposal/candidate hashes fail closed. Direct I52 regenerate rejects after reviewStart seals the analysis session。

**Apply result**

```ts
interface OnboardingApplyResult {
  schemaVersion: 1;
  projectId: string;
  onboardingSessionId: string;
  appliedLayers: InitializationLayer[];
  skippedLayers: InitializationLayer[];
  blockedLayers: InitializationLayer[];
  pendingLayers: InitializationLayer[];
  retryable: boolean;
  errors: { layer: InitializationLayer; code: 'blocked'|'conflict'|'partial-retryable'; retryable: boolean; message: string }[];
}
```

**Steps**

1. Require a fresh direct `执行迭代 I53` instruction；confirm I50–I52 verifies and the held-out report, then create TaskStartSnapshot and I53 DoD.
2. Add only ConfirmationGate `replace()`；reuse the existing core `list()` and expose it additively through `NovelConfirmationService`. Tests cover one-persist replacement, pre-write failure/no partial mutation, duplicate/opposite decisions, restart visibility, idempotent replay and unchanged three-state schema；do not claim power-loss guarantees beyond current I11 temp-write/rename contract.
3. Add review proposal/payload/result + strict Remote schemas in browser-safe `src/core/schema/onboarding-review.ts`；add non-runtime `contracts/stage10/onboarding-review.json` lock and compare descriptors to it. All methods match project/session/sourceHash/layer/proposalId；Client selection never substitutes binding.
4. Implement reviewStart with deterministic root proposal IDs. Retry fills missing proposals idempotently；then seal I52 direct regeneration.
5. Implement four decisions:
   - accept: accept current pending leaf；
   - edit-accept: validate edited layer + forbidden refs, derive successorId from old proposalId + operationId, `replace(mode=edited)`, then accept successor；a replay that finds the matching successor pending resumes `accept`, and one that finds it accepted returns the same ack；mismatched successor/payload fails closed；
   - regenerate: rerun one reducer from the persisted frozen layer evidence, derive successorId from old proposalId + operationId, replace(mode=regenerated), successor remains pending；matching replay returns the same successor without another LLM call when the request carries the same operationId；
   - skip: reject pending leaf and create no successor。
6. Derive review state from Gate list/lineage；reconstruct each pending regenerate from that leaf's persisted complete evidence pool after Host restart；detect cycles, multiple successors, missing evidence, binding/hash mismatch and non-leaf operations fail closed.
7. Require all six leaves accepted or skipped before first apply; any pending returns pendingLayers and performs zero writes.
8. Preflight accepted values and IDs against both existing project and full accepted set:
   - B3 forbidden refs empty；
   - B2 parent refs + stable parent-first Kahn order, missing/cycle blocked；
   - B5 prerequisites within full Outline；
   - B5 character refs/C2 characters/C4 participants/C1 endpoints+knownTo resolve B3；
   - C4 consequences resolve existing/full accepted C4 IDs；
   - C1 milestones resolve C4 that will exist before C1。
9. Reject reviewStart/apply if the project was non-empty before onboarding, except exact same deterministic values found during retry.
10. Define `src/core/onboarding/apply.ts` as a pure orchestrator over narrow read/compare/write ports only；it must not import Host service implementations or filesystem APIs. `src/host/onboarding-service.ts` injects existing Character/Worldview/Outline/State/Canon/Relationship Service adapters. Compare schema-normalized semantic values, omit ledger-owned seq/immutable/supersedes, and sort only fields whose domain semantics are unordered.
11. Apply in exact order B3→B2→B5→C2→C4→C1:
   - B3 stable ID create / same=already done / conflict=blocked；
   - B2 parent-first create；
   - B5 one Outline save；
   - C2 transaction only if current differs from accepted value；same current creates no extra seq；
   - C4 stable candidate order append；same ID+semantic event is done；conflict blocked；
   - C1 `saveAll` after C4 exists。
12. Continue independent layers after one failure, propagate dependency blocks, never delete prior successful data. Transient/interrupted writes produce `partial-retryable` with `errors[].retryable=true`; schema/reference/cycle/existing-value semantic conflicts produce `blocked|conflict` with `retryable=false` and are never rewritten on retry. Overall `retryable` is true only when at least one unapplied layer has a retryable path；retry writes only missing/different-safe items.
13. Add fault-injection tests after every layer boundary, duplicate apply, restart/reconstruct Gate lineage, conflicting ID, C1/C4 dependency, C2 no extra seq, C4 append-only, skipped/unaccepted hashes unchanged.
14. Add seven review descriptors；every method uses the named strict input/result/ack schema and stale-hash fields；workspace remains forwarding-only and preserves every previous descriptor as an exact prefix.
15. Implement `src/client/onboarding.ts` as separate component/controller, import/reuse I51's canonical DOCX picker/driver, and extend standalone onboarding styles. Main `client.ts` only passes selected project, Remote and close/enter callbacks；no second file input/upload owner.
16. UI modes: blank enters immediately；DOCX upload receipt→analysis；free text validates/starts analysis。Review renders six cards with evidence/confidence/warnings and four explicit actions.
17. Disable final apply while any pending；show accepted/skipped/blocked/applied states and partial retry action. Project switch/cancel disposes jobs/upload and clears Client-only state.
18. Add focused Client tests for all four actions, edited proposal replacement, regenerate one-layer hash isolation, skip vs pending, apply partial/retry and Fiber/Slot/style cleanup.
19. Add `scripts/smoke-i53.mjs` for Host fake analysis→Gate→partial apply→retry→restart idempotency and bundle forbidden scan.
20. Load `editing-cordis-compositions` before authoring the test composition. Add `scripts/fixtures/i53-fake-llm-plugin.mjs` and `scripts/smoke-i53-profile.mjs`: the smoke generates a temporary installable test bundle/patch around this fixture, lists that bundle before `novel-creation-tool` in a temporary selected profile, configures a temporary projects root, and proves the test-owned `llm` service exists before novel plugin apply；exercise real workspace Remote for DOCX partial accept/skip and free-text one-layer regenerate；dispose/reboot/reopen. It is a selected-profile Host+Remote contract E2E, not falsely labelled a full browser-shell test。
21. Update package/status/view-model literals to 2.1.0 and create `docs/novel-creation-tool-usage.md` describing the exact basic flow, layer meanings, four decisions, empty states and partial retry。
22. Add scripts:
   ```json
   "smoke:i53": "node scripts/smoke-i53.mjs",
   "smoke:i53:profile": "node scripts/smoke-i53-profile.mjs",
   "verify:i53": "pnpm run typecheck && pnpm test && pnpm run build && pnpm run smoke:i53 && pnpm run smoke:i53:profile",
   "verify:stage-10": "pnpm run verify:i50 && pnpm run verify:i51 && pnpm run verify:i52 && pnpm run verify:i53"
   ```
23. Verification:
   ```powershell
   pnpm exec vitest run src/core/confirm/index.test.ts src/host/confirmation-service.test.ts src/core/schema/onboarding-review.test.ts src/core/onboarding/review.test.ts src/core/onboarding/preflight.test.ts src/core/onboarding/apply.test.ts src/host/onboarding-service.test.ts src/host/remote/onboarding-review.test.ts src/client/onboarding.test.ts src/client.test.ts src/client-contract.test.ts src/editor-remote.test.ts src/workspace-remote.test.ts src/index.test.ts
   pnpm run verify:i11
   pnpm run verify:i49
   pnpm run verify:i53
   pnpm run verify:stage-10
   ```
24. Independent two-stage review: spec/owner/compat first；then code/security/idempotency/retirement。Fix high findings and rerun affected + stage gates。
25. Perform final Stage 10 runtime acceptance **inside I53 before its single commit**：collect I50–I52 hashes, confirm no `lib/`/temp/user data will be staged, run `pnpm run verify:stage-10` and `git diff --check` over the iteration range。
26. Build the ordinary package；do not start a second GUI server. Preserve the exact existing process command, restart only `dsh --profile novel-gen --port 3082` through a managed job, refresh and verify `http://127.0.0.1:3082`。
27. On 3082 verify: empty root no six read errors；create/switch two test-owned projects without cross-write；blank legal states；real DOCX and free text produce six candidates；exercise accept/edit-accept/regenerate/skip；apply/reload/process restart remains idempotent；no C3/deferred C2 fields/fake B5. Keep any created test project data unless the user separately authorizes deletion。
28. Update Stage 10 Aegis checkpoint/evidence/reflection with review, stage gate, held-out, 3082 and retirement results；these final evidence edits belong to I53. Only now may the persisted goal be completed。
29. Commit only I53 files + usage docs + final Aegis evidence:
   ```text
   feat(I53): 完成六层审阅与幂等落地

   - 做了什么：Gate lineage、四种逐层裁决、preflight、partial-retryable apply、三入口 UI
   - 为什么：design §14.7.4 / D17–D19 / R11-4
   - 如何验证：pnpm run verify:i53；pnpm run verify:stage-10；3082 runtime acceptance
   - 明确不做：C3、非空合并、直接文件写、跨文件强制回滚、补偿删除
   ```
30. 按 AGENTS §7 汇报 I53/Stage 10 交付物、证据、held-out、smoke、commit 和交接块并**停止**。

**Rollback / recovery**

Code rollback uses `git revert` of I53 only；never delete accepted project data。Partial project writes remain valid and are resumed by the same accepted Gate payload after code restoration/retry。

## Verification Matrix

| Requirement | Primary evidence | Regression |
|---|---|---|
| R11-1 project lifecycle | `verify:i50`, profile smoke, 3082 create/select | I3/I11/I49 |
| R11-2 DOCX security | `verify:i51`, real fixtures, zero-ref scan | I37/I38/I50 |
| R11-3 six-layer analyzer | `verify:i52`, live held-out report each layer ≥80% | I17/I31/I38 |
| R11-4 review/apply | `verify:i53`, fault injection, profile smoke | I11 + six domain services + I49 |
| Stage 10 cumulative | `verify:stage-10` | full `pnpm test`/build |

## Risks

- **Dirty Client ownership**：overlapping pre-existing diff is a hard stop, not a reason to stash/reset or hide it in I50。
- **Fixture provenance**：no local Office/LibreOffice；I51 cannot substitute generated ZIP for required real fixtures。
- **Live LLM availability**：blank mode remains usable, but I52 completion still requires held-out evidence；unavailable model is a blocker, not a threshold waiver。
- **Remote growth**：descriptor modules must remain append-only and `remote.ts` aggregation-only。
- **Gate file growth**：payload keeps candidates/evidence, never raw DOCX/full input；sample/size tests cap payload。
- **Partial disk failure**：no compensation delete；always return exact per-layer evidence and retry via current-value comparison。
- **Current GUI deployment**：ordinary package Host/Client changes need build + existing profile process restart/page refresh；HMR is not claimed。

## Retirement

- I50: delete all Client `'default'` project fallbacks and duplicate ConfirmationService construction after profile path passes。
- I51: delete handwritten ZIP/XML parser, zlib import and fake DOCX fixture in the same verified commit；no fallback。
- I52: do not alter/retire I38；new initializer is a separate contract。
- I53: no review pointer store and no applied journal；Gate lineage + Domain current values are sole recovery evidence。
- Live project data is never a retirement target。

## Execution Route

- Decision: per-iteration inline；本计划是四个未来执行指令的共享路线图，不是一次连续执行授权。
- Gate: 用户每次只发送一个 `执行迭代 I50` / `I51` / `I52` / `I53`；执行该迭代、fresh verify、单 commit、按 AGENTS §7 汇报后必须停止。禁止因本计划已批准而自动进入下一迭代。
- Evidence: 四个迭代有严格依赖且重复触及 shared index/Remote/Client contracts；单迭代内 inline 协调比并行写共享合同更安全。
- Review assistance: fresh subagent review may run inside the active Ixx, but coordinator owns that iteration's writes and single commit。
- Fallback: if one Ixx spans context resets, use `executing-plans` checkpoints and resume only that same Ixx；不得跨到下一 Ixx。
- User confirmation required before I50: resolve pre-existing Client diff ownership and explicitly allow/deny the non-Ixx planning-baseline commit exception。