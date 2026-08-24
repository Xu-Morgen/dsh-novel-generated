# Stage 10 作品启动与六层初始化设计 - Intent

## TaskIntentDraft

- Requested outcome: 新增 I50-I53，修复作品启动并支持 DOCX、自由文本和空白作品三种初始化入口
- Goal: 以 Host-owned 启动编排和 ConfirmationGate 为边界完成多作品启动与六层候选初始化规格
- Success evidence:
- 设计、需求、计划和 AGENTS 对 I50-I53 一致；用户批准；无源码修改
- Stop condition: 文档一致且自审通过则进入实施计划；若合同或持久化边界未决则暂停
- Non-goals:
- implementation source changes
- C3 inference
- import into non-empty projects
- Scope: v2.1 权威文档同步与 Stage 10 规格，不实现代码
- Change kinds:
- architecture
- Risk hints:
- Remote additive contract、DOCX 上传安全、LLM 六层推断、文件 source-of-truth、既有脏工作区

## BaselineReadSetHint

- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-development-plan.md
- docs/novel-creation-tool-requirements.md
- AGENTS.md

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-development-plan.md
- docs/novel-creation-tool-requirements.md
- AGENTS.md
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-development-plan.md
- docs/novel-creation-tool-requirements.md
- AGENTS.md
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: existing 21 workspace editor invocations remain additive-compatible; I38 B2/B5 contract unchanged
- Affected layers:
- Host project lifecycle
- Remote contract
- Client onboarding
- DOCX import
- six-layer LLM initialization
- Owners:
- Host project lifecycle facade + existing six domain services
- Invariants:
- Host owns files/LLM; Client owns only UI; unconfirmed candidates never write
- Non-goals:
- implementation source changes
- C3 inference
- import into non-empty projects

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-development-plan.md
- docs/novel-creation-tool-requirements.md
- AGENTS.md
- Delivered context refs:
- none
- Acknowledged before plan:
- docs/novel-creation-tool-design.md
- docs/novel-creation-tool-development-plan.md
- docs/novel-creation-tool-requirements.md
- AGENTS.md
- Cited in plan:
- docs/novel-creation-tool-design.md#14.7
- docs/novel-creation-tool-development-plan.md#stage-10
- docs/novel-creation-tool-requirements.md#R11
- AGENTS.md#authority
- Missing refs:
- none
- Advisory decision: continue
