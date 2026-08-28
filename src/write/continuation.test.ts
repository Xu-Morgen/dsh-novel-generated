import { describe, expect, it } from 'vitest';
import { filterKnowledge } from '../core/knowledge/filter.js';
import { ContextAssembler } from '../core/assemble/index.js';
import { registerContextSerializers } from '../core/assemble/serializers.js';
import { assembleStoryContext, type StoryGenerationSources } from '../core/pipeline/index.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import { buildContinuationPrompt } from './continuation.js';

function sources(): StoryGenerationSources {
  return {
    context: {
      macros: { user: 'Author', pov: 'mira' },
      sources: { rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }], style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] }, characters: [], worldview: [], relationships: { relationships: [], characterIds: [] }, state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } },
    },
    navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross the harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross the harbor.', deviationIds: [] },
    knowledge: filterKnowledge('mira', [], [{ characterId: 'mira', knows: [] }]), canon: [], history: { recentScenes: [], historicalSummaries: [] },
  };
}

describe('I44 continuation prompt', () => {
  it('keeps current state context and adds explicit detail-beat continuation intent', () => {
    const context = assembleStoryContext(registerContextSerializers(new ContextAssembler()), sources());
    const prompt = buildContinuationPrompt(context, { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: ['notice key'], status: 'writing' }, sources().navigation);
    expect(prompt).toContain('续写 agent');
    expect(prompt).toContain('当前细纲: Find key');
    expect(prompt).toContain('## State');
    expect(prompt).toContain('## Outline');
    expect(prompt).toContain('当前 POV: mira');
  });

  it('rejects a missing explicit navigation instruction', () => {
    const context = assembleStoryContext(registerContextSerializers(new ContextAssembler()), sources());
    expect(() => buildContinuationPrompt(context, { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: [], status: 'writing' }, { ...sources().navigation, instruction: '' })).toThrow(/navigation/);
  });

  it('I92 rejects a navigation that diverges from the assembled context outline (forked view)', () => {
    const context = assembleStoryContext(registerContextSerializers(new ContextAssembler()), sources());
    const forked: OutlineNavigation = { ...sources().navigation, beatId: 'beat-other', instruction: 'Take the other route.' };
    expect(() => buildContinuationPrompt(context, { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: [], status: 'writing' }, forked))
      .toThrow(/Navigation mismatch.*forked view/);
  });

  it('I92 accepts navigation that equals the assembled context outline (same truth)', () => {
    const context = assembleStoryContext(registerContextSerializers(new ContextAssembler()), sources());
    const same = { ...sources().navigation };
    expect(() => buildContinuationPrompt(context, { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: [], status: 'writing' }, same)).not.toThrow();
  });
});
