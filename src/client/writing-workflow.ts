/**
 * I121 Client 写作循环状态（计划 §18 I121）：只保存当前 Fiber 的展示态，Host
 * 仍拥有正文、细纲 baseline、sourceHash 与 trace 真相。navigationRevision 是
 * 异步结果的边界；切场景/切作品后，旧请求不能把状态写回新目标。
 */

export type WritingWorkflowStatus = 'idle' | 'loading' | 'ready' | 'saved' | 'rejected' | 'cancelled' | 'error';

export interface WritingWorkflowState {
  readonly status: WritingWorkflowStatus;
  readonly navigationRevision: number;
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sceneId?: string;
  /** Host 返回的候选/已保存正文 sourceHash；Client 不在普通 UI 中展示原值。 */
  readonly sourceHash?: string;
  /** 当前生成基线的 opaque id；只供本次状态关联，不构成 Client 真相。 */
  readonly baselineId?: string;
  /** I136 候选与定稿计划之间的短暂关联；正文/计划真相仍由 Host 持有。 */
  readonly candidateId?: string;
  readonly recentSceneCount?: number;
  readonly traceSectionCount?: number;
  readonly message?: string;
}

export function freshWritingWorkflow(navigationRevision = 0): WritingWorkflowState {
  return Object.freeze({ status: 'idle', navigationRevision });
}

export function beginWritingWorkflow(
  state: WritingWorkflowState,
  input: { readonly projectId: string; readonly chapterId: string; readonly navigationRevision: number },
): WritingWorkflowState {
  if (state.navigationRevision !== input.navigationRevision) return state;
  return Object.freeze({
    status: 'loading',
    navigationRevision: input.navigationRevision,
    projectId: input.projectId,
    chapterId: input.chapterId,
  });
}

/**
 * 只接受同一导航世代的异步结果；取消后仍到达的旧结果必须被丢弃，避免
 * “取消/切项目后晚到响应”伪装成当前项目已完成。
 */
export function settleWritingWorkflow(
  state: WritingWorkflowState,
  patch: Omit<Partial<WritingWorkflowState>, 'navigationRevision'> & Pick<WritingWorkflowState, 'status'>,
  navigationRevision: number,
): WritingWorkflowState {
  if (state.navigationRevision !== navigationRevision || state.status === 'cancelled') return state;
  return Object.freeze({ ...state, ...patch, navigationRevision });
}

export function cancelWritingWorkflow(state: WritingWorkflowState, navigationRevision = state.navigationRevision): WritingWorkflowState {
  if (state.navigationRevision !== navigationRevision || state.status === 'idle') return state;
  return Object.freeze({ ...state, status: 'cancelled', message: '已取消当前写作操作' });
}

export function resetWritingWorkflow(navigationRevision: number): WritingWorkflowState {
  return freshWritingWorkflow(navigationRevision);
}
