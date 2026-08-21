# I28 C3 知情 parser — Evidence

- Evidence action / check performed: `pnpm run verify:i28`.
- Result / exit status: passed (0); typecheck, full Vitest suite (46 files / 202 tests), build, and I28 smoke all passed.
- Covered scope: strict JSON output; existing C3 target/state validation; holders/`KnowledgeState.knows` synchronization; one-step `hidden → partially-revealed → revealed`; reverse/cross-level rejection; low-confidence I11 pending/rejection; Host `ctx.llm` adapter/Fiber disposal; frozen corpus 10/10 including held-out 3/3 (100%, threshold 80%).
- Uncovered scope: live credentialed-model extraction and I30 fan-out/atomicity are later work.
- Residual risk: live model outputs may require future prompt-quality tuning but cannot bypass the strict parser/repository boundary.
- Confidence grade: A.
