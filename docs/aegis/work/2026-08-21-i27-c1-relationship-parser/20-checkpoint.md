# I27 C1 关系 parser - Checkpoint

- Task ID: 2026-08-21-i27-c1-relationship-parser
- Current todo: 冻结 I27 样本并定义严格 C1 operation 契约。
- Active slice: samples and contract
- Blocked on: none
- Next step: Create immutable samples/i27 corpus before parser implementation.

## Checkpoint Update

- Current todo: 运行 I27 全量验证并审查 Git closeout。
- Active slice: full verification and closeout
- Completed todos:
- TaskStartSnapshot、DoD/基线读取、冻结 11-case corpus、严格 C1 create/modify schema、C1-only Host parser、RelationshipRepository consumer fixture、I11 low-confidence pending/rejection boundary、Host facade、focused tests and smoke.
- Evidence refs:
- pnpm run typecheck passed; focused Vitest: 3 files / 13 tests passed.
- Blocked on: none
- Next step: Run pnpm run verify:i27, inspect the task-owned diff, then commit only I27 paths.

## DriftCheckDraft

- Scope status: Aligned with C1 parser only; no RelationshipEngine, C3/B2 parser, Client, or orchestration introduced.
- Compatibility status: RelationshipRepository remains C1 persistence/invariant owner; I17 port remains Host LLM route owner; I11 owns low-confidence confirmation; C1 knownTo remains separate from C3.
- Retirement status: No fallback, old automatic C1 writer, or RelationshipEngine path introduced.
- New risk signals:
- none
- Advisory decision: continue

## Checkpoint Update

- Current todo: 完成 I27 Git closeout。
- Active slice: Git closeout
- Completed todos:
- TaskStartSnapshot、DoD/基线读取、冻结 11-case corpus、严格 C1 create/modify schema、C1-only Host parser、RelationshipRepository consumer fixture、I11 low-confidence pending/rejection boundary、Host facade、focused tests、smoke 与 pnpm run verify:i27。
- Evidence refs:
- pnpm run verify:i27 passed: typecheck, 44 Vitest files / 195 tests, build, smoke:i27; frozen corpus 11/11 including held-out 3/3.
- Blocked on: none
- Next step: Commit only the I27-owned files.
