# Proof Bundle - 2026-08-21-i27-c1-relationship-parser

## Method Pack Boundary

This proof bundle is an advisory Aegis Method Pack record. It does not determine evidence sufficiency, produce authoritative `GateDecision`, or grant `completion authority`.

## Task Intent

- Requested outcome: 完成 I27：将已接受正文解析为严格 C1 关系新增/变更操作，并由 C1 repository 机械应用。
- Scope: I27 frozen samples、C1 parser/schema/apply seam、Host facade、测试、smoke、verify 脚本和工作记录。

## Impact

- Compatibility boundary: C1 repository remains canonical persistence owner; I17 LLM port remains Host routing owner; no C3 knowledge behavior derives from C1 knownTo.
- Non-goals:
- No RelationshipEngine, knowledge/worldview parsing, cross-layer orchestration, Client, or direct endpoint.

## Evidence Bundle Refs

- docs/aegis/work/2026-08-21-i27-c1-relationship-parser/evidence-bundle-draft-verify-i27.json

## Drift Check

- Scope status: Aligned with C1 parser only; no RelationshipEngine, C3/B2 parser, Client, or orchestration introduced.
- Compatibility status: RelationshipRepository remains C1 persistence/invariant owner; I17 port remains Host LLM route owner; I11 owns low-confidence confirmation; C1 knownTo remains separate from C3.
- Retirement status: No fallback, old automatic C1 writer, or RelationshipEngine path introduced.
- Advisory decision: continue
