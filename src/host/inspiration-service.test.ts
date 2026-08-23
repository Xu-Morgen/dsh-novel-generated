import { describe, expect, it } from 'vitest';
import { createInspirationService } from './inspiration-service.js';
import { PluginLifecycleGate } from '../core/lifecycle/installation.js';
import type { Outline } from '../core/schema/outline.js';
import type { OutlineProgress } from '../core/schema/outline-progress.js';

const outline: Outline = { id: 'outline', version: 1, structure: 'free', logline: 'A test.', themes: ['trust'], acts: [{ id: 'act-one', index: 1, title: 'Act', goal: 'Goal', beats: [{ id: 'first', title: 'First', description: 'Find the key.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] };
const progress: OutlineProgress = { outlineId: 'outline', currentAct: 'act-one', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 20 };
const direction = { id: 'dawn', title: 'Dawn', premise: 'A dawn bargain.', changes: { outlineNote: 'Mira bargains at dawn.', progressNote: 'The new opportunity changes the route.' }, rationale: 'Raises the cost.' };

function llm(text: string) {
  return { async *stream() { yield { type: 'text-delta', text }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
}

describe('I45 inspiration agent', () => {
  it('returns 2-3 distinct validated directions without writing', async () => {
    const service = createInspirationService(llm(JSON.stringify({ directions: [direction, { ...direction, id: 'storm', title: 'Storm', premise: 'A storm bargain.', changes: { outlineNote: 'Mira bargains in a storm.', progressNote: 'Weather forces a different route.' }, rationale: 'Raises urgency.' }] })));
    const result = await service.propose({ prompt: 'find a turning point' });
    expect(result.directions).toHaveLength(2);
    expect(result.directions[0].id).not.toBe(result.directions[1].id);
  });

  it('requires an accepted I11 record and then changes only selected B5/C6 owners', async () => {
    const service = createInspirationService(undefined);
    const saveOutline = async (value: Outline) => value;
    const saveProgress = async (value: OutlineProgress) => value;
    await expect(service.apply({ projectId: 'demo', proposalId: 'proposal-1', direction, confirmation: { id: 'proposal-1', kind: 'inspiration.apply', payload: direction, version: 1, status: 'pending' }, outline, progress, saveOutline, saveProgress })).rejects.toThrow(/accepted I11/);
    const applied = await service.apply({ projectId: 'demo', proposalId: 'proposal-1', direction, confirmation: { id: 'proposal-1', kind: 'inspiration.apply', payload: direction, version: 1, status: 'accepted' }, outline, progress, saveOutline, saveProgress });
    expect(applied.outline.logline).toBe(outline.logline);
    expect(applied.outline.acts).toEqual(outline.acts);
    expect(applied.progress.deviations).toHaveLength(1);
    expect(outline).toEqual(expect.objectContaining({ version: 1, logline: 'A test.' }));
  });

  it('rejects malformed or duplicate directions', () => {
    const service = createInspirationService(undefined);
    expect(() => service.validate({ directions: [direction] })).toThrow();
    expect(() => service.validate({ directions: [direction, direction] })).toThrow(/distinguishable|distinct/);
  });
});

describe('I45 complete package lifecycle gate', () => {
  it('installs, tears down on upgrade/uninstall, preserves data, and reinstalls cleanly', () => {
    const gate = new PluginLifecycleGate();
    const events: string[] = [];
    expect(gate.install('2.0.0')).toMatchObject({ state: 'installed', version: '2.0.0', dataPreserved: true });
    gate.registerEffect(() => events.push('disposed-v1'));
    expect(gate.upgrade('2.1.0')).toMatchObject({ state: 'upgraded', version: '2.1.0', effects: 0 });
    expect(events).toEqual(['disposed-v1']);
    gate.registerEffect(() => events.push('disposed-v2'));
    expect(gate.uninstall()).toMatchObject({ state: 'uninstalled', effects: 0, dataPreserved: true });
    expect(events).toEqual(['disposed-v1', 'disposed-v2']);
    expect(gate.reinstall('2.1.0')).toMatchObject({ state: 'installed', version: '2.1.0', effects: 0 });
  });

  it('rejects upgrade before install and effects after uninstall', () => {
    const gate = new PluginLifecycleGate();
    expect(() => gate.upgrade('2.1.0')).toThrow(/not installed/);
    gate.install('2.0.0');
    gate.uninstall();
    expect(() => gate.registerEffect(() => {})).toThrow(/not active/);
    expect(() => gate.reinstall('2.1.0')).not.toThrow();
  });
});
