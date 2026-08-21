# I29 B2 世界观改写 parser — Intent

## Slice Card

- Goal: 将已接受正文解析为严格 B2 supersede proposal；任何改写先经 I11 `ConfirmationGate`，由既有 `WorldRepository` 执行“旧条目 rewritten + 新条目”的唯一持久化写入。
- Parent plan/spec: `docs/novel-creation-tool-development-plan.md` I29；`docs/novel-creation-tool-design.md` §5.4、§6.6；`docs/novel-creation-tool-requirements.md` R1-B2、R2-7、R5-5、R5-6。
- Files: `src/llm/parse/worldview.ts`、相邻测试、`src/host/worldview-parser-service.ts`、插件装配测试、`samples/i29/cases.json`、`scripts/smoke-i29.mjs`、`package.json`。
- Boundary: B2-only；不得原地覆盖，且不触及 C1/C2/C3/C4/B3/B4/B5/C5、跨层编排或 `WorldRepository` 既有写入语义。
- Verification: `pnpm run verify:i29`、`pnpm test`。
- Stop: 未确认即可写入、目标不是 active/mutable 条目、重复/非法 replacement 能通过，或 held-out 低于 80%，即停止并只在 I29 边界内修复。

## Baseline usage

- Required and acknowledged: plan I29；design §5.4/§6.6；requirements R1-B2/R2-7/R5-5/R5-6；I8 B2 schema/repository/service；I25–I28 parser shape；I11 Gate。
- Missing refs: none.

## TaskStartSnapshot

- Root: `C:\Users\nemo5\Desktop\dsh`
- HEAD: `138eb35bf12196fa2aa5096bd124290fbe48fcc3`
- Branch: `main`; upstream: `origin/main`; divergence: ahead 13 / behind 0.
- Worktree: `C:/Users/nemo5/Desktop/dsh` on `refs/heads/main`; no active Git operation.
- Git state before I29: no staged, unstaged, or untracked paths; `git diff --check` passed.

## Change Necessity

- User-visible need: accepted narrative must revise mutable worldview facts without losing the superseded historical entry.
- No-change / non-code option: I8 can mechanically rewrite a supplied replacement but cannot recognize or gate a B2 proposal from prose.
- Why code change is necessary: I29 explicitly requires a Host-routed, strict, B2-only narrative parser and confirmation-first supersede boundary.
- Minimum change boundary: parser/service adapter plus tests, frozen corpus, smoke, and script wiring; retain `WorldRepository` and I11 as canonical owners.
- Decision: code-change.

## Complexity Budget / Pre-Edit Owner-Fit

- Artifact class: new I29 parser module with mirror-pattern Host facade and test fixture.
- Target files / artifacts: new I29-owned parser/service/test/sample/smoke paths; narrow `src/index.ts` and `package.json` wiring only.
- Current pressure: prior parsers are separated by layer; no mixed-purpose owner needs new responsibility.
- Projected post-change pressure: one B2 parser seam, no fallback or duplicate persistence owner.
- Budget result: within-budget.
- Planned governance: add the B2 responsibility only in its own parser/service files; preserve repository and gate ownership.
- Pre-Edit Complexity Check: new files, safer boundary is an I29-only module; decision `add owner file`.
- Pre-Edit Owner-Fit Decision: wiring-only in `src/index.ts`; new responsibility in `src/llm/parse/worldview.ts`; decision `add owner file`.
