# I12 ContextAssembler - Reflection

- Result: I12 closes as a Host/core-only deterministic context-assembly slice.
- Key decision: Fixed order and fixed budgets are assembler-owned invariants, not request parameters. The exact UTF-16 code-unit limits are now explicit in the I12 plan/design contract.
- Avoided misfix: No caller-side guard, model/config seam, Client path, fallback, or repository mutation was added.
- Residual risk: Budget units are intentionally pre-tokenizer UTF-16 code units. A future model-aware budget change requires its own authority update and compatibility verification; it is not an I12 override.
- Handoff: I13 may extend serialization only through an explicit new section contract while preserving the I12 B1/B4 owner and ordering guarantees.
