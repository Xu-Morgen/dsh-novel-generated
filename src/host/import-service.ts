import { createImportService, type ImportOptions, type ImportSplitter, type ImportedText, type NovelImportService, type PendingImportCandidate } from '../import/index.js';

/** Host facade for I37 deterministic file import; no layer write authority is exposed. */
export interface NovelHostImportService extends NovelImportService {
  read(filePath: string, options: ImportOptions): Promise<ImportedText>;
  review(filePath: string, options: ImportOptions, splitter: ImportSplitter): Promise<{ readonly source: ImportedText; readonly candidates: readonly PendingImportCandidate[] }>;
}

export function createHostImportService(): NovelHostImportService {
  return createImportService();
}

