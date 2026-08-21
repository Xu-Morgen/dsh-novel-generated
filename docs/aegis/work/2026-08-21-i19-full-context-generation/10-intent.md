# I19 Full Context Generation — Intent

- Requested outcome: Complete I19 in the v2.0 development plan.
- Scope: Host-only full prompt assembly and fake-`ctx.llm` candidate generation from existing B1–B5/C1–C5 views.
- Non-goals: persistence writeback, consistency detection, parsers, Client, Extensions, real endpoint access.
- Baseline read set: `AGENTS.md`; development plan I12–I19; requirements §§0.3, R3-5/R3-6; design §§0.1.2, 6.3, 8.1.
- Owner boundary: `core/pipeline` owns deterministic view composition; `host/story-generation-service` owns the existing Host LLM route invocation; stores retain their existing ownership.
- TDD Route: Mode off / Decision skipped / post-change regression and smoke.
