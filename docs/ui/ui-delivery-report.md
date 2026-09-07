# Electron UI 交付记录（Stage 38 / I188–I194）

日期：2026-09-07。依据设计 §14.34、需求 R36、计划 §38A；原型仅作参考，交付对象为 desktop 分支的真实 Electron 应用。

## 页面与组件

| 迭代 | 完成交付 | 独立提交 |
|---|---|---|
| I188 | 暖纸/墨色/朱砂 token、公共按钮/表单/焦点/状态与真实宿主主题作用域 | `30ea419` |
| I189 | 应用框架、作品库、中文创建、打开/归档/恢复、当前任务与恢复入口、可收起导航 | `9f5918f` |
| I190 | 来源原文/分类/未决审阅、确认范围、初始化规则与文风、失败重试 | `a0710e7` |
| I191 | 大纲/细纲、合并章节场景导航、正文/候选/版本/素材四模式、保存保护、独立定稿、删除影响 | `87146d9` |
| I192 | 角色/世界观/关系/状态/正史/知情/时间线/规则文风、审校/引用审查、队列、搜索/统计、导入导出/备份 | `91620d5` |
| I193 | 创作与 AI 设置、助手、迁移、全局异常、离开保护、键盘焦点及窄窗导航 | `3e04f4b` |
| I194 | 来源感知计划与普通六层分析真实接线、完整作者发布流程、最终状态收口、打包及累积验收 | 本报告所在 `feat(I194)` 提交 |

公共视觉 owner 为 `src/client/styles/{tokens,controls}.ts`；Renderer Button 复用这一套样式，宿主样式只管理几何。路由、必要 DOM 锚点、strict IPC、Main 领域所有权、I11 和保存/取消/重试合同保持。新调用均使用已有 canonical 方法；新增公开 IPC 方法为零。

## 按钮覆盖

原始 241 项全部分类：226 已实现、9 合并、6 退役。逐项文案、级别、位置、可用条件、实现及消费者证据见 [实施账本](ui-button-implementation.json)。新增来源计划/队列审阅等入口单列，不冒充原始按钮数量。

最终运行记录：163 个控件族实际可见，95 个控件族实际点击，293 次原生鼠标操作，87 张截图。

运行时观察与原生点击由 `scripts/ui-electron-session.mjs` 记录；汇总为 `artifacts/desktop/ui/button-coverage.json`。共享锚点按控件族匹配，不能解释为全部循环实例或所有条件子状态均已逐一点击。未实点分支列出确定性/负向消费者证据；原型 89 项检查不计入应用验收。

## 验收证据

- `pnpm run verify:i194`：227 个测试文件、1182 项测试通过；typecheck、build 与 18 项真实 Electron 作者流程检查通过。日志 `artifacts/i194-verify.log`。
- `pnpm run verify:stage-38`：exit 0，日志 `artifacts/stage-38-verify.log`，覆盖全量回归、I187–I194 累积 smoke、Windows 打包、packaged 作者流程、I186 发布门、既有 samples 与 I140/I149/I151。
- 分片真实检查数：I188 5、I189 11、I190 12、I191 19、I192 33、I193 24、I194 18；打包应用另跑同一套 18 项作者检查。各目录的 `validation.json` 和 `controls.json` 是可查证据。
- 完整路径：创建作品 → 导入并处理未决来源 → 明确确认 → 规则/文风 I11 初始化 → 来源计划编辑/取消/恢复/应用 → 正文候选 → 接受草稿 → 细纲写作状态与场景绑定 → 重写 → 独立定稿确认 → 全书发布门放行 → Main 编译全文。普通 expand-outline 路径另验逐层编辑、重生成取消/确认及六层应用。
- 负向与恢复：来源未决阻止继续、生成/计划确认前零写、保存失败保留输入、离开取消保留草稿、陈旧正文/基线拒绝、定稿部分失败不结清候选、未完成卡阻止发布、队列同一失败任务重新排队并成功恢复、删除阻塞与取消、归档只读/恢复。
- 助手真实续写先零写，接受后落入新场景；灵感走 native LlmBackend；迁移在隔离旧库副本中完成预览/确认/撤销。宽度 1366/1440、1024、720、440，以及键盘焦点、长中文、缩放均有对应 smoke。

代表截图：

| 场景 | 路径 |
|---|---|
| 分片作品库、导入、正文四模式、资料、设置与迁移 | `artifacts/desktop/ui/i188` 至 `i193` |
| 来源计划与明确确认 | `artifacts/desktop/ui/i194/source-plan-confirmation.png` |
| 真实定稿完成 | `artifacts/desktop/ui/i194/finalization-complete.png` |
| 全书发布门放行 | `artifacts/desktop/ui/i194/book-ready.png` |
| 导出页面及实际编译文本 | `artifacts/desktop/ui/i194/author-export.png`、`author-manuscript.txt` |
| 最终打包应用同一作者流程 | `artifacts/desktop/ui/i194-packaged` |

模型成功路径使用固定 HTTP 测试 provider，仅替代模型服务边界；页面、Main、preload、IPC、领域文件与 I11 均为真实应用。固定小说文本不作为真实模型质量证据。全文由实际 Main 编译并保存为 smoke 证据；该作者脚本不声称自动点击了 Windows 保存对话框，原生文件端口与安装生命周期另由既有发布回归验证。没有修改 prompt、schema、样本、金标或阈值。

## 发布物与边界

Windows 安装包：`artifacts/desktop/Novel-Creation-Tool-Setup-2.0.0.exe`；可直接运行：`artifacts/desktop/win-unpacked/Novel Creation Tool.exe`。I186 发布审计重跑证据另存 `artifacts/desktop/ui/i194-release/`，避免改写历史迭代的已提交报告。

UI 范围内无未完成阻塞项。明确后置：多窗口、Renderer profile store、主题切换、关系图谱、F1/F2；本次不声称实现 v4.1 多 Renderer/profile 运行时。安装器沿用既有默认 Electron 图标。I150 历史 smoke 的旧 183/89 元数据锁计数不适用现行 additive 合同，已单独记录；现行合同回归、适用开发/held-out 样本均不降低阈值。

## 交接块

刚完成：I188–I194 / Stage 38 暖纸 UI 改造及真实 Electron/打包作者流程。

下一步：本次 UI 任务结束；后续工作需另立尚未占用的 I195 起连续迭代，不自动执行后置功能。

本阶段合同：新增公开 IPC 为零；唯一视觉 owner、原锚点兼容/合并清单、现有来源/写作/定稿 owner 的内部组合接线已记录在设计 §14.34 与 DoD。

Backlog：上述明确后置项及历史元数据 smoke 整理。用户原始未跟踪 UI 设计文件保留，未纳入本次提交。
