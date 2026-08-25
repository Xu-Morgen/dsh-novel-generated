import type { WorkspaceNamespace } from './shared.js';
import { unwrap } from './shared.js';
import type { OutlineShape } from './layers/outline.js';
import type { StateSnapshotShape } from './layers/state.js';

/** Load-result setters plus the editor initializers reload needs to seed. */
export interface ProjectSessionActions {
  setCharacters(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setWorldview(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setOutline(status: 'loading' | 'ready' | 'error', outline: unknown, message?: string): void;
  setRelationship(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setState(status: 'loading' | 'ready' | 'error', snapshots: unknown[], message?: string): void;
  setCanon(status: 'loading' | 'ready' | 'error', events: unknown[], message?: string): void;
  outlineDraft(patch: { draft?: OutlineShape; dirty?: boolean; error?: string; selectedActId?: string; selectedBeatId?: string; selectedDetailId?: string }): void;
  stateDraft(patch: { selectedSeq?: number; fromSeq?: number; toSeq?: number; diff?: unknown; error?: string }): void;
}

/**
 * Reload all six layers for one project. Each layer loads independently through
 * the Host `novelWorkspace` Remote; outline and state additionally seed their
 * editor selection from the loaded payload (first act/beat, latest snapshot).
 * `dispatch` gates against an unmounted Fiber (`active`) and defers until the
 * store's baked actions are captured, so late Remote completions never mutate
 * a dead UI and never race the store instance.
 */
export function reloadProject(
  workspace: WorkspaceNamespace,
  projectId: string,
  actions: ProjectSessionActions,
  dispatch: (fn: (a: ProjectSessionActions) => void) => void,
  active: () => boolean,
): void {
  actions.setCharacters('loading', []);
  actions.setWorldview('loading', []);
  actions.setOutline('loading', undefined);
  actions.setRelationship('loading', []);
  actions.setState('loading', []);
  actions.setCanon('loading', []);
  void unwrap(workspace.characterList(projectId)).then((list) => dispatch((x) => x.setCharacters('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setCharacters('error', [], cause.message)));
  void unwrap(workspace.worldviewList(projectId)).then((list) => dispatch((x) => x.setWorldview('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setWorldview('error', [], cause.message)));
  void unwrap(workspace.outlineRead(projectId)).then((outline) => {
    dispatch((x) => {
      x.setOutline('ready', outline);
      const shape = outline as OutlineShape;
      x.outlineDraft({ draft: { ...shape }, dirty: false, error: '' });
      if ((shape.acts ?? []).length > 0) {
        const actId = (shape.acts ?? [])[0].id;
        const beatId = ((shape.acts ?? [])[0].beats ?? [])[0]?.id;
        x.outlineDraft({ selectedActId: actId, selectedBeatId: beatId });
      }
    });
  }, (cause: Error) => dispatch((x) => x.setOutline('error', undefined, cause.message)));
  void unwrap(workspace.relationshipRead(projectId)).then((list) => dispatch((x) => x.setRelationship('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setRelationship('error', [], cause.message)));
  void unwrap(workspace.stateSnapshots(projectId)).then((snapshots) => {
    dispatch((x) => {
      const list = snapshots as unknown as StateSnapshotShape[];
      x.setState('ready', list);
      if (list.length > 0) x.stateDraft({ selectedSeq: list[list.length - 1].seq, fromSeq: list[0].seq, toSeq: list.length > 1 ? list[list.length - 1].seq : undefined });
    });
  }, (cause: Error) => dispatch((x) => x.setState('error', [], cause.message)));
  void unwrap(workspace.canonQuery(projectId)).then((events) => dispatch((x) => x.setCanon('ready', events as unknown[])), (cause: Error) => dispatch((x) => x.setCanon('error', [], cause.message)));
}
