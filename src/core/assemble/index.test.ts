import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuleRepository } from '../rules/index.js';
import type { ActiveRuleView, Rule } from '../schema/rules.js';
import type { ConstantStyleSegment, StyleProfile } from '../schema/style.js';
import { StyleRepository } from '../style/index.js';
import {
  ContextAssembler,
  ContextAssemblyError,
  contextSectionOrder,
  i12ContextBudget,
  type ContextAssemblyRequest,
} from './index.js';
import { registerI12Serializers } from './serializers.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i12-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function rule(id: string, over: Partial<Rule> = {}): Rule {
  return {
    id,
    version: 1,
    scope: 'global',
    kind: 'physics',
    statement: `${id} must hold`,
    priority: 1,
    immutable: false,
    examples: [],
    active: true,
    ...over,
  };
}

function activeRule(item: Rule): ActiveRuleView {
  return { rule: item, scope: item.scope, priority: item.priority, immutable: item.immutable };
}

function style(over: Partial<StyleProfile> = {}): ConstantStyleSegment {
  const profile: StyleProfile = {
    id: 'harbor-style',
    version: 1,
    name: 'Harbor noir',
    person: 'third-limited',
    tense: 'past',
    povScope: 'single',
    tone: 'restrained',
    proseStyle: 'precise sensory detail',
    chapterFormat: 'location dateline',
    dialogueConventions: 'Use Chinese quotation marks.',
    forbidden: ['suddenly'],
    ...over,
  };
  return { profile, forbidden: [...profile.forbidden] };
}

function request(over: Partial<ContextAssemblyRequest> = {}): ContextAssemblyRequest {
  return {
    macros: { user: 'Lin', pov: 'Mira' },
    sources: {
      rules: [
        activeRule(rule('low', { priority: 1, statement: 'Respect {{user}}.' })),
        activeRule(rule('high', { priority: 9, immutable: true, statement: '{{pov}} cannot break the harbor seal.' })),
      ],
      style: style({ tone: 'restrained for {{pov}}' }),
    },
    ...over,
  };
}

function assembler(): ContextAssembler {
  return registerI12Serializers(new ContextAssembler());
}

describe('I12 ContextAssembler', () => {
  it('produces byte-stable B1→B4 prompt sections with complete macro expansion', () => {
    const first = assembler().assemble(request());
    const second = assembler().assemble(request({
      sources: { ...request().sources, rules: [...request().sources.rules].reverse() },
    }));

    expect(first).toEqual(second);
    expect(first.prompt).toContain('## Rules\n');
    expect(first.prompt.indexOf('## Rules')).toBeLessThan(first.prompt.indexOf('## Style'));
    expect(first.prompt.indexOf('id: high')).toBeLessThan(first.prompt.indexOf('id: low'));
    expect(first.prompt).toContain('Respect Lin.');
    expect(first.prompt).toContain('Mira cannot break the harbor seal.');
    expect(first.prompt).toContain('tone: restrained for Mira');
    expect(first.prompt).not.toContain('{{');
    expect(first.characterCount).toBe(first.prompt.length);
  });

  it('consumes existing B1/B4 repository views as a downstream consumer fixture', async () => {
    const root = await temporaryRoot();
    const rules = new RuleRepository(root);
    const styles = new StyleRepository(root);
    await rules.open();
    await styles.open();
    await rules.create(rule('rule-harbor', { priority: 7, immutable: true, statement: '{{pov}} respects the harbor law.' }));
    await styles.save(style().profile);

    const result = assembler().assemble({
      macros: { user: 'Author', pov: 'Mira' },
      sources: { rules: await rules.listActive(), style: await styles.constantSegment() },
    });

    expect(result.prompt).toContain('Mira respects the harbor law.');
    expect(result.prompt).toContain('## Style');
  });

  it('fails closed for missing serializers, duplicate registration, malformed sources, and macro headings', () => {
    const incomplete = new ContextAssembler();
    expect(() => incomplete.assemble(request())).toThrow(/Missing context serializer/);

    const registered = assembler();
    expect(() => registerI12Serializers(registered)).toThrow(/already registered/);
    expect(() => registered.assemble(request({ sources: { ...request().sources, rules: undefined as never } }))).toThrow(
      /Rules context source must be an array/,
    );
    expect(() => new ContextAssembler().register({ id: 'rules', heading: '{{pov}}', serialize: () => 'rule' })).toThrow(
      /heading cannot contain macro syntax/,
    );
  });

  it('uses immutable fixed I12 limits and rejects both section and total budget breaches', () => {
    expect(i12ContextBudget).toEqual({
      totalCharacters: 6_000,
      sectionCharacters: { rules: 4_000, style: 3_000 },
    });
    expect(Object.isFrozen(i12ContextBudget)).toBe(true);
    expect(Object.isFrozen(i12ContextBudget.sectionCharacters)).toBe(true);
    expect(Object.isFrozen(contextSectionOrder)).toBe(true);
    expect(() => (contextSectionOrder as unknown as string[]).reverse()).toThrow();

    expect(() => assembler().assemble(request({
      sources: {
        ...request().sources,
        rules: [activeRule(rule('too-long', { statement: 'x'.repeat(i12ContextBudget.sectionCharacters.rules) }))],
      },
    }))).toThrow(/section budget exceeded: rules/);
    expect(() => assembler().assemble(request({
      sources: {
        rules: [activeRule(rule('large-rules', { statement: 'x'.repeat(3_500) }))],
        style: style({ tone: 'y'.repeat(2_500) }),
      },
    }))).toThrow(/total budget exceeded/);
  });

  it('rejects absent macro values, unknown macros, malformed macro residue, and macro syntax in values', () => {
    expect(() => assembler().assemble(request({ macros: { user: '', pov: 'Mira' } }))).toThrow(/macro value is required: user/);
    expect(() => assembler().assemble(request({ macros: { user: '{{pov}}', pov: 'Mira' } }))).toThrow(/contains unresolved syntax/);
    expect(() => assembler().assemble(request({
      sources: {
        ...request().sources,
        rules: [activeRule(rule('unknown', { statement: '{{missing}} remains.' }))],
      },
    }))).toThrow(/Unknown context macro: missing/);
    expect(() => assembler().assemble(request({
      sources: {
        ...request().sources,
        rules: [activeRule(rule('broken', { statement: '{{pov remains.' }))],
      },
    }))).toThrow(/Unresolved context macro/);
  });

  it('rejects inconsistent B4 forbidden consumer data rather than silently changing the prompt', () => {
    const inconsistent = style();
    const source: ConstantStyleSegment = { ...inconsistent, forbidden: ['different'] };
    expect(() => assembler().assemble(request({ sources: { ...request().sources, style: source } }))).toThrow(
      ContextAssemblyError,
    );
  });
});
