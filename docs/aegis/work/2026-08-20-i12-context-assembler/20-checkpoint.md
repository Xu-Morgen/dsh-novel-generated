# I12 ContextAssembler - Checkpoint

## TodoCheckpointDraft

- Current todo: Perform final task-owned diff review and create the single I12 commit.
- Active slice: I12 completion closeout.
- Completed todos:
  - Read I12 authority, architecture, requirements, prior iteration handoff, and B1/B4 consumer seams.
  - Capture TaskStartSnapshot: C:\\Users\\nemo5\\Desktop\\dsh; main at 171484d02805e60ded53cb97f7efd6d76638449e; origin/main ahead 10; clean worktree; no active Git operation; one worktree.
  - Implement the Host-only assembler, B1/B4 serializers, macro expansion, fixed order, and fail-closed fixed budgets.
  - Add positive, negative, consumer, mutation-resistance, and smoke coverage.
  - Complete advisory code review; repair its two Important findings and one Minor finding.
  - Backfill the I12 fixed UTF-16 code-unit budget contract in the plan and design.
  - Re-run pnpm run verify:i12 after the repairs.
- Evidence refs:
  - Authority readback: development plan I12, design §6/§8, requirements R2-6/R3-1.
  - Baseline readback: RuleRepository.listActive and StyleRepository.constantSegment expose structured, deterministic I12 inputs.
  - Advisory review: no Critical findings; dynamic request budget, mutable section order, and macro-capable headings were repaired at the canonical owner.
  - pnpm run verify:i12 after review repairs: passed typecheck; 23 Vitest files / 105 tests; build; deterministic I12 smoke.
- Blocked on: none.
- Next step: inspect the final task-owned delta, stage only I12 paths, commit, and read back the Git receipt.

## Execution Readiness View

- Intent lock: deterministic context assembly only.
- Scope fence: B1 rules and B4 style serializers, fixed order, macro expansion, and budgets.
- Baseline lock: input ownership remains in the existing repositories; this slice is Host/core only.
- Compatibility boundary: no Client, LLM, storage, fallback, or dynamic budget behavior.
- Retirement boundary: no old assembler path exists.
- Test obligations: byte-stability, section order, macro expansion, section/total budget, missing input, unresolved macro, and downstream-consumer fixture.
- Review gate: verify:i12 and task-owned delta review before the one I12 commit.
- Drift / rewind rule: any required new layer serializer, persistence mutation, or runtime service returns the work to plan review.

## DriftCheckDraft

- Scope status: aligned with I12; the only expanded artifact boundary is the required plan/design backfill for the previously unspecified fixed budget values.
- Compatibility status: no new owner, fallback, adapter, migration, public runtime seam, Client, LLM, or storage behavior; request-owned budget configuration was removed.
- Retirement status: no predecessor assembler exists; the rejected dynamic request-budget path never shipped and has no retained compatibility path.
- Execution Readiness View alignment: intent lock, scope fence, Host ownership, compatibility boundary, retirement boundary, test obligations, and review gate all remain satisfied.
- Advisory decision: continue.
