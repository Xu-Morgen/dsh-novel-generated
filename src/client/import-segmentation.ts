import { importInterpretationInputSchema, type ImportInterpretationParagraph } from '../core/schema/import-interpretation-analysis.js';

const MAX_PARAGRAPHS = 200;

function paragraphId(index: number): string {
  return `paragraph-${String(index + 1).padStart(4, '0')}`;
}

function paragraphFromRange(sourceText: string, startOffset: number, endOffset: number): ImportInterpretationParagraph {
  const raw = sourceText.slice(startOffset, endOffset);
  const leading = raw.search(/\S/);
  if (leading < 0) throw new Error('分段两侧都必须包含文字。');
  const trailing = raw.length - raw.trimEnd().length;
  const start = startOffset + leading;
  const end = endOffset - trailing;
  return { paragraphId: '', index: 0, text: sourceText.slice(start, end), startOffset: start, endOffset: end };
}

function validateProjection(sourceText: string, paragraphs: readonly ImportInterpretationParagraph[]): void {
  for (const paragraph of paragraphs) {
    if (sourceText.slice(paragraph.startOffset, paragraph.endOffset) !== paragraph.text) {
      throw new Error('来源片段与规范原文范围不一致，请重新导入。');
    }
  }
}

function finalize(paragraphs: readonly ImportInterpretationParagraph[]): ImportInterpretationParagraph[] {
  if (paragraphs.length > MAX_PARAGRAPHS) throw new Error('来源片段不能超过 200 段。');
  return importInterpretationInputSchema.shape.paragraphs.parse(paragraphs.map((paragraph, index) => ({
    ...paragraph,
    paragraphId: paragraphId(index),
    index,
  })));
}

/**
 * I162 author-selected source segmentation (design §14.29).
 *
 * The operation changes only paragraph boundaries over the Host-projected
 * normalized text. It cannot edit, reorder or synthesize source characters.
 */
export function splitImportParagraph(
  sourceText: string,
  paragraphs: readonly ImportInterpretationParagraph[],
  targetParagraphId: string,
  offsetInParagraph: number,
): ImportInterpretationParagraph[] {
  validateProjection(sourceText, paragraphs);
  const targetIndex = paragraphs.findIndex((paragraph) => paragraph.paragraphId === targetParagraphId);
  if (targetIndex < 0) throw new Error('找不到要分段的来源片段。');
  const target = paragraphs[targetIndex];
  if (!Number.isSafeInteger(offsetInParagraph) || offsetInParagraph <= 0 || offsetInParagraph >= target.text.length) {
    throw new Error('请把光标放在来源片段文字中间。');
  }
  const previous = target.text.charCodeAt(offsetInParagraph - 1);
  const next = target.text.charCodeAt(offsetInParagraph);
  if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
    throw new Error('不能在一个完整字符中间分段。');
  }
  const absoluteOffset = target.startOffset + offsetInParagraph;
  const left = paragraphFromRange(sourceText, target.startOffset, absoluteOffset);
  const right = paragraphFromRange(sourceText, absoluteOffset, target.endOffset);
  return finalize([...paragraphs.slice(0, targetIndex), left, right, ...paragraphs.slice(targetIndex + 1)]);
}

/** Merge one source fragment with its immediately following fragment. */
export function mergeImportParagraphWithNext(
  sourceText: string,
  paragraphs: readonly ImportInterpretationParagraph[],
  targetParagraphId: string,
): ImportInterpretationParagraph[] {
  validateProjection(sourceText, paragraphs);
  const targetIndex = paragraphs.findIndex((paragraph) => paragraph.paragraphId === targetParagraphId);
  if (targetIndex < 0 || targetIndex >= paragraphs.length - 1) throw new Error('只能与紧邻的下一来源片段合并。');
  const current = paragraphs[targetIndex];
  const next = paragraphs[targetIndex + 1];
  if (/\S/.test(sourceText.slice(current.endOffset, next.startOffset))) {
    throw new Error('来源片段之间存在未投影文字，不能合并。');
  }
  const merged = paragraphFromRange(sourceText, current.startOffset, next.endOffset);
  return finalize([...paragraphs.slice(0, targetIndex), merged, ...paragraphs.slice(targetIndex + 2)]);
}
