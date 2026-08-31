import { createHash } from 'node:crypto';
import { validateProjectId } from '../core/io/path.js';
import {
  compileManuscriptInputSchema,
  compileManuscriptResultSchema,
  manuscriptReadinessReceiptSchema,
  type CompileManuscriptInput,
  type CompileManuscriptResult,
  type ManuscriptReadinessReceipt,
} from '../core/schema/manuscript.js';
import type { BookReadinessResult } from '../core/schema/book-readiness.js';
import type { NovelBookCompletionService } from './book-completion-service.js';
import type { NovelTextServiceBundle } from './text-service.js';

/** Dependencies owned by the Host composition root; no Client-side assembly is allowed. */
export interface ManuscriptCompilerDeps {
  readonly text: Pick<NovelTextServiceBundle, 'listChapters' | 'projectFingerprint'>;
  readonly completion: Pick<NovelBookCompletionService, 'scan'>;
}

/**
 * I138 canonical full-manuscript owner (design §14.14.2 / plan §18 I138).
 *
 * It consumes only the chosen C5 `scene.content` returned by the Host text
 * owner, after an I137 full-book scan. Old branches, settings, links, IDs and
 * sidecars never enter the renderer. The receipt and a second fingerprint read
 * make a concurrent source change fail closed instead of producing a mixed
 * manuscript.
 */
export interface ManuscriptCompiler {
  compile(projectId: string, input: CompileManuscriptInput): Promise<CompileManuscriptResult>;
}

function receiptOf(result: BookReadinessResult): ManuscriptReadinessReceipt {
  return manuscriptReadinessReceiptSchema.parse({
    gateOpen: result.gateOpen,
    computedAt: result.computedAt,
    textFingerprint: result.fingerprints.text,
    outlineFingerprint: result.fingerprints.outline,
    bindingFingerprint: result.fingerprints.binding,
    review: result.review,
  });
}

function sameFreshness(left: ManuscriptReadinessReceipt, right: ManuscriptReadinessReceipt): boolean {
  return left.gateOpen === right.gateOpen
    && left.textFingerprint === right.textFingerprint
    && left.outlineFingerprint === right.outlineFingerprint
    && left.bindingFingerprint === right.bindingFingerprint
    && left.review.status === right.review.status
    && left.review.total === right.review.total
    && left.review.hard === right.review.hard
    && left.review.warning === right.review.warning;
}

function markdownAnchor(title: string, occurrence: number): string {
  const slug = title.trim().toLowerCase().replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/gu, '-').replace(/^-|-$/gu, '') || 'chapter';
  return occurrence === 1 ? slug : `${slug}-${occurrence}`;
}

function renderTxt(chapters: readonly { title: string; scenes: readonly { content: string }[] }[]): string {
  const lines = ['目录', ''];
  chapters.forEach((chapter, index) => lines.push(`${index + 1}. ${chapter.title}`));
  lines.push('');
  chapters.forEach((chapter, index) => {
    if (index > 0) lines.push('');
    lines.push(chapter.title, '', ...chapter.scenes.flatMap((scene, sceneIndex) => sceneIndex === 0 ? [scene.content] : ['', scene.content]));
  });
  return `${lines.join('\n')}\n`;
}

function renderMarkdown(chapters: readonly { title: string; scenes: readonly { content: string }[] }[]): string {
  const occurrences = new Map<string, number>();
  const anchors = chapters.map((chapter) => {
    const occurrence = (occurrences.get(chapter.title) ?? 0) + 1;
    occurrences.set(chapter.title, occurrence);
    return markdownAnchor(chapter.title, occurrence);
  });
  const lines = ['# 目录', ''];
  chapters.forEach((chapter, index) => lines.push(`- [${chapter.title}](#${anchors[index]})`));
  lines.push('');
  chapters.forEach((chapter, index) => {
    if (index > 0) lines.push('');
    lines.push(`## ${chapter.title}`, '', ...chapter.scenes.flatMap((scene, sceneIndex) => sceneIndex === 0 ? [scene.content] : ['', scene.content]));
  });
  return `${lines.join('\n')}\n`;
}

export function createManuscriptCompiler(deps: ManuscriptCompilerDeps): ManuscriptCompiler {
  return Object.freeze({
    async compile(projectId: string, rawInput: CompileManuscriptInput): Promise<CompileManuscriptResult> {
      validateProjectId(projectId);
      const input = compileManuscriptInputSchema.parse(rawInput);
      const readiness = await deps.completion.scan(projectId);
      if (!readiness.gateOpen) throw new Error('单一全文编译被发布门阻断：请先完成全书检查并处理所有硬问题。');
      const readinessReceipt = receiptOf(readiness);
      if (input.readinessReceipt !== undefined && !sameFreshness(input.readinessReceipt, readinessReceipt)) {
        throw new Error('单一全文编译被阻断：全书完成门 receipt 已过期，请重新检查全书。');
      }
      const chapters = (await deps.text.listChapters(projectId)).sort((left, right) => left.index - right.index).map((chapter) => ({
        title: chapter.title,
        scenes: [...chapter.scenes].sort((left, right) => left.index - right.index).map((scene) => ({ content: scene.content })),
      }));
      if (chapters.length === 0 || chapters.some((chapter) => chapter.scenes.length === 0)) {
        throw new Error('单一全文编译被阻断：全书必须包含至少一章且每章至少一个场景。');
      }
      const afterFingerprint = await deps.text.projectFingerprint(projectId);
      if (afterFingerprint !== readiness.fingerprints.text) {
        throw new Error('单一全文编译被阻断：正文在编译期间发生变化，请重新检查全书。');
      }
      const content = input.format === 'txt' ? renderTxt(chapters) : renderMarkdown(chapters);
      return compileManuscriptResultSchema.parse({
        projectId,
        format: input.format,
        fileName: `manuscript.${input.format}`,
        content,
        contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
        chapterCount: chapters.length,
        sceneCount: chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
        readinessReceipt,
      });
    },
  });
}
