import { expect, it } from 'vitest';
import { createDesktopWorkbenchStore } from '../../desktop/renderer/store-adapter.js';

it('I213 scene-list refresh preserves dirty prose and ignores a prior chapter response', () => {
  const store = createDesktopWorkbenchStore();
  const read = { id: 'a', index: 1, title: '第一章', pov: 'hero', status: 'draft', scenes: [] };
  try {
    store.actions.chaptersSelectChapter('a');
    store.actions.sceneEditor({ draft: '尚未保存的文字', dirty: true });
    store.actions.chaptersRefreshRead('a', read);
    expect(store.getSnapshot().chapters.chapter.read).toEqual(read);
    expect(store.getSnapshot().chapters.editor).toMatchObject({ draft: '尚未保存的文字', dirty: true });
    store.actions.chaptersSelectChapter('b');
    store.actions.chaptersRefreshRead('a', read);
    expect(store.getSnapshot().chapters.chapter.read).toBeUndefined();
  } finally { store.dispose(); }
});
