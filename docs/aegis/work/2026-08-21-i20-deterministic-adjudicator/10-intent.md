# I20 确定性裁决器 - Intent

## TaskIntentDraft

- Requested outcome: 完成 I20：将结构化 violation 确定性裁决为 pass/warn/reject，并同步设计过渡声明。
- Goal: 完成 I20：将结构化 violation 确定性裁决为 pass/warn/reject，并同步设计过渡声明。
- Success evidence:
- verify:i20 通过，含 hard/soft/empty/非法 schema 与两个调用点夹具。
- Stop condition: 验证失败、范围扩展至检测器或 LLM、或出现未决契约冲突时停止。
- Non-goals:
- I21-I24 检测器、LLM、parser、写回、Client。
- Scope: I20 adjudicator、测试、smoke/verify、设计文档过渡状态同步。
- Change kinds:
- code
- Risk hints:
- 共享一致性契约；必须 fail closed，且不得实现 I21-I24 检测。

## BaselineReadSetHint

- docs/novel-creation-tool-design.md §9.1
- docs/novel-creation-tool-development-plan.md I20 / §0.6
- docs/novel-creation-tool-requirements.md R2-8/R4-1

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md §9.1
- docs/novel-creation-tool-development-plan.md I20 / §0.6
- docs/novel-creation-tool-requirements.md R2-8/R4-1
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- docs/novel-creation-tool-design.md §9.1
- docs/novel-creation-tool-development-plan.md I20 / §0.6
- docs/novel-creation-tool-requirements.md R2-8/R4-1
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: 只消费结构化 violations；不加入语义检测、LLM、写回或产品 UI。
- Affected layers:
- src/core/validate
- Owners:
- ConsistencyValidator deterministic adjudication seam
- Invariants:
- 任一 hard 拒绝；仅 soft 警告；空集通过；非法输入 fail closed。
- Non-goals:
- I21-I24 检测器、LLM、parser、写回、Client。

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md §9.1
- docs/novel-creation-tool-development-plan.md I20 / §0.6
- docs/novel-creation-tool-requirements.md R2-8/R4-1
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-design.md §9.1
- docs/novel-creation-tool-development-plan.md I20 / §0.6
- docs/novel-creation-tool-requirements.md R2-8/R4-1
- Cited in plan:
- design §9.1; plan I20; R2-8/R4-1
- Missing refs:
- none
- Advisory decision: continue
