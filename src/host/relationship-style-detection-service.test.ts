import { describe, expect, it } from 'vitest';
import { createRelationshipStyleDetectionService } from './relationship-style-detection-service.js';

const input = {
  prose: '米拉毫无保留地把密钥交给林舟。',
  relationships: [{
    id: 'mira-lin', version: 1, from: 'mira', to: 'lin', type: 'rivalry' as const,
    affinity: -60, trust: 5, status: '公开敌对', milestones: [], knownTo: ['mira', 'lin'],
  }],
  style: {
    id: 'style-main', version: 1, name: '港湾阴谋', person: 'third-limited' as const,
    tense: 'past' as const, povScope: 'single' as const, tone: '克制紧张', proseStyle: '冷峻简洁',
    chapterFormat: '场景标题', dialogueConventions: '使用中文引号', forbidden: [],
  },
};

describe('I24 Host relationship/style detection service', () => {
  it('routes C1/B4 soft detection through injected Host LLM and returns I20 warn', async () => {
    const requests: unknown[] = [];
    const service = createRelationshipStyleDetectionService({
      async *stream(request: unknown) {
        requests.push(request);
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'relationship-drift', severity: 'soft', message: '关系信任显著偏离。', references: ['mira-lin'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const result = await service.detectRelationshipAndStyle(input, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

    expect(result.adjudication.status).toBe('warn');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: 'dsh', model: 'default', messages: [{ content: [{ text: expect.stringContaining('style-main') }] }] });
  });

  it('rejects malformed settings before they reach the injected route', async () => {
    let called = false;
    const service = createRelationshipStyleDetectionService({
      async *stream() { called = true; yield { type: 'finish', reason: { kind: 'stop' } }; },
    });
    await expect(service.detectRelationshipAndStyle(input, { modelRef: 'dsh/default', endpoint: 'forbidden' }))
      .rejects.toThrow(/Invalid generation settings/);
    expect(called).toBe(false);
  });
});
