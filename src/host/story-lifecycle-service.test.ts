import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStoryLifecycleService, type StoryLifecycleRequest } from './story-lifecycle-service.js';
import { StateEngine } from '../core/state/index.js';
import { RelationshipRepository } from '../core/relationship/index.js';
import { KnowledgeRepository } from '../core/knowledge/index.js';
import { CanonLedger } from '../core/canon/index.js';
import { WorldRepository } from '../core/worldview/index.js';
import { ConfirmationGate } from '../core/confirm/index.js';
import { applyC2StateOperations, type C2StateParserOutput } from '../llm/parse/state.js';
import { applyC1RelationshipOperations, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { applyC3KnowledgeOperations, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { applyC4CanonOperations, type C4CanonParserOutput } from '../llm/parse/canon.js';
import { applyAcceptedB2WorldviewSupersedeOperations, proposeB2WorldviewSupersedeOperations, type B2WorldviewParserOutput } from '../llm/parse/worldview.js';

const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i30-host-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

function fakeLlm(seen: string[], full = false) {
  return {
    async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      const output = prompt === '继续写这一幕' ? '米拉在码头找到铜钥匙。'
        : prompt.includes('C2 状态') ? { ops: full ? [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] : [] }
        : prompt.includes('C1 关系') ? { ops: full ? [{ op: 'create', relationship: { id: 'mira-lin', from: 'mira', to: 'lin', type: 'friendship', affinity: 10, trust: 20, status: 'new allies', milestones: [], knownTo: ['mira', 'lin'] }, confidence: 'high' }] : [] }
        : prompt.includes('C3 知情') ? { ops: full ? [{ op: 'advance', targetId: 'secret-1', addHolders: ['lin'], status: 'partially-revealed', confidence: 'high' }] : [] }
        : prompt.includes('C4 正史') ? { ops: full ? [{ op: 'append', event: { id: 'evt-key', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: '米拉在码头找到铜钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] : [] }
        : prompt.includes('B2 世界观') ? { ops: full ? [{ op: 'supersede', targetId: 'harbor-status', replacement: { id: 'harbor-key-route', kind: 'geography', title: '钥匙航路港', content: '码头已发现通向钥匙航路的线索。', keywords: ['码头', '钥匙'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }, confidence: 'high' }] : [] }
        : (() => { throw new Error(`Unexpected prompt: ${prompt}`); })();
      yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

function createWriterPorts(writes: string[]): StoryLifecycleRequest['writers'] {
  return {
    c2: async () => { writes.push('c2'); },
    c1: async () => { writes.push('c1'); },
    c3: async () => { writes.push('c3'); },
    c4: async () => { writes.push('c4'); },
    b2: async () => { writes.push('b2'); },
  };
}

function request(projectId: string, writers: StoryLifecycleRequest['writers'], decision: 'accept' | 'reject' = 'accept') {
  return {
    id: `lifecycle-${decision}`,
    projectId,
    prompt: '继续写这一幕', settings, decision,
    afterGenerationViolations: [], beforeWritebackViolations: [], writers,
    parserInputs: {
      c2: { state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } },
      c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] },
    },
  };
}

describe('I30 Host lifecycle service', () => {
  it('uses fake ctx.llm once for prose and once per isolated parser, then delegates writes in saga order', async () => {
    const seen: string[] = []; const writes: string[] = [];
    const service = createStoryLifecycleService(fakeLlm(seen), await root());
    const writers = createWriterPorts(writes);
    const result = await service.run(request('project-i30', writers));
    expect(result.candidate.text).toBe('米拉在码头找到铜钥匙。');
    expect(result.result.status).toBe('written');
    expect(writes).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(seen).toHaveLength(6);
    expect(seen.filter((prompt) => prompt.includes('不得输出')).length).toBe(5);
  });

  it('persists a fake-ctx.llm full fan-out through the existing C2/C1/C3/C4/B2 owners', async () => {
    const workspace = await root(); const project = join(workspace, 'project-i30-real');
    const state = await StateEngine.open(join(project, 'state'), { id: 'state-1', version: 1, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] });
    const relationships = new RelationshipRepository(project); await relationships.open(); await relationships.saveAll([]);
    const knowledge = new KnowledgeRepository(project); await knowledge.open();
    await knowledge.saveAll([{ id: 'secret-1', version: 1, fact: '钥匙藏在码头。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'dawn' }, status: 'hidden' }], [{ characterId: 'mira', knows: ['secret-1'] }, { characterId: 'lin', knows: [] }]);
    const canon = await CanonLedger.open(join(project, 'canon'));
    const worldview = new WorldRepository(join(project, 'worldview')); await worldview.open();
    const currentWorld = { id: 'harbor-status', version: 1, kind: 'geography' as const, title: '旧港', content: '港口没有航路线索。', keywords: ['港口'], triggerMode: 'keyword' as const, weight: 1, parent: null, mutable: true, status: 'active' as const, supersededBy: null };
    await worldview.create(currentWorld);
    const gate = await ConfirmationGate.open(project, { autoConfirmForTests: true });
    const writers: StoryLifecycleRequest['writers'] = {
      c2: async (output) => { await applyC2StateOperations(state, output as C2StateParserOutput); },
      c1: async (output) => { await applyC1RelationshipOperations(relationships, await relationships.read(), output as C1RelationshipParserOutput); },
      c3: async (output) => { await applyC3KnowledgeOperations(knowledge, await knowledge.read(), output as C3KnowledgeParserOutput); },
      c4: async (output) => { await applyC4CanonOperations(canon, output as C4CanonParserOutput); },
      b2: async (output) => { const parsed = output as B2WorldviewParserOutput; const proposal = await proposeB2WorldviewSupersedeOperations(gate, 'b2-confirmed', await worldview.list(), parsed); await applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, worldview); },
    };
    const service = createStoryLifecycleService(fakeLlm([], true), workspace);
    const base = request('project-i30-real', writers);
    const currentKnowledge = await knowledge.read();
    const result = await service.run({ ...base, parserInputs: { ...base.parserInputs, c3: { entries: [...currentKnowledge.entries], states: [...currentKnowledge.states] }, b2: { current: await worldview.list() } } });
    expect(result.result.status).toBe('written');
    expect(state.current().storyTime).toBe('dawn');
    expect((await relationships.read()).map((entry) => entry.id)).toEqual(['mira-lin']);
    expect((await knowledge.read()).entries[0]).toMatchObject({ status: 'partially-revealed', holders: ['mira', 'lin'] });
    expect(canon.query().map((entry) => entry.id)).toEqual(['evt-key']);
    expect((await worldview.read('harbor-status')).status).toBe('rewritten');
    expect((await worldview.read('harbor-key-route')).status).toBe('active');
  });

  it('does not invoke any parser or persistence writer when the user rejects the generated candidate', async () => {
    const seen: string[] = []; const writes: string[] = [];
    const service = createStoryLifecycleService(fakeLlm(seen), await root());
    const writers = createWriterPorts(writes);
    const result = await service.run(request('project-i30-reject', writers, 'reject'));
    expect(result.result.status).toBe('decision-rejected');
    expect(writes).toEqual([]);
    expect(seen).toHaveLength(1);
  });
});
