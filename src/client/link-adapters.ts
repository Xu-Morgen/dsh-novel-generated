import type { EntityLink, TextAnchor } from '../core/schema/link.js';
import type { El } from './shared.js';

/** Thin panel-side seam: adapters construct links; Router owns navigation. */
export interface ContextLinkSink {
  open(link: EntityLink): void;
}

export function entityContextLink(projectId: string, kind: Exclude<EntityLink['kind'], 'text'>, entityId: string): EntityLink {
  return { projectId, kind, entityId };
}

export function textContextLink(projectId: string, chapterId: string, sceneId: string, anchor?: TextAnchor): EntityLink {
  return { projectId, kind: 'text', chapterId, sceneId, ...(anchor === undefined ? {} : { anchor }) };
}

/** Shared accessible affordance used by source panels; no projection lookup happens here. */
export function contextLinkButton(h: El, label: string, source: string, link: EntityLink, sink: ContextLinkSink | undefined): unknown {
  if (sink === undefined) return null;
  return h('button', {
    type: 'button',
    className: 'nv-btn nv-btn--link nv-context-link',
    'data-novel-context-link-source': source,
    'data-novel-context-link-target': link.kind,
    'data-novel-context-link-id': link.kind === 'text' ? `${link.chapterId}:${link.sceneId}` : link.entityId,
    'aria-label': label,
    onClick: () => sink.open(link),
  }, label);
}
