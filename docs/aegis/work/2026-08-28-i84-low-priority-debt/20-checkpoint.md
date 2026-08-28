# I84 低优先级债务清零 - Checkpoint

- Task ID: 2026-08-28-i84-low-priority-debt
- Current todo: 完成基线审计与 DoD
- Active slice: I84 patch map and acceptance map
- Blocked on: none
- Next step: 锁定最小实现边界后委派实现

## Checkpoint Update

- Current todo: 按 I84 最小范围实现交付物及正负向测试
- Active slice: 共享纯模块、倒置边、指定杂项与 smoke 的单一 I84 实现切片
- Completed todos:
- 读取 I84 迭代卡、权威基线与当前工作树，填写 DoD/切片边界
- Evidence refs:
- development-plan.md:809-815; requirements.md:285-296; design.md:1050-1061; architecture-review.md:112-121,173-194
- Blocked on: none
- Next step: 委派实现代理按锁定边界改动并运行目标测试

## DriftCheckDraft

- Scope status: 严格位于 I84 卡片；只新增共享纯模块/测试/smoke并迁移既有消费者
- Compatibility status: 公开 Remote/wire 与服务 key 锁定不变
- Retirement status: 重复文本管道与 Client SHA 实现通过 delete-first 退役，不留 fallback
- New risk signals:
- workspace 构造签名收紧需要迁移全部测试消费者
- Advisory decision: continue

## Checkpoint Update

- Current todo: 运行 I84、阶段与全量验证并检查 smoke 产物
- Active slice: 全量 verify:i84 后运行 verify:stage-15
- Completed todos:
- 按 I84 最小范围实现交付物及正负向测试
- Evidence refs:
- focused 47 tests + review-fix 32 tests; typecheck/build/smoke:i84 pass; spec and quality reviews approved
- Blocked on: none
- Next step: 收取 verify:i84 后启动 stage-15 累积门

## DriftCheckDraft

- Scope status: 实现与评审均位于 I84；无新增功能
- Compatibility status: 公开 Remote/wire/service keys 未改；两阶段评审通过
- Retirement status: 文本/SHA/DOCX兼容 carrier 均退役且 smoke 锁定
- New risk signals:
- stage-15 累积验证尚未执行
- Advisory decision: needs-verification

## Checkpoint Update

- Current todo: 审查差异并创建唯一 I84 commit
- Active slice: final diff review, workspace bundle/check, scoped commit
- Completed todos:
- 运行 I84、阶段与全量验证并检查 smoke 产物
- Evidence refs:
- verify:i84 exit 0; verify:stage-15 exit 0; 116 files/723 tests per full run; held-out 0.1/0.9/0.9
- Blocked on: none
- Next step: final reviewer, Aegis bundle/check, stage task-owned files and commit

## DriftCheckDraft

- Scope status: I84 product/source changes plus Stage 15 smoke fixture portability repair required by the mandated cumulative gate
- Compatibility status: public Remote/wire/service names and shapes unchanged; all regressions green
- Retirement status: duplicate text/SHA/DOCX carriers retired; no fallback; smoke asserts absence
- New risk signals:
- Vitest warns about two pre-existing unawaited I75 test assertions; tests pass and no I84 behavior impact
- Advisory decision: continue

## Checkpoint Update

- Current todo: 汇总验收证据、commit 与交接块
- Active slice: final user handoff
- Completed todos:
- 审查差异并创建唯一 I84 commit
- Evidence refs:
- single scoped I84 commit created after final verify:i84 and verify:stage-15
- Blocked on: none
- Next step: read back final commit/status, close goal, report handoff
