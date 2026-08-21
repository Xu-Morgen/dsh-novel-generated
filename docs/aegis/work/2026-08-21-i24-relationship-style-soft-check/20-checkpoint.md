# I24 LLM 软检查（关系漂移/风格偏离）- Checkpoint

- Task ID: 2026-08-21-i24-relationship-style-soft-check

## Slice Card

- Goal: deliver I24 semantic C1 relationship-drift and B4 style-deviation soft detection through Host LLM and I20 warning consumer.
- Parent plan/spec: development plan I24; design §5.6/§5.8/§9/§9.1; requirements R2-8/R4-5.
- Files: `samples/i24/`, I24 LLM detector/facade tests, smoke, package verify scripts, work record.
- Boundary: no hard reject, vector retrieval, parser, writeback, Client, persistence change, or live endpoint.
- Verification: target tests, `pnpm run verify:i24`, `pnpm run verify:stage-3`, and `pnpm test`.
- Stop: corpus threshold misses, non-soft output accepted, invalid output becomes pass, or scope expands.

## TodoCheckpointDraft

- Current todo: I24 closed.
- Active slice: none.
- Completed todos: baseline read and TaskStartSnapshot; DoD/scope fence; frozen 10-case corpus (three canonical and three held-out); C1/B4 prompt projection; strict soft-only schema and reference assertions; I20 warning consumer; Host `ctx.llm` facade/Fiber wiring; tests; smoke; `verify:i24`; Stage 3 gate; full suite; patch review; and clean commit `6d84f576de3ed40bb3657a1ee0b4b84050251f3d`.
- Evidence refs: focused tests (3 files / 12 tests) plus typecheck; `pnpm run verify:i24` passed (39 files / 176 tests + build + smoke); `pnpm run verify:stage-3` passed; extra `pnpm test` passed; `git diff --check` passed; final repository status is clean.
- Blocked on: none.
- Next step: begin I25 only under its own iteration card.

## DriftCheckDraft

- Scope status: aligned with I24 C1 relationship-drift and B4 style-deviation detection only.
- Compatibility status: I20 remains the sole pass/warn/reject owner; I17 remains the sole LLM route; C1/B4 retain persisted source ownership.
- Retirement status: none required; no predecessor, fallback, or duplicate writer is retained.
- Advisory decision: continue to Git closeout.
