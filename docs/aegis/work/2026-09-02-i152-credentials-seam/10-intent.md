# I152 DoD — DSH credentials seam 兼容修复

- 目标：修复 `novelLlmConfig.save/load` 直接按旧扁平布局读写 `.credentials.yaml`，导致 DSH `0.1.1-rc.2` 拒绝 `NOVEL_CUSTOM_API_KEY` 顶层键的问题。
- canonical owner：DSH Host `ctx.credentials`；小说插件只持有 `NOVEL_CUSTOM_API_KEY` 引用名，不拥有凭据文件 schema 或原子写入协议。
- 兼容边界：`novel-custom` provider id、`novelLlmConfig` Remote 方法/参数/结果、A2 `modelRef`/`secretRef`、`settings.yaml` provider 形状保持不变。
- 明确不做：不升级 DSH family，不改 LLM prompt/schema/样本，不修改用户现有凭据文件，不新增模型路由，不把 API key 返回 Client。
- 正向验收：保存走 `CredentialProvider.set()`；加载/留空保存走 `describe()`；真实 rc.2 `LocalCredentialProvider` 产出 `version: 1` + `refs:` 文档，并可立即 resolve。
- 负向验收：缺失 credentials service fail closed；只读环境凭据拒绝写入；已有 `records`/其他 refs 不被覆盖；源码不再直接拼接或读写 `.credentials.yaml`。
- 消费者夹具：真实 `LocalCredentialProvider` + `createLlmConfigService` + A2/settings 三方 round-trip。
- 验证：`pnpm run verify:i152`；`pnpm run verify:stage-21`；`pnpm test`。
- 产物：`artifacts/i152-credentials-seam.json`。
