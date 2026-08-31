# I106 章节树管理与简化受控删除 - Checkpoint

> 2026-08-31 scope reset：此前 Task 1A guard/fence/recovery 方案已被用户明确收缩，不再继续，也不得作为完成证据。

- Task ID: 2026-08-29-i106-chapter-management
- Current todo: 按简化规格清理旧 Task 1A，并从最小 schema/impact 重新开始。
- Active slice: scope-reset
- Completed todos:
  - I104/I105 baseline 已完成；
  - 2026-08-31 简化设计、需求、迭代卡、spec 与 plan 已同步。
- Invalidated prior work:
  - path-global mutation guard；
  - deletion fence token/lease；
  - recovery barrier/reservation；
  - deletion journal/audit 与复杂 terminal outcomes。
- Preserve if independently useful:
  - 纯 chapter/scene deletion transform；
  - 现有 I104 project write lane canonical-path 修复，但前提是它不依赖删除 guard/fence；
  - 与简化 impact 直接相关的纯测试。
- Blocked on: none。
- Next step:
  1. 对当前未提交 I106 diff 做 keep/remove 分类；
  2. 移除旧架构专属代码和测试；
  3. 按新 plan Task 1 重建最小 schema/impact；
  4. focused tests 后再进入 Host apply。

## Current acceptance focus

- 本地单用户、单 Host；
- impact → I11 → apply；
- binding-first、C5-second；
- 同一请求成功前完成权威数据同步；
- proposalId 重复调用幂等；
- 中途失败依赖手动重试，不自动恢复、不阻断其他项目写入；
- Markdown mirror 继续使用 I104 outbox。

## Evidence policy

旧 Task 1A focused/typecheck 结果只证明当时实现可运行，不证明新规格完成。I106 只能以清理后的最终 diff、当前 focused tests、`pnpm run verify:i106` 与新版 smoke artifact 完成。
