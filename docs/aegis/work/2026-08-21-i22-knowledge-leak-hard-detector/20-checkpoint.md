# I22 知情泄漏硬约束检测器 - Checkpoint

- Task ID: 2026-08-21-i22-knowledge-leak-hard-detector
## Slice Card

- Goal: deliver I22 C3 POV knowledge-leak hard detection through the Host LLM and I20 reject consumer.
- Parent plan/spec: development plan I22; design §5.10/§8/§9.1; requirements R1-C3/R2-8/R4-3.
- Files: `samples/i22/`, I22 LLM detector/facade tests, smoke, verify, work record.
- Boundary: no rule/canon detector change, soft checks, parser, writeback, Client, persistence writer, or endpoint.
- Verification: target tests, then `pnpm run verify:i22`.
- Stop: corpus threshold misses, output cannot fail closed, or scope expands.

## TodoCheckpointDraft

- Current todo: final Git closeout after verification.
- Active slice: final review and clean commit.
- Completed todos: plan/design/requirements and I17/I18/I20/I21 baselines read; TaskStartSnapshot captured; 15-case frozen corpus created (canonical 5, held-out 5); I18-derived C3 projection, strict detector contract, I20 reject consumer, Host `ctx.llm` facade/Fiber wiring, smoke, and `verify:i22` implemented and verified.
- Evidence refs: `pnpm run verify:i22` passed (37 files/165 tests + build + smoke); `git diff --check` passed.
- Blocked on: none for I22. Full workspace integrity helper reports pre-existing unindexed I12/I19/I21 records outside this slice.
- Next step: stage only I22 paths, commit, then read back commit receipt.

## DriftCheckDraft

- Scope status: aligned with I22 C3 knowledge-leak detection only.
- Compatibility status: I18 remains C3 filter owner; I20 remains the only pass/warn/reject owner; I17 port remains the sole LLM route.
- Retirement status: none required; no predecessor or fallback is being retained.
- Advisory decision: continue to Git closeout.
