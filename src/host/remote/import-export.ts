import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：导入预览分块 wire schema 从 core/schema/upload.ts 的 docxTextChunkSchema
// 派生（I37 归一化分块与 I51 DOCX 分块同构；core/schema 纯 zod，可入 Client
// bundle 图 —— 架构审查 §6.3/§9#3）。
import { docxTextChunkSchema } from '../../core/schema/upload.js';

/**
 * I69 导入导出与备份 Remote（design §14.10「导入、导出与备份」/ R14-4）。
 *
 * `novelImportExport` 是作品设置里「导入导出与备份」面板的唯一读写面：
 * - `exportArchive`：I39 可移植档案受控下载载荷（full-project / shareable-template），
 *   内容为序列化档案文本，fileName 仅供浏览器 Blob 下载；
 * - `exportText`：I39 纯文本导出（txt/md）的文件映射下载载荷；
 * - `restore`：round-trip 备份恢复 —— 校验先行，N-7 非空作品 fail closed 返回
 *   blocked（列出已存在层），空壳作品事务写盘（失败回滚，无半导入）；
 * - `importPreview`：I37 确定性导入管线预览（归一化 + 分块，零写）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON，不含任何 Host 路径与 secret；
 * 校验由 Host 服务端（core 合同）执行，Client 不复制领域校验、不做领域 fallback。
 */

export const importExportArchiveModeWireSchema = z.enum(['full-project', 'shareable-template']);
export const importExportTextFormatWireSchema = z.enum(['txt', 'md']);
export const importExportImportFormatWireSchema = z.enum(['txt', 'md', 'docx']);

export const importExportArchiveOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  mode: importExportArchiveModeWireSchema,
  exportedAt: z.string().min(1),
  fileName: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  content: z.string().min(1),
}).strict();

export const importExportTextOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  format: importExportTextFormatWireSchema,
  fileName: z.string().min(1),
  files: z.record(z.string(), z.string()),
}).strict();

/** restore 结果：imported（写盘成功）或 blocked（N-7 非空作品 fail closed + 冲突层列表）。 */
export const importExportRestoreResultWireSchema = z.discriminatedUnion('status', [
  z.object({
    projectId: z.string().min(1),
    status: z.literal('imported'),
    written: z.array(z.string()),
    conflicts: z.array(z.string()),
  }).strict(),
  z.object({
    projectId: z.string().min(1),
    status: z.literal('blocked'),
    reason: z.literal('non-empty-project'),
    layers: z.array(z.string()),
  }).strict(),
]);

export const importPreviewInputWireSchema = z.object({
  fileName: z.string().min(1).max(255),
  format: importExportImportFormatWireSchema,
  text: z.string().min(1).max(10 * 1024 * 1024),
}).strict();

export const importPreviewChunkWireSchema = docxTextChunkSchema;

export const importPreviewOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1),
  format: importExportImportFormatWireSchema,
  text: z.string(),
  chunks: z.array(importPreviewChunkWireSchema),
}).strict();

// I75：`param`/`importExportInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const importExportInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelImportExport', method, parameters, resultSchema);

const projectIdParam = param('projectId', strictCodec('novel-creation-tool#projectId', z.string().min(1).max(64)));

export const importExportArchiveInvocation = importExportInvocation('exportArchive', [
  projectIdParam,
  param('mode', strictCodec('novel-creation-tool#importExportArchiveMode', importExportArchiveModeWireSchema)),
], strictCodec('novel-creation-tool#importExportArchiveOutcome', importExportArchiveOutcomeWireSchema));
export const importExportTextInvocation = importExportInvocation('exportText', [
  projectIdParam,
  param('format', strictCodec('novel-creation-tool#importExportTextFormat', importExportTextFormatWireSchema)),
], strictCodec('novel-creation-tool#importExportTextOutcome', importExportTextOutcomeWireSchema));
export const importExportRestoreInvocation = importExportInvocation('restore', [
  projectIdParam,
  param('raw', strictCodec('novel-creation-tool#importExportRestoreRaw', z.string().min(1))),
], strictCodec('novel-creation-tool#importExportRestoreResult', importExportRestoreResultWireSchema));
export const importExportPreviewInvocation = importExportInvocation('importPreview', [
  projectIdParam,
  param('input', strictCodec('novel-creation-tool#importPreviewInput', importPreviewInputWireSchema)),
], strictCodec('novel-creation-tool#importPreviewOutcome', importPreviewOutcomeWireSchema));

export const importExportInvocations = [
  importExportArchiveInvocation,
  importExportTextInvocation,
  importExportRestoreInvocation,
  importExportPreviewInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const importExportRemoteContribution = remoteContribution('novel-creation-tool-import-export', importExportInvocations);
