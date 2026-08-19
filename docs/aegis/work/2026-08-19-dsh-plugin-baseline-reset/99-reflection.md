# DSH 插件权威基线重置 - Reflection

## What landed
- Authority reset: design/requirements/development-plan/AGENTS all v2.0, with DeepSeek Harness as the non-modifiable exclusive host and ordinary persistent bundle plugin as the delivery form.
- Code reset: retired the v1.x independent Node/Vite + browser-LLM implementation and scaffolded a minimal I1 Host Cordis plugin (service lifecycle + local composition smoke), all green under `pnpm run verify:i1`.
- ADR-0001 records why the host identity changed; baseline sync updated the four authority docs.

## Decisions worth remembering
- Production activation = selected-profile `package.json` dependency + `dsh.bundle.patch` + explicit `dsh.profile.bundles` entry, single insertion owner; repo `cordis.yml` is local smoke only.
- Dynamic `cordis_define` and dynamic `harness.handle`/`host.call` are explicitly NOT the release/RPC contract.
- I2 is the only permitted pre-gate Client code (gate-only probe); product Client starts only after its public-contract proof.

## Drift / risk
- The real selected-profile boot/stop/restart acceptance for I1 remains unexecuted (needs a temporary DSH profile install). Local loader+lifecycle smoke covers the equivalent path.
- `lib/` build output is currently untracked; `.gitignore` was deliberately left untouched because it carries a pre-existing uncommitted user change. A later, user-approved `.gitignore` update should add `lib/`.

## Closeout boundary
- This is the completion candidate for the reset change. Method Pack output does not grant completion authority; the user owns the final acceptance of the new architecture baseline.

Method Pack output does not grant completion authority.
