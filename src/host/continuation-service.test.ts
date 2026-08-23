import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filterKnowledge } from '../core/knowledge/filter.js';
import { createContinuationService, type ContinuationRequest } from './continuation-service.js';

const roots: string[] = [];
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
function llm(seen: string[]) { return { async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) { const prompt = request.messages[0].content[0].text; seen.push(prompt); const output = prompt.includes('续写 agent') ? '米拉握紧铜钥匙，推开了门。' : JSON.stringify({ ops: [] }); yield { type: 'text-delta', text: output }; yield { type: 'finish', reason: { kind: 'stop' } }; } }; }
function request(projectId: string, decision: 'accept' | 'reject', writes: string[]): ContinuationRequest {
  return {
    id: `i44-${decision}`, projectId, chapter: { id: 'chapter-1', index: 1, title: '旧港', pov: 'mira', status: 'draft' },
    scene: { id: `scene-${decision}`, summary: '续写旧港。', beats: ['continue'], canonEvents: [], notes: '' },
    sources: { context: { macros: { user: 'Author', pov: 'mira' }, sources: { rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }], style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] }, characters: [], worldview: [], relationships: { relationships: [], characterIds: [] }, state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } } }, navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross harbor.', deviationIds: [] }, knowledge: filterKnowledge('mira', [], [{ characterId: 'mira', knows: [] }]), canon: [], history: { recentScenes: [], historicalSummaries: [] } },
    card: { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: ['notice key'], status: 'writing' }, navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross harbor.', deviationIds: [] }, settings, decision, afterGenerationViolations: [], beforeWritebackViolations: [], parserInputs: { c2: { state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } }, c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] } }, writers: { c2: async () => { writes.push('c2'); }, c1: async () => { writes.push('c1'); }, c3: async () => { writes.push('c3'); }, c4: async () => { writes.push('c4'); }, b2: async () => { writes.push('b2'); } },
  };
}
describe('I44 continuation Host service', () => {
  it('writes structured layers before appending the accepted next scene', async () => { const root = await mkdtemp(join(tmpdir(), 'novel-i44-')); roots.push(root); const seen: string[] = []; const writes: string[] = []; const service = createContinuationService(llm(seen), root); await service.open('demo'); const result = await service.continue(request('demo', 'accept', writes)); expect(result.execution.result.status).toBe('written'); expect(result.scene?.content).toBe('米拉握紧铜钥匙，推开了门。'); expect(writes).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']); expect(seen[0]).toContain('当前细纲: Find key'); });
  it('rejects without parser, layer, or C5 writeback', async () => { const root = await mkdtemp(join(tmpdir(), 'novel-i44-')); roots.push(root); const writes: string[] = []; const service = createContinuationService(llm([]), root); await service.open('demo'); const result = await service.continue(request('demo', 'reject', writes)); expect(result.execution.result.status).toBe('decision-rejected'); expect(result.scene).toBeUndefined(); expect(writes).toEqual([]); });
});
