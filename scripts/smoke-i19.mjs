import assert from 'node:assert/strict';
import { filterKnowledge } from '../lib/core/knowledge/filter.js';
import { createStoryGenerationService } from '../lib/host/story-generation-service.js';

const seen = [];
const service = createStoryGenerationService({
  async *stream(request) { seen.push(request); yield { text: 'I19-' }; yield { text: 'CANDIDATE' }; },
});
const result = await service.generate({
  context: {
    macros: { user: 'Author', pov: 'mira' },
    sources: {
      rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The harbor seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }],
      style: { profile: { id: 'style-1', version: 1, name: 'Spare', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'quiet', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'Chinese quotes', forbidden: [] }, forbidden: [] },
      characters: [], worldview: [], relationships: { relationships: [], characterIds: [] },
      state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] },
    },
  },
  navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross the harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross the harbor.', deviationIds: [] },
  knowledge: filterKnowledge('mira', [{ id: 'secret-1', version: 1, fact: 'Mira knows the code.', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'later' }, status: 'hidden' }], [{ characterId: 'mira', knows: ['secret-1'] }]),
  canon: [{ id: 'canon-1', seq: 0, storyTime: 'dawn', kind: 'event', summary: 'The bell rang.', detail: 'warning', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: [], immutable: true, supersededBy: null }],
  history: { recentScenes: [{ id: 'scene-1', index: 0, content: 'Recent prose.', summary: 'recent', beats: [], canonEvents: [], notes: '' }], historicalSummaries: ['Distant summary.'] },
}, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
assert.equal(result.candidate.text, 'I19-CANDIDATE');
assert.equal(seen.length, 1);
assert.match(seen[0].prompt, /## Outline/);
assert.match(seen[0].prompt, /Mira knows the code/);
assert.match(seen[0].prompt, /Recent prose/);
assert.doesNotMatch(seen[0].prompt, /endpoint/);
console.log('I19 smoke passed: full Host context assembled and routed through injected LLM');
