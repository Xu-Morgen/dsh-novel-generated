import type { ImportExportNamespace } from './shared.js';
import type { ImportInterpretationParagraph } from './import-interpretation-review.js';
import { paragraphsFromHostChunks } from './import-interpretation-review.js';
import { toUserMessage } from './presentation.js';
import { unwrap, type El } from './shared.js';
import type { WorkbenchActions, WorkbenchState } from './store/types.js';

export type SourceImportFormat = 'txt' | 'md';

export interface SourceImportState {
  readonly text: string;
  readonly format: SourceImportFormat;
  readonly status: 'idle' | 'normalizing' | 'error';
  readonly error?: string;
}

export interface SourceImportGate {
  readonly status: 'checking' | 'ready' | 'blocked';
  readonly message: string;
}

/**
 * I159 source-entry gate. The Client only projects the Host-loaded canonical
 * layers; an incomplete/error projection fails closed and never starts upload
 * or normalization. The initial C2 snapshot and an empty B5 document are the
 * only initialized values that still count as an empty work.
 */
export function sourceImportGate(state: Pick<WorkbenchState, 'characters' | 'worldview' | 'outline' | 'relationship' | 'state' | 'canon' | 'chapters'>): SourceImportGate {
  const { characters, worldview, outline, relationship, state: worldState, canon } = state;
  const statuses = [characters.status, worldview.status, outline.status, relationship.status, worldState.status, canon.status, state.chapters.status];
  if (statuses.some((status) => status === 'loading')) {
    return { status: 'checking', message: '正在确认作品是否为空，请稍候。' };
  }
  if (statuses.some((status) => status === 'error')) {
    return { status: 'blocked', message: '无法确认作品是否为空。请返回作品列表，新建独立作品后再导入。' };
  }
  const initialStateOnly = worldState.snapshots.length === 0 || (worldState.snapshots.length === 1
    && worldState.snapshots[0]?.id === 'initial-state'
    && worldState.snapshots[0]?.storyTime === ''
    && Array.isArray(worldState.snapshots[0]?.characters)
    && worldState.snapshots[0].characters.length === 0);
  const empty = characters.list.length === 0
    && worldview.list.length === 0
    && (outline.outline?.acts.length ?? 0) === 0
    && relationship.list.length === 0
    && initialStateOnly
    && canon.events.length === 0
    && state.chapters.list.length === 0;
  return empty
    ? { status: 'ready', message: '可导入 DOCX，或粘贴 TXT/Markdown 文本。两种输入都会先进入来源语义审阅。' }
    : { status: 'blocked', message: '当前作品已有内容，不能合并导入。请返回作品列表，新建独立作品后再导入。' };
}

export interface SourceImportControllerDeps {
  normalizer(): ImportExportNamespace | undefined;
  currentProjectId(): string | undefined;
  isActive(): boolean;
  beginOp(key: string): boolean;
  endOp(key: string): void;
  dispatch(fn: (actions: WorkbenchActions) => void): void;
  startSourceReview(source: { sourceHash: string; text: string; paragraphs: readonly ImportInterpretationParagraph[] }): void;
}

export interface SourceImportController {
  normalizeText(input: { text: string; format: SourceImportFormat }, gate: SourceImportGate): void;
}

/**
 * Single composition port for pasted/file text. Host `importPreview` owns text
 * normalization, source ranges and sourceHash; the Client only projects those
 * returned chunks into the existing source-semantic review (design §14.26).
 */
export function createSourceImportController(deps: SourceImportControllerDeps): SourceImportController {
  const normalizeText = (input: { text: string; format: SourceImportFormat }, gate: SourceImportGate): void => {
    const target = deps.normalizer();
    const projectId = deps.currentProjectId();
    if (!deps.isActive() || projectId === undefined) return;
    if (gate.status !== 'ready') {
      deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: gate.message }));
      return;
    }
    if (target === undefined || input.text.trim() === '') {
      deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: input.text.trim() === '' ? '请先粘贴要导入的文本。' : '来源文本规范化服务不可用。' }));
      return;
    }
    if (!deps.beginOp('source-import:normalize')) return;
    deps.dispatch((actions) => actions.sourceImportPatch({ status: 'normalizing', error: undefined }));
    void unwrap(target.normalizeSource(projectId, { fileName: `pasted.${input.format}`, format: input.format, text: input.text })).then((raw) => {
      deps.endOp('source-import:normalize');
      if (!deps.isActive()) return;
      const result = raw as { sourceHash: string; text: string; chunks: readonly unknown[] };
      let paragraphs: ImportInterpretationParagraph[];
      try { paragraphs = paragraphsFromHostChunks(result.chunks); }
      catch {
        deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: '系统未返回可审阅的文本范围，请重新导入。' }));
        return;
      }
      deps.dispatch((actions) => actions.sourceImportPatch({ status: 'idle', error: undefined }));
      deps.startSourceReview({ sourceHash: result.sourceHash, text: result.text, paragraphs });
    }, (cause: Error) => {
      deps.endOp('source-import:normalize');
      if (deps.isActive()) deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: toUserMessage(cause, '来源文本处理失败，请重试。') }));
    });
  };
  return Object.freeze({ normalizeText });
}

export interface SourceImportPresenterProps {
  readonly state: SourceImportState;
  readonly gate: SourceImportGate;
  readonly uploadLabel: string;
  readonly uploadBusy: boolean;
  readonly setText: (value: string) => void;
  readonly setFormat: (value: SourceImportFormat) => void;
  readonly submitText: () => void;
  readonly uploadFile: (file: File) => void;
}

/** Pure author-facing entry shared by workflow import and legacy route. */
export function sourceImportPresenter(h: El, props: SourceImportPresenterProps): unknown {
  const blocked = props.gate.status !== 'ready';
  return h('section', { className: 'nv-onboarding-entry', 'data-novel-source-import-entry': '', 'data-novel-source-import-gate': props.gate.status },
    h('h3', { className: 'nv-editor__title' }, '导入来源'),
    h('p', { className: 'nv-settings__hint', role: props.gate.status === 'blocked' ? 'alert' : 'status', 'data-novel-source-import-guidance': '' }, props.gate.message),
    h('label', { className: 'nv-upload', 'data-novel-source-import-docx': '' },
      h('span', { className: 'nv-upload__label', role: 'status', 'aria-live': 'polite' }, props.uploadLabel),
      h('input', { type: 'file', accept: '.docx', disabled: blocked || props.uploadBusy, 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) props.uploadFile(file); } }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '文本格式'),
      h('select', { className: 'nv-field__input', value: props.state.format, disabled: blocked || props.state.status === 'normalizing', 'data-novel-source-import-format': '', onChange: (event: { target: { value: string } }) => props.setFormat(event.target.value as SourceImportFormat) },
        h('option', { value: 'txt' }, 'TXT'), h('option', { value: 'md' }, 'Markdown')),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '来源文本'),
      h('textarea', { className: 'nv-field__input', rows: 6, value: props.state.text, disabled: blocked || props.state.status === 'normalizing', placeholder: '粘贴故事想法、背景资料、梗概或已有正文…', 'data-novel-source-import-text': '', onChange: (event: { target: { value: string } }) => props.setText(event.target.value) }),
    ),
    h('button', { type: 'button', className: 'nv-btn nv-btn--primary', disabled: blocked || props.state.status === 'normalizing' || props.state.text.trim() === '', 'data-novel-source-import-submit': '', onClick: props.submitText }, props.state.status === 'normalizing' ? '正在整理来源…' : '进入来源语义审阅'),
    props.state.error ? h('p', { className: 'nv-settings__error', role: 'alert', 'data-novel-source-import-error': '' }, props.state.error) : null,
  );
}
