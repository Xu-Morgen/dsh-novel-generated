import { z } from 'zod';
import { strictCodec } from '../host/remote/common.js';
import { param, remoteInvocation } from '../host/remote/shared.js';

/** Main-owned export payload. The path is deliberately absent from this contract. */
export const desktopSaveFileInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  content: z.string().max(64 * 1024 * 1024),
  mimeType: z.string().min(1).max(128).optional(),
}).strict();

/** Opaque save result; cancellation is a normal user outcome, not a failure. */
export const desktopSaveFileResultSchema = z.object({
  saved: z.boolean(),
  fileName: z.string().min(1).max(255),
}).strict();

/** I180 additive desktop-only OS save seam. */
export const desktopSaveFileInvocation = remoteInvocation('novelDesktopFiles', 'saveFile', [
  param('input', strictCodec('novel-creation-tool#desktopSaveFileInput', desktopSaveFileInputSchema)),
], strictCodec('novel-creation-tool#desktopSaveFileResult', desktopSaveFileResultSchema));
