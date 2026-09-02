# I158 Evidence — 来源 Remote Host 注册修复

## 根因与修复

- Client Remote 正确调用 `/api/novelImportInterpretation/create`；URL 无需增加 package 前缀。
- DSH `TypertGatewayService` 只认领已登记在 Host Typert registry 的 `<namespace>/<method>`。I142–I148/I151 的 Client contributions 已挂载，但六组 strict invocations 未加入唯一 `hostContribution`，因此 HTTP 层直接 404。
- I158 将六组、共 28 个既有 descriptors 补入唯一 Host face；没有新增 endpoint、REST server、fallback 或第二注册 owner。

## 验收结果

- `pnpm run verify:stage-27`：通过。
- TypeScript：`tsc --noEmit` 与生产构建通过。
- Vitest：214 个测试文件、1170 项测试全部通过。
- Client bundle：`lib/client.js`，1,486,392 bytes。
- 真实 rc.2 `/api` interceptor：认领 `novelImportInterpretation/create`，并经 Gateway 创建合法 draft session。
- 未知 endpoint 不被认领；Fiber dispose 后本地 descriptor 撤销，已见 endpoint 返回结构化 withdrawn 错误而非裸 404。
- 六组 Client contribution ↔ Host face 集合：28/28 存在，零缺失、零重复。
- Stage 18、Stage 19 与 Stage 20 七份相关 contract 文件 SHA-256 全部保持不变。

## 可查产物

- `artifacts/i158-source-remote-host-registration.json`
- `src/host/remote/host-contribution-i158.test.ts`
- `scripts/smoke-i158.mjs`
