# I85 DSH 0.1.1-rc.2 baseline upgrade - Intent

## TaskIntentDraft

- Requested outcome: Atomically upgrade the reproducible DSH family baseline to 0.1.1-rc.2 and prove the complete compatibility gate.
- Goal: Make 0.1.1-rc.2 the sole project DSH family pin only after base+web+plugin, Client, Remote, Tools, LLM, and lifecycle evidence passes.
- Success evidence:
- verify:i85 and verify:stage-16 pass; exact pins and negative scans pass; no domain/wire/sample/project-data drift; one clean I85 commit.
- Stop condition: done when all I85 acceptance gates and commit closeout pass; blocked on unavailable public contract or repeated same external failure; needs-verification on partial evidence; scope-exceeded on domain/public-contract changes.
- Non-goals:
- No product features or unrelated dependency upgrades.
- Scope: package/profile/lockfile sync, I85 compatibility smoke and tests, two awaited resolves fixes, I54 gate refresh, acceptance evidence and commit.
- Change kinds:
- baseline-compatibility
- Risk hints:
- Host upgrade can expose public contract drift; mixed rc.7/rc.2 or fallback is forbidden.

## BaselineReadSetHint

- docs/novel-creation-tool-design.md v2.4 §0.1/D20/D23/§14.13
- docs/novel-creation-tool-requirements.md v2.4 H0-11..13/R17
- docs/novel-creation-tool-development-plan.md v2.4 I85 lines 826-838

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md v2.4 §0.1/D20/D23/§14.13
- docs/novel-creation-tool-requirements.md v2.4 H0-11..13/R17
- docs/novel-creation-tool-development-plan.md v2.4 I85 lines 826-838
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- docs/novel-creation-tool-design.md v2.4 §0.1/D20/D23/§14.13
- docs/novel-creation-tool-requirements.md v2.4 H0-11..13/R17
- docs/novel-creation-tool-development-plan.md v2.4 I85 lines 826-838
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: No domain schema, public Service/Remote/wire, prompt/sample/gold/threshold, or project data changes; no rc.7 fallback.
- Affected layers:
- manifest/profile/lockfile, Host and Client compatibility tests, verification scripts
- Owners:
- I85 compatibility gate; production domain owners remain unchanged
- Invariants:
- ordinary persistent Cordis plugin, one bundle insertion owner, Host owns truth, Fiber disposal removes side effects
- Non-goals:
- No product features or unrelated dependency upgrades.

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md v2.4 §0.1/D20/D23/§14.13
- docs/novel-creation-tool-requirements.md v2.4 H0-11..13/R17
- docs/novel-creation-tool-development-plan.md v2.4 I85 lines 826-838
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-design.md:45-69,901-904,1066-1074
- docs/novel-creation-tool-requirements.md:66-79,300-310
- docs/novel-creation-tool-development-plan.md:820-838,867-871
- Cited in plan:
- D23 exact atomic baseline switch; R17 compatibility gates; I85 scope/non-goals/rollback
- Missing refs:
- none
- Advisory decision: continue
