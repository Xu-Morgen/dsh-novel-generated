# I105 SceneOutlineBinding 与候选落点合同实施计划

## Goal

交付 I105 / R18-1b：由独立 Host `SceneOutlineBindingRepository` 持有项目级 `scene-outline-bindings.yaml`，提供严格的一对一手工绑定与计算型 `stableSceneId` 默认映射；新增 additive binding、`novelWriting.proposeAt`、`novelQueue.startAt` Remote，并使 writing/queue/statistics/Client projection 退出 `chapter-1` 业务硬编码。

## Architecture

- `SceneOutlineBindingRepository` 是手工 sceneId↔detailBeatId 绑定的唯一持久化 owner。
- C5 `TextRepository` 与 B5 `OutlineRepository` 仍分别拥有正文与细纲真相；binding 服务只读取它们做引用预检。
- effective binding = 手工绑定优先；未被手工占用的 scene/card 才允许按 `stableSceneId(actId, beatId, detailBeatId)` 计算默认映射。默认映射不写 YAML，也不成为任意手工绑定真相。
- 新 candidate-target 主路径显式携带 existing chapterId + unoccupied sceneId，并冻结 C5/outline/binding 三个 fingerprint；accept 时三者全部复验。
- queue `startAt` 显式接受 existing chapterId；每张 card 先取手工绑定，否则派生 stableSceneId。已存在目标视为 completed/occupied，不生成重复候选。
- ordinary persistent Cordis Plugin 的 Host 是唯一文件 owner；Client 只消费 strict Remote，不增加 I106 管理表单。

## Tech Stack

TypeScript、Zod、现有 YAML I/O、Cordis Host Services、DSH Typert descriptors/real Client binder、Vitest、现有 contract-lock 生成器。

## Baseline / Authority Refs

- `docs/novel-creation-tool-design.md` v2.7 §14.14.1 D24、§14.14.2 D25/R18-1。
- `docs/novel-creation-tool-requirements.md` v2.7 R18-1。
- `docs/novel-creation-tool-development-plan.md` v2.7 I105（lines 1038–1046）。
- `AGENTS.md` v2.7。
- I104 baseline commit `86366852838080bb0604fba5088950a3224313eb`。
- 用户裁决：独立 binding Remote + `proposeAt/startAt`；显式绑定优先/计算默认；显式 chapter+scene；C5+outline+binding 三 fingerprint。

## Compatibility Boundary

- 不修改 C5/B5 persistence Schema，不复用 `scene.beats`，不重写 scene ID。
- 既有 `novelWriting.propose`、`novelQueue.start` descriptors/参数/结果逐字段不变；作为兼容入口保留，但生产 Client/queue 不再调用其隐式落点逻辑。
- 旧入口只在项目恰好一个 chapter 时确定性解析目标；多章节拒绝并要求 additive 显式入口。不得保留生产 `chapter-1` fallback。
- 新 Remote 全部 additive、strict，并锁 descriptor/result schema；非法输入/结果必须在真实 binder 边界拒绝。
- I105 仅提供删除前 binding impact 枚举，不清理绑定、不公开 delete Remote、不接 I11；这些属于 I106。

## TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: minimum implementation plus focused positive/negative and regression verification
- Reason: 用户/仓库未要求 strict TDD；DoD 要求确定性正负测试、消费者夹具、全量回归。
- Verification: focused Vitest suites → `pnpm run verify:i105`。

## Aegis Visibility

I105 同时新增 persistence owner、公开合同和兼容退役路径；计划用于锁定 owner、三 fingerprint、默认映射和旧入口退休边界，防止出现第二 binding truth 或 caller fallback。

## BaselineUsageDraft

- Required baseline refs: design D24/D25、requirements R18-1、plan I105、AGENTS。
- Delivered context refs: I104 commit、现有 candidate/queue/outline/text/statistics owners。
- Acknowledged before plan refs: 全部 required refs 已读取。
- Cited in plan refs: 全部 required refs。
- Missing refs: none。
- Decision: continue。

## Requirement Ready Check

- Requirement source refs: plan I105、requirements R18-1、design D24/D25。
- Goals and scope refs: project-level YAML binding + explicit candidate target。
- User / scenario refs: 用户已裁决四个合同/行为问题。
- Requirement item refs: repository、Remote、writing/queue/statistics/Client consumers、hardcode scan。
- Acceptance / verification criteria refs: duplicate/dangling/cross-project/stale/occupied/reopen/real binder/`verify:i105`。
- Open blocker questions: none。
- Decision: ready。

## Change Necessity

- User-visible need: 多章节作品必须把手工/queue 候选落到作者选择或可证明派生的 chapter+scene，并能管理 scene↔细纲卡关系。
- No-change / non-code option: 文档约定无法移除当前 production `chapter-1` 常量，也不能提供持久绑定和 stale gate。
- Why code change is necessary: 当前没有 binding owner，candidate/queue/statistics 各自推导落点。
- Minimum change boundary: 新 schema/repository/service/Remote；修改既有 candidate/queue/landing/statistics/Client projection 的单一消费 seam；合同锁与测试。
- Decision: code-change。

## Existence Check

- Proposed new surface: `SceneOutlineBindingRepository` + binding Remote。
- Existing owner / reuse candidate: C5/B5 owners只能提供被引用实体，不能拥有跨层关系；`scene.beats` 明确禁止复用。
- Why existing surface is insufficient: 把绑定写入 C5/B5 会形成错误 owner 并改变冻结 Schema。
- Creation proof: I105 明确指定独立 Host owner 与项目文件。
- Entropy / retirement impact: 新 owner替代 production hardcoded/default truth；旧 propose/start仅保留兼容入口，production callers退役。
- Decision: add-with-proof。

## Architecture Integrity Lens

- Invariant: 手工绑定只有一个持久 owner；默认 stable mapping 只在 resolver 中计算。
- Canonical owner / contract: Host repository + strict additive Remote。
- Responsibility overlap: statistics/queue不得再直接把 stableSceneId 当手工 binding truth。
- Higher-level simplification: 一个 resolver 同时服务 manual Remote、writing、queue、statistics。
- Retirement / falsifier: production source hardcode scan必须为零；旧 invocation contract lock零漂移。
- Verdict: proceed。

## Plan-Time Complexity Check

- Target files: 新 binding schema/repository/service/adapter；现有 candidate-production、landing-saga、queue-service、statistics build/service、Client candidate projection、Remote/locks/tests。
- Existing size / shape signals: queue-service 与 writing adjudication 已较大；避免把 binding I/O/解析直接塞入它们。
- Owner fit: 新 repository负责 I/O；facade/resolver负责跨 owner预检；消费者仅调用 resolver。
- Add-in-place risk: candidate/queue只允许 wiring和旧 fallback删除，不新增第二 binding算法。
- Better file boundary: `src/core/schema/scene-outline-binding.ts`、`src/host/scene-outline-binding-repository.ts`、`src/host/scene-outline-binding-service.ts`、专属 Remote/adapter。
- Budget result: within-budget, with focused adapters and shared resolver。
- Recommendation: add owner files; edit consumers in place only at target seams。

## Execution Readiness View

- Intent Lock: I105 only。
- Scope Fence: no I106 UI/delete orchestration/Gate；no B5/C6 mutation。
- Baseline Lock: I104 commit `8636685` + D24/D25。
- Approved Behavior: independent binding Remote + proposeAt/startAt；manual-over-default；explicit target；three fingerprints。
- Owner / Contract Constraints: C5/B5 unchanged；binding Host-only truth；Client no file access。
- Compatibility Boundary: old invocation bodies unchanged in lock；legacy entry no production hardcode。
- Retirement Boundary: remove production `chapter-1` targeting and projection text；fixtures allowed by explicit scan allowlist。
- Task Batches: owner/Remote → consumers/freshness → locks/smoke/evidence。
- Test Obligations: repository roundtrip/negative/restart；outline/text/writing/queue/statistics fixtures；real binder; old contract drift zero。
- Review Gates: spec compliance then code quality, all findings closed。
- Drift / Rewind Rules: any C5/B5 schema edit, I106 UI/delete, or old descriptor change stops execution。
- Evidence Required Before Completion: `pnpm run verify:i105`, artifact, clean scoped commit。
- Advisory Boundary: method-pack execution guidance only; not GateDecision, PolicySnapshot, or completion authority。

## Files

### Create

- `src/core/schema/scene-outline-binding.ts`
- `src/host/scene-outline-binding-repository.ts`
- `src/host/scene-outline-binding-service.ts`
- `src/host/remote/scene-outline-binding.ts`
- `src/host/scene-outline-binding-adapter.ts`
- focused repository/service/integration tests colocated with existing conventions
- `scripts/smoke-i105.mjs`
- `artifacts/i105-scene-outline-binding.json`

### Modify minimally

- Host composition/service types and `src/remote.ts`
- writing Remote/adapter/candidate-production/landing freshness entry state
- queue Remote/service/task schema only for additive explicit target snapshots; old queue Remote unchanged
- statistics resolver consumer and Client candidate projection
- contract lock generator/lock/tests and real binder fixture
- client bundle whitelist/namespace if the pure schema enters Client graph
- `docs/aegis/INDEX.md` for this plan record

## Task 1 — Binding schema, repository, service, and binding Remote

**Why:** establish the canonical owner before changing consumers.

**Impact / Compatibility:** new file only; C5/B5 read-only references; existing Remote unchanged.

**Steps:**

1. Define strict document, manual entry, effective projection, impact, fingerprint, and mutation schemas. Persist only version + sorted manual pairs; all owned results bounded.
2. Implement path-keyed serialized repository with missing-file empty state, strict read, atomic tmp+rename save, deterministic SHA-256 fingerprint, duplicate/one-to-one validation, and restart recovery semantics.
3. Implement service preflight by reading actual TextService chapter/scene and OutlineService beatCards. Reject unknown/cross-project/ambiguous detailBeat IDs. Compute defaults only when neither side has a manual binding.
4. Implement `read/save/rebind/unbind/impact` semantics: expected binding fingerprint; save requires free scene/card; rebind never displaces; unbind requires exact manual pair; impact returns manual/effective matches for scene or chapter without deleting.
5. Add `novelSceneOutlineBinding` descriptors and descriptor-derived adapter result typing; register one Host receiver and export contribution.
6. Add focused positive/negative/reopen/atomic tests and real outline+text consumer fixture.

**Verification:** `pnpm run typecheck` and focused binding suites.

## Task 2 — Explicit candidate/queue targets and shared freshness

**Why:** remove production hardcoded landing and make stale/occupied behavior reproducible.

**Impact / Compatibility:** additive `proposeAt/startAt`; existing `propose/start` descriptors/results unchanged; no auto chapter creation on new path.

**Steps:**

1. Add strict candidate-target selection/snapshot schemas with chapterId, sceneId, optional detailBeatId, textFingerprint, outlineFingerprint, bindingFingerprint.
2. Add outline canonical content fingerprint and binding resolver snapshot. Project-local duplicate detailBeat IDs make binding/target operations fail closed without changing B5 Schema.
3. Add `novelWriting.proposeAt` descriptor/adapter. It requires explicit existing chapter and unoccupied scene, captures the current three fingerprints inside Host CandidateEntry (the caller does not manufacture tokens), and returns the existing bounded candidate result shape under a new result schema ID.
4. At preview/adjudicate accept, re-read all three fingerprints; any mismatch rejects before parser/LLM/write. Remove new-path auto chapter creation; unknown chapter fails before generation.
5. Preserve old `propose` descriptor and compat entry. Resolve only exactly-one-chapter projects without any `chapter-1` constant; multi-chapter fails with explicit-target guidance. Remove all production Client calls to old implicit path.
6. Add `novelQueue.startAt` with explicit chapterId. Host freezes the current three fingerprints in each task snapshot; manual binding wins, otherwise stableSceneId. Existing occupied scene is reconciled completed; conflict with another manual/effective card fails closed.
7. Keep old `start` descriptor compatible, but its compatibility resolver only supports exactly one chapter. Client writing/queue production calls use `proposeAt`/`startAt`; the existing agent continue tool adds optional chapterId/sceneId and uses `proposeAt` when supplied while preserving its old single-chapter call.
8. Update queue recovery and candidate rehydrate to preserve/revalidate target snapshot. Update candidate projection text to display returned target rather than `chapter-1`.
9. Route statistics scene-card mapping through the shared effective binding resolver; stableSceneId remains only the unbound default.
10. Add writing/queue/statistics/Client consumer tests for chosen/derived target, three stale tokens, occupied target, restart, and no LLM/write before preflight failure.

**Verification:** focused writing, queue, statistics, Client, and C5 regressions.

## Task 3 — Contract locks, binder, hardcode scan, smoke, and evidence

**Why:** D24 and I105 DoD require machine-verifiable public compatibility and real consumption.

**Impact / Compatibility:** append-only Stage 18 lock; all pre-I105 descriptor/result JSON bodies remain structurally identical.

**Steps:**

1. Extend Stage 18 lock generator with binding and candidate-target descriptors/results.
2. Add invalid Domain-result compile fixture plus invalid wire input/result binder negatives.
3. Extend real TypertRegistry + Gateway + Client binder fixture through actual composition for binding methods, `proposeAt`, and `startAt` without caller casts.
4. Add a production-source `chapter-1` scanner with explicit fixture/migration allowlist; scan candidate-production, queue targeting, Client projection, statistics mapping and agent tools.
5. Add `scripts/smoke-i105.mjs` to assert owner paths, no C5/B5 schema edits, contract counts/drift, consumer suites, and generate `artifacts/i105-scene-outline-binding.json`.
6. Run focused suites, then spec review and code-quality review; repair and re-review until both pass.
7. Run `pnpm run verify:i105`; audit `git diff --check`, status, forbidden TODO/FIXME/console, and contract drift.
8. Stage only I105 paths and create one AGENTS-format I105 commit; read back HEAD/files/status.

**Verification:** `pnpm run verify:i105` must pass typecheck, 100% tests, build, smoke.

## Risks and Mitigations

- **Cross-owner race:** target snapshot freezes all three fingerprints; capture–validate–recapture and accept preflight reject deterministic stale cases. I105 does not claim a C5/B5/binding shared transaction; final C5 writes reuse I104 expected fingerprints, while I106 owns deletion consistency.
- **Project detailBeat ambiguity:** resolver rejects duplicate project-wide detailBeat IDs; no B5 schema change.
- **Default/manual collision:** one resolver computes manual-first/default-only-if-free and all consumers reuse it.
- **Legacy compatibility:** old descriptor bodies are locked; compat behavior is isolated and scanned out of production callers.
- **Queue journal migration:** new snapshot fields must have an explicit legacy parser/migration seam; no silent fabricated fingerprints. Legacy tasks require recovery through exactly-one-chapter deterministic resolution or fail closed.
- **Scope creep:** binding cleanup and GUI management remain I106.

## Anti-Entropy Declaration

- Deletion Class: code-retirement plus externally locked Remote compatibility.
- Old Path/Object: production `chapter-1` target fallback and statistics' independent stableSceneId-as-truth path.
- New Canonical Owner: SceneOutlineBindingService effective resolver plus explicit proposeAt/startAt targets.
- Expected Preserved Behavior: existing propose/start descriptors, parameter order, and result bodies remain compatible.
- Expected Retired Behavior: no production caller or hidden fallback fixes a business target to `chapter-1`; statistics no longer owns a second mapping algorithm.
- External Boundary Touched: yes — existing Remote methods stay as a bounded compatibility exception required by D24.
- Source-of-Truth Data Risk: none; I105 changes code and adds a non-destructive manual-binding document, but deletes no live project data.
- User Confirmation Required: no.

## Retirement Decision

- Path: delete-first for internal hardcoding/direct mapping; compat-exception only for the already published propose/start Remote invocations.
- Why: authority explicitly requires production retirement and public invocation compatibility.
- Non-edits: no project data deletion, no C5/B5 schema edit, no I106 cleanup/migration.

## Retirement Verification Plan

- Main-path check: proposeAt/startAt and canonical binding resolution land in selected/derived chapter+scene.
- Lingering-reference check: production-source scanner finds zero `chapter-1` business literals and no direct statistics mapping truth.
- Negative check: zero/multi-chapter legacy calls, stale snapshots, occupied targets, and partial explicit targets fail closed.
- Boundary check: every pre-I105 descriptor/result lock remains structurally identical; real binder accepts old and new methods.

## Retirement

- Delete production `chapter-1` targeting in candidate-production, queue-service, Client candidate projection, statistics linkage, and agent production calls.
- Retain literal `chapter-1` only in tests/fixtures or a named compatibility/migration module included in the scan allowlist.
- Retain existing `propose/start` Remote methods for D24 compatibility, but no production caller may depend on implicit chapter selection.
- `stableSceneId` remains the sole automatic default derivation helper; it is never persisted as arbitrary manual truth and never overrides manual bindings.

## Execution Route

- Decision: subagent-driven
- Evidence: three sequential owner batches with bounded file responsibilities and mandatory spec/quality review benefit from isolated implementation contexts.
- Fallback: coordinator inline repair only if a subagent reports a concrete blocker after context is supplied.
- User confirmation required: no; all public/behavior decisions were explicitly answered.
