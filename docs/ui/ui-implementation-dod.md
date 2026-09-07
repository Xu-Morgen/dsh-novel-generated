# Electron UI 实施与交接账本

授权：2026-09-07 用户明确授权 UI 全流程、多迭代连续执行与本地提交。
基点：desktop / 0412517；I187 治理提交 f489a83 已存在。原有未跟踪 docs/ui 设计材料保留，不作为生产验收证据。

## I188 / UI-A：视觉基础与公共控件

- 状态：验收通过；待本卡独立提交后进入 I189。
- 目标：暖纸、墨色、朱砂的唯一色表覆盖整个桌面根；迁出章节文件中的公共按钮、表单与状态样式，提供公共按钮呈现适配器。
- Owner：`src/client/styles/tokens.ts` 唯一色表；`src/client/styles/controls.ts` 公共控件；`src/desktop/renderer/ui/` 呈现组件；`renderer.css` 仅宿主页面几何；navigation/responsive/layers 只删除旧主题与迁出的公共规则。`styles.ts` 保持唯一组合器。
- 兼容：继续支持所有 `--nv-*`、`.nv-btn*` 与 `data-novel-*` 消费者；删除 DSH token 转发与暗色选择器，不新增主题切换；业务方法、disabled、保存和确认语义不变。
- 交付物：生产 theme/controls、作品目录及助手消费者、回归与负向断言、`verify:i188`、真实 Electron 截图及 JSON smoke。
- 确定性验收：整个 root 中目录、助手和进度能解析颜色/字体；默认、主、轻、危险、选择按钮状态可区分；键盘焦点可见；原 disabled 不触发 callback；忙碌按钮保留名称与禁用原因。
- 负向验收：主题无远程资产/宿主主题依赖；无重复 `.nv-btn` owner；无 provider/IPC/schema/prompt/样本改动。
- 验证：`pnpm run verify:i188`（typecheck、pnpm test、build、真实 Electron smoke）。截图为真实 production entry，组件夹具另外标明。
- 明确不做：页面重排由后续卡负责；不夹带多窗口、profiles、关系图、F1/F2。
- 完成证据：`pnpm run verify:i188` exit 0；222 个测试文件 / 1170 断言通过；真实 Electron 5 项检查通过（file 入口/单 root/无 Node、目录主题、按钮与中文入口、键盘焦点、真实创建后的助手主题）。`artifacts/i188-verify.log`；`artifacts/desktop/ui/i188/{validation.json,project-directory.png,created-project.png}`。
- 视觉复核：暖纸与按钮已生效；旧 fixed 工作台仍遮住助手，目录迁移区仍常驻，已明确由 I189 处理；此卡不把颜色可解声称为全部面板可见。

## 后续 DoD

## I189 / UI-B：应用框架、作品库与当前任务

- 前置：I188 已完成，commit `30ea419`。
- 状态：验收通过。实际 Electron 发现桌面 projectOpen 缺失既有 readWorkflowResume 接线，本卡按恢复验收修复；不扩展持久模型。
- 目标：作品标题与当前任务为主体；工作台进入正常布局；助手按需展开、迁移专用入口；保留 20 个稳定 route 与八阶段导航。
- Owner：desktop shell/project-workflow 与新的 directory 呈现、client presenter/workflow、styles/base/navigation/panels/responsive；公共控件仍归 I188 owner。
- 兼容与退役：data-novel 锚点与业务 callback 保持；桌面“折叠”只收导航，旧“关闭”按钮退役为系统窗口控制，作品库仍走既有离开保护；退役桌面 fixed 侧板与宽度拖柄。历史 presenter 分支仍供隔离夹具，不成为第二生产入口。阶段序号不再冒充完成证据；退役未调用的 openedProjectView，存量目录 presenter 入口合并到 ProjectDirectory。
- 交付物：真实目录/新建/归档区、当前任务卡、可折叠进阶导航、助手/迁移入口；回归、负测与 `verify:i189`。
- 验收：真实创建/打开/归档只读/恢复、刷新后任务恢复；助手控件可点击且不被工作台遮挡；迁移只在入口打开时显示；1366/1024/720/440 宽度无页面横向溢出与主操作遮挡；导航收起保留正文；未决来源不显示可继续写作；按钮状态账逐条更新。
- 验证：`pnpm run verify:i189` exit 0；223 文件 / 1173 测试；I188 5 项兼容检查与 I189 11 项真实 Electron 检查通过。`artifacts/i189-verify.log`；`artifacts/desktop/ui/i189/validation.json` 及目录/迁移/助手/归档/1366、1024、720、440px 工作流截图。
- 明确不做：正文单树与资料表单留给 I191/I192；不改 IPC/领域/prompt/样本，不添加新的确认门。

I190–I193 在开始各自生产改动前逐卡填写；每个迭代独立 commit，失败不跨卡。

## 交接

刚完成：I189 应用框架与任务恢复，223 文件 / 1173 测试，I188 5 项 + I189 11 项真实 Electron 检查。下一步：I190 来源导入与审阅。
新增领域/IPC 合同：零。UI token/控件兼容层仅属呈现。
后置：多窗口、Renderer profile store、主题切换、关系图谱、连接测试新能力、F1/F2。
