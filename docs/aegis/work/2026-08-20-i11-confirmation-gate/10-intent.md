# I11 ConfirmationGate - Intent

## TaskIntentDraft

- Requested outcome: Implement the persistent idempotent ConfirmationGate required by development-plan I11.
- Goal: Deliver I11 as one verified commit.
- Success evidence:
- Typecheck, I11 positive and negative regression tests, smoke:i11, verify:i11, and a clean I11 commit.
- Stop condition: Complete on passing verify:i11 and commit; stop on contract conflict, scope expansion, or persistent verification failure.
- Non-goals:
- Do not wire CanonLedger or later business flows.
- Scope: I11 only: confirmation schema, core gate, Host facade, tests, smoke, verification script.
- Change kinds:
- contract
- Risk hints:
- Shared persistent confirmation primitive consumed by all future user-confirmed writes.

## BaselineReadSetHint

- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- src/core/project/index.ts
- src/core/io/yaml.ts

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- src/core/project/index.ts
- src/core/io/yaml.ts
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- src/core/project/index.ts
- src/core/io/yaml.ts
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: No business proposal semantics, Client panel, or LLM integration.
- Affected layers:
- Host-owned core confirmation and project persistence
- Owners:
- src/core/confirm and src/host/confirm-service
- Invariants:
- No proposal applies before acceptance; each accepted proposal applies at most once; rejection never applies; pending survives restart.
- Non-goals:
- Do not wire CanonLedger or later business flows.

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- src/core/project/index.ts
- src/core/io/yaml.ts
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- src/core/project/index.ts
- src/core/io/yaml.ts
- Cited in plan:
- docs/novel-creation-tool-development-plan.md#I11
- docs/novel-creation-tool-requirements.md#R2-9
- Missing refs:
- none
- Advisory decision: continue
