# 架构审查记录索引（docs/architecture-reviews/）

> 用途：集中存放对「AI 长篇小说创作器」的**架构审查 / 审改意见记录**（review record，非设计权威，不覆盖 `docs/novel-creation-tool-design.md` §0.1 宿主基线）。
> 命名约定：文件名带时间戳 `YYYY-MM-DD-…`，按文件名即可判断先后；每份记录内 §9 或等同节维护「进入迭代」跟踪表。
> 收录规则：新增审查意见一律**新建**本文件夹下的时间戳文件，**不修改**既有记录；旧记录仅在其自身生命周期内演进。

## 记录清单（按时间先后）

| 文件名 | 日期 | 顺序 | 进入迭代状态（截至 2026-08-28） |
|---|---|---|---|
| `novel-creation-tool-architecture-review.md`（v1.0，位于 `docs/` 根，2026-08-27 产出） | 2026-08-27 | 第一份 | ✅ 六项路线图全部进入 Stage 15（I75–I84）并完成 |
| `2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0） | 2026-08-28 | 第二份 | ✅ 中级以上条目已进入 Stage 17 修复迭代（I86–I102，development-plan §18）；P0 为 5 个 Remote 死方法（§3.1）；中-低/低项仍在 backlog |

## 进入迭代跟踪约定

- 「已进入迭代」= 该条目已被某迭代卡采纳（在 development-plan 中立项）；完成时更新为「✅ 完成（Ixx）」。
- 「未进入迭代」= 仍在 backlog（development-plan §21 同源）；review v2.0 中-低/低项（validator 骨架、仓储 primitive、import 格式 descriptor 等）仍在此列。
- 当前待执行排期为 **Stage 17 修复迭代 I86–I102（development-plan §18）**；R18 新增功能候选已延后至全部修复迭代之后并重编号为 **I103–I112（development-plan §19）**，仍未排期。
