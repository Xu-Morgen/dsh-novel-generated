import { expect, it } from 'vitest';
import { createDesktopWorkbenchStore } from './store-adapter.js';

it('I217 late chapter read/analysis results cannot overwrite navigation to another chapter or a scene', () => {
  const store = createDesktopWorkbenchStore();
  store.actions.selectProject('book', 'Book');
  store.actions.chaptersSelectChapter('first');
  const firstRevision = store.getSnapshot().chapters.navigationRevision;
  store.actions.chaptersSelectChapter('second');
  const secondRevision = store.getSnapshot().chapters.navigationRevision;
  store.actions.chapterManuscript('first', firstRevision, { status: 'error', message: 'late first chapter' });
  expect(store.getSnapshot().chapters.manuscript?.status).toBe('loading');
  store.actions.chapterManuscript('second', secondRevision, { status: 'ready', message: 'second chapter' });
  expect(store.getSnapshot().chapters.manuscript?.message).toBe('second chapter');
  store.actions.chaptersSelectScene('scene');
  store.actions.chapterManuscript('second', secondRevision, { status: 'pending', message: 'late analysis' });
  expect(store.getSnapshot().chapters.manuscript?.message).toBe('second chapter');
  store.dispose();
});
