import { describe, expect, it } from 'vitest';
import {
  assertPovContextNoLeak,
  buildSafePovContext,
  detectPovContextLeaks,
  projectPublicAtStart,
} from './public-at-start.js';
import type { PublicAtStartProjectionInput, PovContextInput } from '../schema/narrative-visibility.js';

const event = {
  id: 'opening-event', storyTime: '故事开始', kind: 'event' as const, summary: '港口开门', detail: '港口在清晨公开开门。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['canon'], evidenceParagraphIds: ['public-1'],
};
const publicInput: PublicAtStartProjectionInput = {
  sourceRole: 'hybrid',
  evidence: [{ paragraphId: 'public-1', role: 'prose', visibility: 'public-at-start', text: '港口在清晨公开开门。' }],
  events: [event],
};

const hiddenEntry = { id: 'hidden-ash', version: 1, fact: '灰烬圣典的幕后机制。', kind: 'secret' as const, holders: ['archivist'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' as const };
const contextInput: PovContextInput = {
  pov: 'mira', b5: { beatId: 'act-1-beat-1', text: '米拉调查港口的异常线索。' }, b2Triggers: ['港口'],
  c3Entries: [hiddenEntry], c3States: [{ characterId: 'archivist', knows: ['hidden-ash'] }, { characterId: 'mira', knows: [] }], c4Events: [event],
};

describe('I147 public-at-start and POV visibility guards', () => {
  it('projects the same explicitly public evidence deterministically', () => {
    expect(projectPublicAtStart(publicInput)).toEqual([event]);
    expect(projectPublicAtStart(publicInput)).toEqual(projectPublicAtStart(structuredClone(publicInput)));
  });

  it.each(['backstage', 'future', 'presentation', 'author-instruction'] as const)('rejects %s evidence from C4', (visibility) => {
    const input = structuredClone(publicInput);
    input.evidence[0].visibility = visibility;
    expect(() => projectPublicAtStart(input)).toThrow(/public-at-start guard/);
  });

  it('rejects world-truth masquerading as public prose and unknown evidence', () => {
    const worldTruth = structuredClone(publicInput);
    worldTruth.evidence[0].role = 'world-truth';
    expect(() => projectPublicAtStart(worldTruth)).toThrow(/public-at-start guard/);
    const unknown = structuredClone(publicInput);
    unknown.events[0].evidenceParagraphIds = ['missing'];
    expect(() => projectPublicAtStart(unknown)).toThrow(/Unknown public-at-start evidence/);
  });

  it('filters C3 before composing B5/B2/C4 context and rejects hidden fact leaks', () => {
    const context = buildSafePovContext(contextInput);
    expect(context.knowledge.entries).toEqual([]);
    expect(detectPovContextLeaks(contextInput, context)).toEqual([]);
    const leaked = structuredClone(context);
    leaked.b5.text = `${leaked.b5.text} ${hiddenEntry.fact}`;
    expect(() => assertPovContextNoLeak(contextInput, leaked)).toThrow(/knowledge leak/);
    const triggerLeak = structuredClone(context);
    triggerLeak.b2Triggers = [hiddenEntry.fact];
    expect(() => assertPovContextNoLeak(contextInput, triggerLeak)).toThrow(/knowledge leak/);
    const canonLeak = structuredClone(context);
    canonLeak.c4Events[0].detail = hiddenEntry.fact;
    expect(() => assertPovContextNoLeak(contextInput, canonLeak)).toThrow(/knowledge leak/);
  });
});
