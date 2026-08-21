import { describe, expect, it } from 'vitest';
import { createStateParserService } from './state-parser-service.js';

const state = {
  id: 'state', version: 1, seq: 0, storyTime: 'day 1',
  scene: { location: '码头', timeOfDay: 'dawn', weather: 'clear', season: 'spring', atmosphere: 'quiet' },
  characters: [{ characterId: 'lin', location: '码头', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '', currentGoal: 'wait', flags: {} }],
};

describe('I25 Host C2 state parser service', () => {
  it('routes recognition through injected Host LLM without exposing writeback', async () => {
    const seen: unknown[] = [];
    const service = createStateParserService({
      async *stream(request: unknown) {
        seen.push(request);
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'modify', target: 'lin', field: 'location', action: 'set', value: '钟楼', confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    await expect(service.parseC2State({ prose: '林舟来到钟楼。', state }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }))
      .resolves.toMatchObject({ ops: [{ target: 'lin', field: 'location' }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: 'dsh', model: 'default' });
    expect(Object.keys(service)).toEqual(['parseC2State']);
  });
});
