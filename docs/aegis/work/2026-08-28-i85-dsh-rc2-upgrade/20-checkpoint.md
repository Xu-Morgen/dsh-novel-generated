# I85 DSH 0.1.1-rc.2 baseline upgrade - Checkpoint

- Task ID: I85
- Current todo: Read baseline and capture TaskStartSnapshot
- Active slice: Baseline and compatibility inventory
- Blocked on: none
- Next step: Inventory rc.7 references and rc.2 public contracts before edits.

## Checkpoint Update

- Current todo: Inventory rc.7 references and rc.2 contracts
- Active slice: Compatibility inventory and minimal test design
- Completed todos:
- Read I85 baseline and capture TaskStartSnapshot at HEAD 1b643f79
- Evidence refs:
- TaskStartSnapshot: main, HEAD 1b643f79, +3/-0, clean, no Git operation, one worktree
- Baseline read: design §0.1/D20/D23/§14.13; requirements H0-11..13/R17; plan I85
- Blocked on: none
- Next step: Confirm rc.2 public exports and design the minimum I85 smoke without fallback.

## Checkpoint Update

- Current todo: Implement I85 baseline sync and compat gates
- Active slice: Manifest/profile/lockfile sync, production fixes, compat tests, lifecycle smoke
- Completed todos:
- Read baseline and capture TaskStartSnapshot
- Inventory rc.7 references and rc.2 public contracts
- Evidence refs:
- rc.2 GenerateOptions.stop declared (dsh-llm types.d.ts:355); pi-ai rejects stop UNSUPPORTED_OPTION (dsh-llm-pi-ai index.js:1710); deepseek maps stop (types.d.ts:29)
- ToolRuntime.register no arg validation (dsh-tools index.js:2762); defineTool wraps validate (index.js:862); ToolRuntime inject systemPrompt (index.js:2554)
- TypertGatewayService invoke request shape + static inject typert (dsh-api-gateway types.d.ts:6, index.js:50)
- lib .d.ts references dsh-typert-protocol/registry types -> move to dependencies (deliverable 1 conditional)
- Blocked on: none
- Next step: Edit package.json/profile, pnpm install, then production fixes + tests + smoke.

## DriftCheckDraft

- Scope status: I85 deliverables 1-5 done; stage smoke repairs (i33-36) are verification-harness fixes surfaced by acceptance 5, not product changes
- Compatibility status: rc.2 contract held: no domain schema/public wire/prompt/sample/project-data changes; defineTool is the DSH-sanctioned fail-closed mechanism; stop forwarded per 0.1.1-rc.2 GenerateOptions with pi-ai UNSUPPORTED_OPTION explicit
- Retirement status: rc.7 executable pins retired (delete-first); rc.7 text kept only as historical provenance in docs
- New risk signals:
- none
- Advisory decision: continue

## Checkpoint Update

- Current todo: Commit clean I85 commit and report
- Active slice: Commit and closeout
- Completed todos:
- Read baseline and capture TaskStartSnapshot
- Inventory rc.7 references and rc.2 public contracts
- Implement I85 baseline sync and compat gates
- Run verify:i85 and stage key regressions (all green)
- Evidence refs:
- verify:i85 exit 0 (typecheck + 736/736 + build + smoke:i85/i54 + held-out)
- Stage key regressions exit 0: verify:i1/i33/i45/i54/i84; smoke:i34/35/36 repaired
- Blocked on: none
- Next step: Stage I85-owned paths, one clean commit, read back HEAD.
