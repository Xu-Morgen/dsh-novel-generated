import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { downloadText, MAX_RESTORE_FILE_BYTES } from '../layers/import-export.js';
import type { ImportExportEditOps, ImportExportLayerState, ImportExportPreviewShape, ImportExportRestoreResultShape } from '../layers/import-export.js';
import type { OpsPorts, OpsRuntime } from './context.js';

export interface ImportExportSavePort {
  saveFile(fileName: string, content: string, mimeType?: string): Promise<{ readonly saved: boolean; readonly fileName: string }>;
}

type ImportExportPort = Pick<OpsPorts, 'importExportNamespace'> & { saveFile?: ImportExportSavePort };

/**
 * I69 import/export operations with an optional I180 Main-owned save port.
 * Browser download remains the compatibility path; when the port exists, no
 * file path enters Renderer state and every export is authorized by Main.
 */
export function createImportExportOps(runtime: OpsRuntime, port: ImportExportPort): ImportExportEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const importExportNamespace = port.importExportNamespace;
  const saveFile = port.saveFile;
  const iePatch = (patch: Partial<ImportExportLayerState>): void => act.importExportPatch(patch);

  const persistExport = async (fileName: string, content: string, mimeType?: string): Promise<boolean> => {
    if (saveFile === undefined) {
      downloadText(fileName, content, mimeType);
      return true;
    }
    return (await saveFile.saveFile(fileName, content, mimeType)).saved;
  };

  return {
    setExportMode(mode) { iePatch({ exportMode: mode, message: undefined, error: undefined }); },
    setTextFormat(format) { iePatch({ textFormat: format, message: undefined, error: undefined }); },
    setImportFormat(format) { iePatch({ importFormat: format, message: undefined, error: undefined }); },
    setImportText(text) { iePatch({ importText: text, message: undefined, error: undefined }); },
    pickImportFile(file) {
      if (!file) return;
      void file.text().then((text) => {
        if (!isActive()) return;
        iePatch({ importText: text, importFileName: file.name, message: undefined, error: undefined });
      }, () => { if (!isActive()) return; iePatch({ error: `读取导入文件失败：${file.name}` }); });
    },
    pickRestoreFile(file) {
      if (!file) return;
      if (file.size > MAX_RESTORE_FILE_BYTES) {
        iePatch({ restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: '恢复包超过 10 MiB 上限。', error: undefined });
        return;
      }
      void file.text().then((text) => {
        if (!isActive()) return;
        iePatch({ restoreFileName: file.name, restoreRaw: text, restoreResult: undefined, restoreError: undefined, message: undefined, error: undefined });
      }, () => { if (!isActive()) return; iePatch({ restoreError: `读取恢复包失败：${file.name}` }); });
    },
    exportArchive(): void {
      const target = importExportNamespace;
      if (!target || projectId === undefined || snapshot.importExport.busy.exportArchive === true) return;
      if (!beginOp('importExport:export-archive')) return;
      const release = (): void => endOp('importExport:export-archive');
      iePatch({ busy: { ...snapshot.importExport.busy, exportArchive: true }, message: undefined, error: undefined });
      void unwrap(target.exportArchive(projectId, snapshot.importExport.exportMode)).then(async (outcome) => {
        if (!isActive()) { release(); return; }
        const result = outcome as { fileName: string; mode: string; fileCount: number; content: string };
        try {
          const saved = await persistExport(result.fileName, result.content, 'application/json');
          release();
          if (!isActive()) return;
          iePatch({
            busy: { ...snapshot.importExport.busy, exportArchive: false },
            message: saved ? `已导出 ${result.fileCount} 个文件（${result.mode}），已写入 ${result.fileName}。` : '已取消导出保存。',
          });
        } catch (cause) {
          release();
          if (!isActive()) return;
          iePatch({ busy: { ...snapshot.importExport.busy, exportArchive: false }, error: toUserMessage(cause as Error) });
        }
      }, (cause: Error) => { release(); if (!isActive()) return; iePatch({ busy: { ...snapshot.importExport.busy, exportArchive: false }, error: toUserMessage(cause) }); });
    },
    exportText(): void {
      const target = importExportNamespace;
      if (!target || projectId === undefined || snapshot.importExport.busy.exportText === true) return;
      if (!beginOp('importExport:export-text')) return;
      const release = (): void => endOp('importExport:export-text');
      iePatch({ busy: { ...snapshot.importExport.busy, exportText: true }, message: undefined, error: undefined });
      void unwrap(target.exportText(projectId, snapshot.importExport.textFormat)).then(async (outcome) => {
        if (!isActive()) { release(); return; }
        const result = outcome as { fileName: string; format: string; files: Record<string, string> };
        let savedCount = 0;
        let cancelled = false;
        try {
          for (const [name, content] of Object.entries(result.files)) {
            const base = name.split(/[\\/]/).pop() ?? name;
            const saved = await persistExport(base, content, result.format === 'md' ? 'text/markdown' : 'text/plain');
            if (!saved) { cancelled = true; break; }
            savedCount += 1;
          }
          release();
          if (!isActive()) return;
          const total = Object.keys(result.files).length;
          iePatch({
            busy: { ...snapshot.importExport.busy, exportText: false },
            message: cancelled ? `已取消导出，已写入 ${savedCount}/${total} 个文件。` : `已导出 ${savedCount} 个纯文本文件（${result.format}）。`,
          });
        } catch (cause) {
          release();
          if (!isActive()) return;
          iePatch({ busy: { ...snapshot.importExport.busy, exportText: false }, error: toUserMessage(cause as Error) });
        }
      }, (cause: Error) => { release(); if (!isActive()) return; iePatch({ busy: { ...snapshot.importExport.busy, exportText: false }, error: toUserMessage(cause) }); });
    },
    compileManuscript(format: 'txt' | 'md'): void {
      const target = importExportNamespace;
      if (!target || projectId === undefined || snapshot.importExport.busy.compileManuscript === true) return;
      const operation = `importExport:compile-manuscript:${format}`;
      if (!beginOp(operation)) return;
      const release = (): void => endOp(operation);
      iePatch({ busy: { ...snapshot.importExport.busy, compileManuscript: true }, message: undefined, error: undefined });
      void unwrap(target.compileManuscript(projectId, { format })).then(async (outcome) => {
        if (!isActive()) { release(); return; }
        const result = outcome as { fileName: string; format: 'txt' | 'md'; content: string; chapterCount: number; sceneCount: number };
        try {
          const saved = await persistExport(result.fileName, result.content, result.format === 'md' ? 'text/markdown' : 'text/plain');
          release();
          if (!isActive()) return;
          iePatch({
            busy: { ...snapshot.importExport.busy, compileManuscript: false },
            message: saved ? `已编译单一全文 ${result.format.toUpperCase()}：${result.chapterCount} 章、${result.sceneCount} 个场景，已写入 ${result.fileName}。` : '已取消编译文稿保存。',
          });
        } catch (cause) {
          release();
          if (!isActive()) return;
          iePatch({ busy: { ...snapshot.importExport.busy, compileManuscript: false }, error: toUserMessage(cause as Error) });
        }
      }, (cause: Error) => { release(); if (!isActive()) return; iePatch({ busy: { ...snapshot.importExport.busy, compileManuscript: false }, error: toUserMessage(cause) }); });
    },
    restore(): void {
      const target = importExportNamespace;
      const state = snapshot.importExport;
      if (!target || projectId === undefined || state.busy.restore === true || state.restoreRaw === undefined) return;
      if (!beginOp('importExport:restore')) return;
      const release = (): void => endOp('importExport:restore');
      iePatch({ busy: { ...state.busy, restore: true }, message: undefined, error: undefined, restoreError: undefined, restoreResult: undefined });
      void unwrap(target.restore(projectId, state.restoreRaw)).then((outcome) => {
        release();
        if (!isActive()) return;
        const result = outcome as ImportExportRestoreResultShape;
        if (result.status === 'imported') {
          iePatch({ busy: { ...state.busy, restore: false }, restoreResult: result, message: `恢复完成：写入 ${result.written.length} 个文件（round-trip）。` });
        } else {
          iePatch({ busy: { ...state.busy, restore: false }, restoreResult: result, message: undefined });
        }
      }, (cause: Error) => { release(); if (!isActive()) return; iePatch({ busy: { ...state.busy, restore: false }, restoreError: toUserMessage(cause) }); });
    },
    previewImport(): void {
      const target = importExportNamespace;
      const state = snapshot.importExport;
      if (!target || projectId === undefined || state.busy.preview === true || state.importText.trim() === '') return;
      if (!beginOp('importExport:preview')) return;
      const release = (): void => endOp('importExport:preview');
      iePatch({ busy: { ...state.busy, preview: true }, message: undefined, error: undefined });
      void unwrap(target.importPreview(projectId, { fileName: state.importFileName ?? `pasted.${state.importFormat}`, format: state.importFormat, text: state.importText })).then((outcome) => {
        release();
        if (!isActive()) return;
        const result = outcome as ImportExportPreviewShape;
        iePatch({ busy: { ...state.busy, preview: false }, preview: result, message: `导入预览完成：${result.chunks.length} 块（零写）。` });
      }, (cause: Error) => { release(); if (!isActive()) return; iePatch({ busy: { ...state.busy, preview: false }, error: toUserMessage(cause) }); });
    },
    dismiss() { iePatch({ status: 'idle', message: undefined, error: undefined, busy: {}, preview: undefined, restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: undefined, importText: '', importFileName: undefined }); },
  };
}
