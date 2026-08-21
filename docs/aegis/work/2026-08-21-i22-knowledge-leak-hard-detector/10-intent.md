# I22 知情泄漏硬约束检测器 - Intent

## TaskIntentDraft

- Requested outcome: 完成 I22：仅以过滤后的 POV 视图界定可知事实，通过 Host ctx.llm 检测正文知情泄漏并交由 I20 拒绝。
- Goal: 完成 I22：仅以过滤后的 POV 视图界定可知事实，通过 Host ctx.llm 检测正文知情泄漏并交由 I20 拒绝。
- Success evidence:
  - Frozen corpus has at least 15 cases, five canonical and five held-out; canonical is 100% and overall score is at least 90%.
  - The detector derives the POV-known projection through I18 `filterKnowledge`, emits only hard `knowledge-leak` findings, rejects through I20, and fails closed for malformed output or known/unknown references.
  - `pnpm run verify:i22` passes.
- Stop condition: Any implementation of rule/canon detection, soft checks, parser, writeback, Client, or live endpoint work; or an unresolved baseline/contract conflict.
- Non-goals:
  - I21 B1/C4 detection semantics, I23/I24 soft checks, parser, persistence writes, Client UI, and a credentialed endpoint.
- Scope: I22 detector, frozen samples, Host facade, tests, smoke, verify, work record
- Change kinds:
- code
- Risk hints:
- none

## BaselineReadSetHint

- `AGENTS.md`
- `docs/novel-creation-tool-design.md` §5.10, §8, §9.1
- `docs/novel-creation-tool-development-plan.md` I22
- `docs/novel-creation-tool-requirements.md` R1-C3, R2-8, R4-3
- I18 `src/core/knowledge/filter.ts` and C3 schemas
- I20 `src/core/validate/index.ts`
- I17 `src/llm/port/index.ts`
- I21 detector/facade as the compatible Host-LLM pattern

## BaselineUsageDraft

- Required baseline refs: design §5.10/§8/§9.1; plan I22; requirements R1-C3/R2-8/R4-3; I17 port; I18 filter/C3 schema; I20 adjudicator; I21 compatible Host-LLM pattern.
- Acknowledged before plan: `AGENTS.md`, plan I22, requirements, design, and I17/I18/I20/I21 implementation seams.
- Cited in plan: design §5.10/§8/§9.1; plan I22; requirements R1-C3/R2-8/R4-3.
- Missing refs: none.
- Advisory decision: continue

## ImpactStatementDraft

- Compatibility boundary: Compatibility boundary not yet refined.
- Affected layers:
- none
- Owners:
- none
- Invariants:
- none
- Non-goals:
- none

These records are Method Pack drafts / hints, not authoritative runtime decisions.
