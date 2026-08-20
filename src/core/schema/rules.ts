import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

/**
 * B1 rule layer (design §5.3): the world's hard, non-violable constraints.
 *
 * Contract / invariants:
 * - `scope` and `kind` are closed enums; unknown values are rejected at the
 *   storage boundary (I7) and later surface as structural violations (I20/I21).
 * - `statement` is required and non-empty: a rule that states nothing is invalid.
 * - `priority` is an integer; larger wins on conflict (stable ordering in the
 *   consumer fixture tie-breaks equal priorities by id).
 * - `immutable: true` marks an absolute hard constraint consumed by the
 *   consistency detectors (design §9.1 / R1-B1); it does not change storage.
 * - `active` gates whether the rule is currently supplied to consumers.
 */

export const ruleScopeSchema = z.enum(['global', 'faction', 'location', 'character', 'item']);
export type RuleScope = z.infer<typeof ruleScopeSchema>;

export const ruleKindSchema = z.enum([
  'physics',
  'magic',
  'technology',
  'genre',
  'taboo',
  'permission',
]);
export type RuleKind = z.infer<typeof ruleKindSchema>;

/**
 * One B1 Rule. `id` and `version` come from the shared persisted identity
 * contract; `version` is caller-owned on create and incremented on update.
 */
export const ruleSchema = baseEntitySchema.extend({
  scope: ruleScopeSchema,
  kind: ruleKindSchema,
  statement: z.string().trim().min(1),
  priority: z.number().int(),
  immutable: z.boolean(),
  examples: z.array(z.string()),
  active: z.boolean(),
}).strict();

export type Rule = z.infer<typeof ruleSchema>;

/** Caller-supplied payload for `create`; `id` is required, `version` defaults to 1. */
export type RuleInput = Omit<Rule, 'version'> & { version?: number };

/** Caller-supplied payload for `update`; `id` must match the target rule id. */
export type RulePatch = Omit<Rule, 'id' | 'version'>;

/** Deterministic consumer view: active rules, highest priority first, id tie-break. */
export interface ActiveRuleView {
  readonly rule: Rule;
  readonly scope: RuleScope;
  readonly priority: number;
  readonly immutable: boolean;
}

/** Reference used by injectors and detectors without re-reading storage. */
export type RuleReference = Pick<Rule, 'id' | 'statement' | 'priority' | 'immutable'>;
