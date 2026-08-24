# Stage 10 作品启动与六层初始化 - Checkpoint

- Task ID: 2026-08-24-stage10-project-onboarding
- Current todo: Execute I50 Host-owned project lifecycle, Remote, Client selection, and I50 verification
- Active slice: I50 only; Host project lifecycle is the canonical owner for list/create/open/readiness
- Blocked on: none
- Next step: Complete I50 implementation, two-stage review, fresh `pnpm run verify:i50`, scoped commit, then stop before I51

## DriftCheckDraft

- Scope status: I50 only, anchored to design §14.7 / D15-D16, requirements R11-1, and plan I50; excludes I51 DOCX, I52 LLM analysis, I53 adjudication/apply, C3, existing non-empty import, and C2 extension objects.
- Compatibility status: Preserve I11 three-state Gate, I37/I38 contracts, old Remote descriptor prefix, six Domain write owners and selected-profile bundle path.
- Owner status: Project lifecycle stays in existing `NovelProjectService`; Remote implementations move under `src/host/remote`; Workspace forwarding moves to `src/host/workspace-service`; browser-safe runtime schemas stay under `src/core/schema`; root `contracts/stage10/*.json` are non-runtime locks only.
- Retirement status: I50 removes the Client project-operation `default` fallback and reuses one ConfirmationService instance after the selected-profile smoke is green; no runtime compatibility fallback.
- Verification status: TaskStartSnapshot was clean at `3947935`; planned evidence is focused lifecycle tests, `pnpm run verify:i50`, source/bundle default scan, and profile smoke.
- New risk signals: Six-layer readiness must not mutate corrupt bytes or make phantom project directories; Client must not auto-select the first result.
- Advisory decision: continue

## Checkpoint Update

- Completed todos:
  - User-approved v2.1 Stage 10 specification synchronized into authority docs
  - Read-only I50, I51 and I52/I53 implementation investigations completed
  - Detailed per-iteration plan written and indexed at `docs/aegis/plans/2026-08-24-stage10-project-onboarding-implementation.md`
  - Initial plan review findings resolved: per-Ixx authorization, strict Remote contracts, B5/C4 candidate closure, live held-out gate, payload boundaries, canonical normalization, restartable Gate evidence, non-retryable conflicts, rollback and evidence ownership
  - Remote/build closure resolved: executable schemas remain in `src`, root contracts are non-runtime JSON locks, current build layout remains unchanged
  - User authorized separate cleanup of the pre-existing Client patch and a non-Ixx Stage 10 planning commit
  - The Client baseline was repaired, verified by `pnpm run verify:i49` (69 files / 320 tests) and committed as `0870e6e`
- Evidence refs:
  - implementation-plan-draft
  - independent-plan-review-initial
  - independent-plan-review-closure
  - independent-plan-review-build-closure
  - task0-client-baseline
- Blocked on: none
- Next step: Do not execute I50 automatically; require a new direct `执行迭代 I50` instruction.
