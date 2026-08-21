import { describe, expect, it } from 'vitest';
import { createKnowledgeParserService } from './knowledge-parser-service.js';

const entries = [{
  id: 'harbor-secret', version: 1, fact: '暗门藏在灯塔地下。', kind: 'secret', holders: ['lin'],
  revealPlan: { revealTo: ['mira'], revealAt: '钟楼对峙后' }, status: 'hidden',
}];
const states = [{ characterId: 'lin', knows: ['harbor-secret'] }, { characterId: 'mira', knows: [] }];

describe('I28 Host C3 knowledge parser service', () => {
  it('routes recognition through injected Host LLM without exposing writeback', async () => {
    const seen: unknown[] = [];
    const service = createKnowledgeParserService({
      async *stream(request: unknown) {
        seen.push(request);
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    await expect(service.parseC3Knowledge({ prose: '米拉看见了暗门。', entries, states }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }))
      .resolves.toMatchObject({ ops: [{ targetId: 'harbor-secret', status: 'partially-revealed' }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'dsh', model: 'default' });
    expect(Object.keys(service)).toEqual(['parseC3Knowledge']);
  });
});
