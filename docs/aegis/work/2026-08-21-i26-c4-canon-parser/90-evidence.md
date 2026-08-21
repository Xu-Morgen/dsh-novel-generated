# I26 C4 正史 parser - Evidence

- Evidence action / check performed: focused `pnpm run typecheck` and `pnpm exec vitest run src/llm/parse/canon.test.ts`.
- Result / exit status: passed; 6 C4 parser tests.
- Covered scope: C4-only prompt projection, strict JSON and op rejection, correction-row current-ledger input, CanonLedger mechanical append consumer, and I11 pending/rejection boundary.
- Uncovered scope: credentialed live DSH model semantic extraction quality.
- Residual risk: controlled fake route proves contract and corpus accounting, not live model judgment.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:i26`.
- Result / exit status: passed; typecheck; 42 Vitest files / 188 tests; TypeScript build and Client bundle; `smoke:i26`.
- Covered scope: repository regression, emitted-library import, fake C4 parser → CanonLedger append, low-confidence pending/rejection boundary, and smoke artifact.
- Uncovered scope: credentialed live DSH model semantic extraction quality.
- Residual risk: immutable 11-case corpus achieved 100% controlled-route accounting, including all three canonical and all three held-out cases, above the 85% threshold.
- Confidence grade: B.

## EvidenceBundleDraft

- Artifact key: verify-i26
- Type: command
- Source: pnpm run verify:i26
- Summary: Passed: typecheck, 42 Vitest files / 188 tests, build, and smoke:i26; frozen corpus 11/11 on controlled fake route including held-out 3/3.
- Verifier: pnpm
