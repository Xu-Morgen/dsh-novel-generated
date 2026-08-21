import { describe, expect, it } from 'vitest';
import { filterKnowledge } from '../core/knowledge/filter.js';
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import { createStoryGenerationService } from './story-generation-service.js';

function sources(): StoryGenerationSources {
  return {
    context: {
      macros: { user: 'Author', pov: 'mira' },
      sources: {
        rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }],
        style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'Chinese quotes', forbidden: [] }, forbidden: [] },
        characters: [], worldview: [], relationships: { relationships: [], characterIds: [] },
        state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] },
      },
    },
    navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross the harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross the harbor.', deviationIds: [] },
    knowledge: filterKnowledge('mira', [{ id: 'secret-1', version: 1, fact: 'Mira knows the code.', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'later' }, status: 'hidden' }], [{ characterId: 'mira', knows: ['secret-1'] }]),
    canon: [], history: { recentScenes: [], historicalSummaries: [] },
  };
}

describe('I19 story generation service', () => {
  it('sends the fully assembled Host prompt to the fake ctx.llm route and returns only a candidate', async () => {
    const seen: string[] = [];
    const service = createStoryGenerationService({ stream: async function* (request: { prompt: string }) { seen.push(request.prompt); yield '候'; yield '选'; } });
    const result = await service.generate(sources(), { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
    expect(result.candidate.text).toBe('候选');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('## Outline');
    expect(seen[0]).toContain('Mira knows the code.');
    expect(Object.keys(service)).toEqual(['generate']);
  });
});
