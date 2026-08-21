import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';

import { apply } from './index.js';

describe('novel-creation-tool Host plugin (I1)', () => {
  it('provides the novelCreation service while the Fiber is live', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });

    await fiber.dispose();
  });

  it('wires I21 detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'immutable-rule', severity: 'hard', message: '违反禁魔规则。', references: ['rule-no-magic'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelConsistencyDetection') as {
      detectRuleAndCanon(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectRuleAndCanon({
      prose: '米拉施放火球。',
      rules: [{ id: 'rule-no-magic', statement: '人类不能施放魔法。', immutable: true, active: true }],
      canon: [],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'reject' } });

    await fiber.dispose();
    expect(root.get('novelConsistencyDetection', false)).toBeUndefined();
  });

  it('wires I22 POV leak detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '米拉知晓了暗门秘密。', references: ['secret-gate'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelKnowledgeLeakDetection') as {
      detectKnowledgeLeak(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectKnowledgeLeak({
      prose: '米拉知道北港暗门只能在退潮时开启。', pov: 'mira',
      entries: [{ id: 'secret-gate', version: 1, fact: '北港暗门只能在退潮时开启。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' }],
      states: [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: ['secret-gate'] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'reject' } });

    await fiber.dispose();
    expect(root.get('novelKnowledgeLeakDetection', false)).toBeUndefined();
  });

  it('removes the novelCreation service after Fiber dispose', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    await fiber.dispose();

    expect(root.get('novelCreation', false)).toBeUndefined();
  });

  it('restarts cleanly on a fresh Fiber', async () => {
    const root = new Context();

    const first = await root.plugin(apply);
    await first.dispose();

    const second = await root.plugin(apply);
    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });
    await second.dispose();
  });
});
