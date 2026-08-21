# Proof Bundle - 2026-08-21-i31-a2-host-config

## Method Pack Boundary

This proof bundle is an advisory Aegis Method Pack record. It does not determine evidence sufficiency, produce authoritative `GateDecision`, or grant `completion authority`.

## Task Intent

- Requested outcome: 完成 I31 A2 Host 配置：模板、预设、模型/采样路由与受控 ctx.llm 委托。
- Scope: 仅 I31 Host-side A2 configuration；src/core/settings-index、src/llm/port、src/host 的必要 wiring、I31 tests/smoke/package scripts/work record。

## Impact

- Compatibility boundary: 保留 GenerationSettings 调用形状并仅在 Host 解析 SecretRef；不替换 ctx.llm adapter。
- Non-goals:
- UI 主题、Client LLM、外层 plugin 类型、内部 Extension registry、直连 endpoint/credential。

## Evidence Bundle Refs

- docs/aegis/work/2026-08-21-i31-a2-host-config/evidence-bundle-draft-diff-check.json
- docs/aegis/work/2026-08-21-i31-a2-host-config/evidence-bundle-draft-verify-i31.json

## Drift Check

- Scope status: I31-only A2 Host configuration; no UI, Extension, or project-data changes.
- Compatibility status: Existing GenerationSettings caller contract and sole ctx.llm adapter preserved; ContextAssembler untouched.
- Retirement status: No legacy A2 owner or fallback exists; no retirement action required.
- Advisory decision: continue
