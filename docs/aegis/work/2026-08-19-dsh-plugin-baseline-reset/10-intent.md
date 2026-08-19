# DSH 插件权威基线重置 - Intent

## TaskIntentDraft

- Requested outcome: 将小说创作器重置为 DeepSeek Harness/Cordis 不可变宿主插件，重写权威文档、退役旧 I1 并从新 I1 开始
- Goal: 将小说创作器重置为 DeepSeek Harness/Cordis 不可变宿主插件，重写权威文档、退役旧 I1 并从新 I1 开始
- Success evidence:
- 三份权威文档与 AGENTS 一致；旧独立应用路径消失；新 I1 普通 Cordis 插件可构建、装载与卸载；验证全绿
- Stop condition: done=文档基线、新 I1 与验证完成；blocked=外部 DSH 契约连续三轮不可获得；needs-verification=实现存在但宿主验证不足；scope-exceeded=需要修改 DSH 本体
- Non-goals:
- 本轮不完成全部小说引擎和编辑 UI
- Scope: 设计/需求/开发计划/AGENTS/旧 I1 退役/新 I1 插件骨架及测试
- Change kinds:
- architecture-reset
- Risk hints:
- 权威架构、宿主契约、代码退役与构建边界同步变化

## BaselineReadSetHint

- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: 保留作品数据与叙事模型；不保留旧独立 Vite/浏览器直连 LLM 兼容路径
- Affected layers:
- Host composition / Cordis plugin / Client Slot / project data
- Owners:
- DeepSeek Harness/Cordis host boundary
- Invariants:
- 产品主交付始终是可被 DSH composition 装载和卸载的普通持久插件，禁止独立前端成为第二主路径
- Non-goals:
- 本轮不完成全部小说引擎和编辑 UI

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Cited in plan:
- none
- Missing refs:
- none
- Advisory decision: continue

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-requirements.md
- docs/novel-creation-tool-development-plan.md
- AGENTS.md
- Cited in plan:
- docs/aegis/plans/2026-08-19-dsh-plugin-baseline-reset.md
- Missing refs:
- none
- Advisory decision: continue
