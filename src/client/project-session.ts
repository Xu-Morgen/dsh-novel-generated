import type { WorkspaceNamespace } from './shared.js';
import { unwrap } from './shared.js';
import { emptyOutline, type OutlineShape } from './layers/outline.js';
import type { StateSnapshotShape } from './layers/state.js';
import type { ProjectSessionActions } from './store/types.js';

/**
 * 装载动作子集来自 store 契约单一来源（I82 接口收敛，架构审查 §5.1：
 * `ProjectSessionActions` 由 `WorkbenchActions` Pick 派生，见 store/types.ts）。
 */

/**
 * Reload all six layers for one project. Each layer loads independently through
 * the Host `novelWorkspace` Remote; outline and state additionally seed their
 * editor selection from the loaded payload (first act/beat, latest snapshot).
 * `dispatch` gates against an unmounted Fiber (`active`) and defers until the
 * store's baked actions are captured, so late Remote completions never mutate
 * a dead UI and never race the store instance.
 *
 * The optional `layers` readiness comes from `projectOpen` (I50 step 21): a B5
 * `uninitialized` outline is the legacy `{}` marker that `outlineRead` would
 * reject — skip the read and show the empty form instead.
 */
export interface ProjectOpenLayers {
  readonly outline?: 'ready' | 'empty' | 'uninitialized' | 'corrupt';
}
export function reloadProject(
  workspace: WorkspaceNamespace,
  projectId: string,
  actions: ProjectSessionActions,
  dispatch: (fn: (a: ProjectSessionActions) => void) => void,
  active: () => boolean,
  layers?: ProjectOpenLayers,
): void {
  actions.setCharacters('loading', []);
  actions.setWorldview('loading', []);
  actions.setOutline('loading', undefined);
  actions.setRelationship('loading', []);
  actions.setState('loading', []);
  actions.setCanon('loading', []);
  actions.setChapters('loading', []);
  void unwrap(workspace.chapterList(projectId)).then((list) => dispatch((x) => x.setChapters('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setChapters('error', [], cause.message)));
  void unwrap(workspace.characterList(projectId)).then((list) => dispatch((x) => x.setCharacters('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setCharacters('error', [], cause.message)));
  void unwrap(workspace.worldviewList(projectId)).then((list) => dispatch((x) => x.setWorldview('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setWorldview('error', [], cause.message)));
  if (layers?.outline === 'uninitialized') {
    dispatch((x) => {
      x.setOutline('ready', emptyOutline());
      x.outlineDraft({ draft: emptyOutline(), dirty: false, error: '' });
    });
  } else {
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
  }
  void unwrap(workspace.relationshipRead(projectId)).then((list) => dispatch((x) => x.setRelationship('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setRelationship('error', [], cause.message)));
  void unwrap(workspace.stateSnapshots(projectId)).then((snapshots) => {
    dispatch((x) => {
      const list = snapshots as unknown as StateSnapshotShape[];
      x.setState('ready', list);
      if (list.length > 0) x.stateDraft({ selectedSeq: list[list.length - 1].seq, fromSeq: list[0].seq, toSeq: list.length > 1 ? list[list.length - 1].seq : undefined });
    });
  }, (cause: Error) => dispatch((x) => x.setState('error', [], cause.message)));
  void unwrap(workspace.canonQuery(projectId, undefined)).then((events) => dispatch((x) => x.setCanon('ready', events as unknown[])), (cause: Error) => dispatch((x) => x.setCanon('error', [], cause.message)));
}
