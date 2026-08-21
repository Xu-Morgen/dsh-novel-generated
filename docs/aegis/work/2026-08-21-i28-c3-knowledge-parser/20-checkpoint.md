# I28 C3 知情 parser — Checkpoint

- Current todo: review verified diff and produce the I28-only commit.
- Active slice: completion closeout.
- Completed todos: baseline/task-start snapshot; strict C3 operation contract; mechanical materialization; repository persistence; I11 low-confidence proposal; Host facade/wiring; frozen corpus; smoke; complete I28 verification.
- Evidence refs: plan I28; design §5.10/§6.6; requirements R1-C3/R5-4; `src/core/schema/knowledge.ts`; `src/core/knowledge/index.ts`; `pnpm run verify:i28` (46 files / 202 tests, build and smoke passed).
- Blockers: none.
- Next step: inspect staged I28 paths, commit, and read back the Git receipt.

## Drift Check Draft

- Intent/scope: aligned with I28 only.
- Compatibility/retirement: no fallback, adapter duplication, or retained legacy writer introduced; `KnowledgeRepository` remains canonical C3 write owner.
- Test/review lock: schema, reverse/cross-level negative cases, repository consumer fixture, I11 pending behavior, corpus held-out ≥80%, smoke all passed.
- PatchShape: none; the parser's materializer is the sole new C3 operation adapter and `KnowledgeRepository` remains canonical persistence owner.
- Decision: continue to commit closeout.
