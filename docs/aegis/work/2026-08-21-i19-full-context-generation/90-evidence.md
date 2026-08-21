# I19 Full Context Generation — Evidence

- `pnpm run verify:i19`: passed typecheck, 32 test files / 142 tests, build, and `scripts/smoke-i19.mjs`.
- `pnpm run verify:stage-2`: passed cumulative I12–I19 verification.
- Positive coverage: fixed section order, current navigation injection, C3 filtered knowledge, C4 summary, C5 recent prose and distant summary, fake Host LLM candidate collection.
- Negative coverage: hidden C3 fact exclusion; oversized non-truncatable navigation fails closed before LLM invocation.
- Artifact: `samples/i19/held-out.json` is immutable held-out assembly coverage at threshold 0.8. No credentialed real DSH model route was configured locally, so no fabricated real-model score is claimed.
