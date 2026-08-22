import { describe, expect, it } from 'vitest';
import { createWorkspaceEditorService, editorInvocations } from './remote.js';

const characters = { list: async () => [], read: async () => ({}), create: async () => ({}), update: async () => ({}) } as any;
const worldview = { list: async () => [], read: async () => ({}), create: async () => ({}), rewrite: async () => ({ superseded: {}, replacement: {} }) } as any;
const outline = { read: async () => ({}), save: async () => ({}), beatCards: async () => [] } as any;
const relationship = { read: async () => [], save: async () => ({}) } as any;

describe('I36 C2/C4 read-only and confirmation contract', () => {
  it('publishes rollback/query/propose/accept but no canon update or delete descriptor', () => {
    const names = editorInvocations.map((item) => `${item.namespace}/${item.method}`);
    expect(names).toContain('novelState/rollback');
    expect(names).toContain('novelCanon/query');
    expect(names).toContain('novelCanon/correctionPropose');
    expect(names).toContain('novelCanon/correctionAccept');
    expect(names).not.toContain('novelCanon/update');
    expect(names).not.toContain('novelCanon/delete');
  });

  it('keeps rollback and supersede writes in Host services', async () => {
    const calls: string[] = [];
    const state = {
      current: () => ({ seq: 4 }), snapshots: () => [{ seq: 4 }],
      rollback: async (_projectId: string, seq: number) => { calls.push(`rollback:${seq}`); return { seq: 5 }; },
      diff: () => ({ fromSeq: 0, toSeq: 1, changes: [] }),
    } as any;
    const canon = {
      query: () => [],
      supersede: async (_projectId: string, targetId: string) => { calls.push(`supersede:${targetId}`); return { id: 'correction-1' }; },
    } as any;
    const confirmation = {
      propose: async (_projectId: string, input: any) => { calls.push(`propose:${input.kind}`); return { ...input, status: 'pending', version: 1 }; },
      accept: async () => { calls.push('accept'); return { id: 'proposal-1', kind: 'canon-supersede', status: 'accepted', version: 1, payload: { targetId: 'event-1', correction: { id: 'correction-1', storyTime: 'day 1', summary: 'fixed', detail: '', participants: [], location: '', consequences: [], affectedLayers: [] } } }; },
    } as any;
    const service = createWorkspaceEditorService(characters, worldview, outline, relationship, state, canon, confirmation);
    await service.stateRollback('book', 2);
    await service.canonCorrectionPropose('book', 'event-1', { id: 'correction-1', storyTime: 'day 1', summary: 'fixed', detail: '', participants: [], location: '', consequences: [], affectedLayers: [] });
    await service.canonCorrectionAccept('book', 'proposal-1');
    expect(calls).toEqual(['rollback:2', 'propose:canon-supersede', 'accept', 'supersede:event-1']);
  });
});
