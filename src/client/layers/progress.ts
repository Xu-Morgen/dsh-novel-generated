import type { El, ProgressNamespace } from '../shared.js';

/**
 * I68 C6 进度与灵感方向落地面板（design §14.10「C6 与灵感落地」/ R14-3）。
 *
 * 作者查看当前幕/节/场景卡与偏差，并把选定的灵感方向经 Gate 应用到 B5/C6：
 * - 导航与完成状态：当前导航目标（幕/节/指令/前置条件）、每节完成状态（C6
 *   completedBeats + B5 detailBeats.status 派生）、场景卡进度、「当前导航 vs
 *   detailBeat 状态」一致性提示；只读展示（B5 场景卡状态在大纲编辑器 I48 修正，
 *   刷新后重新一致）。
 * - 偏差：列出未调和/已调和偏差；可记录新偏差或把偏差标记为已调和（只写 C6）。
 * - 灵感方向：输入提示词点「灵感时刻」→ Host 产 2–3 个可区分方向（零写）；
 *   选定一个 → 「确认应用」发起 Gate 提案（pending，未确认零写）；在待确认
 *   列表确认（apply，只改授权的 B5 logline/themes 与 C6 偏差，重复 apply 幂等）
 *   或拒绝（零写）。
 * - 刷新与审计记录：刷新重新装载投影/待确认/审计；审计记录列出该作品全部
 *   inspiration.apply 裁决（accepted/rejected，持久化按插入顺序）。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelOutlineProgress` Remote；Client 只持有最小 owned JSON
 *   投影，不导入 core schema、不复制领域校验、不做任何领域 fallback。
 * - 灵感默认只读：未选择/未确认时本面板不发起任何 B5/C6 写。
 */

export interface ProgressSceneShape {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly pov: string;
  readonly wordTarget: number;
  readonly status: 'planned' | 'writing' | 'done';
}

export interface ProgressBeatShape {
  readonly id: string;
  readonly title: string;
  readonly optional: boolean;
  readonly completed: boolean;
  readonly current: boolean;
  readonly prerequisitesMet: boolean;
  readonly sceneCards: readonly ProgressSceneShape[];
  readonly doneScenes: number;
  readonly totalScenes: number;
}

export interface ProgressActShape {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly beats: readonly ProgressBeatShape[];
}

export interface ProgressDeviationShape {
  readonly id: string;
  readonly planned: string;
  readonly actual: string;
  readonly reason: string;
  readonly reconciled: boolean;
}

export interface ProgressNavigationShape {
  readonly actId: string;
  readonly beatId: string;
  readonly title: string;
  readonly description: string;
  readonly prerequisites: readonly string[];
  readonly prerequisitesMet: boolean;
  readonly instruction: string;
  readonly deviationIds: readonly string[];
}

export interface ProgressConsistencyShape {
  readonly currentBeatCompleted: boolean;
  readonly completedBeatsWithOpenScenes: readonly string[];
  readonly navigationTargetAllScenesDone: boolean;
}

export interface ProgressProjectionShape {
  readonly outlineId: string;
  readonly acts: readonly ProgressActShape[];
  readonly currentAct: string;
  readonly currentBeat: string;
  readonly completedBeats: readonly string[];
  readonly deviations: readonly ProgressDeviationShape[];
  readonly tensionLevel: number;
  readonly navigation: ProgressNavigationShape;
  readonly consistency: ProgressConsistencyShape;
}

export interface ProgressDirectionShape {
  readonly id: string;
  readonly title: string;
  readonly premise: string;
  readonly changes: {
    readonly logline?: string;
    readonly themes?: readonly string[];
    readonly outlineNote: string;
    readonly progressNote: string;
  };
  readonly rationale: string;
}

export interface ProgressPendingProposalShape {
  readonly proposalId: string;
  readonly direction: ProgressDirectionShape;
  readonly status: 'pending';
}

export interface ProgressAuditRecordShape {
  readonly proposalId: string;
  readonly status: 'accepted' | 'rejected';
  readonly direction: ProgressDirectionShape;
}

export interface ProgressSelectOutcomeShape {
  readonly projectId: string;
  readonly proposalId: string;
  readonly direction: ProgressDirectionShape;
  readonly status: 'pending';
}

export interface ProgressApplyOutcomeShape {
  readonly projectId: string;
  readonly proposalId: string;
  readonly applied: boolean;
  readonly projection: ProgressProjectionShape;
  readonly audit: readonly ProgressAuditRecordShape[];
}

export interface ProgressLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly projection?: ProgressProjectionShape;
  /** 灵感时刻产出的可区分方向（零写；未选择前不发起任何 Gate 提案）。 */
  readonly directions?: readonly ProgressDirectionShape[];
  readonly inspiring: boolean;
  readonly prompt: string;
  readonly selectedDirectionId?: string;
  readonly pending: readonly ProgressPendingProposalShape[];
  readonly audit: readonly ProgressAuditRecordShape[];
  readonly deviationDraft: { readonly planned: string; readonly actual: string; readonly reason: string };
  readonly acting: boolean;
}

export interface ProgressEditOps {
  refresh(): void;
  inspire(): void;
  setPrompt(value: string): void;
  selectDirection(directionId: string): void;
  /** 选定方向 → Gate 提案（pending；未确认零写）。 */
  proposeApply(): void;
  accept(proposalId: string): void;
  reject(proposalId: string): void;
  setDeviationDraft(patch: Partial<{ planned: string; actual: string; reason: string }>): void;
  recordDeviation(): void;
  reconcileDeviation(deviationId: string): void;
  dismiss(): void;
}

export function freshProgress(): ProgressLayerState {
  return { status: 'idle', inspiring: false, prompt: '', pending: [], audit: [], deviationDraft: { planned: '', actual: '', reason: '' }, acting: false };
}

export const PROGRESS_SCENE_STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: '待写', writing: '写作中', done: '已完成',
};

function consistencyFindings(projection: ProgressProjectionShape): string[] {
  const findings: string[] = [];
  if (projection.consistency.currentBeatCompleted) findings.push('当前节同时出现在「已完成节」中（C6 执行态自相矛盾，请先修正 completedBeats 或 currentBeat）。');
  for (const beatId of projection.consistency.completedBeatsWithOpenScenes) {
    findings.push(`已完成节「${beatId}」仍有未完成场景卡（完成状态与 B5 场景卡不一致，请在大纲编辑器把场景卡标为已完成）。`);
  }
  if (projection.consistency.navigationTargetAllScenesDone) {
    findings.push('导航目标节的全部场景卡已完成，但该节尚未标记为完成（可在完成状态中跟进）。');
  }
  return findings;
}

function sceneCard(h: El, card: ProgressSceneShape): unknown {
  return h('li', { className: 'nv-progress__scene', 'data-novel-progress-scene': card.id },
    h('span', { className: 'nv-progress__scene-title', 'data-novel-progress-scene-title': '' }, card.title),
    h('span', { className: 'nv-progress__badge nv-progress__badge--' + card.status, 'data-novel-progress-scene-status': card.status }, PROGRESS_SCENE_STATUS_LABELS[card.status] ?? card.status),
    h('span', { className: 'nv-progress__scene-meta', 'data-novel-progress-scene-meta': '' }, `${card.pov || '—'} · ${card.wordTarget} 字`),
    card.summary === '' ? null : h('p', { className: 'nv-progress__scene-summary', 'data-novel-progress-scene-summary': '' }, card.summary),
  );
}

function beatCard(h: El, beat: ProgressBeatShape): unknown {
  return h('li', { className: 'nv-progress__beat' + (beat.current ? ' is-current' : ''), 'data-novel-progress-beat': beat.id },
    h('div', { className: 'nv-progress__beat-main' },
      h('span', { className: 'nv-progress__beat-title', 'data-novel-progress-beat-title': '' }, beat.title),
      beat.current ? h('span', { className: 'nv-progress__badge nv-progress__badge--current', 'data-novel-progress-beat-current': '' }, '当前') : null,
      beat.completed ? h('span', { className: 'nv-progress__badge nv-progress__badge--done', 'data-novel-progress-beat-completed': '' }, '已完成') : null,
      beat.optional ? h('span', { className: 'nv-progress__badge', 'data-novel-progress-beat-optional': '' }, '可选') : null,
      h('span', { className: 'nv-progress__beat-count', 'data-novel-progress-beat-count': '' }, `场景 ${beat.doneScenes}/${beat.totalScenes}`),
    ),
    beat.sceneCards.length === 0
      ? h('p', { className: 'nv-progress__scene-empty', 'data-novel-progress-scene-empty': '' }, '（无场景卡）')
      : h('ul', { className: 'nv-progress__scenes', 'data-novel-progress-scenes': '' }, beat.sceneCards.map((card) => sceneCard(h, card))),
  );
}

function directionCard(h: El, direction: ProgressDirectionShape, selected: boolean, busy: boolean, ops: ProgressEditOps): unknown {
  const changes: string[] = [];
  if (direction.changes.logline !== undefined) changes.push(`新立意：${direction.changes.logline}`);
  if (direction.changes.themes !== undefined && direction.changes.themes.length > 0) changes.push(`主题：${direction.changes.themes.join('、')}`);
  changes.push(`大纲调整：${direction.changes.outlineNote}`);
  changes.push(`进度备注：${direction.changes.progressNote}`);
  return h('li', { className: 'nv-progress__direction' + (selected ? ' is-selected' : ''), 'data-novel-progress-direction': direction.id },
    h('div', { className: 'nv-progress__direction-main' },
      h('span', { className: 'nv-progress__direction-title', 'data-novel-progress-direction-title': '' }, direction.title),
      h('p', { className: 'nv-progress__direction-premise', 'data-novel-progress-direction-premise': '' }, direction.premise),
    ),
    h('ul', { className: 'nv-progress__direction-changes', 'data-novel-progress-direction-changes': '' },
      changes.map((line) => h('li', { key: line }, line))),
    h('p', { className: 'nv-progress__direction-rationale', 'data-novel-progress-direction-rationale': '' }, `理由：${direction.rationale}`),
    h('button', { type: 'button', className: 'nv-btn' + (selected ? ' nv-btn--primary' : ''), 'data-novel-progress-direction-select': direction.id, disabled: busy, onClick: () => ops.selectDirection(direction.id) },
      selected ? '已选定（可取消）' : '选定此方向'),
  );
}

/**
 * 进度与灵感面板。状态机：idle → loading → ready / error。ready 后展示导航/
 * 完成状态/偏差与灵感方向；灵感默认只读，选定方向经 Gate 提案→确认/拒绝才写 B5/C6。
 */
export function progressPanel(h: El, projectId: string, namespace: ProgressNamespace | undefined, state: ProgressLayerState, ops: ProgressEditOps): unknown {
  const available = namespace !== undefined && projectId !== undefined;
  const busy = state.acting || state.status === 'loading' || state.inspiring;
  let body: unknown;
  if (!available) {
    body = h('p', { className: 'nv-progress__hint', 'data-novel-progress-unavailable': '' }, '进度与灵感服务不可用（novelOutlineProgress Remote 未挂载）。');
  } else if (state.status === 'idle') {
    body = h('p', { className: 'nv-progress__hint', 'data-novel-progress-idle': '' }, '尚未装载。点击「刷新」查看当前幕/节/场景卡进度与灵感方向。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-progress__hint', 'data-novel-progress-loading': '', role: 'status', 'aria-live': 'polite' }, '正在装载进度与灵感…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-progress__error', 'data-novel-progress-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', { 'data-novel-progress-error-text': '' }, state.message ?? '进度与灵感读取失败'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-progress-retry': '', onClick: () => ops.refresh() }, '重试'),
    );
  } else {
    const projection = state.projection;
    const navigation = projection?.navigation;
    const findings = projection === undefined ? [] : consistencyFindings(projection);
    const directions = state.directions ?? [];
    const selected = directions.find((direction) => direction.id === state.selectedDirectionId);
    body = h('div', { className: 'nv-progress__ready', 'data-novel-progress-ready': '' },
      // 导航与完成状态（当前幕/节/场景卡 + 一致性）。
      h('div', { className: 'nv-progress__section', 'data-novel-progress-nav': '' },
        h('h4', { className: 'nv-progress__section-title' }, '当前导航（C6 执行态）'),
        navigation === undefined
          ? h('p', { className: 'nv-progress__empty', 'data-novel-progress-empty': '' }, '暂无大纲导航（B5 未初始化）。')
          : h('div', { className: 'nv-progress__nav-card', 'data-novel-progress-nav-card': '' },
            h('p', { className: 'nv-progress__nav-target', 'data-novel-progress-nav-target': '' },
              `目标节：${navigation.title}（幕 ${navigation.actId}）`),
            h('p', { className: 'nv-progress__nav-description', 'data-novel-progress-nav-description': '' }, navigation.description),
            h('p', { className: 'nv-progress__nav-instruction', 'data-novel-progress-nav-instruction': '' }, navigation.instruction),
            h('p', { className: 'nv-progress__nav-meta', 'data-novel-progress-nav-meta': '' },
              `已完成节 ${projection?.completedBeats.length ?? 0} · 未调和偏差 ${navigation.deviationIds.length} · 冲突强度 ${projection?.tensionLevel ?? 0}`),
          ),
        findings.length === 0 ? null
          : h('ul', { className: 'nv-progress__consistency', 'data-novel-progress-consistency': '' },
            findings.map((finding) => h('li', { key: finding, 'data-novel-progress-consistency-item': '' }, finding))),
      ),
      h('div', { className: 'nv-progress__section', 'data-novel-progress-completion': '' },
        h('h4', { className: 'nv-progress__section-title' }, '完成状态（幕 → 节 → 场景卡）'),
        projection === undefined || projection.acts.length === 0
          ? h('p', { className: 'nv-progress__empty', 'data-novel-progress-empty': '' }, '尚无大纲结构。')
          : h('ul', { className: 'nv-progress__acts', 'data-novel-progress-acts': '' },
            projection.acts.map((act) => h('li', { key: act.id, className: 'nv-progress__act', 'data-novel-progress-act': act.id },
              h('p', { className: 'nv-progress__act-title', 'data-novel-progress-act-title': '' }, `${act.title}（第 ${act.index} 幕）`),
              h('ul', { className: 'nv-progress__beats', 'data-novel-progress-beats': '' }, act.beats.map((beat) => beatCard(h, beat))),
            ))),
      ),
      // 偏差（只写 C6；B5 永不因偏差被改写 —— N-5）。
      h('div', { className: 'nv-progress__section', 'data-novel-progress-deviations': '' },
        h('h4', { className: 'nv-progress__section-title' }, '偏差记录（C6）'),
        projection === undefined || projection.deviations.length === 0
          ? h('p', { className: 'nv-progress__empty', 'data-novel-progress-deviation-empty': '' }, '尚无偏差记录。')
          : h('ul', { className: 'nv-progress__deviation-list', 'data-novel-progress-deviation-list': '' },
            projection.deviations.map((deviation) => h('li', { key: deviation.id, className: 'nv-progress__deviation', 'data-novel-progress-deviation': deviation.id },
              h('p', { className: 'nv-progress__deviation-text', 'data-novel-progress-deviation-text': '' },
                `${deviation.reconciled ? '已调和' : '未调和'}：计划「${deviation.planned}」→ 实际「${deviation.actual}」（${deviation.reason}）`),
              deviation.reconciled ? null
                : h('button', { type: 'button', className: 'nv-btn', 'data-novel-progress-deviation-reconcile': deviation.id, disabled: busy, onClick: () => ops.reconcileDeviation(deviation.id) }, '标记已调和'),
            ))),
        h('div', { className: 'nv-progress__deviation-record', 'data-novel-progress-deviation-record': '' },
          h('p', { className: 'nv-progress__section-subtitle' }, '记录新偏差'),
          h('label', { className: 'nv-field' },
            h('span', { className: 'nv-field__label' }, '原计划'),
            h('input', { type: 'text', className: 'nv-field__input', 'data-novel-progress-deviation-planned': '', value: state.deviationDraft.planned, onChange: (event: { target: { value: string } }) => ops.setDeviationDraft({ planned: event.target.value }) }),
          ),
          h('label', { className: 'nv-field' },
            h('span', { className: 'nv-field__label' }, '实际发生'),
            h('input', { type: 'text', className: 'nv-field__input', 'data-novel-progress-deviation-actual': '', value: state.deviationDraft.actual, onChange: (event: { target: { value: string } }) => ops.setDeviationDraft({ actual: event.target.value }) }),
          ),
          h('label', { className: 'nv-field' },
            h('span', { className: 'nv-field__label' }, '原因'),
            h('input', { type: 'text', className: 'nv-field__input', 'data-novel-progress-deviation-reason': '', value: state.deviationDraft.reason, onChange: (event: { target: { value: string } }) => ops.setDeviationDraft({ reason: event.target.value }) }),
          ),
          h('div', { className: 'nv-editor__actions' },
            h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-progress-deviation-submit': '', disabled: busy || state.deviationDraft.planned.trim() === '' || state.deviationDraft.actual.trim() === '' || state.deviationDraft.reason.trim() === '', onClick: () => ops.recordDeviation() }, state.acting ? '记录中…' : '记录偏差'),
          ),
        ),
      ),
      // 灵感方向（默认只读；选定 → Gate 提案 → 确认/拒绝才写 B5/C6）。
      h('div', { className: 'nv-progress__section', 'data-novel-progress-inspiration': '' },
        h('h4', { className: 'nv-progress__section-title' }, '灵感方向（默认只读）'),
        h('p', { className: 'nv-progress__hint', 'data-novel-progress-inspiration-desc': '' }, '「灵感时刻」产出 2–3 个可区分方向（不写任何层）；选定并确认后，只把该方向对 B5（立意/主题）与 C6（偏差）的调整经确认应用。'),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '灵感提示词（可选）'),
          h('input', { type: 'text', className: 'nv-field__input', 'data-novel-progress-inspire-prompt': '', value: state.prompt, onChange: (event: { target: { value: string } }) => ops.setPrompt(event.target.value), placeholder: '如：给故事一个更黑暗的转折' }),
        ),
        h('div', { className: 'nv-editor__actions' },
          h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-progress-inspire': '', disabled: busy, onClick: () => ops.inspire() }, state.inspiring ? '思考中…' : '灵感时刻'),
        ),
        directions.length === 0
          ? null
          : h('div', { className: 'nv-progress__directions', 'data-novel-progress-directions': '' },
            h('ul', { className: 'nv-progress__direction-list', 'data-novel-progress-direction-list': '' }, directions.map((direction) => directionCard(h, direction, direction.id === state.selectedDirectionId, busy, ops))),
            selected === undefined ? null
              : h('div', { className: 'nv-editor__actions' },
                h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-progress-propose': '', disabled: busy, onClick: () => ops.proposeApply() }, state.acting ? '提交中…' : '确认应用此方向（经 Gate）'),
              ),
          ),
      ),
      // 待确认提案（Gate pending；重载一致）。
      state.pending.length === 0 ? null
        : h('div', { className: 'nv-progress__section', 'data-novel-progress-pending': '' },
          h('h4', { className: 'nv-progress__section-title' }, `待确认方向（${state.pending.length} 条）`),
          h('ul', { className: 'nv-progress__pending-list', 'data-novel-progress-pending-list': '' },
            state.pending.map((proposal) => h('li', { key: proposal.proposalId, 'data-novel-progress-pending-item': proposal.proposalId },
              h('p', { className: 'nv-progress__pending-text', 'data-novel-progress-pending-text': '' },
                `「${proposal.direction.title}」→ ${proposal.direction.changes.outlineNote}`),
              h('div', { className: 'nv-editor__actions' },
                h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-progress-pending-accept': proposal.proposalId, disabled: busy, onClick: () => ops.accept(proposal.proposalId) }, state.acting ? '应用中…' : '确认应用'),
                h('button', { type: 'button', className: 'nv-btn', 'data-novel-progress-pending-reject': proposal.proposalId, disabled: busy, onClick: () => ops.reject(proposal.proposalId) }, '拒绝'),
              ),
            ))),
        ),
      // 审计记录（全部 inspiration.apply 裁决，持久化按插入顺序）。
      state.audit.length === 0 ? null
        : h('div', { className: 'nv-progress__section', 'data-novel-progress-audit': '' },
          h('h4', { className: 'nv-progress__section-title' }, '灵感应用审计记录'),
          h('ul', { className: 'nv-progress__audit-list', 'data-novel-progress-audit-list': '' },
            state.audit.map((record) => h('li', { key: record.proposalId, 'data-novel-progress-audit-record': record.proposalId },
              h('p', { className: 'nv-progress__audit-text', 'data-novel-progress-audit-text': '' },
                `${record.status === 'accepted' ? '已应用' : '已拒绝'}：「${record.direction.title}」（${record.proposalId}）`),
            ))),
        ),
      state.message === undefined ? null
        : h('p', { className: 'nv-progress__message', 'data-novel-progress-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    );
  }
  return h('section', { className: 'nv-progress', 'data-novel-progress-panel': '', 'data-novel-progress-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '进度与灵感（C6）'),
    h('p', { className: 'nv-progress__hint', 'data-novel-progress-desc': '' }, '查看当前幕/节/场景卡完成状态与偏差；灵感方向默认只读，选定并经确认后才允许调整 B5/C6（重复应用幂等）。'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-progress-refresh': '', disabled: busy, onClick: () => ops.refresh() }, busy ? '处理中…' : '刷新'),
    ),
    body,
  );
}
