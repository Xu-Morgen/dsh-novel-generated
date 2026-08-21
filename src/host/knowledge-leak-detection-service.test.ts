import { describe, expect, it } from 'vitest';
import { createKnowledgeLeakDetectionService } from './knowledge-leak-detection-service.js';

const input = {
  prose: '米拉知道北港暗门只能在退潮时开启。', pov: 'mira',
  entries: [{ id: 'secret-gate', version: 1, fact: '北港暗门只能在退潮时开启。', kind: 'secret' as const, holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' as const }],
  states: [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: ['secret-gate'] }],
};

describe('I22 Host knowledge-leak detection service', () => {
  it('routes C3 POV detection through the injected Host LLM and returns I20 reject', async () => {
    const requests: unknown[] = [];
    const service = createKnowledgeLeakDetectionService({
      async *stream(request: unknown) {
        requests.push(request);
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '米拉知晓了暗门秘密。', references: ['secret-gate'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const result = await service.detectKnowledgeLeak(input, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

    expect(result.adjudication.status).toBe('reject');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: 'dsh', model: 'default', messages: [{ content: [{ text: expect.stringContaining('secret-gate') }] }] });
  });

  it('rejects malformed settings before they reach the injected route', async () => {
    let called = false;
    const service = createKnowledgeLeakDetectionService({
      async *stream() { called = true; yield { type: 'finish', reason: { kind: 'stop' } }; },
    });
    await expect(service.detectKnowledgeLeak(input, { modelRef: 'dsh/default', endpoint: 'forbidden' }))
      .rejects.toThrow(/Invalid generation settings/);
    expect(called).toBe(false);
  });
});
