import { describe, expect, it } from 'vitest';
import { createConsistencyDetectionService } from './consistency-detection-service.js';

describe('I21 Host consistency detection service', () => {
  it('routes B1/C4 detection through the injected Host LLM and returns I20 reject', async () => {
    const requests: unknown[] = [];
    const service = createConsistencyDetectionService({
      async *stream(request: unknown) {
        requests.push(request);
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'canon-conflict', severity: 'hard', message: '林舟已死。', references: ['canon-lin-dead'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const result = await service.detectRuleAndCanon({
      prose: '林舟走进港口。',
      rules: [],
      canon: [{ id: 'canon-lin-dead', summary: '林舟已经死亡。', detail: '葬于旧桥。' }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

    expect(result.adjudication.status).toBe('reject');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: 'dsh', model: 'default', messages: [{ content: [{ text: expect.stringContaining('canon-lin-dead') }] }] });
  });

  it('rejects malformed settings before they reach the injected route', async () => {
    let called = false;
    const service = createConsistencyDetectionService({
      async *stream() { called = true; yield { type: 'finish', reason: { kind: 'stop' } }; },
    });
    await expect(service.detectRuleAndCanon({ prose: '文本', rules: [], canon: [] }, { modelRef: 'dsh/default', endpoint: 'forbidden' }))
      .rejects.toThrow(/Invalid generation settings/);
    expect(called).toBe(false);
  });
});
