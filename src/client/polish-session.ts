import type { PolishMode } from '../core/candidate/index.js';

export type { PolishMode };

/** Client-only chapter projection needed by the transient polish session. */
export interface PolishSceneTarget {
  readonly id: string;
  readonly index: number;
}

export type PolishSessionStatus = 'idle' | 'running' | 'stopped' | 'completed' | 'error';

/**
 * I122 章节润色会话态（design §14.14.2 D25 / R18-4）。
 *
 * 这是 Client 当前 Fiber 的导航/展示状态，不是章节批次账本：只有 scene ids、游标、
 * 完成数和错误提示会在当前会话暂存；刷新、重启或切项目由 fresh/reset 丢弃进度，
 * C5 已接受正文仍由 Host 真相保留。
 */
export interface PolishSessionState {
  readonly status: PolishSessionStatus;
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly mode?: PolishMode;
  readonly sceneIds: readonly string[];
  readonly currentSceneId?: string;
  readonly completedCount: number;
  readonly navigationRevision: number;
  readonly error?: string;
}

export function freshPolishSession(navigationRevision = 0): PolishSessionState {
  return Object.freeze({
    status: 'idle' as const,
    sceneIds: Object.freeze([] as string[]),
    completedCount: 0,
    navigationRevision,
  });
}

/** scene.index 是章节润色唯一顺序 owner；id 只用于并列 index 时确定性收敛。 */
export function orderPolishScenes(scenes: readonly PolishSceneTarget[]): readonly PolishSceneTarget[] {
  return Object.freeze([...scenes]
    .map((scene) => ({ id: scene.id, index: scene.index }))
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id)));
}

export function startPolishSession(input: {
  readonly projectId: string;
  readonly chapterId: string;
  readonly scenes: readonly PolishSceneTarget[];
  readonly mode: PolishMode;
  readonly navigationRevision: number;
}): PolishSessionState {
  if (!input.projectId.trim() || !input.chapterId.trim()) throw new Error('润色会话需要明确作品和章节');
  const scenes = orderPolishScenes(input.scenes);
  if (scenes.length === 0) throw new Error('当前章节没有可润色的场景');
  return Object.freeze({
    status: 'running' as const,
    projectId: input.projectId,
    chapterId: input.chapterId,
    mode: input.mode,
    sceneIds: Object.freeze(scenes.map((scene) => scene.id)),
    currentSceneId: scenes[0]?.id,
    completedCount: 0,
    navigationRevision: input.navigationRevision,
  });
}

export function selectNextPolishScene(state: PolishSessionState, navigationRevision: number): PolishSessionState {
  if (state.status !== 'running') return state;
  if (state.currentSceneId !== undefined) throw new Error('当前场景仍有待裁决润色候选');
  const next = state.sceneIds[state.completedCount];
  if (next === undefined) return Object.freeze({ ...state, status: 'completed' as const, error: undefined });
  return Object.freeze({ ...state, currentSceneId: next, navigationRevision, error: undefined });
}

export function completePolishScene(state: PolishSessionState, sceneId: string): PolishSessionState {
  if (state.status !== 'running' || state.currentSceneId !== sceneId) return state;
  const completedCount = state.completedCount + 1;
  return Object.freeze({
    ...state,
    currentSceneId: undefined,
    completedCount,
    status: completedCount >= state.sceneIds.length ? 'completed' as const : 'running' as const,
    error: undefined,
  });
}

export function stopPolishSession(state: PolishSessionState): PolishSessionState {
  if (state.status !== 'running') return state;
  return Object.freeze({ ...state, status: 'stopped' as const });
}

export function failPolishSession(state: PolishSessionState, error: string): PolishSessionState {
  return Object.freeze({ ...state, status: 'error' as const, error: error || '章节润色失败' });
}
