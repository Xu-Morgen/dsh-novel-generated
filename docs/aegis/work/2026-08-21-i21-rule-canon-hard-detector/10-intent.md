# I21 规则/正史硬约束检测器 - Intent

## TaskIntentDraft

- Requested outcome: 完成 I21：通过 Host `ctx.llm` 将 prose 转为 B1 immutable 与 C4 正史的结构化硬违规，并接入 I20 裁决器。
- Goal: 以严格 schema、fail-closed 解析和冻结样本证明规则/正史硬约束检测的最小闭环。
- Success evidence:
  - 至少 15 个冻结样本，包含 held-out 子集；canonical 100%、总体 ≥90%。
  - 输出严格 schema；模型输出非法时 fail closed；I20 裁决为 reject。
  - `pnpm run verify:i21` 通过。
- Stop condition: 检测扩展到 I22 知情、软检查、parser、写回或 Client；或 baseline/契约冲突无法消解。
- Non-goals: I22 知情泄漏、I23/I24 软检查、parser、落库、UI、真实 endpoint。
- Scope: `src/llm/validate/` 的 Host LLM 规则/正史检测器，I20 consumer fixture，样本、测试、smoke、验证脚本与本工作记录。
- TDD Route: Mode off / Decision skipped / Strict authority not applicable / post-change regression + negative tests + smoke.

## BaselineReadSetHint

- `AGENTS.md`
- `docs/novel-creation-tool-design.md` §9/§9.1
- `docs/novel-creation-tool-development-plan.md` §0.6/I21
- `docs/novel-creation-tool-requirements.md` R1-B1/R2-8/R4-2
- `src/core/validate/index.ts` (I20 structured violation/adjudication contract)
- `src/llm/port/index.ts` (I17 Host LLM port)
- `src/core/schema/rules.ts` and `src/core/schema/canon.ts`

## ImpactStatementDraft

- Owner boundary: I21 owns LLM semantic detection and strict output parsing under `src/llm/validate/`; I20 continues to own only structured-violation adjudication.
- Compatibility boundary: detector consumes prose plus B1/C4 context and reuses the injected Host LLM port; no persistence or Client owner is introduced.
- Invariants: only active immutable rules and supplied canon enter the prompt; every emitted finding is hard; malformed model output throws rather than passing; the I20 consumer result rejects hard findings.
- Retirement boundary: no predecessor or fallback path is replaced or retained.

## TaskStartSnapshot

- Root: `C:\Users\nemo5\Desktop\dsh`
- HEAD: `9b417ac046918d716c48d3c32f1f30dc72ace720` (`feat(I20): add deterministic consistency adjudicator`)
- Branch: `main`; upstream divergence: `0 4`.
- Staged/unstaged/untracked task paths: none.
- Active Git operation: none.
- Worktree: `C:/Users/nemo5/Desktop/dsh` on `refs/heads/main`.

These records are Method Pack drafts / hints, not authoritative runtime decisions.
