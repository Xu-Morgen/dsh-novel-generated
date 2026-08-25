import { z } from 'zod';

/**
 * I51 受控 DOCX 上传契约（design §14.7.2 / D18, requirement R11-2）。
 *
 * Client 只分块运输字节，Host 校验文件名、声明大小、块序号、块大小、总大小与
 * SHA-256，并限制 entry/解压量/压缩比。所有字段跨 Remote 时已 JSON 严格化。
 */

/** 文件名：仅 basename 字符，禁止路径分隔符与 NUL。 */
export const uploadFileNameSchema = z.string().min(1).max(255).regex(/^[^/\\\u0000]+$/);
export type UploadFileName = z.infer<typeof uploadFileNameSchema>;

/** 单次声明的上传元数据。 */
export const uploadStartInputSchema = z.object({
  fileName: uploadFileNameSchema,
  size: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type UploadStartInput = z.infer<typeof uploadStartInputSchema>;

/** 一个块。 */
export const uploadChunkInputSchema = z.object({
  index: z.number().int().nonnegative(),
  data: z.string().min(1),
}).strict();
export type UploadChunkInput = z.infer<typeof uploadChunkInputSchema>;

/** uploadStart 结果。 */
export const uploadStartResultSchema = z.object({
  uploadId: z.string().min(1),
  chunkSize: z.number().int().positive(),
  nextIndex: z.number().int().nonnegative(),
}).strict();
export type UploadStartResult = z.infer<typeof uploadStartResultSchema>;

/** uploadChunk 结果：收到块后顺延。 */
export const uploadChunkResultSchema = z.object({
  nextIndex: z.number().int().nonnegative(),
  received: z.number().int().nonnegative(),
}).strict();
export type UploadChunkResult = z.infer<typeof uploadChunkResultSchema>;

/** 规范化 DOCX 文本块（I51 只产文本，不产候选）。 */
export const docxTextChunkSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
}).strict();
export type DocxTextChunk = z.infer<typeof docxTextChunkSchema>;

/** uploadFinalize 结果：提取的规范文本与最小证据。 */
export const uploadFinalizeResultSchema = z.object({
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  fileName: uploadFileNameSchema,
  text: z.string(),
  chunks: z.array(docxTextChunkSchema),
}).strict();
export type UploadFinalizeResult = z.infer<typeof uploadFinalizeResultSchema>;
