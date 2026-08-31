# I106 章节树管理、简化受控删除与空作品引导设计

日期：2026-08-31

范围：Stage 18 / I106 / R18-1c

状态：替代 2026-08-29 的 durable deletion saga 方案

## 1. 目标与依据

I106 只完成三件事：

1. 把 I104 的章节/场景 CRUD、元数据和排序接入 Chapters GUI；
2. 把 I105 的场景↔细纲绑定及候选落点接入 GUI；
3. 提供 `impact → I11 confirmation → apply` 的本地受控硬删除。

权威依据：

- `docs/novel-creation-tool-design.md` §14.14 / R18-1；
- `docs/novel-creation-tool-requirements.md` R18-1；
- `docs/novel-creation-tool-development-plan.md` I104–I106；
- I11 ConfirmationGate、I104 C5 mutation/delete primitive、I105 SceneOutlineBinding。

## 2. 简化裁决

### 2.1 运行模型

- 插件仅按本地单用户、单 Host 进程设计。
- 不为多用户、跨进程竞争或任意崩溃点自动恢复建立基础设施。
- 并发保护只使用现有 project write lane、最终 fingerprint 复验和 I11。

### 2.2 实时与幂等

- binding 与 C5 都是本次删除涉及的权威数据；`apply` 返回成功前必须同步完成 binding 清理与 C5 删除。
- `proposalId` 同时作为稳定幂等键。重复 `apply` 不重复清理、不重复删除，目标已删除时返回 `already-deleted`。
- 不创建后台任务补写 binding/C5，不让 Client 串联两个公开写命令。
- Markdown mirror 是既有派生输出，继续复用 I104 outbox；它不是叙事真相层，不为 I106 新建事务或恢复机制。

### 2.3 明确删除的旧方案

I106 不再设计或实现：

- durable deletion saga / deletion journal；
- deletion audit/tombstone repository 与 audit Remote；
- reservation registry；
- recovery barrier；
- deletion fence token/lease；
- `openForDeletionRecovery` 或特殊 composition open 顺序；
- binding restore/compensation；
- 在 queue、writing、branch、migration 等所有写路径安装删除 guard；
- `recovery-required`、`compensated`、`aborted` 等删除状态。

## 3. Owner 与同步顺序

- C5 chapter/scene JSON：I104 `TextRepository` / `ChapterWriteQueue`。
- scene↔detailBeat 手工绑定：I105 `SceneOutlineBindingRepository`。
- 用户确认：I11 ConfirmationGate。
- queue/candidate：各自 owner；I106 只读活动项，不接管取消或裁决。
- Client：只持表单、选择、对话框和 busy/error 状态，不持领域真相。

删除 apply 使用以下固定顺序：

1. 进入现有 project write lane；
2. 重新读取 target、source/branch/binding fingerprint 和活动 queue/candidate；
3. 任一内容变化返回 `stale`，活动项存在返回 `blocked`，此时 Gate/C5/binding 零写；
4. 幂等接受对应 I11 proposal；
5. 调用 I105 Host-only `cleanupForDeletion(targetSceneIds, proposalId)`；已清理视为成功；
6. 调用 I104 纯删除 primitive，并以 proposalId/target 缺失处理重复执行；
7. 两项完成后返回 `deleted`；若响应丢失，重试返回 `already-deleted`。

不恢复已清理的 binding。如果 binding 清理后 C5 删除因 I/O 失败，调用返回可重试技术错误；作者重试同一 proposal，binding cleanup 幂等跳过后继续删除 C5。这样最坏状态是“正文仍在、手工绑定已解除”，不会丢失正文，也不需要全局恢复屏障。

## 4. Impact 合同

impact 必须有界、排序稳定，并包含：

- target：chapter 或 scene；
- C5：scene 数、正文字符数、project/target fingerprint；
- branches：branch id/label/chosen/sourceHash，不返回完整正文；
- bindings：将被清理的 manual/effective binding；
- activeQueue：目标相关 queued/running/candidate-ready 项；
- activeCandidates：目标相关 pending candidate；
- historicalReferences：能够由稳定 target payload 精确定位的既有引用；
- opaqueHistoryCount：无法从既有记录精确定位目标的历史数量；
- blockers：`last-scene-landing | active-queue | active-candidate`；
- impactFingerprint：以上可变业务内容的确定性摘要。

历史记录只读且不修改。删除后，现有历史投影在发现 target 不存在时显示 stale/deleted；I106 不复制历史记录，也不新增删除审计账本。

## 5. Remote 合同

新增单一 strict additive namespace `novelTextDeletion`，只包含四个方法：

1. `impact(projectId, target)`
   - `ready { impact }`
   - `blocked { impact }`
2. `propose(projectId, target, expectedImpactFingerprint)`
   - `pending { proposalId, impact }`
   - `stale { impact }`
   - `blocked { impact }`
3. `apply(projectId, proposalId)`
   - `deleted { proposalId, fingerprint }`
   - `already-deleted { proposalId, fingerprint }`
   - `stale { impact }`
   - `blocked { impact }`
4. `reject(projectId, proposalId)`
   - `rejected { proposalId }`
   - `already-rejected { proposalId }`

技术 I/O、corrupt data、wrong proposal kind、unknown target 和非法参数继续作为 Remote error；不把技术错误扩展成持久业务状态机。

## 6. 活动项处理

- queued/running/candidate-ready queue task 阻断删除。
- pending direct candidate 阻断删除。
- failed/cancelled/completed queue task 与 written/rejected/superseded candidate 不阻断。
- Client 显示并复用现有 queue cancel/cancelTask 与 writing reject 操作；I106 不自动取消。
- 作者处理活动项后重新获取 impact；旧 proposal 不自动刷新。
- 不使用 reservation。考虑到本地单用户模型，apply 的最终复验和 C5 fingerprint 是唯一竞争门。

## 7. Client 设计

扩展现有 Chapters layer，不新增顶层 view：

- 章节树选择；
- chapter/scene create/edit；
- chapter/scene 上下移动；
- scene↔detailBeat binding editor；
- candidate/queue 落点选择；
- 删除影响确认；
- 无 chapter / 空 chapter 引导。

删除对话框只需要：

`idle → loading → ready | blocked → proposing → pending → applying | rejecting → done | stale | error`

- blocked 时显示现有活动项处理入口；
- stale 时只允许重新加载 impact；
- error 保留上下文供手动重试；
- project 切换或 Fiber dispose 清除 transient 状态；
- applying 时不允许重复点击。

## 8. 兼容边界

- I104/I105 已有 invocation 与结果逐字段不变。
- C5/B5/SceneOutlineBinding schema 不变。
- `novelText` 不新增公开 delete 方法。
- 不复制 I104/I105 CRUD、binding、queue 或 writing Remote。
- chapterId/sceneId 永久不变。
- 旧 Chapters DOM 锚点保留。

## 9. 非目标

- 不做垃圾箱、正文恢复、soft delete；
- 不做 durable deletion saga、journal、audit、reservation 或 recovery barrier；
- 不做跨进程/多用户并发；
- 不自动取消 queue/candidate；
- 不做富文本、ID 重命名或非空项目导入；
- 不进入 I107 四模式或 I108 结构预览。

## 10. 验收

### Host/domain

- impact 覆盖正文摘要、branches、binding、活动项和可定位历史引用；
- unknown/cross-project/last-valid-landing 拒绝；
- pending/rejected/stale/blocked 零 C5/binding 写；
- 成功返回前 binding 与 C5 均已更新；
- 重复 apply 不重复副作用并返回 already-deleted；
- binding 已清、C5 尚在时重试同一 proposal 可完成；
- response 丢失后重试可识别已删除；
- 既有历史记录未被删除，目标缺失时投影 stale；
- Markdown mirror 继续由 I104 outbox 收敛。

### Client/contract

- 真实 binder 完成 CRUD/reorder/binding/target/impact/propose/apply/reject；
- strict invalid input/result negatives；
- blocker、stale、技术错误和重复 apply UI 可行动；
- DOM、focus、窄屏与 dispose 全绿；
- contract lock 只追加四个方法，旧合同 body 不变。

### 验证

`pnpm run verify:i106`：typecheck、全量测试、build、I106 smoke。smoke 产物为 `artifacts/i106-chapter-management-e2e.json`，只记录 CRUD/binding、四个删除方法、实时幂等同步、Client anchors 与非目标，不记录 saga/recovery 数据。

## 11. ADR 结论

本方案没有新增需要 ADR 的持久协调边界。I106 复用既有 owners、I11 和本地 project write lane；未来若产品改为多用户、跨进程写入或要求任意崩溃点自动恢复，必须另立需求和 ADR，不在 I106 预留实现。
