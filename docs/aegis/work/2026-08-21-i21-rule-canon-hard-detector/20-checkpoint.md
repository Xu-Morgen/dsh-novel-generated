# I21 规则/正史硬约束检测器 - Checkpoint

## Slice Card

- Goal: 交付 I21 的 Host LLM B1 immutable/C4 硬约束检测与 I20 reject 消费者夹具。
- Parent plan/spec: `docs/novel-creation-tool-development-plan.md` I21；设计 §9.1；需求 R4-2。
- Files: `samples/i21/`、`src/llm/validate/`、I21 smoke/verify、I21 工作记录。
- Boundary: 不实现知情、软检查、parser、写回、Client 或真实 endpoint。
- Verification: `pnpm run verify:i21`，随后 `pnpm test`。
- Stop: 样本不达阈值、输出不能 fail-closed、或范围越界。

## TodoCheckpointDraft

- Current todo: follow-up review and final Git closeout.
- Active slice: I21 post-repair review.
- Completed todos: baseline 已读；TaskStartSnapshot 已记录；15-case frozen corpus（canonical 5，held-out 5）已建立；严格 parser、Host-port detector、I20 reject fixture、Host `ctx.llm` facade/Fiber wiring、smoke/verify 已实现；审查指出的 settings 与引用验证缺口已修复。
- Evidence refs: design §9.1; plan I21/§0.6; requirements R1-B1/R2-8/R4-2; I20/I17 contracts; `pnpm run verify:i21` passed（35 files/156 tests + build + smoke）。
- Blocked on: none. The upstream adapter mismatch was repaired in the separate I17 corrective commit `1f69a49`.
- Next step: final task-owned diff review and I21 commit.

## DriftCheckDraft

- Scope status: aligned with I21 rule/canon hard detector only.
- Compatibility status: reuses I17 Host port and I20 adjudication; no new fallback, adapter, service, persistence writer, or Client path.
- Retirement status: none required; no old implementation replaced.
- Advisory decision: continue.
