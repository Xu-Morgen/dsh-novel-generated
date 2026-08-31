# I106 章节管理与简化受控删除实施计划

> **Goal:** 完成 I106 / R18-1c：GUI 章节/场景管理、绑定/候选落点、空态，以及本地 `impact → I11 → apply` 硬删除。
>
> **Architecture:** 复用 I104 `TextRepository` project write lane、I105 `SceneOutlineBinding` 和 I11。binding/C5 在同一 apply 请求内同步完成并以 proposalId 幂等；Markdown mirror 复用 I104 outbox。
>
> **明确移除:** durable deletion saga/journal/audit、reservation、recovery barrier、fence token/lease、特殊 open/recovery 路径和跨全仓写入 guard。

## 1. Authority 与完成线

- `docs/novel-creation-tool-design.md` §14.14 / R18-1；
- `docs/novel-creation-tool-requirements.md` R18-1；
- `docs/novel-creation-tool-development-plan.md` I106；
- 简化规格 `docs/aegis/specs/2026-08-29-i106-chapter-management-design.md`；
- I104 commit `8636685`；I105 commit `d12d08d`。

完成证据：focused tests → `pnpm run verify:i106` → smoke artifact → 单一 I106 commit。

## 2. 范围锁

### 必须完成

- Chapters GUI CRUD、metadata、reorder；
- binding editor 与 candidate/queue target 选择；
- bounded deletion impact；
- I11 propose/apply/reject；
- 同一请求内 binding cleanup + C5 delete；
- proposalId 幂等重试；
- blocker/stale/error Client 状态；
- 空 chapter/scene 引导。

### 不得实现

- 持久 deletion operation 状态机；
- deletion journal、audit/tombstone 文件或 audit Remote；
- reservation registry、recovery barrier、mutation guard；
- `openForDeletionRecovery`；
- binding restore/compensation；
- queue/writing/branch/migration 全路径 guard；
- 自动取消 queue/candidate；
- 多用户或跨进程安全。

## 3. 变更边界

### 新增或保留的最小文件

- `src/core/schema/text-deletion.ts`：仅 impact、四方法 input/result schema；
- `src/host/text-deletion-service.ts`：impact/propose/apply/reject；
- `src/host/remote/text-deletion.ts`：四个 strict additive descriptors；
- 对应 focused tests；
- `scripts/smoke-i106.mjs`；
- `artifacts/i106-chapter-management-e2e.json`。

### 最小修改

- I104 TextRepository/ChapterWriteQueue：暴露现有 lane 内幂等 delete seam，不新增第二删除器；
- I105 binding service：增加 Host-only `cleanupForDeletion(targetSceneIds, proposalId)`，重复 cleanup 成功；
- queue/writing：只增加只读 target activity introspection，不增加 guard；
- composition/remote registration/contract lock；
- Client chapters state/ops/panel/harness。

### 必须从 I106 最终 diff 移除

- `src/core/text/mutation-guard.ts` 及测试；
- deletion fence token/lease 与 recovery-open API；
- journal/audit/reservation/recovery service 或 schema；
- `recovery-required | compensated | aborted` outcomes；
- 因旧方案加入 queue/writing/branch/migration 的 guard 接线。

若这些路径由当前未提交工作产生，实施时应在提交 I106 前按最终 diff 精确移除；不得影响 I104/I105 已提交能力。

## 4. Task 1 — 收敛 schema 与纯 impact

**目标：** 先把删除合同降到需求最小面。

1. 将 target 保持为 chapter/scene discriminated union。
2. impact 只包含 C5 摘要、branch 元数据、bindings、active queue/candidate、可定位 history、opaque count、blockers 和 fingerprint。
3. 删除 phase/journal/audit/terminal outcome/recovery-required schema。
4. blockers 仅保留 last-scene-landing、active-queue、active-candidate。
5. 保证数组有界、稳定排序、重复项拒绝。
6. 为相同输入相同 fingerprint、未知目标、跨 chapter scene、上限和 blocker 写正负测试。

验证：focused schema/deletion tests。

## 5. Task 2 — 本地实时幂等 apply

**目标：** 在既有 owner 上实现最短写路径。

1. Text owner 提供在 project write lane 内运行最终 preflight + delete primitive 的窄 seam。
2. Binding owner 提供 `cleanupForDeletion(targetSceneIds, proposalId)`：
   - 只删除 manual rows；
   - 不写 default/effective projection；
   - proposalId 重复调用返回相同成功结果；
   - target rows 已不存在时视为成功。
3. TextDeletionService：
   - `impact` 聚合只读投影；
   - `propose` 校验 expected fingerprint 后写 I11 pending；
   - `apply` 进入 lane、最终复验、幂等 accept Gate、cleanup binding、delete C5；
   - `reject` 复用 I11 reject。
4. C5 delete 成功后不写 deletion audit；已有 history 保持原样。
5. Markdown mirror 只观察 I104 outbox，不新增 I106 mirror coordinator。
6. 故障测试只覆盖有业务价值的四个窗口：
   - Gate 前失败：零写；
   - Gate accepted 后、binding 前失败：重试继续；
   - binding 后、C5 前失败：不恢复 binding，重试继续；
   - C5 后响应丢失：重试 already-deleted。

验证：focused Host/service/reopen tests。重开只验证项目数据仍可读和手动重试，不承诺自动恢复。

## 6. Task 3 — Remote 与合同

1. 新增 `novelTextDeletion.impact/propose/apply/reject`。
2. 每个 descriptor 使用 canonical strict Zod schema，adapter 返回类型从 descriptor result 派生。
3. 真实 binder 覆盖正常、缺参、额外字段、错 target kind、非法结果。
4. Stage 18 contract lock 只追加四个方法及其结果 schema；旧 descriptor/result bodies 不变。
5. 不增加 audit、recover、resume 或 status Remote。

验证：remote result contract、real binder、contract lock focused tests。

## 7. Task 4 — Chapters GUI

1. 复用现有 Chapters layer/state/ops，不新增 WorkbenchViewId。
2. 接入 chapter/scene create/update/reorder。
3. 接入 binding read/save/rebind/unbind 和 candidate/queue target。
4. 删除对话框状态限制为：
   - idle/loading/ready/blocked；
   - proposing/pending/applying/rejecting；
   - done/stale/error。
5. blocker 使用既有 queue/writing 操作，完成后显式刷新 impact。
6. error 保留 proposalId/target，允许手动重试同一 apply。
7. 成功或 already-deleted 后从 Host 完整重读章节树，不在 Client 乐观维护真相。
8. 保留 DOM anchors、focus return、窄屏和 Fiber dispose。

验证：Client harness + real binder E2E。

## 8. Task 5 — 回归、smoke 与清理

1. 扫描以下旧方案词在生产 I106 路径归零：
   - `TextDeletionRecoveryBarrier`；
   - `TextTargetReservationRegistry`；
   - `openForDeletionRecovery`；
   - deletion fence token/lease；
   - `recovery-required`、`compensated`、`aborted`。
2. 验证 I104/I105 descriptors/results 不变。
3. 验证 C5/B5/SceneOutlineBinding schema 不变。
4. smoke 记录：四个方法、impact 类别、幂等窗口、Client anchors、旧合同 hash、非目标。
5. 运行 `pnpm run verify:i106`。
6. 检查最终 diff 不含 saga/journal/audit/reservation/recovery 实现。

## 9. 验收矩阵

| 场景 | 结果 | 写入 |
|---|---|---|
| impact only | ready/blocked | 零写 |
| Gate pending/rejected | pending/rejected | C5/binding 零写 |
| fingerprint 变化 | stale | C5/binding 零写 |
| active queue/candidate | blocked | C5/binding 零写 |
| accepted normal apply | deleted | binding 与 C5 同请求完成 |
| 重复 apply | already-deleted | 无重复副作用 |
| binding 已清、C5 仍在 | retry → deleted | 不恢复 binding |
| C5 已删、响应丢失 | retry → already-deleted | 无重复删除 |
| mirror 暂未收敛 | deleted + existing outbox | 不创建新叙事层任务 |

## 10. 风险与取舍

- 本方案不保证跨崩溃原子性；这是本地单用户产品的明确取舍。
- binding-first 保证失败时不丢正文；解除绑定可由作者重新绑定，优先于复杂补偿。
- 不使用 reservation，接受最终 preflight 后极短竞争窗口；C5 fingerprint 仍会拒绝陈旧删除。
- 多层叙事内容写入必须同步且幂等；只有既有派生 mirror/index 可以异步重建。
- 若未来需要多进程或自动 crash recovery，必须新立需求，不在 I106 预埋。

## 11. Commit 模板

```text
feat(I106): 交付本地章节管理与简化受控删除

- 做了什么：章节/场景 GUI、绑定/落点与 impact→I11→实时幂等删除
- 为什么：design §14.14 / R18-1 / I106，本地单用户范围收缩
- 如何验证：pnpm run verify:i106；artifacts/i106-chapter-management-e2e.json
- 明确不做：deletion saga/journal/audit、reservation、recovery barrier、垃圾箱与跨进程安全
```
