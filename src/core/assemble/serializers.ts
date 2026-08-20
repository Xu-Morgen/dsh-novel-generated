import { ruleSchema, type ActiveRuleView } from '../schema/rules.js';
import { styleProfileSchema, type ConstantStyleSegment } from '../schema/style.js';
import { ContextAssemblyError, type ContextAssembler, type ContextSectionSerializer } from './index.js';

/**
 * B1 constant-layer prompt serializer (design §8). It validates consumer views
 * and sorts itself, so equivalent inputs remain stable even when a caller did
 * not obtain them directly from RuleRepository.listActive().
 */
export const ruleContextSerializer: ContextSectionSerializer = {
  id: 'rules',
  heading: 'Rules',
  serialize(source: unknown): string {
    if (!Array.isArray(source)) throw new ContextAssemblyError('Rules context source must be an array');
    const rules = source.map((view) => validateActiveRuleView(view));
    return rules
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
      .map((rule) => {
        const examples = rule.examples.length === 0 ? '' : `\n  examples: ${rule.examples.join(' | ')}`;
        return `- id: ${rule.id}\n  priority: ${rule.priority}\n  scope: ${rule.scope}\n  kind: ${rule.kind}\n  immutable: ${rule.immutable}\n  statement: ${rule.statement}${examples}`;
      })
      .join('\n');
  },
};

/**
 * B4 constant-layer prompt serializer (design §8). The segment's duplicated
 * forbidden view is checked against its canonical profile to reject stale or
 * caller-mutated consumer data rather than silently changing prompt meaning.
 */
export const styleContextSerializer: ContextSectionSerializer = {
  id: 'style',
  heading: 'Style',
  serialize(source: unknown): string {
    if (!isStyleSegment(source)) throw new ContextAssemblyError('Style context source is required');
    const profile = styleProfileSchema.parse(source.profile);
    if (!sameStrings(profile.forbidden, source.forbidden)) {
      throw new ContextAssemblyError('Style forbidden expressions must match the profile');
    }
    const forbidden = source.forbidden.length === 0 ? '(none)' : source.forbidden.map((item) => `- ${item}`).join('\n');
    return [
      `id: ${profile.id}`,
      `name: ${profile.name}`,
      `person: ${profile.person}`,
      `tense: ${profile.tense}`,
      `povScope: ${profile.povScope}`,
      `tone: ${profile.tone}`,
      `proseStyle: ${profile.proseStyle}`,
      `chapterFormat: ${profile.chapterFormat}`,
      `dialogueConventions: ${profile.dialogueConventions}`,
      'forbidden:',
      forbidden,
    ].join('\n');
  },
};

/** Register the two fixed I12 serializers in their canonical section registry. */
export function registerI12Serializers(assembler: ContextAssembler): ContextAssembler {
  return assembler.register(ruleContextSerializer).register(styleContextSerializer);
}

function validateActiveRuleView(value: unknown) {
  if (!isActiveRuleView(value)) throw new ContextAssemblyError('Invalid active rule context source');
  const rule = ruleSchema.parse(value.rule);
  if (!rule.active || value.scope !== rule.scope || value.priority !== rule.priority || value.immutable !== rule.immutable) {
    throw new ContextAssemblyError(`Invalid active rule context source: ${rule.id}`);
  }
  return rule;
}

function isActiveRuleView(value: unknown): value is ActiveRuleView {
  return typeof value === 'object' && value !== null && 'rule' in value && 'scope' in value && 'priority' in value && 'immutable' in value;
}

function isStyleSegment(value: unknown): value is ConstantStyleSegment {
  return typeof value === 'object' && value !== null && 'profile' in value && 'forbidden' in value && Array.isArray(value.forbidden);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
