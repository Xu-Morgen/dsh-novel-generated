# I85 DSH 0.1.1-rc.2 baseline upgrade - Evidence

No evidence has been recorded yet.

## EvidenceBundleDraft

- Artifact key: verify-i85
- Type: command
- Source: pnpm run verify:i85
- Summary: typecheck + 736/736 tests + build + smoke:i85 (rc2 negative scan, real base+web+plugin CLI boot/HTTP/stop/restart/uninstall, in-process service boot/stop/restart, Client ModuleLoader materialization) + smoke:i54 + smoke:samples held-out (I43 median=0.1, I44 9/10, I45 0.9) all exit 0
- Verifier: coordinator

## EvidenceBundleDraft

- Artifact key: stage-key-regressions
- Type: command
- Source: verify:i1 / verify:i33 + smoke:i34..i36 / verify:i45 / verify:i54 / verify:i84
- Summary: Stage 0 (i1), Stage 6 (i33 + i34/35/36 smoke incl. pre-existing Windows path + stale I46 anchor repairs), Stage 8 (i45), Stage 11 (i54), Stage 15 (i84) all exit 0; full suite 736/736 stable across reruns
- Verifier: coordinator

## EvidenceBundleDraft

- Artifact key: pin-and-negative-scans
- Type: static
- Source: manifest.test.ts / client-contract.test.ts / smoke-i85 Part 0 / smoke-i54
- Summary: manifest/profile/lockfile all exact 0.1.1-rc.2; lockfile + manifest rc.7-residue negative scans pass; typert packages moved to production dependency face per published .d.ts consumer need (deliverable 1 conditional)
- Verifier: coordinator
