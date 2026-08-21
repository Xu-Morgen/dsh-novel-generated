# I26 C4 正史 parser - Intent

## TaskIntentDraft

- Requested outcome: 完成 I26：将已接受正文解析为 C4 CanonEvent append/supersede proposal，并严格保持账本 append-only。
- Goal: 为正文→C4 正史事实建立单层、严格且可验证的 Host LLM parser seam。
- Success evidence: 预先冻结至少 10 个样本（含 canonical 与 held-out）；控制 fake backend 的 overall 与 held-out 均 ≥85%；严格 proposal schema；CanonLedger 消费者夹具；非法 JSON/op/旧行改写 fail closed；`confidence < medium` 仅产生 I11 pending proposal；拒绝后账本零写入；`pnpm run verify:i26` 通过。
- Stop condition: 接触其他层 parser、改写旧正史行、跨层编排、未确认的低置信写入、或样本阈值未达标。
- Non-goals: C2/C1/C3/B2 parser、完整生命周期、Client、真实 endpoint、跨层事务。
- Scope: I26 frozen samples、C4 parser/schema/apply seam、测试、smoke、verify 脚本和本工作记录。
- Change kinds: code
- Risk hints: 模型语义质量仅以冻结语料上的控制 fake route 验证；生产模型质量仍受环境约束。

## BaselineReadSetHint

- `AGENTS.md`
- `docs/novel-creation-tool-design.md` §5.11、§6.2、§6.6
- `docs/novel-creation-tool-development-plan.md` I26 与阶段 4
- `docs/novel-creation-tool-requirements.md` R1-C4、R2-2、R2-7、R5-2
- I5 `src/core/schema/canon.ts` 与 `src/core/canon/index.ts`
- I11 `src/core/confirm/index.ts`
- I17 `src/llm/port/index.ts`
- I25 `src/llm/parse/state.ts`（LLM parser 边界模式）

## BaselineUsageDraft

- Required baseline refs: all items in BaselineReadSetHint.
- Acknowledged before plan: all listed references.
- Cited in implementation: design §5.11/§6.2/§6.6; plan I26; requirements R1-C4/R2-2/R2-7/R5-2.
- Missing refs: none.
- Advisory decision: continue.

## ImpactStatementDraft

- Compatibility boundary: CanonLedger remains the sole C4 append/supersede and sequence owner; ConfirmationGate remains the sole confirmation owner; I17 port remains the Host LLM route owner.
- Affected layers: C4 parser seam only.
- New owner: I26 parser recognizes strict append/supersede proposals; the deterministic applier dispatches validated proposals only to CanonLedger append/supersede methods.
- Invariants: parser cannot output update/delete; correction must target an extant active CanonEvent; no ledger write occurs before a low-confidence proposal is accepted; rejection leaves ledger unchanged.
- Non-goals: no other parser, no cross-layer orchestration, and no second natural-language interpretation path.

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md
- design §§5.11,6.2,6.6
- plan I26
- requirements R1-C4,R2-2,R2-7,R5-2
- I5 CanonLedger/schema
- I11 ConfirmationGate
- I17 LLM port
- I25 parser pattern
- Delivered context refs:
- none
- Acknowledged before plan:
- AGENTS.md
- design §§5.11,6.2,6.6
- plan I26
- requirements R1-C4,R2-2,R2-7,R5-2
- I5 CanonLedger/schema
- I11 ConfirmationGate
- I17 LLM port
- I25 parser pattern
- Cited in plan:
- design §§5.11,6.2,6.6
- plan I26
- requirements R1-C4,R2-2,R2-7,R5-2
- Missing refs:
- none
- Advisory decision: continue
