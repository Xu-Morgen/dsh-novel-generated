# I24 LLM 软检查（关系漂移/风格偏离）- Intent

## TaskIntentDraft

- Requested outcome: 完成 I24：通过 Host `ctx.llm` 对 C1 关系漂移与 B4 风格偏离进行语义软检查，并将严格结构化发现交由 I20 返回警告。
- Goal: 完成 I24：通过 Host `ctx.llm` 对 C1 关系漂移与 B4 风格偏离进行语义软检查，并将严格结构化发现交由 I20 返回警告。
- Success evidence:
  - Frozen corpus has at least 10 cases, canonical and held-out subsets, and at least 80% overall accuracy.
  - The detector accepts only `relationship-drift` and `style-deviation` soft findings referencing disclosed C1 or B4 sources; malformed output and undisclosed references fail closed.
  - Every valid finding delegates to I20 and returns `warn`, never `reject`.
  - `pnpm run verify:i24` and `pnpm run verify:stage-3` pass.
- Stop condition: any hard-reject semantics, vector retrieval, parser/writeback, Client, persistence, live credentialed endpoint, or unresolved baseline conflict.
- Non-goals: hard rejection; vector retrieval; parser; writeback; Client; real endpoint.
- Scope: I24 sample corpus, LLM detector, Host facade/Fiber lifecycle wiring, tests, smoke, verify scripts, and work record.
- Change kinds: code
- Risk hints: semantic quality uses controlled fake-backend corpus accounting; live credentialed model quality remains environment-gated.

## BaselineReadSetHint

- `AGENTS.md`
- `docs/novel-creation-tool-design.md` §5.6, §5.8, §9, §9.1
- `docs/novel-creation-tool-development-plan.md` I24
- `docs/novel-creation-tool-requirements.md` R2-8, R4-5
- I17 `src/llm/port/index.ts`
- I20 `src/core/validate/index.ts`
- C1 `src/core/schema/relationship.ts` and B4 `src/core/schema/style.ts`
- I21/I22 detector and Host facade patterns

## BaselineUsageDraft

- Required baseline refs: design §5.6/§5.8/§9/§9.1; plan I24; requirements R2-8/R4-5; I17 port; I20 adjudicator; C1/B4 schemas; I21/I22 Host-LLM patterns.
- Acknowledged before plan: all listed references.
- Cited in implementation: design §9/§9.1; plan I24; requirements R2-8/R4-5.
- Missing refs: none.
- Advisory decision: continue.

## ImpactStatementDraft

- Compatibility boundary: I20 remains sole pass/warn/reject owner; I17 remains LLM route owner; C1/B4 remain persisted-source owners.
- Affected layers: I24 LLM detection and Host facade only.
- New owner: I24 detector owns semantic relationship/style finding and no data mutation.
- Invariants: output is strictly soft; references identify only disclosed C1 relationship IDs or B4 style ID; invalid output is an error, never a pass.
- Non-goals: no parser, writeback, Client, hard constraint, or vector retrieval.

These records are Method Pack drafts / hints, not authoritative runtime decisions.
