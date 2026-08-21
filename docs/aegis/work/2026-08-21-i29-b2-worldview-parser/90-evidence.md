# I29 B2 世界观改写 parser — Evidence

- Evidence action / check performed: `pnpm run typecheck` and focused Vitest for I29 parser/service/plugin wiring.
- Result / exit status: passed; 3 files / 15 tests.
- Covered scope: strict B2-only schema, Host `ctx.llm` facade, unconfirmed and rejected zero-write boundaries, accepted/replayed `WorldRepository` rewrite, frozen corpus wiring.
- Evidence action / check performed: `pnpm run verify:i29`.
- Result / exit status: passed; typecheck, 48 test files / 209 tests, TypeScript build, Client bundle build, and `scripts/smoke-i29.mjs`.
- Covered scope: full repository regression plus I29 smoke: proposal remains pending before I11 accept; acceptance marks old entry `rewritten`, links `supersededBy`, and creates an active replacement.
- Sample regression: frozen `samples/i29/cases.json` contains 10 cases; held-out 3/3 and overall 10/10 on controlled fake backend (100%, threshold 80%).
- Uncovered scope: live credentialed DSH-model extraction quality; I30 cross-layer atomic lifecycle.
- Residual risk: the parser validates only B2 and serially invokes existing repository rewrites; future I30 owns cross-layer compensation.
- Confidence grade: A for the bounded I29 contract.
