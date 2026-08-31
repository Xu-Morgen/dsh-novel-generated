import type { El, ImportExportNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';

/**
 * I69 导入导出与备份面板（design §14.10「导入、导出与备份」/ R14-4）。
 *
 * 作品设置里的备份与可移植性入口，全部读写只经 Host `novelImportExport` Remote：
 * - 导出（备份/分享）：`exportArchive` 全项目包或 shareable-template 受控下载；
 *   `exportText` 纯文本 txt/md 逐文件下载。浏览器只接收下载载荷，不持有源路径。
 * - 恢复（round-trip 备份恢复）：选择导出的 .portable.json → `restore`。目标作品
 *   必须为空壳（N-7：已有内容的非空作品 fail closed，列出冲突层），校验先行 +
 *   失败回滚保证「取消/失败无半导入」。
 * - 导入预览（I37 通用导入管线）：选择/粘贴 txt/md 文本 → `importPreview` 归一化
 *   分块预览（零写；I38 拆分 agent 属生成管线 Host 侧能力，不在本面板写层）。
 *
 * 契约与不变式：Client 只持有最小 owned JSON；不导入 core schema、不复制领域校验、
 * 无领域 fallback；路径/secret 从不进入本面板的任何状态。
 */

export interface ImportExportPreviewChunkShape {
  readonly index: number;
  readonly text: string;
}

export interface ImportExportPreviewShape {
  readonly fileName: string;
  readonly format: 'txt' | 'md';
  readonly text: string;
  readonly chunks: readonly ImportExportPreviewChunkShape[];
}

export type ImportExportRestoreResultShape =
  | { readonly status: 'imported'; readonly written: readonly string[]; readonly conflicts: readonly string[] }
  | { readonly status: 'blocked'; readonly reason: 'non-empty-project'; readonly layers: readonly string[] };

/** I101/I138：导入导出面板子工作流独立 busy（含单一全文编译）。 */
export type ImportExportBusy = Partial<Record<'exportArchive' | 'exportText' | 'compileManuscript' | 'restore' | 'preview', boolean>>;

export interface ImportExportLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly error?: string;
  readonly busy: ImportExportBusy;
  readonly exportMode: 'full-project' | 'shareable-template';
  readonly textFormat: 'txt' | 'md';
  readonly importFormat: 'txt' | 'md';
  readonly importText: string;
  readonly importFileName?: string;
  readonly preview?: ImportExportPreviewShape;
  readonly restoreFileName?: string;
  /** 恢复包原文（瞬态：仅存于浏览器内存，用于一次 restore 调用，不渲染）。 */
  readonly restoreRaw?: string;
  readonly restoreResult?: ImportExportRestoreResultShape;
  readonly restoreError?: string;
}

export interface ImportExportEditOps {
  setExportMode(mode: 'full-project' | 'shareable-template'): void;
  setTextFormat(format: 'txt' | 'md'): void;
  setImportFormat(format: 'txt' | 'md'): void;
  setImportText(text: string): void;
  /** 读取选中文件文本（txt/md）供导入预览。 */
  pickImportFile(file: File): void;
  /** 读取选中恢复包文本（.portable.json）并暂存瞬态 restoreRaw。 */
  pickRestoreFile(file: File): void;
  exportArchive(): void;
  exportText(): void;
  compileManuscript(format: 'txt' | 'md'): void;
  restore(): void;
  previewImport(): void;
  dismiss(): void;
}

export function freshImportExport(): ImportExportLayerState {
  return { status: 'idle', busy: {}, exportMode: 'full-project', textFormat: 'txt', importFormat: 'txt', importText: '' };
}

export const IMPORT_EXPORT_MODE_LABELS: Readonly<Record<string, string>> = {
  'full-project': '全项目包（设定、结构与正文）',
  'shareable-template': '可分享设定模板（不含正文）',
};

export const MAX_RESTORE_FILE_BYTES = 10 * 1024 * 1024;

/** 浏览器受控下载：Blob + 临时 <a>，不写盘、不暴露 Host 路径。 */
export function downloadText(fileName: string, content: string, type = 'application/json'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    if (typeof anchor.click === 'function') anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    // 下载失败不掩盖状态反馈（无真实 DOM 的测试/受限环境静默跳过）。
  }
}

function readFileText(file: File): Promise<string> {
  return file.text().then((text) => {
    if (text.length === 0) throw new Error('文件为空');
    return text;
  });
}

/**
 * 导入导出与备份面板。状态机：idle → loading → ready / error。导出/恢复/预览
 * 都显示独立反馈行；N-7 阻断与校验失败以显式说明呈现，不静默合并或覆盖。
 */
export function importExportPanel(h: El, projectId: string, namespace: ImportExportNamespace | undefined, state: ImportExportLayerState, ops: ImportExportEditOps): unknown {
  const available = namespace !== undefined && projectId !== undefined;
  const busy = state.busy.exportArchive === true || state.busy.exportText === true || state.busy.compileManuscript === true || state.busy.restore === true || state.busy.preview === true || state.status === 'loading';
  const restoreBlocked = state.restoreResult?.status === 'blocked';
  const restoreImported = state.restoreResult?.status === 'imported';

  return h('section', { className: 'nv-panel nv-settings', 'data-novel-import-export-panel': '', 'data-novel-import-export-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '导入导出与备份'),
    h('p', { className: 'nv-settings__hint', 'data-novel-import-export-desc': '' },
      '备份与可移植性入口：全项目包/可分享模板/纯文本导出下载、round-trip 恢复与通用导入预览。' +
      '浏览器只接收受控下载载荷并发送命令，不持有任何源文件路径。'),

    // ---- 导出（备份/分享）----
    h('div', { className: 'nv-progress__section', 'data-novel-import-export-export': '' },
      h('h4', { className: 'nv-progress__section-title' }, '导出（备份 / 分享）'),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '导出范围'),
        h('select', { className: 'nv-field__input', 'data-novel-ie-export-mode': '', value: state.exportMode, disabled: busy, onChange: (event: { target: { value: string } }) => ops.setExportMode(event.target.value as 'full-project' | 'shareable-template') },
          (Object.keys(IMPORT_EXPORT_MODE_LABELS) as Array<'full-project' | 'shareable-template'>).map((mode) =>
            h('option', { key: mode, value: mode }, IMPORT_EXPORT_MODE_LABELS[mode]))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '纯文本格式'),
        h('select', { className: 'nv-field__input', 'data-novel-ie-text-format': '', value: state.textFormat, disabled: busy, onChange: (event: { target: { value: string } }) => ops.setTextFormat(event.target.value as 'txt' | 'md') },
          h('option', { value: 'txt' }, 'TXT（章节正文）'),
          h('option', { value: 'md' }, 'Markdown（正文 + 设定）')),
      ),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-ie-export-archive': '', disabled: !available || busy, onClick: () => ops.exportArchive() }, state.busy.exportArchive === true ? '导出中…' : '导出项目包（下载 .portable.json）'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-ie-export-text': '', disabled: !available || busy, onClick: () => ops.exportText() }, state.busy.exportText === true ? '导出中…' : '导出纯文本'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-ie-compile-txt': '', disabled: !available || busy, onClick: () => ops.compileManuscript('txt') }, state.busy.compileManuscript === true ? '编译中…' : '编译单一全文 TXT'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-ie-compile-md': '', disabled: !available || busy, onClick: () => ops.compileManuscript('md') }, state.busy.compileManuscript === true ? '编译中…' : '编译单一全文 Markdown'),
      ),
      state.exportMode === 'shareable-template'
        ? h('p', { className: 'nv-settings__hint', 'data-novel-ie-shareable-note': '' }, '可分享模板不含正文，其余设定与结构照常包含，适合分享创作设定。')
        : null,
    ),

    // ---- 恢复（round-trip 备份恢复）----
    h('div', { className: 'nv-progress__section', 'data-novel-import-export-restore': '' },
      h('h4', { className: 'nv-progress__section-title' }, '恢复（round-trip 备份恢复）'),
      h('p', { className: 'nv-settings__hint', 'data-novel-ie-restore-desc': '' },
        '选择先前导出的 .portable.json 恢复到当前作品。恢复目标必须是空作品（N-7：' +
        '已有内容的作品不允许静默合并或覆盖；将列出冲突层并阻断）。'),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '备份包文件（.portable.json）'),
        h('input', { type: 'file', accept: '.json,application/json', className: 'nv-upload__input', 'data-novel-ie-restore-file': '', disabled: busy, onChange: (event: { target: { files: FileList | null } }) => {
          const file = event.target.files?.[0];
          if (file) ops.pickRestoreFile(file);
        } }),
      ),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-ie-restore': '', disabled: !available || busy || state.restoreFileName === undefined, onClick: () => ops.restore() }, state.busy.restore === true ? '恢复中…' : '恢复到当前作品'),
      ),
      restoreBlocked ? h('div', { className: 'nv-import-export__blocked', 'data-novel-ie-restore-blocked': '', role: 'alert', 'aria-live': 'assertive' },
        h('p', { 'data-novel-ie-restore-blocked-text': '' }, `恢复被阻断（N-7）：当前作品已有内容，不允许静默合并/覆盖。已存在层：${(state.restoreResult as { layers: readonly string[] }).layers.join('、')}。`),
        h('p', { className: 'nv-settings__hint' }, '请先创建新作品（空壳）再执行恢复。'),
      ) : null,
      restoreImported ? h('p', { className: 'nv-settings__ok', 'data-novel-ie-restore-imported': '', role: 'status', 'aria-live': 'polite' },
        `恢复完成：写入 ${(state.restoreResult as { written: readonly string[] }).written.length} 个文件。`) : null,
      state.restoreError ? h('p', { className: 'nv-settings__error', 'data-novel-ie-restore-error': '', role: 'alert', 'aria-live': 'assertive' }, state.restoreError) : null,
    ),

    // ---- 导入预览（I37 通用导入管线，零写）----
    h('div', { className: 'nv-progress__section', 'data-novel-import-export-import': '' },
      h('h4', { className: 'nv-progress__section-title' }, '通用导入预览（I37 管线，零写）'),
      h('p', { className: 'nv-settings__hint', 'data-novel-ie-import-desc': '' },
        '选择或粘贴 txt/md 文本，预览整理后的内容与分块结果；本面板不会直接改动作品。' +
        '（docx 导入请使用「六层初始化」入口。）'),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '源文本格式'),
        h('select', { className: 'nv-field__input', 'data-novel-ie-import-format': '', value: state.importFormat, disabled: busy, onChange: (event: { target: { value: string } }) => ops.setImportFormat(event.target.value as 'txt' | 'md') },
          h('option', { value: 'txt' }, 'TXT'),
          h('option', { value: 'md' }, 'Markdown')),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '选择文本文件'),
        h('input', { type: 'file', accept: '.txt,.md', className: 'nv-upload__input', 'data-novel-ie-import-file': '', disabled: busy, onChange: (event: { target: { files: FileList | null } }) => {
          const file = event.target.files?.[0];
          if (file) ops.pickImportFile(file);
        } }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '或直接粘贴文本'),
        h('textarea', { className: 'nv-field__input', 'data-novel-ie-import-text': '', rows: 5, value: state.importText, onChange: (event: { target: { value: string } }) => ops.setImportText(event.target.value), placeholder: '粘贴章节草稿或设定文本…' }),
      ),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-ie-import-preview': '', disabled: !available || busy || state.importText.trim() === '', onClick: () => ops.previewImport() }, state.busy.preview === true ? '处理中…' : '预览导入分块'),
      ),
      state.preview === undefined ? null
        : h('div', { className: 'nv-import-export__preview', 'data-novel-ie-preview': '' },
          h('p', { 'data-novel-ie-preview-text': '' },
            `「${state.preview.fileName}」（${state.preview.format}）归一化后 ${state.preview.text.length} 字符，确定性分为 ${state.preview.chunks.length} 块（零写）。`),
          h('ul', { className: 'nv-import-export__chunks', 'data-novel-ie-preview-chunks': '' },
            state.preview.chunks.slice(0, 5).map((chunk) =>
              h('li', { key: chunk.index, 'data-novel-ie-preview-chunk': chunk.index },
                `#${chunk.index}（${chunk.text.length} 字）：${chunk.text.slice(0, 60)}${chunk.text.length > 60 ? '…' : ''}`))),
          state.preview.chunks.length > 5 ? h('p', { className: 'nv-settings__hint' }, `…其余 ${state.preview.chunks.length - 5} 块略。`) : null,
        ),
    ),

    state.message === undefined ? null
      : h('p', { className: 'nv-settings__ok', 'data-novel-ie-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    state.error ? h('p', { className: 'nv-settings__error', 'data-novel-ie-error': '', role: 'alert', 'aria-live': 'assertive' }, toUserMessage(state.error)) : null,
  );
}
