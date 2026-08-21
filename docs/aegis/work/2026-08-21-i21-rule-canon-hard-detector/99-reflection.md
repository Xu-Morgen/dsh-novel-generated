# I21 规则/正史硬约束检测器 - Reflection

- Completed slice: Host `ctx.llm` B1 immutable/C4 hard detector, strict output/reference boundary, I20 reject integration, frozen 15-case corpus, Host/Fiber consumer path, test, smoke, and `verify:i21` command.
- Plan adherence: aligned to development plan I21 and design §9.1; no I22 knowledge, soft checks, parser, writeback, Client, endpoint, fallback, or persistence feature was added.
- Review outcome: initial review found missing production `ctx.llm` wiring, runtime settings validation, and source-reference validation. The follow-up review verified those repairs and found no Critical issues.
- Evidence boundary: the corpus is fake-route controlled because this environment has no credentialed DSH route. Its 5 canonical, 5 held-out, and 15 total cases demonstrate 100% contract-regression accounting against the 90% threshold, not a claim about live-model semantic accuracy. A credentialed model-route corpus evaluation remains the highest-value environment-gated follow-up.
- Retirement: no old detector, fallback, adapter, or duplicate owner was introduced or retained.
- Backlog: run the unchanged frozen corpus against a configured DSH model route and record the external semantic score; do not modify gold, held-out membership, or threshold to accommodate that run.
