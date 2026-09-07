import type { El } from '../shared.js';
import { WORKFLOW_STAGES, type WorkflowStageId, type WorkflowState, workflowStageOf } from '../workflow.js';
import type { SourceAwareWorkflowProjection } from '../source-aware-workflow.js';

export interface WorkflowPanelProps {
  readonly state: WorkflowState;
  readonly projectName: string;
  readonly openStage: (stage: WorkflowStageId) => void;
  readonly sourceAware?: SourceAwareWorkflowProjection;
}

/**
 * I139 唯一作者流程壳（R18-15）。渲染器只投影 Client 的当前阶段和下一动作，
 * 每个按钮把控制权交回既有面板；不在普通流程里显示内部 ID、fingerprint、
 * 层编号、索引维护或确认门实现细节。
 */
export function workflowPanel(h: El, props: WorkflowPanelProps): unknown {
  const source = props.sourceAware ?? props.state.sourceAware;
  const blocked = source !== undefined && !source.canEnterOutline;
  const current = workflowStageOf(blocked ? 'import' : props.state.stage);
  return h('section', {
    className: 'nv-panel nv-workflow',
    'data-novel-workflow-panel': '',
    'aria-labelledby': 'nv-workflow-title',
  },
    h('p', { className: 'nv-workflow__eyebrow' }, '创作流程'),
    h('h1', { id: 'nv-workflow-title', className: 'nv-workflow__title', 'data-novel-workflow-project': '' }, props.projectName),
    h('div', { className: 'nv-workflow__current', 'data-novel-workflow-next': current.id, role: 'status', 'aria-live': 'polite' },
      h('strong', null, `当前阶段：${current.label}`),
      h('p', { className: 'nv-settings__hint' }, `下一步：${current.nextAction}`),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-workflow-next-action': '', onClick: () => props.openStage(current.id) }, blocked ? '返回来源确认' : current.nextAction),
    ),
    source === undefined ? null : h('section', { className: 'nv-workflow__source', 'data-novel-workflow-source-route': source.route, 'data-novel-workflow-source-status': source.planStatus ?? 'unplanned' },
      h('h4', { className: 'nv-workflow__source-title' }, '来源进入创作流程'),
      h('p', { className: 'nv-settings__hint', role: 'status', 'aria-live': 'polite', 'data-novel-workflow-source-message': '' }, source.message),
      source.unresolvedParagraphIds.length === 0 ? null : h('p', { className: 'nv-import-review__validation', role: 'alert', 'data-novel-workflow-source-unresolved': '' }, `尚有 ${source.unresolvedParagraphIds.length} 段来源待裁决。`),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-workflow-source-next': source.nextStage, onClick: () => props.openStage(source.nextStage) }, source.nextStage === 'detail' ? '进入细纲步骤' : source.nextStage === 'outline' ? '进入大纲步骤' : '返回来源确认'),
    ),
    h('p', { className: 'nv-settings__hint' }, '创作路径 · 当前标记表示上次停留位置，各阶段结果请进入查看。'),
    h('ol', { className: 'nv-workflow__stages', 'data-novel-workflow-stages': '' },
      WORKFLOW_STAGES.map((stage) => {
        const state = stage.id === current.id ? 'current' : 'upcoming';
        return h('li', { key: stage.id, className: `nv-workflow__stage nv-workflow__stage--${state}`, 'data-novel-workflow-stage': stage.id, 'data-novel-workflow-stage-state': state },
          h('div', { className: 'nv-workflow__stage-copy' },
            h('span', { className: 'nv-workflow__stage-step', 'aria-hidden': 'true' }, String(stage.step)),
            h('div', null,
              h('h4', { className: 'nv-workflow__stage-title' }, stage.label),
              h('p', { className: 'nv-workflow__stage-hint' }, stage.hint),
            ),
          ),
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-workflow-open-stage': stage.id, disabled: blocked && stage.id !== 'import', title: blocked && stage.id !== 'import' ? source.message : undefined, 'aria-label': `进入${stage.label}阶段`, onClick: () => props.openStage(stage.id) }, state === 'current' ? '继续' : '打开'),
        );
      }),
    ),
  );
}
