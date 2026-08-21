import { describe, expect, it } from 'vitest';
import { createRelationshipParserService } from './relationship-parser-service.js';

const current = [{
  id: 'lin-mira', version: 1, from: 'lin', to: 'mira', type: 'friendship',
  affinity: 30, trust: 40, status: 'uneasy alliance', milestones: [], knownTo: ['lin', 'mira'],
}];

describe('I27 Host C1 relationship parser service', () => {
  it('routes recognition through injected Host LLM without exposing writeback', async () => {
    const seen: unknown[] = [];
    const service = createRelationshipParserService({
      async *stream(request: unknown) {
        seen.push(request);
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'modify', targetId: 'lin-mira', field: 'trust', action: 'set', value: 70, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    await expect(service.parseC1Relationships({ prose: '林舟终于相信米拉。', current }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }))
      .resolves.toMatchObject({ ops: [{ targetId: 'lin-mira', field: 'trust' }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'dsh', model: 'default' });
    expect(Object.keys(service)).toEqual(['parseC1Relationships']);
  });
});
