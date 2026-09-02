# I152 验收证据

- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm run verify:i152`：通过；212 个测试文件、1152 项测试全绿，Host/Client 构建和 I152 smoke 通过。
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm run verify:stage-21`：通过；Stage 21 累计门全绿。
- Windows 原生 `node scripts\smoke-i152.mjs`：通过；项目依赖由 Windows pnpm 11.22.0 按冻结 lockfile 安装，`@deepseek-ai/dsh-credentials` 可被插件产物解析。
- Windows 原生 `node --expose-internals scripts\smoke-i85.mjs`：通过；真实 rc.2 base+web+plugin boot/stop/restart/uninstall 与 Client ModuleLoader 物化通过。
- 消费者夹具：真实 `0.1.1-rc.2` `LocalCredentialProvider` 经 `NovelLlmConfigService` 保存后生成 `version: 1` / `refs` 文档，既有 refs/records 保留且新引用可立即 resolve。
- 负向夹具：缺失 credentials seam、环境只读遮蔽和 provider 写入失败均 fail closed，且不会提前改写 settings/A2。
- Smoke 产物：`artifacts/i152-credentials-seam.json`。

说明：未显式设置 WSL 的 `TMPDIR`/`TEMP`/`TMP` 时，Vitest 继承 Windows 临时目录并在测试导入前因临时 `ssr` 目录消失而报 `ENOENT`；固定到 `/tmp` 后同一门禁通过，该失败不涉及产品断言。
