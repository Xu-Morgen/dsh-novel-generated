# I12 ContextAssembler - Evidence

## EvidenceBundleDraft

- Artifact key: authority-readback
- Type: baseline
- Source: docs/novel-creation-tool-development-plan.md#I12; docs/novel-creation-tool-design.md#§6,§8; docs/novel-creation-tool-requirements.md#R2-6,R3-1.
- Summary: I12 is Host/core-only, B1→B4 ordered, deterministic, fixed-budget assembly with complete user/pov macro expansion and no dynamic budget, Client, LLM, or later serializers.

## EvidenceBundleDraft

- Artifact key: advisory-review
- Type: independent review
- Source: working-tree advisory review before commit.
- Summary: No Critical findings. Repaired two Important findings (dynamic per-request budget and mutable order) and one Minor finding (macro-capable heading); no duplicate owner, fallback, DSH boundary violation, or ADR need found.

## EvidenceBundleDraft

- Artifact key: verify-i12-post-review
- Type: command
- Source: pnpm run verify:i12
- Summary: Passed typecheck; 23 Vitest files / 105 tests; TypeScript build; I12 smoke covering deterministic B1/B4 assembly, fixed order, macro expansion, and budget rejection.
- Verifier: pnpm

## EvidenceBundleDraft

- Artifact key: diff-check
- Type: command
- Source: git diff --check
- Summary: No whitespace error reported for the I12 working-tree delta before commit.
