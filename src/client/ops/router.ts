import type { EntityLink } from '../../core/schema/link.js';
import type { ChaptersEditOps, ChaptersMode } from '../layers/chapters.js';
import { captureRoute, linkForRouteFocus, linkFromSearchHit, popRoute, pushRoute, routeForLink, type RouterEditOps, type RouterTargetFocus } from '../router.js';
import type { WorkbenchActions, WorkbenchState } from '../store/types.js';
import type { OpsRuntime } from './context.js';

function selectionDiffers(state: WorkbenchState, route: { chapterId?: string; sceneId?: string }): boolean {
  return state.chapters.selectedChapterId !== route.chapterId || state.chapters.selectedSceneId !== route.sceneId;
}

function routeNeedsDirtyGuard(state: WorkbenchState, route: { view: string; selection: { chapterId?: string; sceneId?: string } }): boolean {
  return route.view === 'chapters' && route.selection.chapterId !== undefined && route.selection.sceneId !== undefined
    && state.chapters.editor.dirty && selectionDiffers(state, route.selection);
}

function restoreRoute(act: WorkbenchActions, chapters: ChaptersEditOps | undefined, state: WorkbenchState, route: ReturnType<typeof captureRoute>): void {
  act.activateView(route.view);
  if (route.view !== 'chapters') return;
  act.chaptersMode(route.mode as ChaptersMode);
  const chapterId = route.selection.chapterId;
  const sceneId = route.selection.sceneId;
  if (chapters === undefined || chapterId === undefined) return;
  if (sceneId !== undefined && selectionDiffers(state, route.selection)) chapters.openScene(chapterId, sceneId);
  else if (state.chapters.selectedChapterId !== chapterId) chapters.selectChapter(chapterId);
}

/** Client router owner: all forward/back navigation passes through this module. */
export function createRouterOps(runtime: OpsRuntime, chaptersRef: { current?: ChaptersEditOps }, targetFocus: RouterTargetFocus): RouterEditOps {
  const { act, snapshot } = runtime;
  const projectId = runtime.projectId;
  const routeError = (error: { code: 'invalid-link' | 'cross-project' | 'unknown-target' | 'unsupported-target'; message: string }): void => act.routerPatch({ error });
  const open = (link: EntityLink): void => {
    if (projectId === undefined) { routeError({ code: 'unknown-target', message: '当前没有打开作品' }); return; }
    const result = routeForLink(projectId, link);
    if (!result.ok) { routeError(result.error); return; }
    if (routeNeedsDirtyGuard(snapshot, result.route)) {
      chaptersRef.current?.openScene(result.route.selection.chapterId!, result.route.selection.sceneId!);
      return;
    }
    if (!targetFocus.focus(link)) { routeError({ code: 'unknown-target', message: '目标实体不存在或已不在当前作品中' }); return; }
    const source = captureRoute(projectId, snapshot);
    act.routerPatch(pushRoute(snapshot.router, source, result.route));
    restoreRoute(act, chaptersRef.current, snapshot, result.route);
  };
  return {
    open,
    openFromSearch(hit) {
      if (projectId === undefined) { routeError({ code: 'unknown-target', message: '当前没有打开作品' }); return; }
      const result = linkFromSearchHit(projectId, hit);
      if (!result.ok) { routeError(result.error); return; }
      open(result.link);
    },
    back() {
      if (projectId === undefined) return;
      const popped = popRoute(snapshot.router);
      if (popped.route === undefined) return;
      if (routeNeedsDirtyGuard(snapshot, popped.route)) {
        chaptersRef.current?.openScene(popped.route.selection.chapterId!, popped.route.selection.sceneId!);
        return;
      }
      act.routerPatch(popped.state);
      restoreRoute(act, chaptersRef.current, snapshot, popped.route);
      const sourceFocus = linkForRouteFocus(popped.route);
      if (sourceFocus !== undefined && sourceFocus.kind !== 'text' && !targetFocus.focus(sourceFocus)) {
        act.routerPatch({ error: { code: 'unknown-target', message: '返回来源的目标已不在当前作品中' } });
      }
    },
    dismissError() { act.routerPatch({ error: undefined }); },
  };
}
