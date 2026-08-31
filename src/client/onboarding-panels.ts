import type { El } from './shared.js';
import { toUserMessage } from './presentation.js';
import {
  ONBOARDING_LAYERS,
  type OnboardingAdjudicationExtra,
  type OnboardingDecision,
  type OnboardingLayerId,
  type OnboardingNamespace,
  type OnboardingState,
} from './onboarding-types.js';

/**
 * I53 六层候选审阅与逐层裁决 Client 面板渲染（design §14.7.4 / R11-4，计划
 * §18 I95 拆分：onboarding 的 panels 片）。纯渲染：只消费 OnboardingState 与
 * 回调，无文件/领域副作用。
 */

/** Text projection of an unknown candidate value (strings / arrays of strings). */
function candidateText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(candidateText).filter((item) => item.length > 0).join('、');
  return '';
}

/** The few fields worth showing per layer while deciding (design §14.7.4). */
function layerCandidateFields(layer: OnboardingLayerId, candidate: unknown): Array<{ k: string; v: string }> {
  const c = (candidate ?? {}) as Record<string, unknown>;
  switch (layer) {
    case 'characters':
      return [
        { k: '姓名', v: candidateText(c.name) },
        { k: '类型', v: candidateText(c.kind) },
        { k: '性格', v: candidateText(c.personality) },
        { k: '背景', v: candidateText(c.background) },
        { k: '动机', v: candidateText(c.motivation) },
      ];
    case 'worldview':
      return [
        { k: '标题', v: candidateText(c.title) },
        { k: '类型', v: candidateText(c.kind) },
        { k: '内容', v: candidateText(c.content) },
        { k: '关键词', v: candidateText(c.keywords) },
      ];
    case 'outline':
      return [
        { k: '结构', v: candidateText(c.structure) },
        { k: '一句话梗概', v: candidateText(c.logline) },
        { k: '主题', v: candidateText(c.themes) },
        { k: '幕数', v: Array.isArray(c.acts) ? String(c.acts.length) : '' },
      ];
    case 'relationship':
      return [
        { k: '关系', v: `${candidateText(c.from)} → ${candidateText(c.to)}` },
        { k: '类型', v: candidateText(c.type) },
        { k: '状态', v: candidateText(c.status) },
      ];
    case 'state':
      return [
        { k: '时间', v: candidateText(c.storyTime) },
        { k: '地点', v: candidateText((c.scene as Record<string, unknown> | undefined)?.location) },
        { k: '在场角色', v: Array.isArray(c.characters)
          ? c.characters.map((ch) => candidateText((ch as Record<string, unknown>).characterId)).filter((item) => item).join('、')
          : '' },
      ];
    case 'canon':
      return [
        { k: '事件', v: candidateText(c.summary) },
        { k: '类型', v: candidateText(c.kind) },
        { k: '参与者', v: candidateText(c.participants) },
        { k: '地点', v: candidateText(c.location) },
      ];
  }
}

/** Render one layer's candidates as compact read-only cards so the user can see
 * what they are accepting / regenerating / skipping (design §14.7.4). */
function candidateCards(h: El, layer: OnboardingLayerId, state: OnboardingState): unknown {
  const layers = state.layers as Record<string, { candidates?: unknown[] }> | undefined;
  const candidates = layers?.[layer]?.candidates;
  if (!candidates || candidates.length === 0) {
    return h('p', { className: 'nv-onboarding__no-candidates', 'data-novel-onboarding-candidates': layer }, '（无候选）');
  }
  return h('div', { className: 'nv-onboarding__candidates', 'data-novel-onboarding-candidates': layer },
    candidates.map((candidate, index) => h('div', {
      key: `${layer}-${index}`,
      className: 'nv-onboarding__candidate',
      'data-novel-onboarding-candidate': layer,
    }, layerCandidateFields(layer, candidate).map((field) => h('p', {
      key: field.k,
      className: 'nv-onboarding__candidate-field',
      'data-novel-onboarding-field': layer,
    },
    h('span', { className: 'nv-onboarding__candidate-key' }, field.k),
    h('span', { className: 'nv-onboarding__candidate-value', 'data-novel-onboarding-value': layer }, field.v))))),
  );
}

/** Candidates of one layer from the raw package (plain JSON). */
function layerCandidates(state: OnboardingState, layer: OnboardingLayerId): unknown[] {
  const layers = state.layers as Record<string, { candidates?: unknown[] }> | undefined;
  return layers?.[layer]?.candidates ?? [];
}

/** I56 逐层终态状态：空候选 / 待裁决 / 已接受 / 已修改并接受 / 已跳过 / 已重生成待再次裁决。 */
function layerStatusText(state: OnboardingState, layer: OnboardingLayerId): string {
  const decision = state.decisions[layer];
  if (decision === 'accept') return '已接受';
  if (decision === 'edit') return '已修改并接受';
  if (decision === 'skip') return '已跳过';
  if (decision === 'regenerate') return '已重生成 · 待再次裁决';
  return layerCandidates(state, layer).length === 0 ? '无候选 · 待裁决' : '待裁决';
}

/** I56 六层终态门：全部进入 accepted/edited/skipped 终态才可 apply；regenerate 仍留 pending。 */
function applyEligibility(state: OnboardingState): { ready: boolean; pendingCount: number } {
  let pendingCount = 0;
  for (const { id } of ONBOARDING_LAYERS) {
    const decision = state.decisions[id];
    if (decision === undefined || decision === 'regenerate') pendingCount += 1;
  }
  return { ready: pendingCount === 0, pendingCount };
}

/** The layer's current candidate value as pretty JSON (edit panel seed). */
function currentLayerJson(state: OnboardingState, layer: OnboardingLayerId): string {
  const layers = state.layers as Record<string, unknown> | undefined;
  try { return JSON.stringify(layers?.[layer] ?? null, null, 2); } catch { return ''; }
}

function decisionLabel(decision: OnboardingDecision): string {
  switch (decision) {
    case 'accept': return '接受';
    case 'edit': return '修改后接受';
    case 'regenerate': return '打回重生成';
    case 'skip': return '跳过';
  }
}

/**
 * 渲染六层审阅面板（I56 锁终态门，design §14.7.4 / R12-3）：
 * - 每层显示终态状态；空候选层禁用「接受 / 修改后接受」（须重生成或显式跳过）。
 * - 「修改后接受」打开逐层编辑面板：JSON 编辑整层候选，确认时提交真实 editedValue。
 * - 「打回重生成」打开反馈面板：用户 feedback 随 regenerate 提交 Host。
 * - apply 按钮在六层全部进入终态前禁用（pending 阻止 apply，Host 侧同语义）。
 */
export function onboardingReview(
  h: El,
  namespace: OnboardingNamespace | undefined,
  state: OnboardingState,
  patch: (patch: Partial<OnboardingState>) => void,
  decide: (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra) => void,
  apply: () => void,
): unknown {
  const result = state.applyResult;
  const eligibility = applyEligibility(state);
  const openPanelFor = (layer: OnboardingLayerId): 'edit' | 'regenerate' | undefined => state.openPanel?.[layer];
  const openPanel = (layer: OnboardingLayerId, panel: 'edit' | 'regenerate'): void => {
    patch({ openPanel: { ...state.openPanel, [layer]: panel }, error: undefined });
  };
  const closePanel = (layer: OnboardingLayerId): void => {
    patch({ openPanel: { ...state.openPanel, [layer]: undefined } });
  };
  const confirmEdit = (layer: OnboardingLayerId): void => {
    const text = (state.editTexts?.[layer] ?? '').trim();
    if (!text) { patch({ error: '「修改后接受」的候选值不能为空' }); return; }
    // I91：editedValue 的 wire 类型（z.json 输出）随 descriptor 派生；JSON.parse 结果与之兼容。
    let value: NonNullable<Parameters<OnboardingNamespace['adjudicate']>[0]['editedValue']>;
    try { value = JSON.parse(text); } catch { patch({ error: '编辑的结构化内容格式不正确，请修正后重试' }); return; }
    decide(layer, 'edit', { editedValue: value });
  };
  const confirmRegenerate = (layer: OnboardingLayerId): void => {
    const feedback = state.feedbackTexts?.[layer] ?? '';
    decide(layer, 'regenerate', { feedback });
  };
  return h('section', { className: 'nv-onboarding', 'data-novel-onboarding': '' },
    h('h3', { className: 'nv-onboarding__title' }, '六层初始化审阅'),
    h('p', { className: 'nv-onboarding__hint' }, '逐层接受、修改后接受、打回重生成或显式跳过；空候选层须重生成或跳过。全部落到终态后才可应用。'),
    h('ul', { className: 'nv-onboarding__layers', 'data-novel-onboarding-layers': '' },
      ONBOARDING_LAYERS.map((layer) => {
        const empty = layerCandidates(state, layer.id).length === 0;
        const panel = openPanelFor(layer.id);
        return h('li', { key: layer.id, className: 'nv-onboarding__layer', 'data-novel-onboarding-layer': layer.id },
          h('span', { className: 'nv-onboarding__layer-label' }, layer.label),
          h('span', { className: 'nv-onboarding__status', 'data-novel-onboarding-status': layer.id }, layerStatusText(state, layer.id)),
          h('div', { className: 'nv-onboarding__verdicts', role: 'group', 'aria-label': `${layer.label} 裁决` },
            (['accept', 'edit', 'regenerate', 'skip'] as const).map((decision) => h('button', {
              key: decision,
              type: 'button',
              className: 'nv-onboarding__verdict' + (state.decisions[layer.id] === decision ? ' is-active' : ''),
              'data-novel-onboarding-verdict': layer.id,
              'data-novel-onboarding-decision': decision,
              disabled: namespace === undefined || ((decision === 'accept' || decision === 'edit') && empty),
              onClick: () => {
                if (decision === 'edit' || decision === 'regenerate') openPanel(layer.id, decision);
                else decide(layer.id, decision);
              },
            }, decisionLabel(decision))),
          ),
          panel === 'edit' ? h('div', { className: 'nv-onboarding__panel', 'data-novel-onboarding-edit-open': layer.id },
            h('label', { className: 'nv-field' },
              h('span', { className: 'nv-field__label' }, '编辑候选值（结构化内容，整层结构）'),
              h('textarea', {
                className: 'nv-field__input nv-onboarding__edit-text',
                rows: 8,
                spellCheck: false,
                'data-novel-onboarding-edit-text': layer.id,
                value: state.editTexts?.[layer.id] ?? currentLayerJson(state, layer.id),
                onChange: (event: { target: { value: string } }) => patch({ editTexts: { ...state.editTexts, [layer.id]: event.target.value }, error: undefined }),
              }),
            ),
            h('div', { className: 'nv-onboarding__panel-actions' },
              h('button', { type: 'button', className: 'nv-onboarding__panel-confirm', 'data-novel-onboarding-edit-confirm': layer.id, onClick: () => confirmEdit(layer.id) }, '确认修改并接受'),
              h('button', { type: 'button', className: 'nv-onboarding__panel-cancel', 'data-novel-onboarding-edit-cancel': layer.id, onClick: () => closePanel(layer.id) }, '取消'),
            ),
          ) : null,
          panel === 'regenerate' ? h('div', { className: 'nv-onboarding__panel', 'data-novel-onboarding-regenerate-open': layer.id },
            h('label', { className: 'nv-field' },
              h('span', { className: 'nv-field__label' }, '重生成反馈（可选）'),
              h('textarea', {
                className: 'nv-field__input',
                rows: 3,
                'data-novel-onboarding-feedback': layer.id,
                value: state.feedbackTexts?.[layer.id] ?? '',
                placeholder: '例如：候选缺少动机；地点应为北港而非南港。',
                onChange: (event: { target: { value: string } }) => patch({ feedbackTexts: { ...state.feedbackTexts, [layer.id]: event.target.value }, error: undefined }),
              }),
            ),
            h('div', { className: 'nv-onboarding__panel-actions' },
              h('button', { type: 'button', className: 'nv-onboarding__panel-confirm', 'data-novel-onboarding-regenerate-confirm': layer.id, onClick: () => confirmRegenerate(layer.id) }, '确认重生成'),
              h('button', { type: 'button', className: 'nv-onboarding__panel-cancel', 'data-novel-onboarding-regenerate-cancel': layer.id, onClick: () => closePanel(layer.id) }, '取消'),
            ),
          ) : null,
          candidateCards(h, layer.id, state),
        );
      }),
    ),
    h('p', { className: 'nv-onboarding__eligibility', 'data-novel-onboarding-eligibility': '', 'aria-live': 'polite' },
      eligibility.ready ? '六层终态已锁定，可应用已接受层。' : `待 ${eligibility.pendingCount} 层进入终态（已接受/已修改/已跳过）后启用应用。`),
    h('button', {
      type: 'button',
      className: 'nv-onboarding__apply',
      'data-novel-onboarding-apply': '',
      disabled: namespace === undefined || !eligibility.ready || state.applying === true,
      onClick: () => apply(),
    }, state.applying === true ? '应用中…' : '应用已接受层并进入创作台'),
    state.error ? h('p', { className: 'nv-onboarding__error', 'data-novel-onboarding-error': '', role: 'alert' }, state.error) : null,
    result ? h('dl', { className: 'nv-onboarding__result', 'data-novel-onboarding-result': '', 'aria-live': 'polite' },
      h('dt', null, '已应用'), h('dd', { 'data-novel-onboarding-applied': '' }, result.appliedLayers.join(', ') || '—'),
      h('dt', null, '已跳过'), h('dd', null, result.skippedLayers.join(', ') || '—'),
      h('dt', null, '被阻断'), h('dd', null, result.blockedLayers.join(', ') || '—'),
      h('dt', null, '待处理'), h('dd', null, result.pendingLayers.join(', ') || '—'),
      result.retryable ? h('p', { className: 'nv-onboarding__retryable' }, '可重试：仅补齐未完成层，不删除已写数据。') : null,
      result.errors.length > 0 ? h('p', { className: 'nv-onboarding__errors' }, result.errors.join('；')) : null,
      result.retryable ? h('button', {
        type: 'button',
        className: 'nv-onboarding__apply-retry',
        'data-novel-onboarding-apply-retry': '',
        disabled: namespace === undefined || state.applying === true,
        onClick: () => apply(),
      }, state.applying === true ? '重试中…' : '重试应用未完成层') : null,
    ) : null,
  );
}

/** I57 分析生命周期面板：busy/progress（进行中 + 取消）、失败/取消（错误 + 重试）。
 * 渲染在原文入口下方，让「分析中防重复 start / 取消零层写入 / 错误可重试不砖化」
 * 都落在同一可见区域（R12-4）。分析成功后此面板消失，进入审阅。 */
export function analysisPanel(
  h: El,
  state: OnboardingState,
  cancel: () => void,
  retry: () => void,
): unknown {
  const analysis = state.analysis;
  if (analysis === undefined || analysis.status === 'succeeded') return null;
  const busy = analysis.status === 'queued' || analysis.status === 'running';
  if (busy) {
    return h('section', { className: 'nv-analysis', 'data-novel-analysis-busy': analysis.status, 'aria-live': 'polite', 'aria-busy': 'true' },
      h('p', { className: 'nv-analysis__status', 'data-novel-analysis-status': analysis.status, role: 'status' },
        analysis.status === 'queued' ? '正在排队等待分析…' : '正在分析原文（生成六层候选）…'),
      h('button', {
        type: 'button',
        className: 'nv-analysis__cancel',
        'data-novel-analysis-cancel': '',
        onClick: () => cancel(),
      }, '取消分析'),
    );
  }
  const cancelled = analysis.status === 'cancelled';
  return h('section', {
    className: 'nv-analysis nv-analysis--terminal',
    'data-novel-analysis-cancelled': cancelled ? '' : undefined,
    'data-novel-analysis-failed': cancelled ? undefined : '',
  },
    h('p', { className: 'nv-analysis__error', 'data-novel-analysis-error': '', role: 'alert' },
      cancelled ? '分析已取消，未写入任何层。' : `分析失败：${toUserMessage(analysis.error ?? '未知错误')}`),
    h('button', {
      type: 'button',
      className: 'nv-analysis__retry',
      'data-novel-analysis-retry': '',
      onClick: () => retry(),
    }, '重新分析'),
  );
}
