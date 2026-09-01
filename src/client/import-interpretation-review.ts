import type { El } from './shared.js';
import { unwrap } from './shared.js';
import { toUserMessage } from './presentation.js';
import type {
  ImportInterpretationNamespace,
  ImportInterpretationAnalysisNamespace,
} from './remote-namespace.js';
import type {
  ImportInterpretationParagraph,
  SourceInterpretationOutput,
  SourceInterpretationParagraph,
  SourceParagraphRole,
} from '../core/schema/import-interpretation-analysis.js';
import type {
  ImportSourceRole,
  ImportTreatment,
  NarrativeIntent,
  NarrativePov,
  RevealPacing,
} from '../core/schema/import-interpretation.js';
import type { WorkbenchActions } from './store/types.js';

export type { ImportInterpretationParagraph, SourceParagraphRole } from '../core/schema/import-interpretation-analysis.js';

/**
 * I144 Client projection of the source-review workflow (design §14.15.2).
 *
 * This is deliberately interaction state, not a second domain schema: Host
 * remains the authority for strict parsing, entity resolution and persistence.
 * `paragraphs` carry ranges already projected by Host; the Client never reads
 * a file or invents an offset. `selectedSourceRole` is separate from the model
 * suggestion so low confidence can never silently become author intent.
 */
export interface ImportInterpretationReviewState {
  readonly projectId: string;
  readonly importSessionId?: string;
  readonly sourceHash: string;
  readonly sourceText?: string;
  readonly analysisStatus: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly analysis?: SourceInterpretationOutput;
  readonly selectedSourceRole?: ImportSourceRole;
  readonly treatment?: ImportTreatment;
  readonly narrativeIntent?: NarrativeIntent;
  readonly paragraphs: readonly ImportReviewParagraph[];
  readonly confirmed: boolean;
  readonly busy: boolean;
  readonly error?: string;
}

export interface ImportReviewParagraph extends ImportInterpretationParagraph {
  readonly suggestedRole?: SourceParagraphRole;
  readonly confidence?: 'low' | 'medium' | 'high';
  readonly evidence?: string;
  readonly selectedRole?: SourceParagraphRole;
  readonly decision: 'pending' | 'accepted' | 'rejected' | 'edited';
}

export interface ImportInterpretationReviewOps {
  begin(source: { sourceHash: string; text: string; paragraphs: readonly ImportInterpretationParagraph[] }): void;
  cancel(): void;
  confirm(): void;
  setSourceRole(role: ImportSourceRole | undefined): void;
  setTreatment(treatment: ImportTreatment | undefined): void;
  setNarrativeIntent(intent: NarrativeIntent | undefined): void;
  setParagraphRole(paragraphId: string, role: SourceParagraphRole): void;
  setParagraphDecision(paragraphId: string, decision: ImportReviewParagraph['decision']): void;
}

const SOURCE_ROLE_LABELS: Readonly<Record<ImportSourceRole, string>> = Object.freeze({
  idea: '创作想法',
  synopsis: '故事梗概 / 预定剧情',
  'background-material': '背景设定 / 幕后资料',
  'existing-prose': '已有正文',
  hybrid: '混合文档',
});

const TREATMENT_LABELS: Readonly<Record<ImportTreatment, string>> = Object.freeze({
  'expand-outline': '扩展为大纲',
  'adapt-pov': '按视角重构读者体验',
});

const PARAGRAPH_ROLE_LABELS: Readonly<Record<SourceParagraphRole, string>> = Object.freeze({
  'world-truth': '世界真相 / 设定事实',
  'plot-plan': '剧情计划',
  prose: '叙事正文',
  'author-instruction': '作者指令',
  'presentation-note': '呈现提示',
});

const POV_LABELS: Readonly<Record<NarrativePov, string>> = Object.freeze({ limited: '限知视角', omniscient: '全知视角' });
const PACING_LABELS: Readonly<Record<RevealPacing, string>> = Object.freeze({ slow: '慢速揭示', balanced: '均衡揭示', fast: '快速揭示' });

/** The five source roles are a UI projection of the canonical I141 enum. */
export const IMPORT_SOURCE_ROLE_OPTIONS = Object.freeze(Object.entries(SOURCE_ROLE_LABELS) as Array<[ImportSourceRole, string]>);
/** Stage 19 intentionally exposes only these two treatments. */
export const IMPORT_TREATMENT_OPTIONS = Object.freeze(Object.entries(TREATMENT_LABELS) as Array<[ImportTreatment, string]>);
export const IMPORT_PARAGRAPH_ROLE_OPTIONS = Object.freeze(Object.entries(PARAGRAPH_ROLE_LABELS) as Array<[SourceParagraphRole, string]>);

/**
 * Convert the Host import preview chunks into the I143 paragraph projection.
 * The only normalization here is assigning a stable display id; text and
 * offsets remain the values returned by Host, as required by R19-2.
 */
export function paragraphsFromHostChunks(chunks: readonly unknown[]): ImportInterpretationParagraph[] {
  return chunks.map((raw, index) => {
    const chunk = raw as { text?: unknown; startOffset?: unknown; endOffset?: unknown };
    if (typeof chunk.text !== 'string' || typeof chunk.startOffset !== 'number' || typeof chunk.endOffset !== 'number') {
      throw new Error('来源段落范围不可用，请重新读取文件');
    }
    return {
      paragraphId: `paragraph-${String(index + 1).padStart(4, '0')}`,
      index,
      text: chunk.text,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
    };
  });
}

/** Start state for an author review; no model suggestion is treated as confirmed. */
export function freshImportInterpretationReview(projectId: string, sourceHash: string, sourceText?: string, paragraphs: readonly ImportInterpretationParagraph[] = []): ImportInterpretationReviewState {
  return {
    projectId,
    sourceHash,
    ...(sourceText === undefined ? {} : { sourceText }),
    analysisStatus: 'idle',
    paragraphs: paragraphs.map((paragraph) => ({ ...paragraph, decision: 'pending' })),
    confirmed: false,
    busy: false,
  };
}

function withAnalysis(state: ImportInterpretationReviewState, output: SourceInterpretationOutput): ImportInterpretationReviewState {
  const byId = new Map(output.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph]));
  return {
    ...state,
    analysisStatus: 'succeeded',
    analysis: output,
    paragraphs: state.paragraphs.map((paragraph) => {
      const suggestion = byId.get(paragraph.paragraphId);
      return suggestion === undefined ? paragraph : {
        ...paragraph,
        suggestedRole: suggestion.role,
        confidence: suggestion.confidence,
        evidence: suggestion.evidence,
      };
    }),
    busy: false,
    error: undefined,
  };
}

/** Build the review projection once a strict I143 result has crossed the Remote seam. */
export function importInterpretationReviewFromAnalysis(
  state: ImportInterpretationReviewState,
  output: SourceInterpretationOutput,
): ImportInterpretationReviewState {
  return withAnalysis(state, output);
}

/**
 * Client-side early gate. It intentionally checks only author interaction
 * completeness; Host repeats the full I141/I142 validation and entity lookup.
 */
export function importIntentValidationMessage(state: ImportInterpretationReviewState): string | undefined {
  if (state.projectId.trim() === '' || state.sourceHash.trim() === '') return '来源身份不可用，请重新读取文件。';
  if (state.selectedSourceRole === undefined) return '请确认来源角色。';
  if (state.treatment === undefined) return '请选择当前处理目标。';
  if (state.selectedSourceRole === 'existing-prose' && state.treatment === 'adapt-pov') return '已有正文在当前阶段只能扩展为大纲；正文保真导入尚未开放。';
  if ((state.selectedSourceRole === 'idea' || state.selectedSourceRole === 'synopsis') && state.treatment === 'adapt-pov') return '按视角重构目前只适用于背景素材或混合来源，请改选扩展为大纲。';
  const intent = state.narrativeIntent;
  if (state.treatment === 'adapt-pov') {
    if (intent === undefined) return '按视角重构需要补充叙事意图。';
    if (intent.pov === 'limited' && intent.protagonistId === undefined && intent.protagonistCandidateId === undefined) return '限知视角需要指定主角或待创建主角。';
    if (intent.protagonistId !== undefined && intent.protagonistCandidateId !== undefined) return '主角只能选择已有角色或待创建候选之一。';
    if (new Set(intent.initialKnown).size !== intent.initialKnown.length) return '初始已知信息不能重复。';
  } else if (intent !== undefined) {
    return '扩展为大纲不应携带视角意图。';
  }
  const unresolved = state.paragraphs.some((paragraph) => paragraph.decision === 'pending');
  if (unresolved) return '请先处理所有来源段落。';
  if (state.confirmed) return undefined;
  return undefined;
}

export function canConfirmImportIntent(state: ImportInterpretationReviewState): boolean {
  return state.busy === false && state.confirmed === false && state.analysisStatus !== 'queued' && state.analysisStatus !== 'running'
    && importIntentValidationMessage(state) === undefined;
}

function optionNodes(h: El, options: ReadonlyArray<readonly [string, string]>, selected: string | undefined): unknown[] {
  return [h('option', { value: '', disabled: true }, '请选择')]
    .concat(options.map(([value, label]) => h('option', { value, selected: selected === value }, label)));
}

function selectField(h: El, label: string, value: string | undefined, options: ReadonlyArray<readonly [string, string]>, onChange: (value: string) => void, props: Record<string, unknown> = {}): unknown {
  return h('label', { className: 'nv-field nv-import-review__field' },
    h('span', { className: 'nv-field__label' }, label),
    h('select', { className: 'nv-field__input', value: value ?? '', 'aria-label': label, onChange: (event: { target: { value: string } }) => onChange(event.target.value), ...props }, optionNodes(h, options, value)),
  );
}

function intentFields(h: El, state: ImportInterpretationReviewState, ops: ImportInterpretationReviewOps): unknown {
  if (state.treatment !== 'adapt-pov') return null;
  const intent = state.narrativeIntent;
  const current = intent ?? { pov: 'omniscient' as const, initialKnown: [], revealPacing: 'balanced' as const };
  return h('fieldset', { className: 'nv-import-review__intent', 'data-novel-import-interpretation-intent': '' },
    h('legend', null, '叙事意图'),
    selectField(h, '适用视角', current.pov, Object.entries(POV_LABELS) as Array<[NarrativePov, string]>, (value) => ops.setNarrativeIntent({ ...current, pov: value as NarrativePov })),
    current.pov === 'limited' ? h('div', { className: 'nv-import-review__protagonist', 'data-novel-import-interpretation-protagonist': '' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '已有主角 ID（可选）'),
        h('input', { className: 'nv-field__input', value: current.protagonistId ?? '', 'aria-label': '已有主角 ID', onChange: (event: { target: { value: string } }) => ops.setNarrativeIntent({ ...current, protagonistId: event.target.value.trim() || undefined, protagonistCandidateId: undefined }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '待创建主角候选 ID（可选）'),
        h('input', { className: 'nv-field__input', value: current.protagonistCandidateId ?? '', 'aria-label': '待创建主角候选 ID', onChange: (event: { target: { value: string } }) => ops.setNarrativeIntent({ ...current, protagonistCandidateId: event.target.value.trim() || undefined, protagonistId: undefined }) }),
      ),
    ) : null,
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '初始已知信息 ID（每行一个，可选）'),
      h('textarea', { className: 'nv-field__input', rows: 3, value: current.initialKnown.join('\n'), 'aria-label': '初始已知信息', onChange: (event: { target: { value: string } }) => ops.setNarrativeIntent({ ...current, initialKnown: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) }) }),
    ),
    selectField(h, '揭示节奏', current.revealPacing, Object.entries(PACING_LABELS) as Array<[RevealPacing, string]>, (value) => ops.setNarrativeIntent({ ...current, revealPacing: value as RevealPacing })),
  );
}

function evidencePanel(h: El, state: ImportInterpretationReviewState): unknown {
  const evidenceIds = state.analysis?.evidenceParagraphIds ?? [];
  if (evidenceIds.length === 0) return null;
  const byId = new Map(state.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph]));
  return h('section', { className: 'nv-import-review__evidence', 'data-novel-import-interpretation-evidence': '' },
    h('h4', null, '系统依据'),
    h('ul', null, evidenceIds.map((id) => h('li', { key: id, 'data-novel-import-interpretation-evidence-item': id }, byId.get(id)?.text ?? '来源段落已变化'))),
  );
}

function paragraphPanel(h: El, state: ImportInterpretationReviewState, ops: ImportInterpretationReviewOps): unknown {
  if (state.paragraphs.length === 0) return null;
  return h('section', { className: 'nv-import-review__paragraphs', 'data-novel-import-interpretation-paragraphs': '' },
    h('h4', null, '逐段来源审阅'),
    state.paragraphs.map((paragraph) => h('article', { key: paragraph.paragraphId, className: 'nv-import-review__paragraph', 'data-novel-import-interpretation-paragraph': paragraph.paragraphId },
      h('p', { className: 'nv-import-review__paragraph-text' }, paragraph.text),
      paragraph.suggestedRole === undefined ? null : h('p', { className: 'nv-import-review__suggestion', 'data-novel-import-interpretation-suggestion': paragraph.paragraphId }, `建议：${PARAGRAPH_ROLE_LABELS[paragraph.suggestedRole]}（${paragraph.confidence ?? '未标注'}）`),
      paragraph.evidence === undefined ? null : h('p', { className: 'nv-import-review__evidence-text' }, `依据：${paragraph.evidence}`),
      selectField(h, '段落来源类型', paragraph.selectedRole ?? paragraph.suggestedRole, IMPORT_PARAGRAPH_ROLE_OPTIONS, (value) => ops.setParagraphRole(paragraph.paragraphId, value as SourceParagraphRole), { 'data-novel-import-interpretation-paragraph-role': paragraph.paragraphId }),
      selectField(h, '段落处理', paragraph.decision, [['pending', '待处理'], ['accepted', '保留此分类'], ['edited', '修改后保留'], ['rejected', '排除本段']] as const, (value) => ops.setParagraphDecision(paragraph.paragraphId, value as ImportReviewParagraph['decision']), { 'data-novel-import-interpretation-paragraph-decision': paragraph.paragraphId }),
      h('button', { type: 'button', className: 'nv-btn nv-btn--small', 'data-novel-import-interpretation-merge': paragraph.paragraphId, onClick: () => ops.setParagraphDecision(paragraph.paragraphId, 'accepted') }, '合并此分类'),
    )),
  );
}

/**
 * Pure renderer for the I144 source review. Rendering never invokes a Remote;
 * every side effect is an explicit callback owned by the Client controller.
 */
export function sourceInterpretationReview(h: El, state: ImportInterpretationReviewState, ops: ImportInterpretationReviewOps): unknown {
  const validation = importIntentValidationMessage(state);
  const suggested = state.analysis?.sourceRole;
  const lowConfidence = state.analysis?.confidence === 'low';
  const treatmentOptions = state.selectedSourceRole === 'existing-prose'
    ? ([['expand-outline', TREATMENT_LABELS['expand-outline']]] as const)
    : IMPORT_TREATMENT_OPTIONS;
  return h('section', { className: 'nv-import-review', 'data-novel-import-interpretation-review': '', 'data-novel-import-interpretation-status': state.analysisStatus, 'data-novel-narrow-review': '' },
    h('div', { className: 'nv-import-review__header' },
      h('h3', null, '确认导入来源'),
      h('p', { role: 'status', 'aria-live': 'polite', 'data-novel-import-interpretation-status-message': '' }, state.busy ? '正在解释来源…' : state.confirmed ? '来源意图已确认，可进入下一步。' : '系统建议仅供参考，必须由你确认。'),
    ),
    suggested === undefined ? null : h('p', { className: 'nv-import-review__suggestion', 'data-novel-import-interpretation-overall-suggestion': '' }, `整体建议：${SOURCE_ROLE_LABELS[suggested]}${lowConfidence ? '（置信度较低，请重点核对）' : ''}`),
    lowConfidence ? h('p', { className: 'nv-import-review__warning', role: 'alert', 'data-novel-import-interpretation-low-confidence': '' }, '当前来源判断置信度较低，不会自动进入下一步。') : null,
    selectField(h, '来源角色（必须确认）', state.selectedSourceRole, IMPORT_SOURCE_ROLE_OPTIONS, (value) => ops.setSourceRole(value as ImportSourceRole), { 'data-novel-import-interpretation-source-role': '' }),
    selectField(h, '当前处理目标（必须确认）', state.treatment, treatmentOptions, (value) => ops.setTreatment(value as ImportTreatment), { 'data-novel-import-interpretation-treatment': '' }),
    state.selectedSourceRole === 'existing-prose' ? h('p', { className: 'nv-import-review__warning', role: 'note', 'data-novel-import-interpretation-existing-prose': '' }, '当前阶段只支持扩展为大纲；正文保真导入尚未交付，将在 Stage 21 提供。') : null,
    intentFields(h, state, ops),
    evidencePanel(h, state),
    paragraphPanel(h, state, ops),
    validation === undefined ? null : h('p', { className: 'nv-import-review__validation', role: 'alert', 'data-novel-import-interpretation-validation': '' }, validation),
    state.error === undefined ? null : h('p', { className: 'nv-editor__error', role: 'alert', 'data-novel-import-interpretation-error': '' }, toUserMessage(state.error, '来源审阅未完成，请重试。')),
    h('div', { className: 'nv-import-review__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', disabled: !canConfirmImportIntent(state), 'data-novel-import-interpretation-confirm': '', onClick: () => ops.confirm() }, state.confirmed ? '已确认' : '确认来源并继续'),
      h('button', { type: 'button', className: 'nv-btn', disabled: state.busy, 'data-novel-import-interpretation-cancel': '', onClick: () => ops.cancel() }, '取消审阅'),
    ),
  );
}

export interface ImportInterpretationControllerDeps {
  analysis(): ImportInterpretationAnalysisNamespace | undefined;
  session(): ImportInterpretationNamespace | undefined;
  currentProjectId(): string | undefined;
  isActive(): boolean;
  beginOp(key: string): boolean;
  endOp(key: string): void;
  dispatch(fn: (actions: WorkbenchActions) => void): void;
  onConfirmed(): void;
}

export interface ImportInterpretationController {
  begin(source: { sourceHash: string; text: string; paragraphs: readonly ImportInterpretationParagraph[] }): void;
  cancel(): void;
  confirm(): void;
  setSourceRole(role: ImportSourceRole | undefined): void;
  setTreatment(treatment: ImportTreatment | undefined): void;
  setNarrativeIntent(intent: NarrativeIntent | undefined): void;
  setParagraphRole(paragraphId: string, role: SourceParagraphRole): void;
  setParagraphDecision(paragraphId: string, decision: ImportReviewParagraph['decision']): void;
  dispose(): void;
}

const IMPORT_ANALYSIS_POLL_MS = 800;

/**
 * I144 controller. The only timer is the analysis poll, owned here so Fiber
 * disposal can clear it. Session confirmation is explicit and idempotence is
 * delegated to the I142 Host owner; no B/C/C5 write is possible from this API.
 */
export function createImportInterpretationController(deps: ImportInterpretationControllerDeps): ImportInterpretationController {
  let current: ImportInterpretationReviewState | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const operationKey = 'import-interpretation:review';
  const clearPoll = (): void => { if (pollTimer !== undefined) { clearTimeout(pollTimer); pollTimer = undefined; } };
  const active = (): boolean => !disposed && deps.isActive();
  const write = (state: ImportInterpretationReviewState | undefined): void => {
    current = state;
    deps.dispatch((actions) => actions.importInterpretationReview(state));
  };
  const patch = (changes: Partial<ImportInterpretationReviewState>): void => {
    if (current === undefined) return;
    write({ ...current, ...changes });
  };
  const release = (): void => deps.endOp(operationKey);

  const finish = (changes: Partial<ImportInterpretationReviewState>): void => {
    clearPoll();
    if (active()) patch({ ...changes, busy: false });
    release();
  };

  const poll = (identity: { projectId: string; importSessionId: string; sourceHash: string }): void => {
    const target = deps.analysis();
    if (!active() || target === undefined) { clearPoll(); release(); return; }
    void unwrap(target.status(identity)).then((status) => {
      if (!active() || current?.importSessionId !== identity.importSessionId) return;
      if (status.status === 'succeeded') {
        void unwrap(target.result(identity)).then((result) => {
          if (!active() || current?.importSessionId !== identity.importSessionId) return;
          finish(withAnalysis(current, result.output));
        }, (error: Error) => finish({ analysisStatus: 'failed', error: toUserMessage(error, '来源解释未完成，请重试。') }));
        return;
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        finish({ analysisStatus: status.status, error: status.status === 'failed' ? '来源解释未完成，请重试。' : undefined });
        return;
      }
      if (active()) pollTimer = setTimeout(() => poll(identity), IMPORT_ANALYSIS_POLL_MS);
    }, (error: Error) => finish({ analysisStatus: 'failed', error: toUserMessage(error, '来源解释未完成，请重试。') }));
  };

  const begin = (source: { sourceHash: string; text: string; paragraphs: readonly ImportInterpretationParagraph[] }): void => {
    if (!active() || deps.currentProjectId() === undefined) return;
    const projectId = deps.currentProjectId() as string;
    if (source.paragraphs.length === 0) {
      write({ ...freshImportInterpretationReview(projectId, source.sourceHash, source.text), analysisStatus: 'failed', error: '来源段落范围不可用，请重新读取文件。' });
      return;
    }
    if (!deps.beginOp(operationKey)) return;
    clearPoll();
    const initial = freshImportInterpretationReview(projectId, source.sourceHash, source.text, source.paragraphs);
    write({ ...initial, analysisStatus: 'queued', busy: true });
    const session = deps.session();
    const analysis = deps.analysis();
    if (session === undefined || analysis === undefined) { finish({ analysisStatus: 'failed', error: '来源审阅服务暂时不可用。' }); return; }
    // I142 requires a valid intent even for a draft. This provisional value is
    // never treated as author confirmation and is replaced by the explicit form.
    void unwrap(session.create({
      projectId,
      sourceHash: source.sourceHash,
      intent: { sourceRole: 'idea', treatment: 'expand-outline' },
      paragraphDecisions: source.paragraphs.map((paragraph) => ({ paragraphId: paragraph.paragraphId, decision: 'pending' as const, summary: '待作者裁决' })),
    })).then((created) => {
      if (!active()) { release(); return; }
      const identity = { projectId, importSessionId: created.importSessionId, sourceHash: source.sourceHash };
      patch({ importSessionId: created.importSessionId, analysisStatus: 'running' });
      void unwrap(analysis.begin({ projectId, importSessionId: created.importSessionId, sourceHash: source.sourceHash, paragraphs: [...source.paragraphs] }, undefined)).then(() => poll(identity), (error: Error) => finish({ analysisStatus: 'failed', error: toUserMessage(error, '来源解释未完成，请重试。') }));
    }, (error: Error) => finish({ analysisStatus: 'failed', error: toUserMessage(error, '来源审阅会话未建立，请重试。') }));
  };

  const cancel = (): void => {
    const state = current;
    clearPoll();
    if (state === undefined) return;
    const target = deps.analysis();
    const session = deps.session();
    const identity = state.importSessionId === undefined ? undefined : { projectId: state.projectId, importSessionId: state.importSessionId, sourceHash: state.sourceHash };
    if (identity !== undefined && target !== undefined) void unwrap(target.cancel(identity)).catch(() => undefined);
    if (identity !== undefined && session !== undefined) void unwrap(session.discard(identity)).catch(() => undefined);
    if (active()) { patch({ analysisStatus: 'cancelled', busy: false, error: undefined }); release(); }
  };

  const confirm = (): void => {
    const state = current;
    const session = deps.session();
    if (!active() || state === undefined || session === undefined || state.importSessionId === undefined || !canConfirmImportIntent(state)) return;
    const message = importIntentValidationMessage(state);
    if (message !== undefined) { patch({ error: message }); return; }
    const intent = { sourceRole: state.selectedSourceRole as ImportSourceRole, treatment: state.treatment as ImportTreatment, ...(state.narrativeIntent === undefined ? {} : { narrativeIntent: state.narrativeIntent }) };
    const identity = { projectId: state.projectId, importSessionId: state.importSessionId, sourceHash: state.sourceHash };
    patch({ busy: true, error: undefined });
    void unwrap(session.confirm({ ...identity, intent, paragraphDecisions: state.paragraphs.map((paragraph) => ({ paragraphId: paragraph.paragraphId, decision: paragraph.decision, summary: paragraph.text.slice(0, 200) })) })).then(() => {
      if (!active()) return;
      patch({ confirmed: true, busy: false });
      deps.onConfirmed();
    }, (error: Error) => patch({ busy: false, error: toUserMessage(error, '来源意图未确认，请检查后重试。') }));
  };

  const setSourceRole = (role: ImportSourceRole | undefined): void => {
    if (role === 'existing-prose' && current?.treatment === 'adapt-pov') {
      patch({ selectedSourceRole: role, treatment: undefined, narrativeIntent: undefined, confirmed: false });
      return;
    }
    patch({ selectedSourceRole: role, confirmed: false });
  };
  const setTreatment = (treatment: ImportTreatment | undefined): void => {
    if (treatment === 'adapt-pov' && current?.selectedSourceRole === 'existing-prose') {
      patch({ treatment: undefined, narrativeIntent: undefined, confirmed: false, error: '已有正文在当前阶段只能扩展为大纲；正文保真导入尚未开放。' });
      return;
    }
    if (treatment === 'expand-outline') patch({ treatment, narrativeIntent: undefined, confirmed: false });
    else patch({ treatment, narrativeIntent: current?.narrativeIntent ?? { pov: 'omniscient', initialKnown: [], revealPacing: 'balanced' }, confirmed: false });
  };
  const setNarrativeIntent = (intent: NarrativeIntent | undefined): void => patch({ narrativeIntent: intent, confirmed: false });
  const setParagraphRole = (paragraphId: string, role: SourceParagraphRole): void => {
    if (current === undefined) return;
    write({ ...current, confirmed: false, paragraphs: current.paragraphs.map((paragraph) => paragraph.paragraphId === paragraphId ? { ...paragraph, selectedRole: role, decision: paragraph.decision === 'pending' ? 'edited' : paragraph.decision } : paragraph) });
  };
  const setParagraphDecision = (paragraphId: string, decision: ImportReviewParagraph['decision']): void => {
    if (current === undefined) return;
    write({ ...current, confirmed: false, paragraphs: current.paragraphs.map((paragraph) => paragraph.paragraphId === paragraphId ? { ...paragraph, decision } : paragraph) });
  };
  const dispose = (): void => { disposed = true; clearPoll(); current = undefined; };
  return Object.freeze({ begin, cancel, confirm, setSourceRole, setTreatment, setNarrativeIntent, setParagraphRole, setParagraphDecision, dispose });
}
