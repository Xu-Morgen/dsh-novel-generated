import { ContextAssembler } from '../lib/core/assemble/index.js';
import { registerI12Serializers } from '../lib/core/assemble/serializers.js';

const rule = {
  id: 'harbor-law', version: 1, scope: 'global', kind: 'taboo',
  statement: '{{pov}} must honor the law named by {{user}}.', priority: 10,
  immutable: true, examples: ['No sailor breaks a sworn harbor law.'], active: true,
};
const style = {
  profile: {
    id: 'harbor-style', version: 1, name: 'Harbor noir', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: 'restrained', proseStyle: 'precise sensory detail', chapterFormat: 'location dateline',
    dialogueConventions: 'Use Chinese quotation marks.', forbidden: ['suddenly'],
  },
  forbidden: ['suddenly'],
};

const assemble = () => registerI12Serializers(new ContextAssembler()).assemble({
  macros: { user: 'Lin', pov: 'Mira' },
  sources: { rules: [{ rule, scope: rule.scope, priority: rule.priority, immutable: rule.immutable }], style },
});

const first = assemble();
const second = assemble();
if (first.prompt !== second.prompt) throw new Error('Context assembly was not byte-stable');
if (!first.prompt.includes('## Rules') || !first.prompt.includes('## Style')) throw new Error('Required B1/B4 sections are missing');
if (first.prompt.indexOf('## Rules') > first.prompt.indexOf('## Style')) throw new Error('Fixed section order was not preserved');
if (first.prompt.includes('{{') || !first.prompt.includes('Mira must honor the law named by Lin.')) {
  throw new Error('Context macros were not completely expanded');
}
if (!Object.isFrozen((await import('../lib/core/assemble/index.js')).contextSectionOrder)) {
  throw new Error('Fixed section order is mutable');
}

let rejectedBudget = false;
try {
  registerI12Serializers(new ContextAssembler()).assemble({
    macros: { user: 'Lin', pov: 'Mira' },
    sources: {
      rules: [{ rule: { ...rule, statement: 'x'.repeat(4_000) }, scope: rule.scope, priority: rule.priority, immutable: rule.immutable }],
      style,
    },
  });
} catch {
  rejectedBudget = true;
}
if (!rejectedBudget) throw new Error('Section budget breach was accepted');

console.log('I12 smoke: deterministic B1/B4 assembly, fixed order, macro expansion, and budget rejection passed');
