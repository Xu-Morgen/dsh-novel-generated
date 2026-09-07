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

## I190 / UI-C：来源导入与审阅

- 前置：I189 已完成，commit `9f5918f`。
- 状态：验收通过。
- 目标：来源输入、逐段原文与分类并排、未决计数与固定确认区；统一首次规则文风初稿及初始化操作层次。
- Owner：presenter.ts（仅折叠已送审的原输入）、source-import.ts、import-interpretation-review.ts、onboarding-panels.ts、styles/onboarding.ts；公共控件与 token 继续复用 I188。
- 兼容：全部 data-novel 锚点、来源/段落 ID、split/merge 光标语义、propose/accept/reject 与 I11 不变；原输入与错误不被视觉状态覆盖。字段布局可加容器，不新增领域状态。
- 交付：BTN-001–012、193–201、220–221 文案/级别/选择态；来源审阅原文与决策布局，初始化与规则文风反馈；verify:i190、真实 Electron 来源未决与失败恢复截图。
- 验收：空来源禁用；未决不能确认；保留/排除可重选且具有文字/aria-pressed；错误保留原文与重试同操作；部分初始化失败保留已写事实；全部旧负向/来源/初始化回归通过。
- 验证：`pnpm run verify:i190` exit 0（VITEST_MAX_WORKERS=4），223 文件 / 1174 断言；12 项真实 Electron 检查通过，`artifacts/desktop/ui/i190/validation.json` 与 source-review-{1440,720,440}.png、失败/空来源截图可查。额外 `smoke:i151` 与 `smoke:i189` 通过。
- 记录：首次默认并发出现旧 binder 5000ms 超时，单文件复查通过，降低并发后的全量通过，未改超时/样本/金标/阈值。
- 证据边界：真实 Electron 本卡覆盖未配置 provider 的失败、重试、原文分段/合并、人工裁决与取消；成功生成的初始化 UI 将在最终作者流程验收补齐。既有成功/held-out/I11 回归已通过，不冒充已实测成功模型页面。
- 明确不做：不新增来源保真功能，不改 Main/IPC/prompt/schema/样本，不新建确认门。

## I191 / UI-D：大纲、正文、候选、版本与定稿

- 前置：I190 已提交 `a0710e7`；状态：验收通过。
- 目标：章节与当前章场景合为一棵按需读取的导航，正文占主空间；大纲、候选、正文保存与定稿各按当前状态确定一个主操作。
- Owner：client/layers/{outline,outline-detail-generation,chapters,scene-editor,candidate,branch}.ts，styles/{chapters,layers,responsive}.ts；如需修复键盘焦点，只使用既有 scheduleFocus。
- 实测 owner 补充：desktop/renderer/shell.ts 缺少已有 outlineDetailGeneration namespace 接线，导致生产细纲生成一直显示不可用；补齐既有类型化服务映射，不新增 IPC。真实生成 smoke 作为跨模块消费者。
- 实测 owner 补充：Main c5-handlers.ts 的写作打开只打开 C5，候选 preview 依赖的 B1/B4/C3 尚未打开；在既有 openWriting 组合处打开这三个 owner，消除必须先访问其他编辑页的隐式前置条件。领域方法和 IPC 形状不变。
- 兼容：保留全部章节/场景/四模式/细纲 data-novel 锚点、远程方法和懒读取语义；不增加未选章节场景请求。保存原文和保存后结构重解析仍为两个既有动作；I11 与 stale/hash 拒绝边界不变。
- 交付：生产导航和正文布局、按钮文案与级别、确认范围呈现、消费者与负向回归、verify:i191 和真实 Electron smoke。
- 接线修复补充：Main c5-handlers 补齐已经锁定的 12 个细纲/范围方法 adapter 与生命周期释放；branch list 明确恢复 canonical `{branches}` 结果（旧 adapter 错回裸数组）；scene-editor ops 修复重复导航绕过 dirty guard，放弃继续走既有决定。回归覆盖 strict list 结果、负向参数、未访问资料页的写作消费者和真实 UI。
- 失败呈现补充：删除阻塞列表逐项呈现领域理由（含最后场景保护）；素材管理既有 message 不再遗漏，失败明确保留输入与刷新重试入口。
- 验收：章节/场景 CRUD、模式切换保留输入；保存失败保留草稿、未保存离开取消；版本存档与对比；候选生成/草稿采用/定稿确认完整管道，拒绝与失败仍可见；1440/1024/720/440 中文长正文无横向挤压。
- 验证：typecheck、pnpm test、build、smoke:i191；适用既有 I134/I135/I136/I140/I150 样本与负向回归不降低要求。成功模型路径使用明确标注的确定性测试 provider 经真实 Main LlmBackend/strict IPC，不替换 UI 回调。
- 完成证据：`verify:i191` exit 0，224 文件 / 1175 测试，19 项真实 Electron 检查；`artifacts/i191-verify.log`、`artifacts/desktop/ui/i191/validation.json` 与细纲/正文四宽度/候选/版本/保存失败/定稿/删除截图。固定 HTTP provider 仅替代模型；初始化后的 C3 为显式测试夹具，不声称覆盖来源初始化。
- 样本：既有细纲解析与 I150 dev/held-out 回归 2 文件 / 7 测试通过，未修改语料/金标/阈值。额外历史 `smoke:i150` 的 183/89 锁尾断言不适用于已追加的当前合同，失败已记 `artifacts/i191-samples-i150.log`；正式 I191 验证和现行合同回归通过，未改旧锁绕过。
- 明确不做：不改模型 prompt/schema/金标/阈值，不增加窗口或主题系统；其他资料和设置按 I192/I193。

## I192 / UI-E：故事资料与进阶工具

- 前置：I191 已提交 `87146d9`；状态：已验收。
- 目标：资料编辑层次清晰、长表单按主题展开；审校、队列、搜索、统计和导入导出使用统一主次操作与真实状态反馈。
- Owner：client/layers/{characters,worldview,relationship,state,canon,knowledge,timeline,rule-style,progress,review,reference-review,queue,search,statistics,import-export}.ts 与 styles/{forms,layers,panels,responsive}.ts；公共字体、颜色和控件继续归 tokens/controls，不新增覆盖表。
- 兼容：所有稳定 route 与必要 data 锚点保留；原校验、disabled、保存/取消/重试与 I11 不放宽。导出不同格式若合并，须继续调用原有格式参数并记录锚点迁移。既有 Main adapter 缺陷仅在真实消费者证明后作最小 owner 修复并记录。
- 实测 owner 补充：desktop/renderer/shell.ts 的既有页面加载 effect 遗漏队列刷新；补齐进入页时的状态/场景卡读取，避免未读取就显示空作品；只读轮询不再清除命令失败信息。queue ops 增加暂停请求等待当前候选结束的本地回执，不改变 runState。无领域/IPC 变更。
- 资料消费者补充：characters/worldview/relationship ops 共用 shared.availableDraftId，避免两个中文名都映射到 untitled，或原名设定修订复用原 ID 而失败；仅给新记录/修订分配未占用的临时标识，Main 保留唯一性校验与原契约。实际关系表单原先生成含 + 的非法 ID，统一改用满足既有 ID 合同的新草稿标识；不修改 ID schema。
- 队列消费者补充：panels/index.ts 与 queue ops 接入现有 candidatePanel/novelWriting.preview/adoptDraft；原任务只提示去正文裁决却没有载入该候选的入口。新增「审阅候选」呈现入口，复用原裁决组件与方法；不新增 IPC，不自动接受。Main review-queue-handlers 必须在队列入口打开既有 B1/B4/C3 与 writing owner，队列外部注册候选绕过普通 propose 前置打开，实测 preview 报 Rule project is not open；消费者覆盖外部注册候选审阅。恢复队列候选没有生成基线，保留 previewLayers 拒绝（负向验证），不伪造基线；正文审阅/草稿采用后继续既有定稿流程。
- 队列采用实测修复：host/queue-service 私有候选 ID 生成不再拼接长任务 ID（原值超过既有 64 字符结果合同）；writing-adjudication-service 在 C5 写入前以既有结果 schema 校验 ID，旧超长恢复候选拒绝且零写，作者可用既有重新生成动作。公开合同/schema 不变，新增 Main 消费者与既有恢复夹具的负向断言。
- 交付：上述稳定页面、按钮账本逐项对应、页面与负向消费者、verify:i192、真实 Electron 截图和队列恢复证据。
- 验收：角色/世界观/关系保存及失败输入保留；知情/正史/状态变更确认；审校硬冲突与软警告区分；队列暂停、继续、取消、失败重试；搜索/统计只重建派生数据，导出/恢复保持既有语义；中文长内容和窄宽布局可达。
- 验证：typecheck、pnpm test、build、smoke:i192；模型集成使用固定 HTTP 测试 provider，既有样本不改动，最终阶段累积执行。
- 完成证据：`pnpm run verify:i192` exit 0；225 文件 / 1176 测试，33 项真实 Electron 检查，`artifacts/i192-verify.log`、`artifacts/desktop/ui/i192/validation.json` 及资料、导入预览、搜索、知情确认、队列暂停/失败/审阅截图。模型仅由固定 HTTP provider 替代，C3/C6 为明确测试夹具；不将这些数据声明为完整初始化作者流程。
- 格式兼容：全文 TXT/MD 合并为格式选择和单一 compile 按钮，保留所选格式原 data 锚点；新增队列审阅入口另记账，不混入原 241 声明数量。
- 本片资料/审校/导出等既有子状态由完整消费者与负向回归覆盖，最终 I193 累积补齐作者流程、打包与按钮账本。
- 明确不做：无关系图谱、新主题系统、多窗口、profiles 或 F1/F2；不调整领域合同和 prompt/schema/样本。

## 交接

刚完成：I192 故事资料与进阶工具，225 文件 / 1176 测试，33 项真实 Electron 检查。下一步：I193 设置、辅助面板与整体验收。
新增领域/IPC 合同：零。UI token/控件兼容层仅属呈现。
后置：多窗口、Renderer profile store、主题切换、关系图谱、连接测试新能力、F1/F2。
