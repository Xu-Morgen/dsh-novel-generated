import { expect, it } from 'vitest';
import { createDesktopWorkbenchStore } from '../../desktop/renderer/store-adapter.js';

it('I212 ignores candidate responses after navigation or author edits', () => {
  const store = createDesktopWorkbenchStore();
  try {
    const state = { token: 'request', kind: 'beat' as const, busy: true, message: '' };
    store.actions.outlineDraft({ descriptionUpdate: state });
    store.actions.outlineDraft({ selectedBeatId: 'different' });
    store.actions.outlineDescriptionResult(state.token, { descriptionUpdate: { ...state, busy: false, message: 'late' } });
    expect(store.getSnapshot().outlineEditor.descriptionUpdate).toBeUndefined();
    store.actions.outlineDraft({ descriptionUpdate: state });
    store.actions.outlineMutate(draft => ({ ...draft, logline: '作者修改' }));
    store.actions.outlineDescriptionResult(state.token, { dirty: false, descriptionUpdate: { ...state, busy: false } });
    expect(store.getSnapshot().outlineEditor.dirty).toBe(true);
    expect(store.getSnapshot().outlineEditor.draft.logline).toBe('作者修改');
    expect(store.getSnapshot().outlineEditor.descriptionUpdate).toBeUndefined();
  } finally { store.dispose(); }
});
