# I27 C1 关系 parser - Intent

## TaskIntentDraft

- Requested outcome: 完成 I27：将已接受正文解析为严格 C1 关系新增/变更操作，并由 C1 repository 机械应用。
- Goal: 建立正文到 C1 的单层严格 Host LLM parser seam，同时保持 parser 为默认唯一 C1 自动写入者。
- Success evidence:
- 冻结至少 10 个样本（含 canonical 与 held-out），controlled fake backend 的 overall 与 held-out 均 >=80%，严格 schema，C1 repository 消费者夹具，非法 JSON/op/target/field/value fail closed，无第二默认 C1 写入路径，pnpm run verify:i27 通过。
- Stop condition: 接触 RelationshipEngine、C3/B2 parser、跨层编排、Client、真实 endpoint，或样本阈值未达标。
- Non-goals:
- No RelationshipEngine, knowledge/worldview parsing, cross-layer orchestration, Client, or direct endpoint.
- Scope: I27 frozen samples、C1 parser/schema/apply seam、Host facade、测试、smoke、verify 脚本和工作记录。
- Change kinds:
- code
- Risk hints:
- 控制 fake route 仅验证契约和语料计量；实时 DSH 模型的抽取质量仍依赖环境。

## BaselineReadSetHint

- AGENTS.md
- docs/novel-creation-tool-design.md §5.8, §6.5, §6.6
- docs/novel-creation-tool-development-plan.md I27
- docs/novel-creation-tool-requirements.md R1-C1, R2-5, R2-7, R5-3
- src/core/schema/relationship.ts and src/core/relationship/index.ts
- src/llm/parse/state.ts and src/llm/parse/canon.ts
- src/llm/port/index.ts

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md
- docs/novel-creation-tool-design.md §5.8, §6.5, §6.6
- docs/novel-creation-tool-development-plan.md I27
- docs/novel-creation-tool-requirements.md R1-C1, R2-5, R2-7, R5-3
- src/core/schema/relationship.ts and src/core/relationship/index.ts
- src/llm/parse/state.ts and src/llm/parse/canon.ts
- src/llm/port/index.ts
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- AGENTS.md
- docs/novel-creation-tool-design.md §5.8, §6.5, §6.6
- docs/novel-creation-tool-development-plan.md I27
- docs/novel-creation-tool-requirements.md R1-C1, R2-5, R2-7, R5-3
- src/core/schema/relationship.ts and src/core/relationship/index.ts
- src/llm/parse/state.ts and src/llm/parse/canon.ts
- src/llm/port/index.ts
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: C1 repository remains canonical persistence owner; I17 LLM port remains Host routing owner; no C3 knowledge behavior derives from C1 knownTo.
- Affected layers:
- C1 parser seam only
- Owners:
- RelationshipRepository retains persistence/schema boundary; parser recognizes proposals only; Host facade retains injected ctx.llm cancellation ownership.
- Invariants:
- C1 store enforces endpoint, numeric, and list invariants; parser is the only default C1 automatic writer; no RelationshipEngine default path exists.
- Non-goals:
- No RelationshipEngine, knowledge/worldview parsing, cross-layer orchestration, Client, or direct endpoint.

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md
- design §§5.8,6.5,6.6
- plan I27
- requirements R1-C1,R2-5,R2-7,R5-3
- C1 schema/repository
- I25/I26 parser patterns
- I17 LLM port
- Delivered context refs:
- none
- Acknowledged before plan:
- AGENTS.md
- design §§5.8,6.5,6.6
- plan I27
- requirements R1-C1,R2-5,R2-7,R5-3
- C1 schema/repository
- I25/I26 parser patterns
- I17 LLM port
- Cited in plan:
- design §6.6
- plan I27
- requirements R5-3
- Missing refs:
- none
- Advisory decision: continue
