# I25 C2 状态 parser - Intent

## TaskIntentDraft

- Requested outcome: 完成 I25：将已接受正文解析成严格 C2 ops，并由 StateEngine 机械应用。
- Goal: 为正文→C2 状态变更建立单层、严格且可验证的 LLM parser seam。
- Success evidence: frozen corpus 至少 10 例且含 canonical/held-out，控制 fake backend 总体和 held-out 均 ≥80%；严格 op schema；StateEngine 消费者夹具；非法 target/field/action fail closed；低置信仅提出 I11 Gate proposal；`pnpm run verify:i25` 通过。
- Stop condition: 接触其他层 parser、跨层编排、二次自然语言解释、未通过 Gate 的写回、或样本阈值未达标。
- Non-goals: C1/C3/C4/B2 parser、完整生命周期、Client、真实 endpoint、跨层事务。
- Scope: I25 frozen samples、C2 parser/schema/apply seam、测试、smoke、verify 脚本和本工作记录。
- Change kinds: code
- Risk hints: 模型语义质量仅以冻结语料上的控制 fake route 验证；生产模型质量仍受环境约束。

## BaselineReadSetHint

- `AGENTS.md`
- `docs/novel-creation-tool-design.md` §5.9、§6.6
- `docs/novel-creation-tool-development-plan.md` I25 与 §0.6
- `docs/novel-creation-tool-requirements.md` R1-C2、R2-7、R5-1
- I4 `src/core/schema/state.ts` 与 `src/core/state/index.ts`
- I11 `src/core/confirm/index.ts`
- I17 `src/llm/port/index.ts`

## BaselineUsageDraft

- Required baseline refs: all items in BaselineReadSetHint.
- Acknowledged before plan: all listed references.
- Cited in implementation: design §6.6; plan I25; requirements R1-C2/R2-7/R5-1.
- Missing refs: none.
- Advisory decision: continue.

## ImpactStatementDraft

- Compatibility boundary: StateEngine remains the sole C2 snapshot/transaction owner; ConfirmationGate remains the sole confirmation owner; I17 port remains the LLM route owner.
- Affected layers: C2 parser seam only.
- New owner: I25 parser recognizes strict C2 ops; the deterministic applier only maps validated ops to a supplied StateEngine transaction.
- Invariants: no output outside exact C2 envelope; target and field are checked against the supplied state; low confidence never writes state before I11 acceptance.
- Non-goals: no other parser, no cross-layer orchestration, and no second interpretation path.

These records are Method Pack drafts / hints, not authoritative runtime decisions.
