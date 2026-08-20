import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuleRepository } from '../rules/index.js';
import type { ActiveRuleView, Rule } from '../schema/rules.js';
import type { ConstantStyleSegment, StyleProfile } from '../schema/style.js';
import type { CharacterCore, SceneCharacterView } from '../schema/characters.js';
import type { WorldEntry, WorldEntryHit } from '../schema/worldview.js';
import type { CharacterState, WorldState } from '../schema/state.js';
import { StyleRepository } from '../style/index.js';
import {
  ContextAssembler,
  ContextAssemblyError,
  contextSectionOrder,
  contextTruncationMarker,
  i12ContextBudget,
  i13ContextBudget,
  type ContextAssemblyRequest,
} from './index.js';
import { registerContextSerializers, registerI12Serializers } from './serializers.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i13-'));
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

function character(id: string, over: Partial<CharacterCore> = {}): CharacterCore {
  return {
    id,
    version: 1,
    name: id,
    aliases: [],
    kind: 'supporting',
    personality: 'steady',
    background: 'from the harbor',
    motivation: 'protect the ship',
    goals: [],
    flaws: [],
    abilities: [],
    speechStyle: 'plain',
    staticTraits: [],
    arc: { startingPoint: 'dockhand', desiredEnd: 'captain', keyBeats: [] },
    relationships: [],
    knowledgeIds: [],
    ...over,
  };
}

function sceneCharacter(core: CharacterCore): SceneCharacterView {
  return { character: core, name: core.name, kind: core.kind, pov: core.kind === 'pov' };
}

function worldEntry(id: string, over: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id,
    version: 1,
    kind: 'geography',
    title: `${id} title`,
    content: `${id} content`,
    keywords: [id],
    triggerMode: 'constant',
    weight: 1,
    parent: null,
    mutable: false,
    status: 'active',
    supersededBy: null,
    ...over,
  };
}

function worldHit(entry: WorldEntry, ancestors: string[] = []): WorldEntryHit {
  return { entry, entryId: entry.id, ancestors, level: ancestors.length };
}

function charState(id: string, over: Partial<CharacterState> = {}): CharacterState {
  return {
    characterId: id,
    location: 'deck',
    alive: true,
    health: 'ok',
    mood: 'wary',
    inventory: [],
    condition: 'dry',
    currentGoal: 'wait',
    flags: {},
    ...over,
  };
}

function worldState(over: Partial<WorldState> = {}): WorldState {
  return {
    id: 'state-1',
    version: 1,
    seq: 0,
    storyTime: 'dusk',
    scene: {
      location: 'Harbor',
      timeOfDay: 'night',
      weather: 'fog',
      season: 'winter',
      atmosphere: 'tense',
    },
    characters: [],
    ...over,
  };
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
      characters: [],
      worldview: [],
      state: worldState(),
    },
    ...over,
  };
}

function assembler(): ContextAssembler {
  return registerContextSerializers(new ContextAssembler());
}

function orderOf(prompt: string, heading: string): number {
  return prompt.indexOf(`## ${heading}`);
}

describe('I12 ContextAssembler', () => {
  it('produces byte-stable B1→B4 prompt sections with complete macro expansion', () => {
    const first = assembler().assemble(request());
    const second = assembler().assemble(request({
      sources: { ...request().sources, rules: [...request().sources.rules].reverse() },
    }));

    expect(first).toEqual(second);
    expect(first.prompt).toContain('## Rules\n');
    expect(orderOf(first.prompt, 'Rules')).toBeLessThan(orderOf(first.prompt, 'Style'));
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
      sources: {
        rules: await rules.listActive(),
        style: await styles.constantSegment(),
        characters: [],
        worldview: [],
        state: worldState(),
      },
    });

    expect(result.prompt).toContain('Mira respects the harbor law.');
    expect(result.prompt).toContain('## Style');
  });

  it('fails closed for missing serializers, duplicate registration, malformed sources, and macro headings', () => {
    const incomplete = new ContextAssembler();
    expect(() => incomplete.assemble(request())).toThrow(/Missing context serializer/);

    const registered = assembler();
    expect(() => registerContextSerializers(registered)).toThrow(/already registered/);
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
        rules: [activeRule(rule('large-rules', { statement: 'r'.repeat(3_800) }))],
        style: style({ tone: 's'.repeat(2_700) }),
        characters: [sceneCharacter(character('big', { background: 'c'.repeat(10_000) }))],
        worldview: [worldHit(worldEntry('wide', { content: 'w'.repeat(10_000) }))],
        state: worldState({ storyTime: 't'.repeat(10_000) }),
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

  it('keeps the I12 two-section registrar as a subset that cannot assemble alone', () => {
    const partial = registerI12Serializers(new ContextAssembler());
    expect(() => partial.assemble(request())).toThrow(/Missing context serializer: characters/);
  });
});

describe('I13 B3/B2/C2 serializers and trigger consumption', () => {
  it('assembles the fixed five-section order rules→style→characters→worldview→state', () => {
    const prompt = assembler().assemble(request({
      sources: {
        ...request().sources,
        characters: [sceneCharacter(character('mira', { name: 'Mira', kind: 'pov' }))],
        worldview: [worldHit(worldEntry('harbor'))],
      },
    })).prompt;

    const rules = orderOf(prompt, 'Rules');
    const style = orderOf(prompt, 'Style');
    const characters = orderOf(prompt, 'Characters');
    const worldview = orderOf(prompt, 'Worldview');
    const state = orderOf(prompt, 'State');
    expect(rules).toBeGreaterThanOrEqual(0);
    expect(rules).toBeLessThan(style);
    expect(style).toBeLessThan(characters);
    expect(characters).toBeLessThan(worldview);
    expect(worldview).toBeLessThan(state);
  });

  it('injects only scene-relevant characters, sorted by name then id, with macro expansion', () => {
    const zara = sceneCharacter(character('zara', { name: 'Zara', personality: 'proud', motivation: 'find {{pov}}' }));
    const mira = sceneCharacter(character('mira', { name: 'Mira', kind: 'pov', background: 'hunted by {{user}}' }));
    const result = assembler().assemble(request({
      sources: { ...request().sources, characters: [zara, mira] },
    }));

    expect(result.prompt).toContain('- id: mira');
    expect(result.prompt).toContain('- id: zara');
    expect(result.prompt.indexOf('- id: mira')).toBeLessThan(result.prompt.indexOf('- id: zara'));
    expect(result.prompt).toContain('find Mira');
    expect(result.prompt).toContain('hunted by Lin');
    // Only the two supplied scene characters appear; nothing else is injected.
    expect(result.prompt).not.toContain('- id: absent');
  });

  it('injects only trigger-hit world entries, sorted by entry id, with ancestors when present', () => {
    const harbor = worldHit(worldEntry('harbor', { content: 'the silent teeth of the bay' }));
    const reef = worldHit(worldEntry('reef', { parent: 'harbor', content: 'a jagged outer reef' }), ['harbor']);
    const result = assembler().assemble(request({
      sources: { ...request().sources, worldview: [reef, harbor] },
    }));

    expect(result.prompt).toContain('- id: harbor\n');
    expect(result.prompt).toContain('the silent teeth of the bay');
    expect(result.prompt.indexOf('- id: harbor\n')).toBeLessThan(result.prompt.indexOf('- id: reef\n'));
    expect(result.prompt).toContain('ancestors: harbor');
    // A non-hit entry is never passed to the serializer, so it cannot leak in.
    expect(result.prompt).not.toContain('- id: untouched');
  });

  it('emits a compact structured state snapshot with sorted characters and flags', () => {
    const zed = charState('zed', {
      mood: 'tense',
      inventory: ['lantern', 'map'],
      flags: { wanted: true, alias: 'Ghost' },
    });
    const ada = charState('ada', { alive: false, currentGoal: 'return the key' });
    const result = assembler().assemble(request({
      sources: { ...request().sources, state: worldState({ characters: [zed, ada] }) },
    }));

    expect(result.prompt).toContain('id: state-1');
    expect(result.prompt).toContain('seq: 0');
    expect(result.prompt).toContain('storyTime: dusk');
    expect(result.prompt).toContain('location: Harbor');
    expect(result.prompt).toContain('alive: false');
    expect(result.prompt.indexOf('characterId: ada')).toBeLessThan(result.prompt.indexOf('characterId: zed'));
    // Opaque flags are key-sorted, not insertion-ordered.
    expect(result.prompt).toContain('flags: { alias: Ghost, wanted: true }');
    expect(result.prompt).not.toContain('wanted: true, alias');
  });

  it('truncates over-budget sections deterministically and marks them', () => {
    const oversized = sceneCharacter(character('big', { background: 'c'.repeat(12_000) }));
    const build = () => assembler().assemble(request({ sources: { ...request().sources, characters: [oversized] } }));

    const first = build();
    const second = build();
    expect(first.prompt).toBe(second.prompt);
    expect(first.prompt).toContain(contextTruncationMarker);
    expect(first.sections.find((section) => section.id === 'characters')?.truncated).toBe(true);
    expect(first.sections.find((section) => section.id === 'rules')?.truncated).toBe(false);
    expect(first.sections.find((section) => section.id === 'characters')!.characterCount).toBeLessThanOrEqual(
      i13ContextBudget.sectionCharacters.characters,
    );
  });

  it('omits empty optional sections but keeps the required state section', () => {
    const prompt = assembler().assemble(request()).prompt;
    expect(prompt).not.toContain('## Characters');
    expect(prompt).not.toContain('## Worldview');
    expect(prompt).toContain('## State');
  });

  it('fails closed for invalid character, worldview, and state layer inputs', () => {
    const assemble = (sources: ContextAssemblyRequest['sources']) => assembler().assemble(request({ sources }));

    expect(() => assemble({ ...request().sources, characters: 'bad' as never })).toThrow(
      /Characters context source must be an array/,
    );
    const mismatched = sceneCharacter(character('mira', { name: 'Mira' }));
    expect(() => assemble({ ...request().sources, characters: [{ ...mismatched, name: 'Wrong' }] })).toThrow(
      /Invalid scene character context source: mira/,
    );
    const wrongPov = sceneCharacter(character('mira', { name: 'Mira', kind: 'supporting' }));
    expect(() => assemble({ ...request().sources, characters: [{ ...wrongPov, pov: true }] })).toThrow(
      /Invalid scene character context source: mira/,
    );
    expect(() => assemble({ ...request().sources, characters: [sceneCharacter({ ...character('mira'), kind: 'nope' } as never)] })).toThrow(
      ContextAssemblyError,
    );

    expect(() => assemble({ ...request().sources, worldview: 'bad' as never })).toThrow(
      /Worldview context source must be an array/,
    );
    const hit = worldHit(worldEntry('harbor'));
    expect(() => assemble({ ...request().sources, worldview: [{ ...hit, entryId: 'other' }] })).toThrow(
      /Invalid world entry hit context source: harbor/,
    );
    expect(() => assemble({ ...request().sources, worldview: [{ ...hit, level: 5 }] })).toThrow(
      /Invalid world entry hit context source: harbor/,
    );
    const stale = worldHit(worldEntry('stale', { status: 'rewritten' }));
    expect(() => assemble({ ...request().sources, worldview: [stale] })).toThrow(/World entry hit must be active: stale/);

    expect(() => assemble({ ...request().sources, state: { ...worldState(), scene: undefined } as never })).toThrow(
      /Invalid state context source/,
    );
  });

  it('exposes immutable I13 budgets and the deterministic truncation marker', () => {
    expect(i13ContextBudget).toEqual({
      totalCharacters: 16_000,
      sectionCharacters: { characters: 4_000, worldview: 3_000, state: 3_000 },
    });
    expect(Object.isFrozen(i13ContextBudget)).toBe(true);
    expect(Object.isFrozen(i13ContextBudget.sectionCharacters)).toBe(true);
    expect(contextTruncationMarker).toBe('… [truncated]');
  });
});
