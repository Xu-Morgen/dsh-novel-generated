# I24 LLM 软检查（关系漂移/风格偏离）- Evidence

- Evidence action / check performed: focused I24 test run (`src/llm/validate/relationship-style.test.ts`, `src/host/relationship-style-detection-service.test.ts`, `src/index.test.ts`) and `pnpm run typecheck`.
- Result / exit status: passed; 3 files / 12 tests; typecheck passed.
- Covered scope: C1/B4 prompt projection, strict soft-only model envelope, disclosed-reference fail-closed boundary, I20 warn integration, Host `ctx.llm` facade, and Fiber service disposal.
- Uncovered scope: credentialed live DSH model semantic scoring.
- Residual risk: controlled fake route proves contract and sample-accounting behavior, not live-model judgement.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:i24`.
- Result / exit status: passed; typecheck; 39 Vitest files / 176 tests; build; `smoke:i24`.
- Covered scope: repository regression, emitted library import, fake Host LLM route, C1/B4 soft→I20 warn integration, invalid JSON failure, and smoke artifact.
- Uncovered scope: credentialed real DSH model-route semantic evaluation.
- Residual risk: immutable 10-case corpus achieved 100% controlled-route accounting, above its 80% threshold with all three canonical and all three held-out cases matched.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:stage-3`, additional `pnpm test`, and `git diff --check`.
- Result / exit status: passed; stage I20–I24 and final full suite each passed at 39 files / 176 tests; no whitespace errors.
- Covered scope: Stage 3 accumulation, target and repository-wide regression, build smoke, and patch hygiene.
- Uncovered scope: live credentialed model semantic judgement.
- Residual risk: live response quality remains environment-gated; no fallback or alternate detection path was introduced.
- Confidence grade: A.
