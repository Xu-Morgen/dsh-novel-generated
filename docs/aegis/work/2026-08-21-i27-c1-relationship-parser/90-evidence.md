# I27 C1 关系 parser - Evidence

- Evidence action / check performed: focused `pnpm run typecheck` and `pnpm exec vitest run src/llm/parse/relationship.test.ts src/host/relationship-parser-service.test.ts src/index.test.ts`.
- Result / exit status: passed; 3 test files / 13 tests.
- Covered scope: C1-only prompt projection, strict JSON/op rejection, C1 repository mechanical consumer fixture, I11 low-confidence pending/rejection boundary, Host service surface, and Fiber wiring/disposal.
- Uncovered scope: credentialed live DSH-model semantic extraction quality and later I30 cross-layer atomic coordination.
- Residual risk: controlled fake route proves contract and corpus accounting, not live model judgment.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:i27`.
- Result / exit status: passed; typecheck; 44 Vitest files / 195 tests; TypeScript build and Client bundle; `smoke:i27`.
- Covered scope: repository regression, emitted-library import, fake C1 parser → RelationshipRepository write, C1 invariant rejection, low-confidence I11 pending/rejection, Host facade/Fiber cleanup, and frozen corpus accounting.
- Uncovered scope: credentialed live DSH-model semantic extraction quality and future cross-layer orchestration.
- Residual risk: immutable 11-case corpus achieved 100% controlled-route accounting, including all three canonical and three held-out cases, above the 80% threshold.
- Confidence grade: B.

## EvidenceBundleDraft

- Artifact key: verify-i27
- Type: command
- Source: pnpm run verify:i27
- Summary: Passed: typecheck; 44 Vitest files / 195 tests; build including client bundle; smoke:i27. Frozen corpus matched 11/11 on controlled fake route, with held-out 3/3, above 80% threshold.
- Verifier: pnpm
