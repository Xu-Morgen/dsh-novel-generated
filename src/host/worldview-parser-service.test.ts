import { describe, expect, it } from 'vitest';
import { createWorldviewParserService } from './worldview-parser-service.js';

const current = [{
  id: 'north-kingdom', version: 1, kind: 'faction', title: '北境王国', content: '北境由延续千年的王国统治。',
  keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true, status: 'active', supersededBy: null,
}];

describe('I29 Host B2 worldview parser service', () => {
  it('routes B2-only recognition through injected Host LLM without exposing writeback', async () => {
    const seen: unknown[] = [];
    const service = createWorldviewParserService({
      async *stream(request: unknown) {
        seen.push(request);
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'supersede', targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom', kind: 'faction', title: '北境废墟', content: '王国已经覆灭。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true }, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    await expect(service.parseB2Worldview({ prose: '王国覆灭。', current }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }))
      .resolves.toMatchObject({ ops: [{ targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom' } }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'dsh', model: 'default' });
    expect(Object.keys(service)).toEqual(['parseB2Worldview']);
  });
});
