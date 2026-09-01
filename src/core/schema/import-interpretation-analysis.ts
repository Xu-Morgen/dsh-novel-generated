import { z } from 'zod';
import { confidenceSchema } from './base.js';
import { importSourceRoleSchema } from './import-interpretation.js';

/** The five source meanings an I143 model may assign to one paragraph. */
export const sourceParagraphRoleSchema = z.enum([
  'world-truth',
  'plot-plan',
  'prose',
  'author-instruction',
  'presentation-note',
]);
export type SourceParagraphRole = z.infer<typeof sourceParagraphRoleSchema>;

/** Host-owned normalized paragraph and UTF-16 range; the model never supplies the range. */
export const importInterpretationParagraphSchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  index: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(20_000),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).strict();
export type ImportInterpretationParagraph = z.infer<typeof importInterpretationParagraphSchema>;

export const importInterpretationInputSchema = z.object({
  projectId: z.string().trim().min(1).max(64),
  importSessionId: z.string().trim().min(1).max(64),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  paragraphs: z.array(importInterpretationParagraphSchema).min(1).max(200),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  let previousEnd = -1;
  input.paragraphs.forEach((paragraph, position) => {
    if (!ids.add(paragraph.paragraphId)) {
      context.addIssue({ code: 'custom', path: ['paragraphs', position, 'paragraphId'], message: `Duplicate paragraph id: ${paragraph.paragraphId}` });
    }
    if (paragraph.index !== position) {
      context.addIssue({ code: 'custom', path: ['paragraphs', position, 'index'], message: 'Paragraph indexes must be contiguous and ordered' });
    }
    if (paragraph.endOffset <= paragraph.startOffset) {
      context.addIssue({ code: 'custom', path: ['paragraphs', position, 'endOffset'], message: 'Paragraph range must be non-empty' });
    }
    if (paragraph.startOffset < previousEnd) {
      context.addIssue({ code: 'custom', path: ['paragraphs', position, 'startOffset'], message: 'Paragraph ranges must not overlap' });
    }
    previousEnd = paragraph.endOffset;
  });
});
export type ImportInterpretationInput = z.infer<typeof importInterpretationInputSchema>;

export const sourceInterpretationParagraphSchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  role: sourceParagraphRoleSchema,
  confidence: confidenceSchema,
  evidence: z.string().trim().min(1).max(2_000),
}).strict();
export type SourceInterpretationParagraph = z.infer<typeof sourceInterpretationParagraphSchema>;

/** Strict model output: classification/evidence only, never treatment, POV, range, or write command. */
export const sourceInterpretationOutputSchema = z.object({
  sourceRole: importSourceRoleSchema,
  confidence: confidenceSchema,
  evidenceParagraphIds: z.array(z.string().trim().min(1).max(200)),
  paragraphs: z.array(sourceInterpretationParagraphSchema).min(1).max(200),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type SourceInterpretationOutput = z.infer<typeof sourceInterpretationOutputSchema>;

export const importInterpretationAnalysisBeginResultSchema = z.object({
  projectId: z.string().trim().min(1).max(64),
  importSessionId: z.string().trim().min(1).max(64),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type ImportInterpretationAnalysisBeginResult = z.infer<typeof importInterpretationAnalysisBeginResultSchema>;

export const importInterpretationAnalysisIdentitySchema = importInterpretationAnalysisBeginResultSchema;
export type ImportInterpretationAnalysisIdentity = z.infer<typeof importInterpretationAnalysisIdentitySchema>;

export const importInterpretationAnalysisStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type ImportInterpretationAnalysisStatus = z.infer<typeof importInterpretationAnalysisStatusSchema>;

export const importInterpretationAnalysisStatusResultSchema = importInterpretationAnalysisBeginResultSchema.extend({
  status: importInterpretationAnalysisStatusSchema,
}).strict();
export type ImportInterpretationAnalysisStatusResult = z.infer<typeof importInterpretationAnalysisStatusResultSchema>;

export const importInterpretationAnalysisResultSchema = importInterpretationAnalysisBeginResultSchema.extend({
  output: sourceInterpretationOutputSchema,
}).strict();
export type ImportInterpretationAnalysisResult = z.infer<typeof importInterpretationAnalysisResultSchema>;

/** Deterministically derive paragraph ids/ranges before any LLM call. */
export function createImportInterpretationParagraphs(rawText: string): ImportInterpretationParagraph[] {
  const text = z.string().min(1).max(2 * 1024 * 1024).parse(rawText).normalize('NFC');
  const paragraphs: ImportInterpretationParagraph[] = [];
  let cursor = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const normalized = line.trim();
    const startInLine = line.indexOf(normalized);
    if (normalized.length > 0) {
      const startOffset = cursor + startInLine;
      paragraphs.push({
        paragraphId: `paragraph-${String(paragraphs.length + 1).padStart(4, '0')}`,
        index: paragraphs.length,
        text: normalized,
        startOffset,
        endOffset: startOffset + normalized.length,
      });
    }
    cursor += rawLine.length + 1;
  }
  return importInterpretationInputSchema.shape.paragraphs.parse(paragraphs);
}

/** Fail closed if the model loses, duplicates, reorders, or invents a paragraph. */
export function assertImportInterpretationCoverage(input: ImportInterpretationInput, output: SourceInterpretationOutput): void {
  const expected = input.paragraphs.map((paragraph) => paragraph.paragraphId);
  const actual = output.paragraphs.map((paragraph) => paragraph.paragraphId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Source interpretation paragraphs must cover every input paragraph in order');
  }
  const evidence = new Set(expected);
  for (const id of output.evidenceParagraphIds) {
    if (!evidence.has(id)) throw new Error(`Source interpretation evidence references unknown paragraph: ${id}`);
  }
  if (new Set(output.evidenceParagraphIds).size !== output.evidenceParagraphIds.length) {
    throw new Error('Source interpretation evidence paragraph ids must be unique');
  }
}
