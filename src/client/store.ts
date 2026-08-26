import { type CharacterEditor } from './layers/characters.js';
import { type WorldEditor } from './layers/worldview.js';
import { emptyOutline, type OutlineEditor } from './layers/outline.js';
import { newRelationshipDraft, type RelationshipEditor } from './layers/relationship.js';
import { type StateEditor } from './layers/state.js';
import { type CanonEditor } from './layers/canon.js';
import { freshChapters, type ChaptersLayerState } from './layers/chapters.js';

/** Fresh form state for the reactive workbench store. */
export function freshCharacterEditor(): CharacterEditor {
  return { selectedId: undefined, draft: { id: '', name: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshWorldEditor(): WorldEditor {
  return { selectedId: undefined, draft: { id: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshOutlineEditor(): OutlineEditor {
  return { draft: emptyOutline(), dirty: false, error: '', selectedActId: undefined, selectedBeatId: undefined, selectedDetailId: undefined, saving: false, saveMessage: '' };
}
export function freshRelationshipEditor(): RelationshipEditor {
  return { selectedId: undefined, draft: newRelationshipDraft(), dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshStateEditor(): StateEditor {
  return { selectedSeq: undefined, fromSeq: undefined, toSeq: undefined, diff: undefined, error: '' };
}
export function freshCanonEditor(): CanonEditor {
  return { selectedId: undefined, proposalId: undefined, draft: { storyTime: '', summary: '', detail: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}
export { freshChapters };
export type { ChaptersLayerState };
