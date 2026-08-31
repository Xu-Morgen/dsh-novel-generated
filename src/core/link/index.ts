import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { textContentHash, textProjectFingerprint } from '../text/codec.js';
import {
  createTextAnchor,
  textLinkIndexSchema,
  textLinkSourceSchema,
  type TextAnchor,
  type TextLinkIndexFile,
  type TextLinkRecord,
  type TextLinkSource,
} from '../schema/link.js';
import type { Chapter } from '../schema/text.js';

/**
 * I126 rebuildable text-link projection (design §14.14.2 / R18-8c).
 *
 * The index contains only requests and anchors derived from C5. It is safe to
 * delete and recreate; the chapter JSON, Markdown mirror, and portable archive
 * are never read as link carriers or modified by this module.
 */

export const TEXT_LINK_INDEX_DIRECTORY = '.links';
export const TEXT_LINK_INDEX_FILE = 'index.json';
export const TEXT_LINK_INDEX_VERSION = 1 as const;

export type TextLinkRebuildIssueCode = 'invalid-source' | 'unknown-target' | 'missing-quote' | 'ambiguous-quote';

export interface TextLinkRebuildIssue {
  readonly id: string;
  readonly code: TextLinkRebuildIssueCode;
  readonly chapterId?: string;
  readonly sceneId?: string;
  readonly message: string;
}

export interface TextLinkBuildResult {
  readonly index: TextLinkIndexFile;
  readonly issues: readonly TextLinkRebuildIssue[];
}

export type TextRelinkResult =
  | { readonly status: 'unchanged' | 'relinked'; readonly anchor: TextAnchor }
  | { readonly status: 'error'; readonly code: 'missing-quote' | 'ambiguous-quote'; readonly message: string };

/** Return every UTF-16 start offset, including overlapping occurrences. */
export function findTextOccurrences(text: string, quote: string): readonly number[] {
  if (quote.length === 0) return [];
  const offsets: number[] = [];
  for (let offset = text.indexOf(quote); offset >= 0; offset = text.indexOf(quote, offset + 1)) offsets.push(offset);
  return offsets;
}

/**
 * Re-anchor by exact quote only. A repeated quote is deliberately ambiguous;
 * preserving an old range or guessing the nearest occurrence would silently
 * point at the wrong prose after an edit.
 */
export function relinkTextAnchor(anchor: TextAnchor, nextText: string): TextRelinkResult {
  const offsets = findTextOccurrences(nextText, anchor.quote);
  if (offsets.length === 0) return { status: 'error', code: 'missing-quote', message: '原引文在新正文中不存在' };
  if (offsets.length > 1) return { status: 'error', code: 'ambiguous-quote', message: '原引文在新正文中出现多次，无法安全重链' };
  const start = offsets[0];
  const nextAnchor = createTextAnchor(nextText, start, start + anchor.quote.length, textContentHash(nextText));
  const unchanged = anchor.sourceHash === nextAnchor.sourceHash && anchor.start === nextAnchor.start && anchor.end === nextAnchor.end;
  return { status: unchanged ? 'unchanged' : 'relinked', anchor: nextAnchor };
}

/**
 * Build an index from caller-owned source ids and current C5 chapters. The
 * source id is retained so a later rebuild can recover after a temporary
 * ambiguous/missing quote without inventing a new source record.
 */
export function buildTextLinkIndex(projectId: string, chapters: readonly Chapter[], sources: readonly TextLinkSource[]): TextLinkBuildResult {
  const issues: TextLinkRebuildIssue[] = [];
  const validSources: TextLinkSource[] = [];
  const seen = new Set<string>();
  for (const source of sources.slice().sort(sourceOrder)) {
    const parsed = textLinkSourceSchemaSafe(source);
    if (parsed === undefined) {
      issues.push({ id: source.id || 'invalid-source', code: 'invalid-source', message: '文本链接重建请求格式无效' });
      continue;
    }
    if (seen.has(parsed.id)) {
      issues.push({ id: parsed.id, code: 'invalid-source', chapterId: parsed.chapterId, sceneId: parsed.sceneId, message: '文本链接 source id 重复' });
      continue;
    }
    seen.add(parsed.id);
    validSources.push(parsed);
  }

  const records: TextLinkRecord[] = [];
  for (const source of validSources) {
    const chapter = chapters.find((candidate) => candidate.id === source.chapterId);
    const scene = chapter?.scenes.find((candidate) => candidate.id === source.sceneId);
    if (scene === undefined) {
      issues.push({ id: source.id, code: 'unknown-target', chapterId: source.chapterId, sceneId: source.sceneId, message: '文本链接目标场景不存在' });
      continue;
    }
    const offsets = findTextOccurrences(scene.content, source.quote);
    if (offsets.length === 0) {
      issues.push({ id: source.id, code: 'missing-quote', chapterId: source.chapterId, sceneId: source.sceneId, message: '引文在当前正文中不存在' });
      continue;
    }
    if (offsets.length > 1) {
      issues.push({ id: source.id, code: 'ambiguous-quote', chapterId: source.chapterId, sceneId: source.sceneId, message: '引文在当前正文中出现多次，未生成锚点' });
      continue;
    }
    const anchor = createTextAnchor(scene.content, offsets[0], offsets[0] + source.quote.length, textContentHash(scene.content));
    records.push({
      id: source.id,
      link: { projectId, kind: 'text', chapterId: source.chapterId, sceneId: source.sceneId, anchor },
      status: 'ready',
    });
  }

  const index = textLinkIndexSchema.parse({
    version: TEXT_LINK_INDEX_VERSION,
    projectId,
    sourceFingerprint: textProjectFingerprint(chapters),
    sources: validSources,
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
  });
  return { index, issues: issues.sort(issueOrder) };
}

/** Rebuild all retained source requests against the latest pure C5 content. */
export function rebuildTextLinkIndex(projectId: string, chapters: readonly Chapter[], previous: TextLinkIndexFile): TextLinkBuildResult {
  if (previous.projectId !== projectId) {
    return {
      index: previous,
      issues: [{ id: previous.projectId, code: 'invalid-source', message: '链接索引不属于当前作品' }],
    };
  }
  return buildTextLinkIndex(projectId, chapters, previous.sources);
}

/** Mark all existing anchors stale after any successful C5 edit. */
export function invalidateTextLinkIndex(index: TextLinkIndexFile): TextLinkIndexFile {
  return textLinkIndexSchema.parse({
    ...index,
    records: index.records.map((record) => ({ ...record, status: 'stale' as const })),
  });
}

/** File repository for derived links; malformed files fail closed and can be dropped/rebuilt. */
export class TextLinkIndexRepository {
  private readonly filePath: string;

  constructor(projectDirectory: string) {
    this.filePath = join(projectDirectory, TEXT_LINK_INDEX_DIRECTORY, TEXT_LINK_INDEX_FILE);
  }

  async build(index: TextLinkIndexFile): Promise<TextLinkIndexFile> {
    const parsed = textLinkIndexSchema.parse(index);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(parsed)}\n`, 'utf8');
    return parsed;
  }

  async load(): Promise<TextLinkIndexFile | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw cause;
    }
    return textLinkIndexSchema.parse(JSON.parse(raw));
  }

  async drop(): Promise<boolean> {
    try {
      await rm(this.filePath);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw cause;
    }
  }
}

export type { TextLinkIndexFile, TextLinkRecord, TextLinkSource } from '../schema/link.js';

function sourceOrder(left: TextLinkSource, right: TextLinkSource): number {
  return left.id.localeCompare(right.id) || left.chapterId.localeCompare(right.chapterId) || left.sceneId.localeCompare(right.sceneId) || left.quote.localeCompare(right.quote);
}

function issueOrder(left: TextLinkRebuildIssue, right: TextLinkRebuildIssue): number {
  return left.id.localeCompare(right.id) || left.code.localeCompare(right.code);
}

function textLinkSourceSchemaSafe(value: TextLinkSource): TextLinkSource | undefined {
  const result = textLinkSourceSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
