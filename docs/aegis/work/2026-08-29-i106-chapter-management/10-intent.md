# I106 章节树管理与简化受控删除 - Intent

> 2026-08-31 范围修订：本记录替代此前 durable deletion saga 意图。旧 guard/fence/journal/reservation/recovery 方向不再具有执行效力。

## TaskIntentDraft

- Requested outcome: 完成 I106 R18-1c；每迭代一个 verified commit 并 push。
- Goal: 把 I104/I105 CRUD、排序、绑定和显式落点接入 Chapters GUI，并交付本地 `impact → I11 → apply` 删除。
- Success evidence:
  - strict `novelTextDeletion impact/propose/apply/reject` contracts，旧 Remote bodies 不变；
  - Gate 前失败零写，binding/C5 同请求完成，proposalId 重试幂等；
  - binding 已清/C5 尚在与响应丢失两条手动重试夹具；
  - real binder + Client CRUD/reorder/binding/target/deletion journey；
  - `pnpm run verify:i106`、artifact、single commit/push receipt。
- Stop condition: 全部证据绿且 commit/push receipt 匹配；公开合同、owner、last-landing 或简化规格漂移时暂停。
- Non-goals:
  - deletion saga/journal/audit、reservation、recovery barrier、fence token/lease；
  - 垃圾箱/正文恢复、富文本、ID 重命名、非空导入；
  - I107 modes、I108 structural preview；
  - 修改 C5/B5/binding persistence schema 或旧 Remote body。
- Scope: I106 only：Chapters GUI、本地实时幂等删除、additive Remote、contracts/evidence。
- Risk hints: binding-first 后 C5 I/O 失败需要手动重试；最终 fingerprint 后存在可接受的本地极短竞争窗口；Client mount gaps。

## BaselineReadSetHint

- `docs/novel-creation-tool-design.md` v2.7 §14.14 / R18-1；
- `docs/novel-creation-tool-requirements.md` v2.7 R18-1；
- `docs/novel-creation-tool-development-plan.md` v2.7 I104–I106；
- `AGENTS.md` v2.7；
- `docs/aegis/specs/2026-08-29-i106-chapter-management-design.md` 简化规格；
- `docs/aegis/plans/2026-08-29-i106-chapter-management.md` 简化实施计划；
- I11 ConfirmationGate、I104 commit `8636685`、I105 commit `d12d08d`。

## ImpactStatementDraft

- Compatibility boundary: 旧 descriptor/result bodies、C5/B5/binding schemas 不变；只追加四个删除方法。
- Affected layers: pure impact/schema、Host deletion service/Remote、I104 delete seam、I105 idempotent cleanup、Client Chapters、contracts/smoke。
- Owners: TextRepository owns C5/mirror；SceneOutlineBindingRepository owns manual binding；ConfirmationGate owns authorization；Queue/Writing own activity；TextDeletionService 只协调一次本地调用。
- Invariants: no Client cascade；proposalId 幂等；成功返回前 binding/C5 完成；历史只读；last valid scene protected。
- Explicit retirement: 当前未提交的 mutation guard、fence/recovery APIs、journal/audit/reservation 设计与实现必须从最终 I106 diff 移除。

## Execution Readiness View

- Intent Lock: I106/R18-1c only。
- Scope Fence: no I107/I108 or product expansion。
- Baseline Lock: authority + 2026-08-31 simplified spec/plan + I11/I104/I105。
- Owner/Contract Constraints: canonical owners preserved；four new Remote methods only。
- Task Batches: 1 schema/impact cleanup；2 local idempotent apply；3 Remote/contracts；4 Client；5 regressions/evidence。
- Test Obligations: focused owner tests + real binder/Client + full verify。
- Drift/Rewind: saga/journal/audit/reservation/recovery implementation appearing in final diff rewinds the slice。
- Evidence Required: fresh verify、artifact、clean scoped commit、upstream receipt。

These records are Method Pack drafts / hints, not authoritative runtime decisions.
