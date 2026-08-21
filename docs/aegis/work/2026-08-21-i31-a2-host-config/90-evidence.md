# I31 A2 Host 配置 - Evidence

No evidence has been recorded yet.

## EvidenceBundleDraft

- Artifact key: verify-i31
- Type: command
- Source: pnpm run verify:i31
- Summary: passed: typecheck, 53 test files / 223 tests, build, and I31 smoke
- Verifier: pnpm

## EvidenceBundleDraft

- Artifact key: diff-check
- Type: command
- Source: git diff --check
- Summary: passed: no whitespace errors in I31 working-tree diff
- Verifier: git

## EvidenceBundleDraft

- Artifact key: verify-i31-final
- Type: command
- Source: pnpm run verify:i31
- Summary: passed after public DSH credential/GenerateOptions contract repair: typecheck, 53 test files / 225 tests, build, I31 smoke
- Verifier: pnpm

## EvidenceBundleDraft

- Artifact key: dsh-contract
- Type: source-inspection
- Source: @deepseek-ai/dsh-llm lib/types/types.d.ts:332-356; @deepseek-ai/dsh-credentials lib/types/index.d.ts:46-56
- Summary: GenerateOptions supports temperature/maxTokens/stop only; ctx.credentials resolves one SecretRef per operation.
- Verifier: repository inspection
