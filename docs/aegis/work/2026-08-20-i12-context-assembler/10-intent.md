# I12 ContextAssembler - Intent

## TaskIntentDraft

- Requested outcome: Complete I12 ContextAssembler kernel from the v2.0 development plan.
- Goal: Deliver one verified I12 commit containing the deterministic assembler framework, B1/B4 serializers, macro expansion, and fixed budget enforcement.
- Success evidence: Positive, negative, and consumer-fixture tests; smoke:i12; pnpm run verify:i12; a clean single I12 commit.
- Stop condition: Complete when verify:i12 passes and the task-owned delta is committed; stop for contract conflict, scope expansion, or persistent verification failure.
- Non-goals: B2/B3/C2 serializers, LLM invocation, dynamic budgets, Client code, project-storage API changes, or revisions to prior iteration behavior.
- Scope: src/core/assemble, I12 tests, smoke script, package verification wiring, and the I12 plan/design budget contract backfill only.
- Change kind: shared core contract.
- Risk hints: Stable section ordering, budget semantics, and macro failure modes become dependencies of all later injectors and generation paths.

## Slice Card

- Goal: Provide the I12 deterministic context-assembly kernel.
- Parent plan/spec: docs/novel-creation-tool-development-plan.md#I12; docs/novel-creation-tool-design.md#§8; docs/novel-creation-tool-requirements.md#R2-6,R3-1.
- Files: src/core/assemble/*, scripts/smoke-i12.mjs, package.json, this work record.
- Boundary: only B1 and B4 are serialized; no persistence or runtime service owner changes.
- Verification: pnpm run verify:i12.
- Stop: pause on an authority conflict or an I12 verification failure that cannot be resolved inside the stated boundary.

## BaselineReadSetHint

- docs/novel-creation-tool-development-plan.md#I12
- docs/novel-creation-tool-design.md#§6,§8
- docs/novel-creation-tool-requirements.md#R2-6,R3-1
- src/core/schema/rules.ts
- src/core/rules/index.ts
- src/core/schema/style.ts
- src/core/style/index.ts
- package.json

## BaselineUsageDraft

- Required baseline refs: all entries in BaselineReadSetHint.
- Acknowledged before implementation: all entries in BaselineReadSetHint.
- Cited in slice: development-plan I12; design §6/§8; requirements R2-6/R3-1.
- Missing refs: none.
- Advisory decision: continue.

## ImpactStatementDraft

- Compatibility boundary: The assembler consumes caller-owned structured B1/B4 views and returns owned prompt text. It owns no files, LLM calls, Client state, or domain truth.
- Owner / contract constraints: src/core/assemble is the sole I12 assembly owner; existing repositories remain structured-data owners; later layers add serializers through the assembler extension point rather than alter B1/B4 semantics.
- Invariants: Stable fixed section order; valid macro values fully resolve; unknown/leftover macros fail; section and aggregate budgets are enforced deterministically.
- Retirement boundary: no predecessor assembler or compatibility fallback exists.

These records are Method Pack drafts / hints, not authoritative runtime decisions.
