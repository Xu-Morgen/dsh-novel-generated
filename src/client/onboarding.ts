import type { El } from './shared.js';
import { unwrap } from './shared.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from '../remote.js';

/**
 * I53 六层候选审阅与逐层裁决 Client 模块（design §14.7.4 / R11-4）。
 *
 * Client 只把四种裁决（直接接受 / 修改后接受 / 打回重生成 / 显式跳过）与最终
 * apply 指令送往 Host `novelOnboarding` Remote；Client 不拥有领域校验、不直接
 * 写文件、不解析候选语义（H0-5 / N-3）。裁决结果与 partial-retryable apply 结果
 * 都由 Host 逐层返回并在此展示。
 */

export type OnboardingDecision = 'accept' | 'edit' | 'regenerate' | 'skip';
export type OnboardingLayerId = 'characters' | 'worldview' | 'outline' | 'relationship' | 'state' | 'canon';

export interface OnboardingAdjudicationRecord {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
}
export interface OnboardingApplyResultShape {
  projectId: string;
  onboardingSessionId: string;
  appliedLayers: OnboardingLayerId[];
  skippedLayers: OnboardingLayerId[];
  blockedLayers: OnboardingLayerId[];
  pendingLayers: OnboardingLayerId[];
  retryable: boolean;
  errors: string[];
}

/** Mounted `remote.novelOnboarding` namespace surface. */
export interface OnboardingNamespace {
  adjudicate(input: { projectId: string; onboardingSessionId: string; sourceHash: string; layer: OnboardingLayerId; decision: OnboardingDecision; editedValue?: unknown; feedback?: string }, settings?: unknown): Promise<unknown>;
  acceptedLayers(onboardingSessionId: string): Promise<unknown>;
  finalApply(input: { projectId: string; onboardingSessionId: string; sourceHash: string }): Promise<unknown>;
}

export const ONBOARDING_LAYERS: readonly { id: OnboardingLayerId; label: string }[] = [
  { id: 'characters', label: '角色（B3）' },
  { id: 'worldview', label: '世界观（B2）' },
  { id: 'outline', label: '大纲（B5）' },
  { id: 'relationship', label: '关系（C1）' },
  { id: 'state', label: '状态（C2）' },
  { id: 'canon', label: '正史（C4）' },
];

export interface OnboardingState {
  projectId: string;
  onboardingSessionId: string;
  sourceHash: string;
  decisions: Partial<Record<OnboardingLayerId, OnboardingDecision>>;
  /** The six-layer candidate package returned by the analyzer (plain JSON). */
  layers?: unknown;
  applyResult?: OnboardingApplyResultShape;
  error?: string;
}

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

/**
 * 渲染六层审阅面板：每层一个裁决按钮组 + 候选内容 + 一个最终「应用已接受层」按钮。
 * 裁决结果（接受/跳过/重生成/编辑）与 apply 结果由宿主回调驱动。
 */
export function onboardingReview(
  h: El,
  namespace: OnboardingNamespace | undefined,
  state: OnboardingState,
  dispatch: (fn: (s: OnboardingState) => void) => void,
  decide: (layer: OnboardingLayerId, decision: OnboardingDecision) => void,
  apply: () => void,
): unknown {
  const result = state.applyResult;
  return h('section', { className: 'nv-onboarding', 'data-novel-onboarding': '' },
    h('h3', { className: 'nv-onboarding__title' }, '六层初始化审阅'),
    h('p', { className: 'nv-onboarding__hint' }, '逐层接受、修改后接受、打回重生成或显式跳过，全部落到终态后可进入创作台。'),
    h('ul', { className: 'nv-onboarding__layers', 'data-novel-onboarding-layers': '' },
      ONBOARDING_LAYERS.map((layer) => h('li', { key: layer.id, className: 'nv-onboarding__layer', 'data-novel-onboarding-layer': layer.id },
        h('span', { className: 'nv-onboarding__layer-label' }, layer.label),
        h('div', { className: 'nv-onboarding__verdicts', role: 'group', 'aria-label': `${layer.label} 裁决` },
          (['accept', 'edit', 'regenerate', 'skip'] as const).map((decision) => h('button', {
            key: decision,
            type: 'button',
            className: 'nv-onboarding__verdict' + (state.decisions[layer.id] === decision ? ' is-active' : ''),
            'data-novel-onboarding-verdict': layer.id,
            'data-novel-onboarding-decision': decision,
            disabled: namespace === undefined,
            onClick: () => decide(layer.id, decision),
          }, decisionLabel(decision))),
        ),
        candidateCards(h, layer.id, state),
      )),
    ),
    h('button', {
      type: 'button',
      className: 'nv-onboarding__apply',
      'data-novel-onboarding-apply': '',
      disabled: namespace === undefined,
      onClick: () => apply(),
    }, '应用已接受层并进入创作台'),
    state.error ? h('p', { className: 'nv-onboarding__error', 'data-novel-onboarding-error': '', role: 'alert' }, state.error) : null,
    result ? h('dl', { className: 'nv-onboarding__result', 'data-novel-onboarding-result': '' },
      h('dt', null, '已应用'), h('dd', { 'data-novel-onboarding-applied': '' }, result.appliedLayers.join(', ') || '—'),
      h('dt', null, '已跳过'), h('dd', null, result.skippedLayers.join(', ') || '—'),
      h('dt', null, '被阻断'), h('dd', null, result.blockedLayers.join(', ') || '—'),
      h('dt', null, '待处理'), h('dd', null, result.pendingLayers.join(', ') || '—'),
      result.retryable ? h('p', { className: 'nv-onboarding__retryable' }, '可重试：仅补齐未完成层，不删除已写数据。') : null,
      result.errors.length > 0 ? h('p', { className: 'nv-onboarding__errors' }, result.errors.join('；')) : null,
    ) : null,
  );
}

function decisionLabel(decision: OnboardingDecision): string {
  switch (decision) {
    case 'accept': return '接受';
    case 'edit': return '修改后接受';
    case 'regenerate': return '打回重生成';
    case 'skip': return '跳过';
  }
}

/** 把一个裁决指令送往 Host（归一到 Remote 返回值）。 */
export async function adjudicateOne(namespace: OnboardingNamespace, state: OnboardingState, layer: OnboardingLayerId, decision: OnboardingDecision): Promise<OnboardingAdjudicationRecord> {
  return unwrap(namespace.adjudicate({
    projectId: state.projectId,
    onboardingSessionId: state.onboardingSessionId,
    sourceHash: state.sourceHash,
    layer,
    decision,
  }, undefined)) as unknown as OnboardingAdjudicationRecord;
}

/** 触发 Host final apply 并解析为结构化结果。 */
export async function applyAccepted(namespace: OnboardingNamespace, state: OnboardingState): Promise<OnboardingApplyResultShape> {
  return unwrap(namespace.finalApply({ projectId: state.projectId, onboardingSessionId: state.onboardingSessionId, sourceHash: state.sourceHash })) as unknown as OnboardingApplyResultShape;
}

export { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution };
