# I213 DoD：隐藏队列入口与当前章节场景刷新

- 授权：暂时隐藏生成队列导航，修复当前章节新场景必须重选章节才显示；说明场景/细纲/绑定区别。
- Owner：Client nav/presenter 仅隐藏入口、保留既有任务与兼容路由；chapters management mutation 回读当前章节，store 以 chapterId 防止迟到覆盖其他章节。
- 交付：新建/修改/删除后刷新当前章节场景列表，不重新导航或覆盖正文编辑草稿；候选接受读取路径核验。
- 明确不做：不删除队列数据/后端，不自动创建绑定或改细纲状态，不改变正文/定稿契约。
- 验收：真实 Electron 队列入口不可见，新建场景无需再点章节即出现；旧章响应不覆盖新章、正文草稿保留；既有候选接受回归。
- 依据：设计 §14.14.2 / §14.34。`pnpm run verify:stage-57`（含 verify:i213）全绿；251 文件 / 1244 测试、typecheck/build、I213–I200 Electron 回归和原样本；I44 held-out 9/10、I45 held-out 0.9。
- 证据：`artifacts/i213-verification.log`、`artifacts/desktop/ui/i213/validation.json`、`scenes-refreshed.png`。
- 核验：普通绑定不要求 writing；writing 用于保存绑定时建立定稿基线。普通候选采用 fresh scene ID，接受仅新增正文，不自动手动绑定/改卡状态；无需为首次生成逐卡预建空场景。
- 交接：I213 完成；下一可用 I214。无新增公开合同。原 backlog 保留，另记录队列恢复入口与简化选卡/绑定/基线操作供后续单独立项。
