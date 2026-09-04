# Stage 36 桌面发布基线

状态：I186 收口后发布就绪。首发平台为 Windows 10/11 x64，Electron 是唯一生产宿主。

## 基线结论

- 生产 `dependencies`、桌面 Main/Preload/Renderer bundle、asar 和安装目录不包含 DSH/Cordis/Slot/Typert/ModuleLoader/`ctx.llm`。
- Main 是唯一文件、凭据、LLM、领域服务和写任务 owner；Preload 只暴露版本化 strict IPC；Renderer 不拥有 Node、文件、secret、provider client 或任意 IPC channel。
- 当前 canonical desktop IPC lock 保留 214 invocation 基线，并包含当前已验证的 226 个 strict method descriptors；参数和结果 schema 来自同一 lock。
- 作品文件是 source of truth。安装、升级、卸载、重装、迁移失败和应用异常退出都不得删除或伪造作品真相。
- README 十二步是唯一作者主流程；普通作者无需输入 project ID、fingerprint、source hash 或层编号即可完成导入、生成、定稿、检查和单文件导出。

## 验收矩阵

| 门 | 证据 | 状态 |
| --- | --- | --- |
| 12 步 fake-LLM 产品流、拒绝/stale/失败/POV/发布阻断 | `artifacts/i140-primary-author-workflow.json`、`artifacts/i149-source-aware-product-flow.json`、I186 focused suites | passed |
| 旧库预览、备份、校验、复制、回滚、源不变 | I182 smoke、I186 release smoke | passed |
| clean install、升级、卸载保留、重装重开 | `artifacts/i184-windows-artifacts.json`、I184 smoke | passed |
| CSP、BrowserWindow、导航、新窗口、webview、IPC、凭据和 Renderer 越权门 | `artifacts/i185-security-recovery.json`、I185 smoke | passed |
| C5 journal 进程级崩溃恢复、重启、单实例、临时清理 | `artifacts/i185-security-recovery.json`、I185 smoke | passed |
| 生产依赖、bundle、asar、226 条 strict IPC lock | I183/I186 static scan | passed |
| 打包 Electron Main/Renderer product boundary | I186 packaged product flow | passed |

## 性能与运行边界

I186 packaged smoke 为 Main/Renderer marker 设置 25 秒启动上限、15 秒退出上限，并把实际耗时写入 [`artifacts/i186-release-readiness.json`](../artifacts/i186-release-readiness.json)。测试回归在 Windows 使用单 worker，避免并行临时目录 I/O 造成既有 5 秒测试超时；不改变测试阈值、样本或 gold。

所有窗口监听、IPC handler、timer、任务和 LLM 请求都归 `DesktopLifecycle` 管理。无界后台补偿、云同步、多用户服务和分布式事务不属于本发布基线。

## 发布命令

```bash
pnpm run verify:i186
pnpm run verify:stage-36
```

两条命令均须在 Windows clean profile 上通过后才可发布。I183、I184、I185、I186 分别保持独立 commit；Stage 36 只在累积门通过后标记完成。
