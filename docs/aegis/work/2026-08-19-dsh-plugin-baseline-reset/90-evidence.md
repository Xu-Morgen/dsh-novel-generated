# DSH 插件权威基线重置 - Evidence

## Fresh verification (Task 4/5/6)

### I1 verification chain
- `pnpm install` → 56 packages; `@deepseek-ai/cordis@4.0.1` resolved; esbuild build approved via `pnpm-workspace.yaml` (`allowBuilds.esbuild=true`); `pnpm-lock.yaml` generated.
- `pnpm run typecheck` → exit 0.
- `pnpm test` → 1 file, 3 tests passed (service provide / dispose-removal / clean restart).
- `pnpm run build` → `lib/index.js` + `lib/index.d.ts` emitted.
- `pnpm run smoke:i1` → lifecycle smoke + `cordis.yml` loader/include composition smoke both passed.
- `pnpm run verify:i1` → exit 0 (full chain).

### Old-path retirement (negative check)
- `git grep` for `createRoot(` / `VITE_OPENAI_` / `dev:ui` / `build:ui` / `OpenAICompatClient` / `index.html` → no matches in source; only prohibition/provenance text in AGENTS.md, design/requirements, and the Aegis reset plan.
- Retired tracked files deleted: `.env.example`, `scripts/demo-i1a.mjs`, `scripts/demo-i1b.mjs`, `src/core/io/*`, `src/llm/backend/*`, `src/ui/*`, `vite.config.ts`, `projects/demo/text/chapter-001.md`, `package-lock.json`.

### Cross-document consistency
- design v2.0 §0.1 (constitutional host baseline + composition contract + I1/I2 gate) approved by independent spec/quality review.
- requirements v2.0 (H0 + R0–R9, exact I1–I45, `pnpm run verify:iN`/`verify:stage-N`) verified inline; four Important findings resolved (scale smoke R2-10, RelationshipEngine §6.5/D9, manual C5 edit+reparse, sample-first discipline).
- development plan v2.0 (9 stages, I1–I45) and AGENTS.md v2.0 cross-checked inline: stage grouping matches requirements §0.4; bundle-path composition contract present; no v1.4 iteration as current authority.

## Constraints honored
- `.gitignore` (pre-existing uncommitted change) not modified; `birthday-party-planner.js` untouched and still ignored/untracked.
- No live DSH profile or shipped composition modified; `cordis.yml` is local smoke only.

## Residual risk / uncovered scope
- I1 acceptance items requiring a real selected-profile boot/stop/restart (`dsh --profile ... --dump-config` with the plugin installed into a temporary profile) were not executed in this turn; the local loader/include composition smoke and direct Cordis lifecycle smoke cover the equivalent lifecycle locally.
- I2 public out-of-tree Client bundling/Remote contract is intentionally deferred and gated; not attempted here.
