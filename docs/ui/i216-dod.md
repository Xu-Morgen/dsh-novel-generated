# I216 DoD：场景卡草稿采用与下一卡确认

- 授权：按场景卡写作接受草稿后，将本次卡设为 done；弹窗展示下一张未完成卡标题/摘要/要点，确认设 writing，取消不变。用户追加授权将保存场景绑定到本次 input 中的细纲卡。
- Owner：Main 新增 draft-card-progress 编排，复用原 adoptDraft 与 I11；B5 仓储新增内部 fingerprint CAS，旧公开 adoptDraft 仍只写 C5。Client 新方法用于 scene-card，其他意图不变。
- 公开合同：novelWorkspace 新增 strict sceneCardDraftAdopt / sceneCardNextDecide，同步 registry/lock/Main/Renderer；不修改旧参数结果，不用调用方猜卡 ID。
- 次序：C5 保存成功后才改本次冻结卡并通过 binding owner 建立 sceneId/detailBeatId 手动映射；按 B5 act/index、beat/id、卡数组顺序选下一张未完成卡，不重写内容。跨节当前卡全部完成后 scene-card 可从后续 writing 卡定位对应导航，不写 C6。
- 异常：重复采用不重复正文/完成卡；C5 已存但 B5 失败返回可重试状态；下一卡 I11 决定必须复验原卡内容及 B5 指纹，变更后拒绝覆盖；失败保留弹窗与重试。
- 验收：Main 确定性/负向/重试/取消/幂等、strict 参数和结果、真实 Electron 接受→当前 done→弹窗内容→确认/取消、最后一张无弹窗；未采用零 B5 写。
- 验证：`pnpm run verify:stage-60`（含 verify:i216）全绿；253 文件 / 1263 测试、typecheck/build、I216–I200 实际 Electron 及原样本回归；本次无 prompt/model 输出 schema 变更。
- 证据：`artifacts/i216-verification.log`、`artifacts/desktop/ui/i216/validation.json`、`next-card-confirmation.png`。真实 UI 两次采用分别验证下一卡确认/取消，input 卡 ID 与新增场景绑定落盘，后续请求使用下一 writing 卡，strict 拒绝伪造 card ID。
- 交接：I216 完成，下一可用 I217。新增 strict sceneCardDraftAdopt / sceneCardNextDecide，236 descriptors / Renderer 217 methods；旧接口不变。候选采用重试仍限当前 Main 会话；持久跨重启恢复、任意选卡与独立定稿流程继续 backlog。
- 明确不做：不将续写/润色默认改状态，不自动启动下一次 LLM，不自动定稿或重绑已有冲突关系，不批量修改其他 writing 卡。
