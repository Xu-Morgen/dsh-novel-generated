// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// import-export 层编辑动作 = I69 导入导出与备份 ops（R14-4）：导出下载/恢复/N-7 说明/导入预览，经 importExportNamespace。

import { unwrap } from '../shared.js';
import { downloadText, MAX_RESTORE_FILE_BYTES } from '../layers/import-export.js';
import type { ImportExportEditOps, ImportExportLayerState, ImportExportPreviewShape, ImportExportRestoreResultShape } from '../layers/import-export.js';
import type { OpsContext } from './context.js';

export function createImportExportOps(ctx: OpsContext): ImportExportEditOps {
  const { act, snapshot, beginOp, endOp, active } = ctx;
  const projectId = ctx.projectId;
  const importExportNamespace = ctx.importExportNamespace;
      const iePatch = (patch: Partial<ImportExportLayerState>): void => act.importExportPatch(patch);
      return {
        setExportMode(mode) { iePatch({ exportMode: mode, message: undefined, error: undefined }); },
        setTextFormat(format) { iePatch({ textFormat: format, message: undefined, error: undefined }); },
        setImportFormat(format) { iePatch({ importFormat: format, message: undefined, error: undefined }); },
        setImportText(text) { iePatch({ importText: text, message: undefined, error: undefined }); },
        pickImportFile(file) {
          if (!file) return;
          void file.text().then((text) => {
            if (!active) return;
            iePatch({ importText: text, importFileName: file.name, message: undefined, error: undefined });
          }, () => { if (!active) return; iePatch({ error: `读取导入文件失败：${file.name}` }); });
        },
        pickRestoreFile(file) {
          if (!file) return;
          if (file.size > MAX_RESTORE_FILE_BYTES) {
            iePatch({ restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: '恢复包超过 10 MiB 上限。', error: undefined });
            return;
          }
          void file.text().then((text) => {
            if (!active) return;
            iePatch({ restoreFileName: file.name, restoreRaw: text, restoreResult: undefined, restoreError: undefined, message: undefined, error: undefined });
          }, () => { if (!active) return; iePatch({ restoreError: `读取恢复包失败：${file.name}` }); });
        },
        exportArchive(): void {
          const target = importExportNamespace;
          if (!target || projectId === undefined || snapshot.importExport.acting) return;
          if (!beginOp('importExport:export-archive')) return;
          const release = (): void => endOp('importExport:export-archive');
          iePatch({ acting: true, message: undefined, error: undefined });
          void unwrap(target.exportArchive(projectId, snapshot.importExport.exportMode)).then((outcome) => {
            release();
            if (!active) return;
            const result = outcome as { fileName: string; mode: string; fileCount: number; content: string };
            downloadText(result.fileName, result.content);
            iePatch({ acting: false, message: `已导出 ${result.fileCount} 个文件（${result.mode}），开始下载 ${result.fileName}。` });
          }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
        },
        exportText(): void {
          const target = importExportNamespace;
          if (!target || projectId === undefined || snapshot.importExport.acting) return;
          if (!beginOp('importExport:export-text')) return;
          const release = (): void => endOp('importExport:export-text');
          iePatch({ acting: true, message: undefined, error: undefined });
          void unwrap(target.exportText(projectId, snapshot.importExport.textFormat)).then((outcome) => {
            release();
            if (!active) return;
            const result = outcome as { fileName: string; format: string; files: Record<string, string> };
            for (const [name, content] of Object.entries(result.files)) {
              const base = name.split('/').pop() ?? name;
              // Blob 类型只作浏览器提示，落盘文件名由 anchor.download 的扩展名决定；
              // 不传 MIME（默认 application/json），避免 `text/` 字样进入 bundle
              // （I60/I61 的 Client bundle 负向扫描禁止作品目录路径提示泄漏）。
              downloadText(base, content);
            }
            iePatch({ acting: false, message: `已导出 ${Object.keys(result.files).length} 个纯文本文件（${result.format}），逐个下载。` });
          }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
        },
        restore(): void {
          const target = importExportNamespace;
          const state = snapshot.importExport;
          if (!target || projectId === undefined || state.acting || state.restoreRaw === undefined) return;
          if (!beginOp('importExport:restore')) return;
          const release = (): void => endOp('importExport:restore');
          iePatch({ acting: true, message: undefined, error: undefined, restoreError: undefined, restoreResult: undefined });
          void unwrap(target.restore(projectId, state.restoreRaw)).then((outcome) => {
            release();
            if (!active) return;
            const result = outcome as ImportExportRestoreResultShape;
            if (result.status === 'imported') {
              iePatch({ acting: false, restoreResult: result, message: `恢复完成：写入 ${result.written.length} 个文件（round-trip）。` });
            } else {
              iePatch({ acting: false, restoreResult: result, message: undefined });
            }
          }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, restoreError: (cause as Error).message }); });
        },
        previewImport(): void {
          const target = importExportNamespace;
          const state = snapshot.importExport;
          if (!target || projectId === undefined || state.acting || state.importText.trim() === '') return;
          if (!beginOp('importExport:preview')) return;
          const release = (): void => endOp('importExport:preview');
          iePatch({ acting: true, message: undefined, error: undefined });
          void unwrap(target.importPreview(projectId, { fileName: state.importFileName ?? `pasted.${state.importFormat}`, format: state.importFormat, text: state.importText })).then((outcome) => {
            release();
            if (!active) return;
            const result = outcome as ImportExportPreviewShape;
            iePatch({ acting: false, preview: result, message: `导入预览完成：${result.chunks.length} 块（零写）。` });
          }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
        },
        dismiss() { iePatch({ status: 'idle', message: undefined, error: undefined, acting: false, preview: undefined, restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: undefined, importText: '', importFileName: undefined }); },
      };
}
