# I22 知情泄漏硬约束检测器 - Evidence

- Evidence action / check performed: focused I22 test run (`src/llm/validate/knowledge.test.ts`, `src/host/knowledge-leak-detection-service.test.ts`, `src/index.test.ts`).
- Result / exit status: passed; 3 files / 11 tests.
- Covered scope: I18-derived POV projection, strict model envelope/reference fail-closed boundary, I20 reject consumer, Host `ctx.llm` facade, and Fiber service disposal.
- Uncovered scope: credentialed live DSH model semantic scoring.
- Residual risk: the fake route returns frozen corpus answers by construction, so it proves contracts and scoring accounting rather than live-model judgement.
- Confidence grade: B.

- Evidence action / check performed: `pnpm run verify:i22`.
- Result / exit status: passed (typecheck; 37 Vitest files / 165 tests; build; `smoke:i22`).
- Covered scope: repository regression, emitted library import, fake Host LLM route, C3 leak hard→I20 reject integration, invalid JSON failure, and smoke artifact.
- Uncovered scope: credentialed real DSH model-route semantic evaluation.
- Residual risk: live-model response quality remains environment-gated; the immutable 15-case corpus reached 100% controlled-route accounting, above its 90% threshold with all five canonical and all five held-out cases matched.
- Confidence grade: B.

- Evidence action / check performed: `git diff --check` and task-owned path review.
- Result / exit status: passed; no whitespace errors; modified/untracked paths are I22 implementation, test, sample, smoke, script, and continuity-record artifacts only.
- Covered scope: patch hygiene and declared I22 scope boundary.
- Uncovered scope: repository-wide historical workspace-index integrity.
- Residual risk: the Aegis workspace helper's full `check --root .` reports pre-existing unindexed I12/I19/I21 markdown records; I22's generated records are indexed and this iteration does not modify those earlier workstreams.
- Confidence grade: B.
