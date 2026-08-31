import type { EntityLink } from '../core/schema/link.js';
import type { SearchHitShape } from './layers/search.js';
import type { ChaptersMode } from './layers/chapters.js';
import type { WorkbenchState } from './store/types.js';
import type { WorkbenchViewId } from './nav.js';

/** The exact context captured before a forward navigation. */
export interface RouteSelection {
  readonly chapterId?: string;
  readonly sceneId?: string;
}

export interface RouteFilter {
  readonly searchQuery: string;
  readonly searchPov: string;
  readonly searchReferenceKey: string;
}

export interface RouteFocus {
  readonly kind: EntityLink['kind'];
  readonly id: string;
}

/** Rebuildable Client route; it contains no domain projection or prose. */
export interface WorkbenchRoute {
  readonly projectId: string;
  readonly view: WorkbenchViewId;
  readonly mode: ChaptersMode;
  readonly selection: RouteSelection;
  readonly filter: RouteFilter;
  readonly focus?: RouteFocus;
}

export interface RouterState {
  readonly current?: WorkbenchRoute;
  readonly backStack: readonly WorkbenchRoute[];
  readonly error?: RouterError;
}

export type RouterError = {
  readonly code: 'invalid-link' | 'cross-project' | 'unknown-target' | 'unsupported-target';
  readonly message: string;
};

export type RouteResult =
  | { readonly ok: true; readonly route: WorkbenchRoute }
  | { readonly ok: false; readonly error: RouterError };

export type SearchLinkResult =
  | { readonly ok: true; readonly route: WorkbenchRoute; readonly link: EntityLink }
  | { readonly ok: false; readonly error: RouterError };

export interface RouterEditOps {
  open(link: EntityLink): void;
  openFromSearch(hit: SearchHitShape): void;
  back(): void;
  dismissError(): void;
}

/** Target selection is injected by the ops composition root; Router owns only traversal. */
export interface RouterTargetFocus {
  focus(link: EntityLink): boolean;
}

export function freshRouter(): RouterState {
  return { backStack: [] };
}

/** Capture only UI context, preserving filter/mode/selection across a jump. */
export function captureRoute(projectId: string, state: WorkbenchState): WorkbenchRoute {
  const focus = state.activeView === 'characters' ? state.characterEditor.selectedId === undefined ? undefined : { kind: 'character' as const, id: state.characterEditor.selectedId }
    : state.activeView === 'worldview' ? state.worldEditor.selectedId === undefined ? undefined : { kind: 'worldview' as const, id: state.worldEditor.selectedId }
      : state.activeView === 'relationship' ? state.relationshipEditor.selectedId === undefined ? undefined : { kind: 'relationship' as const, id: state.relationshipEditor.selectedId }
        : state.activeView === 'canon' ? state.canonEditor.selectedId === undefined ? undefined : { kind: 'canon' as const, id: state.canonEditor.selectedId }
          : state.activeView === 'knowledge' ? state.knowledge.selectedEntryId === undefined ? undefined : { kind: 'knowledge' as const, id: state.knowledge.selectedEntryId }
            : state.activeView === 'review' ? state.review.selected[0] === undefined ? undefined : { kind: 'review' as const, id: state.review.selected[0] }
              : state.activeView === 'timeline' ? state.timeline.selectedId === undefined ? undefined : { kind: 'timeline' as const, id: state.timeline.selectedId }
                : state.activeView === 'outline' ? state.outlineEditor.selectedDetailId === undefined ? undefined : { kind: 'scene-card' as const, id: state.outlineEditor.selectedDetailId }
                  : undefined;
  return {
    projectId,
    view: state.activeView,
    mode: state.chapters.mode,
    selection: { chapterId: state.chapters.selectedChapterId, sceneId: state.chapters.selectedSceneId },
    filter: {
      searchQuery: state.search.query,
      searchPov: state.search.pov,
      searchReferenceKey: state.search.referenceKey,
    },
    focus,
  };
}

const entityTargetViews: Record<Exclude<EntityLink['kind'], 'text'>, WorkbenchViewId> = {
  character: 'characters', worldview: 'worldview', relationship: 'relationship', outline: 'outline',
  canon: 'canon', knowledge: 'knowledge', review: 'review', timeline: 'timeline', search: 'search', 'scene-card': 'outline',
};

/** Convert a strict link into a route; only navigation shape is decided here. */
export function routeForLink(projectId: string, link: EntityLink): RouteResult {
  if (link.projectId !== projectId) return { ok: false, error: { code: 'cross-project', message: '链接不属于当前作品' } };
  if (link.kind === 'text') {
    return {
      ok: true,
      route: {
        projectId, view: 'chapters', mode: 'writing',
        selection: { chapterId: link.chapterId, sceneId: link.sceneId },
        filter: { searchQuery: '', searchPov: '', searchReferenceKey: '' },
        focus: { kind: 'text', id: `${link.chapterId}:${link.sceneId}` },
      },
    };
  }
  return {
    ok: true,
    route: {
      projectId, view: entityTargetViews[link.kind], mode: 'writing', selection: {},
      filter: { searchQuery: '', searchPov: '', searchReferenceKey: '' }, focus: { kind: link.kind, id: link.entityId },
    },
  };
}

/** Adapt the legacy search projection at the router boundary, not in Search. */
export function linkFromSearchHit(projectId: string, hit: SearchHitShape): SearchLinkResult {
  const nav = hit.nav;
  if (hit.layer === 'text' && nav.kind === 'text' && nav.chapterId !== undefined && nav.sceneId !== undefined) {
    const link: EntityLink = { projectId, kind: 'text', chapterId: nav.chapterId, sceneId: nav.sceneId };
    const result = routeForLink(projectId, link);
    return result.ok ? { ok: true, route: result.route, link } : result;
  }
  const kindMap: Partial<Record<SearchHitShape['layer'], Exclude<EntityLink['kind'], 'text'>>> = {
    characters: 'character', worldview: 'worldview', outline: 'outline', canon: 'canon', knowledge: 'knowledge',
  };
  const kind = kindMap[hit.layer];
  const entityId = nav.entryId ?? hit.id;
  if (kind !== undefined && nav.kind === hit.layer && entityId.length > 0) {
    const link: EntityLink = { projectId, kind, entityId };
    const result = routeForLink(projectId, link);
    return result.ok ? { ok: true, route: result.route, link } : result;
  }
  return { ok: false, error: { code: 'invalid-link', message: '搜索结果缺少有效导航目标' } };
}

/** Push the source route and make the target the current route. */
export function pushRoute(state: RouterState, source: WorkbenchRoute, target: WorkbenchRoute): RouterState {
  return { current: target, backStack: [...state.backStack, source], error: undefined };
}

/** Pop exactly one source entry; an empty stack is a no-op. */
export function popRoute(state: RouterState): { readonly state: RouterState; readonly route?: WorkbenchRoute } {
  const route = state.backStack[state.backStack.length - 1];
  if (route === undefined) return { state };
  return { state: { current: route, backStack: state.backStack.slice(0, -1), error: undefined }, route };
}

export function linkForRouteFocus(route: WorkbenchRoute): EntityLink | undefined {
  if (route.focus === undefined) return undefined;
  if (route.focus.kind === 'text') {
    if (route.selection.chapterId === undefined || route.selection.sceneId === undefined) return undefined;
    return { projectId: route.projectId, kind: 'text', chapterId: route.selection.chapterId, sceneId: route.selection.sceneId };
  }
  return { projectId: route.projectId, kind: route.focus.kind, entityId: route.focus.id };
}
