# AI 长篇小说创作器

AI 长篇小说创作器是 Electron 本地桌面应用。它以 13 层结构化叙事状态为核心，提供分层上下文组装、LLM 候选生成、正史账本、一致性检查、受控导入导出和作者工作流。

Electron 是唯一生产宿主：Main Process 拥有作品文件、凭据、LLM、领域服务和任务；Preload 只暴露版本化 strict IPC；Renderer 只负责 React UI 和瞬态交互。生产包不依赖或启动 DSH、Cordis、Web server 或 PWA。

- [设计文档](docs/novel-creation-tool-design.md)（v4.0，产品与架构权威）
- [需求文档](docs/novel-creation-tool-requirements.md)（v4.0，需求与验收权威）
- [开发计划](docs/novel-creation-tool-development-plan.md)（v4.0，I166–I186 桌面迁移与发布收口）
- [Stage 36 发布基线](docs/desktop-release-baseline.md)

## 唯一作者流程：12 步

以下 12 步是产品的**唯一主要交付流程**，也是产品级端到端测试的规范顺序：

1. 导入创作思路、故事梗概、幕后设定或已有正文；系统建议来源类型，作者确认“原文是什么、希望把它变成什么”以及适用的 POV/揭示意图。
2. AI 按已确认的来源语义生成大纲候选：幕后素材按主角可体验的调查与揭示顺序叙事化，已有正文保持原文并反向整理大纲；作者审阅并确认。
3. 作者选择某一幕、某一章或全书，由 AI 生成细纲。
4. 作者修改细纲，并将近期场景设为“生成基线”。
5. AI 按一张细纲卡生成一个正文候选。
6. 作者接受为草稿、要求重写或手工微调；接受为草稿只保存正文，不提前改写故事状态。
7. 系统分析作者最终保存的正文：自动更新可确定性派生的信息，并展示人物状态、关系、知情、正史等变化以及对后续细纲的影响和调整建议。
8. 作者在一个汇总预览中一次确认需要应用的变化；未确认、拒绝或失败均不得修改叙事真相。
9. 当前细纲标记为“正文已完成”，系统自动进入下一张有效细纲卡。
10. 下一次生成只使用当前有效细纲、作者最终保存的正文、已确认的故事状态，以及当前 POV 有权知道的信息。
11. 所有细纲完成后进行全书一致性检查，存在阻断问题时不得进入正式导出。
12. 系统生成章节目录并导出一份完整 TXT 或 Markdown；DOCX 仅作为未来可选能力。

系统只自动处理可重建的镜像、索引、统计、影响分析、建议生成、确认后的进度推进和上下文组装；人物命运、剧情方向、后续细纲语义、正史等作者语义必须先展示再确认。普通保存或纯措辞修改不会静默改写后续细纲。

步骤 1 先确认来源角色、当前目标处理以及适用 POV/揭示意图，再把来源交给同一条作者流程。

### 产品测试流程

| 步骤 | 必须观察到的作者结果 | 主要证据 |
| --- | --- | --- |
| 1–2 解释来源并确认大纲 | 来源角色、目标处理和 POV/揭示意图先经作者确认；大纲候选遵循确认后的来源语义 | I141–I149、I151 |
| 3 按范围生成细纲 | 当前选择直接确定生成范围；已有卡和范围外内容受保护 | I133–I134、I150 |
| 4 修改并建立基线 | 作者保存的细纲是真相；细纲变化会使旧基线失效 | I108 |
| 5 每卡生成一个候选 | 候选绑定章节、场景、细纲卡和新鲜基线 | I62–I63、I105、I109–I110 |
| 6 接受为草稿并微调 | 接受、重写、手改互不混淆，候选不会提前改写其他叙事层 | I61、I70、I135 |
| 7 分析最终正文 | 展示五层变化、确定性引用变化和细纲影响 | I109–I118、I135 |
| 8 一次确认 | 一个汇总计划、一次确认、一个 Host 写请求；失败不得半应用 | I135–I136 |
| 9 完成并前进 | 当前卡完成并进入下一张有效卡；没有幽灵目标 | I114、I136 |
| 10 只用有效上下文 | 排除旧草稿、失效基线和 POV 不应知道的信息 | I18、I121 |
| 11 全书检查 | 必需细纲未完成或存在硬阻断时，导出门关闭 | I137 |
| 12 单文件导出 | TXT/Markdown 各自包含稳定章节顺序、目录、标题和正文 | I138 |

## 环境要求

| 依赖 | 版本要求 |
| --- | --- |
| Windows | Windows 10/11 x64（首发支持平台） |
| Node.js | `>= 22`，仅用于开发、测试和构建 |
| pnpm | `11.22.0`（见 `package.json` 的 `packageManager`） |

最终用户不需要安装或启动 DSH。LLM 凭据由桌面应用的 Main Process 管理；不可用的系统安全存储会 fail closed。

## 构建桌面应用

```bash
git clone <repo-url> novel-creation-tool
cd novel-creation-tool
pnpm install
pnpm run typecheck
pnpm run build:desktop
pnpm run package:desktop
```

构建产物位于 `dist/desktop/`；Windows 安装包和更新元数据位于 `artifacts/desktop/`：

- `Novel-Creation-Tool-Setup-<version>.exe`：per-user NSIS 安装包；
- `latest.yml` 与 `.blockmap`：当前安装包的更新元数据；
- `win-unpacked/`：用于本地打包应用 smoke 的目录。

## 安装、升级与作品保留

双击安装包，或在 PowerShell 中执行：

```powershell
Start-Process .\Novel-Creation-Tool-Setup-2.0.0.exe -Wait
```

应用默认把作品库放在 Electron `userData` 下的 `library/`；作品文件是 source of truth。升级、卸载和重装都不会删除作者作品数据。卸载只移除应用文件，重装后可重新打开保留的作品库。

旧 DSH 作品不会自动移动。迁移必须在应用内经过“预览 → 备份 → 校验 → 作者确认 → 复制”，失败可回滚；源目录只读且源 hash 必须保持不变。迁移不读取或复制旧凭据。

## 验证与发布证据

单个迭代和 Stage 36 使用固定命令：

```bash
# 全量确定性回归；Windows 文件 I/O 验证使用单 worker
pnpm test --maxWorkers=1

# Stage 36 最后一张迭代卡
pnpm run verify:i186

# Stage 36 累积门
pnpm run verify:stage-36
```

可检查的发布证据：

- [`artifacts/i184-windows-artifacts.json`](artifacts/i184-windows-artifacts.json)：安装、升级、卸载保留与重装包 hash；
- [`artifacts/i185-security-recovery.json`](artifacts/i185-security-recovery.json)：安全审计、C5 journal 崩溃恢复、单实例和临时清理；
- [`artifacts/i186-release-readiness.json`](artifacts/i186-release-readiness.json)：12 步产品流、strict IPC、迁移/安装/恢复和打包 Main/Renderer E2E 发布清单。

## 当前边界与非目标

- 作品文件仍是唯一叙事真相；镜像、索引和统计可重建；所有用户确认复用同一 ConfirmationGate。
- Renderer 不接触 Node、文件、路径、secret、provider client 或任意 IPC channel；所有长期副作用归 DesktopLifecycle。
- 角色、世界观、关系、状态、正史、知情、时间线、审校、版本、搜索、统计、队列和设置保留为故事资料、进阶工具或设置，不与 12 步流程并列争夺默认入口。
- 不做 Web/PWA 双宿主、多用户服务、云同步、F1/F2 后置导入包、向量检索、DOCX 正式交稿编译或自动发布上传。

## 项目结构

```text
src/core/       # 领域核心、Schema、状态、正史、写队列与确认门
src/llm/        # Main-owned LLM ports、解析、校验与模板
src/host/       # 迁移来源领域服务
src/app/        # framework-neutral 组合与 ports
src/platform/   # Electron/平台 adapters
src/desktop/    # Main、Preload、Renderer
src/extensions/ # 产品内部扩展点，不是外层插件
scripts/        # 构建、回归与发布 smoke
samples/        # 不可变 LLM 样本、held-out 与 gold
contracts/      # canonical strict IPC 与其他契约锁
artifacts/      # 可检查的 smoke/发布证据
```

## 开发纪律

一迭代一任务；每个 Ixx 必须先通过对应 `verify:iN`，再单独创建一个 commit。LLM prompt/schema 变更必须先冻结样本与 held-out；集成先使用 fake backend；测试失败不得修改样本、gold 或阈值掩盖问题。

许可证见 [LICENSE](LICENSE)。
