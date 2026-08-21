# I21 规则/正史硬约束检测器 - Evidence

- Evidence action / check performed: `pnpm run typecheck` after the readonly I20-view contract repair.
- Result / exit status: passed (exit 0).
- Covered scope: I21 detector/public return type against existing I20 shared types.
- Uncovered scope: credentialed real DSH model-route semantic scoring.
- Residual risk: model semantic quality is evaluated through the frozen fake-route regression corpus only in this environment.
- Confidence grade: B.

- Evidence action / check performed: `pnpm test -- src/llm/validate/index.test.ts`.
- Result / exit status: 4 tests passed.
- Covered scope: prompt projection, hard→I20 reject consumer fixture, malformed/soft/unknown output failure, 15-case corpus with canonical and held-out subsets.
- Uncovered scope: full plugin Host composition with a credentialed DSH route.
- Residual risk: fake LLM returns the corpus answer by construction; it proves contract enforcement and regression accounting, not live-model quality.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:i21`.
- Result / exit status: passed (typecheck; 34 Vitest files/153 tests; build; `smoke:i21`).
- Covered scope: repository regression, emitted library import, fake Host LLM route, invalid JSON fail-closed, I20 reject integration.
- Uncovered scope: credentialed real DSH model semantic evaluation, deferred because no runtime credential route is available in this iteration environment.
- Residual risk: live-model response quality remains environment-gated; frozen corpus threshold is 90% and achieved 100% by its controlled fake-route regression.
- Confidence grade: B.

- Evidence action / check performed: review finding repair followed by `pnpm run verify:i21`.
- Result / exit status: passed (typecheck; 35 Vitest files/156 tests; build; `smoke:i21`).
- Covered scope: ordinary plugin `ctx.llm` → I21 Host facade → strict detector → I20 reject; Fiber disposal registration; runtime settings rejection; undisclosed rule/canon reference rejection.
- Uncovered scope: credentialed real DSH model semantic evaluation.
- Residual risk: fake-route corpus exercises contract and scoring accounting, but its generated response is controlled rather than a live model judgement.
- Confidence grade: B.
