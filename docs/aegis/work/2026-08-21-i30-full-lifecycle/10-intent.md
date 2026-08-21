# I30 完整生命周期编排 — Intent

## DoD Card

- 目标：交付 Host 端单一生命周期协调器：`generate → post-generation validate → user decision → C2/C1/C3/C4/B2 parser fan-out → pre-write validate → writeback/compensation`。
- 明确不做：新层、UI、Extension、第二事务或持久化 owner、浏览器/直连 LLM。
- 交付物：`src/core/lifecycle/` 中的协调契约与实现、Host facade/wiring、fake `ctx.llm` e2e 夹具、冻结 held-out 样本、I30 smoke/verify 与工作证据。
- 验收：C2/C1/C3 先写；C4 append 与 B2 confirmation-first rewrite；拒绝零写；失败记录 pending compensation，绝不报告静默成功；真实形状的 held-out e2e 达阈值。
- 验证：focused tests、`pnpm run verify:i30`、`pnpm run verify:stage-4`、一次 I30-only commit。

## TaskStartSnapshot

- Root: `C:\Users\nemo5\Desktop\dsh`
- HEAD/branch: `52b0ec768d57be4c15445a146652b6e79c30643c` on `main` (upstream divergence `0 14`)。
- Staged/unstaged/untracked: none。
- Active Git operation: none; single worktree at this root。

## Baseline Usage Draft

- Required/acknowledged: `AGENTS.md`; development plan I30; design §§6.6, 7, 9; requirements R0-1/R0-3/R2-8/R3-6/R5-5/R5-7; I11 ConfirmationGate; I19/I20/I25–I29 code and checkpoints。
- Owner/contract lock: existing repositories/StateEngine/CanonLedger retain persistence and invariant ownership; I11 retains all confirmation decisions; I30 has the sole lifecycle coordination owner.
- Compatibility/retirement: no fallback or replacement writer is introduced. Compensation is an auditable pending record for already-durable writes, not a hidden rollback claim.

## Impact Statement Draft

A single Host-only lifecycle owner closes the accepted-prose loop without exposing LLM, filesystem, or domain truth to Client code. It coordinates existing bounded seams and exposes failure status explicitly.

## Execution Readiness View

- Intent lock: implement only I30 lifecycle.
- Scope fence: no UI, extensions, new layer, altered parser semantics, or second transaction owner.
- Baseline lock: D3 independent single-layer recognition, §9 two validator gates, I11 confirmation, existing store ownership.
- Test obligations: deterministic fake LLM full path; reject zero-write; write failure compensation; held-out e2e threshold; full I30 and Stage 4 verification.
- Drift / rewind: pause if true atomicity would require changing an existing persistence owner or an undisclosed public contract.
