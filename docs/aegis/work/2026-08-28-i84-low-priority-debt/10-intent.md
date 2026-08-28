# I84 低优先级债务清零 - Intent

## TaskIntentDraft

- Requested outcome: 严格按 I84 迭代卡清零文本管道、Client SHA、分层倒置边与指定杂项债务，保持公开契约和行为不变
- Goal: 完成 I84 并以 verify:i84、verify:stage-15、全量 held-out 与 smoke 证据证明
- Success evidence:
- 复制源与倒置边扫描归零；杂项断言；pnpm test/build/held-out/stage-15 全绿；唯一干净 I84 commit
- Stop condition: done=全部证据覆盖；blocked=连续轮次同一外部阻塞；needs-verification=证据不足；scope-exceeded=需公开 Remote 或领域契约变更
- Non-goals:
- 不新增功能；不破坏性改名；不修改样本/金标/阈值；不跨 I84
- Scope: 仅 I84 卡片列明的低优先级债务、专属测试/smoke/package 验证接线与必要夹具迁移
- Change kinds:
- refactor
- Risk hints:
- 跨 core/llm/host/client 的机械重构可能引入依赖倒置或行为漂移

## BaselineReadSetHint

- AGENTS.md v2.3
- docs/novel-creation-tool-design.md v2.3 §0.1/§14.12/D21-D22
- docs/novel-creation-tool-requirements.md v2.3 R16
- docs/novel-creation-tool-development-plan.md v2.3 I84/§17
- docs/novel-creation-tool-architecture-review.md v1.0 §5.4/§8/§9
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md v2.3
- docs/novel-creation-tool-design.md v2.3 §0.1/§14.12/D21-D22
- docs/novel-creation-tool-requirements.md v2.3 R16
- docs/novel-creation-tool-development-plan.md v2.3 I84/§17
- docs/novel-creation-tool-architecture-review.md v1.0 §5.4/§8/§9
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- AGENTS.md v2.3
- docs/novel-creation-tool-design.md v2.3 §0.1/§14.12/D21-D22
- docs/novel-creation-tool-requirements.md v2.3 R16
- docs/novel-creation-tool-development-plan.md v2.3 I84/§17
- docs/novel-creation-tool-architecture-review.md v1.0 §5.4/§8/§9
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: 保留公开服务名 novelImport/novelImportExport/novelExport/novelOutlineProgress/novelTextEdit/novelLocalizedEdit
- Affected layers:
- core
- llm
- host
- client
- Owners:
- 现有 canonical owners；仅抽取共享纯模块，不新增领域 owner
- Invariants:
- 公开 Remote/wire、领域行为、Host/Client 真相边界、样本与阈值不变
- Non-goals:
- 不新增功能；不破坏性改名；不修改样本/金标/阈值；不跨 I84

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md v2.3
- docs/novel-creation-tool-design.md v2.3 §0.1/§14.12/D21-D22
- docs/novel-creation-tool-requirements.md v2.3 R16
- docs/novel-creation-tool-development-plan.md v2.3 I84/§17
- docs/novel-creation-tool-architecture-review.md v1.0 §5.4/§8/§9
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md
- Delivered context refs:
- none
- Acknowledged before plan:
- AGENTS.md v2.3
- docs/novel-creation-tool-design.md v2.3 §0.1/§14.12/D21-D22
- docs/novel-creation-tool-requirements.md v2.3 R16
- docs/novel-creation-tool-development-plan.md v2.3 I84/§17
- docs/novel-creation-tool-architecture-review.md v1.0 §5.4/§8/§9
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md
- Cited in plan:
- docs/aegis/plans/2026-08-27-architecture-debt-elimination.md
- Missing refs:
- none
- Advisory decision: continue
