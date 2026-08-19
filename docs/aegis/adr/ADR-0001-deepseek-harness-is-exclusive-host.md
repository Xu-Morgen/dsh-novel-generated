# ADR-0001 - DeepSeek Harness 是唯一且不可修改的产品宿主

Status: `recorded-from-work`
Date: `2026-08-19`

## Source Evidence

- I1 verify 全绿(typecheck/test/build/smoke)；设计/需求/开发计划/AGENTS 四份权威文档同步 v2.0；旧 I1a/I1b 独立应用代码退役
## Context

项目 v1.x 曾以独立 Node/Vite 应用方向开发(I1a/I1b)，产品宿主定位缺失，唯一 DSH 表述只是 UI 风格。

## Decision

DeepSeek Harness/Cordis 是唯一运行宿主与主交付形态；产品作为 ordinary persistent bundle plugin 交付，生产经 selected-profile bundle path(dsh.bundle.patch + dsh.profile.bundles，单一插入 owner)；Host 拥有文件/凭据/ctx.llm/持久化/领域服务；Client 仅注册 DSH Slot UI；I1 Host-only、I2 gate-only Client probe，公开合同不可证明即停止。

## Alternatives Considered

- 独立 Node/Vite 应用 + 浏览器直连 LLM(v1.x，已取代)
## Consequences

- 退役独立 UI/浏览器 LLM/自建 OpenAI seam；重排为 9 阶段 45 迭代(I1-I45)；建立 Cordis package/composition/Fiber 生命周期基线。
## Compatibility Boundary

保留 13 层叙事模型、结构化写回闭环、ConfirmationGate、样本治理与作品数据；不保留独立 Vite/浏览器直连 LLM 兼容层。

## Retirement Impact

删除旧 I1a/I1b tracked 代码、demo、vite 配置、.env.example 与固定 mock 产物；不触碰未提交 .gitignore 与 ignored birthday archive。

## Baseline Sync

- Needed: needed
- Target: docs/novel-creation-tool-design.md; docs/novel-creation-tool-requirements.md; docs/novel-creation-tool-development-plan.md; AGENTS.md
- Action: update baseline
- Reason: 四份权威文档已在本 change 同步为 v2.0 DSH 宿主基线并交叉一致。

## Evidence References

- docs/aegis/work/2026-08-19-dsh-plugin-baseline-reset/90-evidence.md
## Boundary

This ADR is an advisory Aegis Method Pack record. It does not grant completion authority or replace project-authoritative architecture sources.
