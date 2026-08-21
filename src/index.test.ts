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

  it('wires I24 relationship/style soft detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'style-deviation', severity: 'soft', message: '时态偏离。', references: ['style-main'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelRelationshipStyleDetection') as {
      detectRelationshipAndStyle(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectRelationshipAndStyle({
      prose: '米拉现在走进码头。', relationships: [],
      style: { id: 'style-main', version: 1, name: '港湾阴谋', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制紧张', proseStyle: '冷峻简洁', chapterFormat: '场景标题', dialogueConventions: '使用中文引号', forbidden: [] },
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'warn' } });

    await fiber.dispose();
    expect(root.get('novelRelationshipStyleDetection', false)).toBeUndefined();
  });

  it('wires I27 C1 recognition as the only automatic C1 parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'modify', targetId: 'lin-mira', field: 'trust', action: 'set', value: 70, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelRelationshipParser') as {
      parseC1Relationships(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseC1Relationships({
      prose: '林舟终于相信米拉。',
      current: [{ id: 'lin-mira', version: 1, from: 'lin', to: 'mira', type: 'friendship', affinity: 30, trust: 40, status: 'uneasy alliance', milestones: [], knownTo: ['lin', 'mira'] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'lin-mira', field: 'trust' }] });
    expect(Object.keys(parser)).toEqual(['parseC1Relationships']);
    expect(root.get('relationshipEngine', false)).toBeUndefined();

    await fiber.dispose();
    expect(root.get('novelRelationshipParser', false)).toBeUndefined();
  });

  it('wires I28 C3 recognition as a forward-only parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelKnowledgeParser') as {
      parseC3Knowledge(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseC3Knowledge({
      prose: '米拉看见了暗门。',
      entries: [{ id: 'harbor-secret', version: 1, fact: '暗门藏在灯塔地下。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: '钟楼对峙后' }, status: 'hidden' }],
      states: [{ characterId: 'lin', knows: ['harbor-secret'] }, { characterId: 'mira', knows: [] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'harbor-secret', status: 'partially-revealed' }] });
    expect(Object.keys(parser)).toEqual(['parseC3Knowledge']);

    await fiber.dispose();
    expect(root.get('novelKnowledgeParser', false)).toBeUndefined();
  });

  it('wires I29 B2 recognition as a confirmation-first supersede parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'supersede', targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom', kind: 'faction', title: '北境废墟', content: '王国已覆灭。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true }, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelWorldviewParser') as {
      parseB2Worldview(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseB2Worldview({
      prose: '王国覆灭。',
      current: [{ id: 'north-kingdom', version: 1, kind: 'faction', title: '北境王国', content: '北境由延续千年的王国统治。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true, status: 'active', supersededBy: null }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom' } }] });
    expect(Object.keys(parser)).toEqual(['parseB2Worldview']);

    await fiber.dispose();
    expect(root.get('novelWorldviewParser', false)).toBeUndefined();
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
