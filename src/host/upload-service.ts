import { createUploadStore, type NovelUploadStore } from '../core/upload/index.js';
import type { UploadChunkResult, UploadFinalizeResult, UploadStartInput, UploadStartResult } from '../core/schema/upload.js';

/**
 * I51 Host facade for the controlled DOCX upload (design §14.7.2 / R11-2).
 *
 * It owns the temp-area store and binds its `dispose` to the Cordis Fiber so
 * cancel/failure/Fiber dispose zeroes the temp directory. It exposes no path and
 * no layer write authority — finalize only returns normalized text blocks.
 */
export interface NovelHostUploadService {
  uploadStart(input: UploadStartInput): Promise<UploadStartResult>;
  uploadChunk(uploadId: string, index: number, base64: string): Promise<UploadChunkResult>;
  uploadFinalize(uploadId: string): Promise<UploadFinalizeResult>;
  uploadCancel(uploadId: string): Promise<void>;
}

export function createHostUploadService(registerDispose: (dispose: () => void | Promise<void>) => void): NovelHostUploadService {
  const store: NovelUploadStore = createUploadStore();
  registerDispose(() => store.dispose());
  return {
    uploadStart: (input) => store.start(input),
    uploadChunk: (uploadId, index, base64) => store.chunk(uploadId, index, base64),
    uploadFinalize: (uploadId) => store.finalize(uploadId),
    uploadCancel: (uploadId) => store.cancel(uploadId),
  };
}
