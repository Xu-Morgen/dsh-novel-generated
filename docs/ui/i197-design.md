# I197 实现边界与验收

Main LlmMonitor 装饰所有生产 LlmBackend，覆盖来源分类、规则文风、叙事生成、正文、审校、助手和队列实际发起的 backend 请求。调用前的领域参数校验和调用后的 schema 校验仍由对应业务面板展示，不冒充 provider 失败。

Main 窗口注册表登记 main/llm-monitor。首次请求自动显示独立 BrowserWindow；关闭辅助窗不中断任务，后续新请求重新打开。主窗关闭同时关闭观察窗，应用退出 dispose 定时器和所有受管窗口。

独立 HTML、React root、preload；辅助 preload 仅发布 novelMonitor.version/subscribe。没有新增领域 invocation，旧 IPC 参数/结果与锁不变；新增 push 事件由 llmMonitorSchema 在 Main 与 preload 双向验证，JSON Schema 锁为 contracts/desktop/llm-monitor.json。

每个请求的 token 只解析一次，provider 与观察层共享同一请求内的值；投影不含 prompt、endpoint、路径或原始异常。正文/推理分开脱敏，在截断前替换完整 secret，并暂存跨 chunk 的 secret 前缀。最多保留 30 条请求、每条正文/推理各 16000 字，仅驻留内存，100ms 合并发送。失败按已知错误类别转换固定中文提示，终态保留。

原 DesktopLlmStreamWindow 页内浮层从生产挂载点移除；原规则文风页内进度条继续兼容，窗口触发不再依赖该业务 method。传输完成只表示 backend 已结束，不代表领域校验或作品写入完成。
