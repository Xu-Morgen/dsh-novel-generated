import { describe, expect, it } from 'vitest';
import { ContextAssembler, type ContextAssemblyRequest } from '../assemble/index.js';
import { registerContextSerializers } from '../assemble/serializers.js';
import { filterKnowledge } from '../knowledge/filter.js';
import { assembleStoryContext, i19ContextBudget, type StoryGenerationSources } from './index.js';

function sources(): StoryGenerationSources {
  return {
    context: {
      macros: { user: 'Author', pov: 'mira' },
      sources: {
        rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }],
        style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'Chinese quotes', forbidden: [] }, forbidden: [] },
        characters: [{ character: { id: 'mira', version: 1, name: 'Mira', aliases: [], kind: 'pov', personality: 'steady', background: 'harbor', motivation: 'protect', goals: [], flaws: [], abilities: [], speechStyle: 'quiet', staticTraits: [], arc: { startingPoint: 'dock', desiredEnd: 'captain', keyBeats: [] }, relationships: [], knowledgeIds: [] }, name: 'Mira', kind: 'pov', pov: true }],
        worldview: [],
        relationships: { relationships: [], characterIds: ['mira'] },
        state: { id: 'state-1', version: 1, seq: 2, storyTime: 'dusk', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] },
      },
    } satisfies ContextAssemblyRequest,
    navigation: { actId: 'act-1', beatId: 'beat-current', title: 'Cross the harbor', description: 'Mira crosses at low tide.', prerequisites: [], prerequisitesMet: true, instruction: '[当前剧情目标] Cross the harbor', deviationIds: [] },
    knowledge: filterKnowledge('mira', [
      { id: 'known-secret', version: 1, fact: 'The seal is cracked.', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'later' }, status: 'hidden' },
      { id: 'hidden-secret', version: 1, fact: 'Lin betrayed the crew.', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'later' }, status: 'hidden' },
    ], [{ characterId: 'mira', knows: ['known-secret'] }, { characterId: 'lin', knows: ['hidden-secret'] }]),
    canon: [{ id: 'canon-1', seq: 0, storyTime: 'dawn', kind: 'event', summary: 'The bell rang.', detail: 'A warning bell rang at dawn.', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: [], immutable: true, supersededBy: null }],
    history: {
      recentScenes: [{ id: 'scene-recent', index: 1, content: 'Recent scene prose.', summary: 'Recent summary.', beats: ['beat-old'], canonEvents: [], notes: '', branches: [] }],
      historicalSummaries: ['Long-ago summary.'],
    },
  };
}

function assemble(input = sources()) {
  return assembleStoryContext(registerContextSerializers(new ContextAssembler()), input);
}

describe('I19 full story context', () => {
  it('orders the fixed context followed by current navigation, filtered C3, C4, and C5 history', () => {
    const result = assemble();
    expect(result.prompt).toContain('## Outline\nbeat: beat-current');
    expect(result.prompt).toContain('## Knowledge\n- id: known-secret');
    expect(result.prompt).not.toContain('Lin betrayed the crew.');
    expect(result.prompt).toContain('## Canon\n- seq: 0');
    expect(result.prompt).toContain('recent scene scene-recent: Recent scene prose.');
    expect(result.prompt).toContain('distant summary 1: Long-ago summary.');
    for (const pair of [['Rules', 'Style'], ['Style', 'Characters'], ['State', 'Outline'], ['Outline', 'Knowledge'], ['Knowledge', 'Canon'], ['Canon', 'History']]) {
      expect(result.prompt.indexOf(`## ${pair[0]}`)).toBeLessThan(result.prompt.indexOf(`## ${pair[1]}`));
    }
  });

  it('changes the generated prompt when the current beat or POV-visible knowledge changes', () => {
    const first = assemble();
    const baseline = sources();
    const changed: StoryGenerationSources = {
      ...baseline,
      navigation: { ...baseline.navigation, beatId: 'beat-next', instruction: '[当前剧情目标] Return home' },
      knowledge: filterKnowledge('mira', [{ id: 'new-known', version: 1, fact: 'A new fact.', kind: 'plotpoint', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'later' }, status: 'revealed' }], [{ characterId: 'mira', knows: ['new-known'] }]),
    };
    expect(assemble(changed).prompt).not.toBe(first.prompt);
  });

  it('fails closed when a caller supplies knowledge for a different POV', () => {
    const baseline = sources();
    const invalid: StoryGenerationSources = {
      ...baseline,
      knowledge: { ...baseline.knowledge, pov: 'lin' },
    };
    expect(() => assemble(invalid)).toThrow(/Knowledge POV/);
  });

  it('fails closed when the non-truncatable current navigation exceeds its budget', () => {
    const baseline = sources();
    const invalid: StoryGenerationSources = {
      ...baseline,
      navigation: { ...baseline.navigation, instruction: 'x'.repeat(i19ContextBudget.sectionCharacters.outline + 1) },
    };
    expect(() => assemble(invalid)).toThrow(/outline/);
  });
});
