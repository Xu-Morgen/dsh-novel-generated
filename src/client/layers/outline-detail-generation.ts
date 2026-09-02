import type { OutlineDetailGenerationNamespace } from '../shared.js';
import type { El } from '../shared.js';
import type {
  OutlineDetailGenerationCandidate,
  OutlineDetailGenerationChoice,
} from '../../core/schema/outline-detail-generation.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import { entitySelect, type EntityOption } from '../entity-selectors.js';

/** I134 transient candidate-review state; it is never narrative-layer truth. */
export interface OutlineDetailGenerationLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'acting' | 'error';
  readonly scopeKind: 'act' | 'outline-beat' | 'bound-chapter' | 'all';
  readonly scopeId: string;
  readonly guidance: string;
  readonly candidateMode?: 'fill-missing' | 'append';
  readonly candidate?: OutlineDetailGenerationCandidate;
  readonly proposalId?: string;
  readonly message?: string;
}

export interface OutlineDetailGenerationEditOps {
  setScopeKind(value: OutlineDetailGenerationLayerState['scopeKind']): void;
  setScopeId(value: string): void;
  setGuidance(value: string): void;
  generate(): void;
  append(): void;
  edit(detailBeatId: string, value: DetailBeat): void;
  regenerate(detailBeatId: string): void;
  skip(detailBeatId: string): void;
  select(detailBeatId: string, keep: boolean): void;
  propose(): void;
  accept(): void;
  reject(): void;
  cancel(): void;
}

export interface OutlineDetailGenerationView {
  readonly namespace: OutlineDetailGenerationNamespace | undefined;
  readonly state: OutlineDetailGenerationLayerState;
  readonly ops: OutlineDetailGenerationEditOps;
  readonly outlineDirty?: boolean;
  readonly selectedAct?: { readonly id: string; readonly label: string };
  readonly selectedBeat?: { readonly id: string; readonly label: string };
  readonly selectedChapter?: { readonly id: string; readonly label: string };
  readonly characterOptions?: readonly EntityOption[];
}

export const OUTLINE_GENERATION_SCOPE_LABELS: Record<OutlineDetailGenerationLayerState['scopeKind'], string> = {
  act: '当前幕',
  'outline-beat': '当前节',
  'bound-chapter': '绑定章节',
  all: '整份大纲',
};

const CHOICE_LABELS: Record<OutlineDetailGenerationChoice, string> = {
  keep: '保留', edit: '已编辑并保留', regenerate: '重新生成并保留', skip: '不保留',
};

function field(h: El, label: string, value: string | number, onChange: (value: string) => void, type = 'text'): unknown {
  return h('label', { className: 'nv-field nv-outline-detail-generation__field' },
    h('span', { className: 'nv-field__label' }, label),
    h('input', { className: 'nv-field__input', type, value: String(value), onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

function candidateItem(h: El, item: OutlineDetailGenerationCandidate['items'][number], ops: OutlineDetailGenerationEditOps, acting: boolean, appendMode: boolean, characterOptions: readonly EntityOption[]): unknown {
  const value = item.after;
  const update = (patch: Partial<DetailBeat>): void => ops.edit(item.detailBeatId, { ...value, ...patch });
  return h('article', { key: item.detailBeatId, className: `nv-outline-detail-generation__item${item.choice === 'skip' ? ' is-skipped' : ''}`, 'data-novel-outline-detail-item': item.detailBeatId },
    h('div', { className: 'nv-outline-detail-generation__item-header' },
      h('strong', null, `${item.position + 1}. ${value.title}`),
      h('span', { className: 'nv-panel__hint' }, item.origin === 'generated' ? (appendMode ? '追加候选' : '补缺候选') : '已有卡片'),
    ),
    h('div', { className: 'nv-form' },
      field(h, '标题', value.title, (next) => update({ title: next })),
      field(h, '摘要', value.summary, (next) => update({ summary: next })),
      entitySelect(h, '视角角色', value.pov, characterOptions, (next) => update({ pov: next }), 'outline-detail-candidate-pov'),
      field(h, '目标字数', value.wordTarget, (next) => update({ wordTarget: Number(next) }), 'number'),
      h('label', { className: 'nv-field nv-outline-detail-generation__field' },
        h('span', { className: 'nv-field__label' }, '要点（每行一项）'),
        h('textarea', { className: 'nv-field__input', rows: 3, value: value.points.join('\n'), onChange: (event: { target: { value: string } }) => update({ points: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) }) }),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-detail-regenerate': item.detailBeatId, disabled: acting || item.origin === 'generated', onClick: () => ops.regenerate(item.detailBeatId) }, '重新生成'),
      item.origin === 'generated'
        ? h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-detail-keep': item.detailBeatId, 'aria-pressed': item.choice !== 'skip', disabled: acting, onClick: () => ops.select(item.detailBeatId, item.choice === 'skip') }, item.choice === 'skip' ? '保留到当前节' : '不保留')
        : h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-detail-skip': item.detailBeatId, disabled: acting, onClick: () => ops.skip(item.detailBeatId) }, '跳过此卡'),
    ),
    h('small', { className: 'nv-panel__hint' }, `选择：${CHOICE_LABELS[item.choice]}`),
  );
}

/**
 * Author review surface for I134. It deliberately renders candidate values,
 * not the B5 editor draft; only the explicit Apply action reaches I11.
 */
export function outlineDetailGenerationPanel(h: El, view: OutlineDetailGenerationView): unknown {
  const { namespace, state, ops } = view;
  if (namespace === undefined) {
    return h('section', { className: 'nv-panel', 'data-novel-outline-detail-generation-panel': '', 'data-novel-outline-detail-generation-state': 'error', role: 'alert' }, '细纲生成服务暂时不可用，请稍后重试。');
  }
  const candidate = state.candidate;
  const acting = state.status === 'loading' || state.status === 'acting';
  const selectedScope = state.scopeKind === 'act' ? view.selectedAct : state.scopeKind === 'outline-beat' ? view.selectedBeat : state.scopeKind === 'bound-chapter' ? view.selectedChapter : { id: 'all', label: '整份大纲' };
  const fillDisabled = acting || view.outlineDirty || selectedScope === undefined;
  const appendDisabled = acting || view.outlineDirty || view.selectedBeat === undefined || state.guidance.trim() === '';
  const appendMode = state.candidateMode === 'append';
  return h('section', { className: 'nv-panel nv-outline-detail-generation', 'data-novel-outline-detail-generation-panel': '', 'data-novel-outline-detail-generation-state': state.status },
    h('div', { className: 'nv-panel__header' },
      h('div', null,
        h('h2', { className: 'nv-panel__title' }, '范围细纲候选'),
        h('p', { className: 'nv-panel__hint' }, '可补齐所选范围的缺失卡，也可按本次要求为当前已保存节追加新卡；确认前不会改写大纲。'),
      ),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-detail-generate': '', disabled: fillDisabled, onClick: ops.generate }, acting ? '处理中…' : '补齐范围缺失卡'),
    ),
    h('div', { className: 'nv-outline-detail-generation__scope', 'data-novel-outline-detail-scope': '' },
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '生成范围'), h('select', { className: 'nv-field__input', value: state.scopeKind, onChange: (event: { target: { value: string } }) => ops.setScopeKind(event.target.value as OutlineDetailGenerationLayerState['scopeKind']) }, Object.entries(OUTLINE_GENERATION_SCOPE_LABELS).map(([kind, label]) => h('option', { key: kind, value: kind }, label)))),
      h('p', { className: 'nv-panel__hint', 'data-novel-outline-detail-selected-scope': selectedScope?.id ?? '' }, selectedScope === undefined ? `请先选择${OUTLINE_GENERATION_SCOPE_LABELS[state.scopeKind]}。` : `将使用：${selectedScope.label}`),
    ),
    h('div', { className: 'nv-form nv-outline-detail-generation__append', 'data-novel-outline-detail-append': '' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '本次生成要求'),
        h('textarea', { className: 'nv-field__input', rows: 3, maxLength: 2000, value: state.guidance, placeholder: '例如：增加一张主角发现线索的调查场景，但暂不揭示幕后真相。', onChange: (event: { target: { value: string } }) => ops.setGuidance(event.target.value) }),
      ),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-detail-append-generate': view.selectedBeat?.id ?? '', disabled: appendDisabled, onClick: ops.append }, acting ? '处理中…' : '为当前节生成新候选'),
      h('p', { className: 'nv-panel__hint' }, view.selectedBeat === undefined ? '请先在上方大纲中选择一节。' : `追加目标：${view.selectedBeat.label}`),
    ),
    view.outlineDirty ? h('p', { className: 'nv-editor__error', role: 'alert', 'data-novel-outline-detail-dirty': '' }, '大纲有未保存修改，请先保存大纲再生成。') : null,
    state.message === undefined ? null : h('p', { className: state.status === 'error' ? 'nv-editor__error' : 'nv-panel__hint', role: state.status === 'error' ? 'alert' : 'status', 'data-novel-outline-detail-generation-message': '' }, state.message),
    candidate === undefined ? h('p', { className: 'nv-outline__nodetail', 'data-novel-outline-detail-generation-empty': '' }, '选择范围并生成候选后，在这里逐卡审阅。') : h('div', { className: 'nv-outline-detail-generation__candidate', 'data-novel-outline-detail-candidate': candidate.candidateId },
      h('p', { className: 'nv-panel__hint' }, `范围内 ${candidate.items.length} 张卡，其中 ${candidate.generatedDetailBeatCount} 张为补缺候选。${candidate.rationale}`),
      candidate.items.map((item) => candidateItem(h, item, ops, acting, appendMode, view.characterOptions ?? [])),
      h('div', { className: 'nv-editor__actions nv-outline-detail-generation__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-detail-propose': candidate.candidateId, disabled: acting, onClick: ops.propose }, '提交确认'),
        h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-detail-cancel': candidate.candidateId, disabled: acting, onClick: ops.cancel }, '取消候选'),
      ),
      state.proposalId === undefined ? null : h('div', { className: 'nv-outline-detail-generation__gate', 'data-novel-outline-detail-proposal': state.proposalId },
        h('p', { className: 'nv-panel__hint' }, '候选已进入确认门；确认后才会应用授权范围。'),
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-detail-accept': state.proposalId, disabled: acting, onClick: ops.accept }, '确认并应用'),
        h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-detail-reject': state.proposalId, disabled: acting, onClick: ops.reject }, '拒绝候选'),
      ),
    ),
  );
}
