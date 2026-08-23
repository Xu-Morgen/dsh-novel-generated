# I44 续写 agent — Intent

## DoD Card
- 目标：Host 端显式调用续写下一段，复用 I19 上下文组装与 I30 标准生命周期。
- 明确不做：被动触发、灵感备选、独立核心管道、Client 领域真相或浏览器 LLM。
- 交付物：续写 prompt builder、Host continuation service、accept/reject fake route tests、10-case held-out、I44 smoke/verify。
- 验收：prompt 含当前状态/正史/大纲/细纲/POV；validate→decision→parse→writeback 接线正确；拒绝零写；held-out >=80%。
- 验证：`pnpm run verify:i44`。

## Baseline Usage Draft
- Required/acknowledged: `AGENTS.md`; development plan I44; design §§6.6, 8, 9.4; requirements R7-5/R9-4; I19 pipeline; I30 lifecycle; I39 text export; I11 decision semantics.
- Owner lock: I19 assembles context, I30 owns lifecycle, TextRepository owns C5 persistence, existing parsers/writers retain layer ownership.
- Compatibility: no fallback, duplicate writer, passive trigger, or new transaction owner.

## Impact Statement Draft
The service adds one explicit Host command facade. Client remains a command caller only; all context, LLM calls, validation, parsing, and file writes stay Host-owned.

## Execution Readiness View
- Intent lock: I44 continuation only.
- Scope fence: no inspiration, passive monitoring, new parser, new persistence layer, or UI.
- Test obligations: prompt contract, accepted writeback, rejected zero-write, held-out threshold, clean I44 verification.
