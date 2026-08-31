import { textContentHash } from '../core/text/codec.js';
import { assertTextAnchor, entityLinkSchema, type EntityLink, type EntityLinkKind } from '../core/schema/link.js';
import type { NovelTextService } from './text-service.js';

/** Host-side outcome for opening a rebuildable navigation link. */
export type LinkErrorCode = 'invalid-link' | 'cross-project' | 'unknown-target' | 'stale';

export type LinkResolveResult =
  | { readonly status: 'ready'; readonly link: EntityLink }
  | { readonly status: 'error'; readonly code: LinkErrorCode; readonly message: string };

export interface LinkTargetResolverDeps {
  /** C5 is the only source used for text existence and freshness checks. */
  readonly text: Pick<NovelTextService, 'readChapter'>;
  /** Later source adapters can provide live entity existence without changing the link contract. */
  readonly entityExists?: (projectId: string, kind: Exclude<EntityLinkKind, 'text'>, entityId: string) => Promise<boolean>;
}

function error(code: LinkErrorCode, message: string): LinkResolveResult {
  return { status: 'error', code, message };
}

/**
 * Canonical Host target resolver (R18-8a). It parses untrusted link data,
 * rejects cross-project targets, checks C5 existence, and treats a changed
 * sourceHash/quote/range as stale. It never writes or attempts to infer a new
 * target, so callers can safely degrade to an error card.
 */
export function createLinkTargetResolver(deps: LinkTargetResolverDeps) {
  return {
    async resolve(projectId: string, rawLink: unknown): Promise<LinkResolveResult> {
      const parsed = entityLinkSchema.safeParse(rawLink);
      if (!parsed.success) return error('invalid-link', '链接格式无效');
      const link = parsed.data;
      if (link.projectId !== projectId) return error('cross-project', '链接不属于当前作品');

      if (link.kind !== 'text') {
        const exists = await deps.entityExists?.(projectId, link.kind, link.entityId);
        return exists === true ? { status: 'ready', link } : error('unknown-target', '目标实体不存在或尚未可用');
      }

      let chapter;
      try {
        chapter = await deps.text.readChapter(projectId, link.chapterId);
      } catch {
        return error('unknown-target', '目标章节不存在');
      }
      const scene = chapter.scenes.find((candidate) => candidate.id === link.sceneId);
      if (scene === undefined) return error('unknown-target', '目标场景不存在');
      if (link.anchor !== undefined) {
        if (link.anchor.sourceHash !== textContentHash(scene.content)) return error('stale', '正文已变化，链接锚点已失效');
        try {
          assertTextAnchor(scene.content, link.anchor);
        } catch {
          return error('stale', '正文锚点范围或引文已失效');
        }
      }
      return { status: 'ready', link };
    },
  };
}
