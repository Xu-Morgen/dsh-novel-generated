# I28 C3 知情 parser — Intent

## Slice Card

- Goal: 将已接受正文解析为严格、只前进的 C3 知情操作；通过现有 `KnowledgeRepository` 机械验证与持久化；低置信提案只进入 I11 `ConfirmationGate`。
- Parent plan/spec: `docs/novel-creation-tool-development-plan.md` I28；`docs/novel-creation-tool-design.md` §5.10、§6.6；`docs/novel-creation-tool-requirements.md` R1-C3、R5-4。
- Files: `src/llm/parse/knowledge.ts`、相邻测试、`src/host/knowledge-parser-service.ts`、插件装配测试、`samples/i28/cases.json`、`scripts/smoke-i28.mjs`、`package.json`。
- Boundary: C3-only；不改 C1、B2、泄漏检测或跨层编排；不引入新的 C3 存储 owner。
- Verification: `pnpm run verify:i28`、`pnpm test`。
- Stop: 任何逆向/跨级操作可被 schema 或机械验证绕过，或 held-out 低于 80%，即停止并修复 I28 内实现。

## Baseline usage

- Required and acknowledged: plan I28；design §5.10/§6.6；requirements R1-C3/R5-4；现有 C3 schema/repository/filter；I25/I27 parser 形态与 I11 Gate。
- Missing refs: none.

## TaskStartSnapshot

- Root: `C:\Users\nemo5\Desktop\dsh`
- HEAD: `ace1a6397d608acee9c5bc74bebe597e8b6872df` (`feat(I27): add strict C1 relationship parser`)
- Branch: `main`; upstream: `origin/main`; divergence: ahead 12 / behind 0.
- Worktree: `C:/Users/nemo5/Desktop/dsh` on `refs/heads/main`.
- Git state before I28: no staged, unstaged, or untracked paths; no active Git operation.

## Change Necessity

- User-visible need: accepted narrative must advance C3 revelation/knower state safely.
- No-change / non-code option: existing C3 repository enforces invariants but cannot recognize structured C3 proposals from prose.
- Why code change is necessary: I28 requires a Host-routed, strict, single-layer narrative parser and testable I11 boundary.
- Minimum change boundary: parser/service adapter and fixture validation only, reusing the existing repository as write owner.
- Decision: code-change.
