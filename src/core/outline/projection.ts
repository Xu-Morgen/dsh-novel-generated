import type { DetailBeat, Outline } from '../schema/outline.js';
import type { OutlineDeviation, OutlineNavigation, OutlineProgress } from '../schema/outline-progress.js';
import { OutlineNavigator } from './navigator.js';

/**
 * I68 C6 进度与灵感方向落地（design §14.10「C6 与灵感落地」/ R14-3）——确定性投影。
 *
 * 把 B5（预设骨架）与 C6（执行态）合并成作者可读的最小 owned 投影：当前幕/节、
 * 每节场景卡完成状态、已完成节、偏差、导航指令与「当前导航 vs detailBeat 状态」
 * 一致性判定。纯函数、零写：它只读 B5/C6，绝不改写任何层（N-5：偏差先记录，
 * 接受新方向必须由用户选择并经 ConfirmationGate）。
 *
 * 不变式：
 * - 输入必须是已通过 `assertProgressReferences` 校验的 C6（未知引用/重复 id 由
 *   OutlineProgressRepository 拒绝）；本函数对未知 current beat 经 OutlineNavigator
 *   抛错（与 I15 导航器同一语义）。
 * - `consistency` 只做派生判定，不改变任何层：currentBeat 不应出现在
 *   completedBeats；已完成节的场景卡应全部 `done`；导航目标节场景卡全 done 但
 *   尚未标记完成时给出「可标记完成」提示。作者据此在大纲编辑器（I48）修正
 *   detailBeat 状态或经 C6 进度面板记录偏差，刷新后投影重新一致。
 */

/** 场景卡完成状态（B5 detailBeats.status 的投影子集）。 */
export type ProjectedSceneStatus = DetailBeat['status'];

/** 场景卡的最小进度投影（不含 points，避免整份 B5 入 Client）。 */
export interface ProjectedSceneCard {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly pov: string;
  readonly wordTarget: number;
  readonly status: ProjectedSceneStatus;
}

/** 节（beat）的进度投影：完成标记来自 C6 completedBeats，场景卡状态来自 B5。 */
export interface ProjectedBeat {
  readonly id: string;
  readonly title: string;
  readonly optional: boolean;
  readonly completed: boolean;
  readonly current: boolean;
  readonly prerequisitesMet: boolean;
  readonly sceneCards: readonly ProjectedSceneCard[];
  readonly doneScenes: number;
  readonly totalScenes: number;
}

/** 幕（act）的进度投影。 */
export interface ProjectedAct {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly beats: readonly ProjectedBeat[];
}

/** 「当前导航与 detailBeat 状态一致」的派生判定（R14-3 验收）。 */
export interface ProgressConsistency {
  /** C6 currentBeat 不应同时出现在 completedBeats（执行态自相矛盾）。 */
  readonly currentBeatCompleted: boolean;
  /** 已完成节中仍含非 `done` 场景卡的节 id（完成状态与 B5 场景卡不一致）。 */
  readonly completedBeatsWithOpenScenes: readonly string[];
  /** 导航目标节的所有场景卡均已 `done`，但该节尚未进入 completedBeats（提示可标记完成）。 */
  readonly navigationTargetAllScenesDone: boolean;
}

/** I68 进度/偏差投影：B5 骨架 + C6 执行态 + 导航 + 一致性，全部最小 owned JSON。 */
export interface OutlineProgressProjection {
  readonly outlineId: string;
  readonly acts: readonly ProjectedAct[];
  readonly currentAct: string;
  readonly currentBeat: string;
  readonly completedBeats: readonly string[];
  readonly deviations: readonly OutlineDeviation[];
  readonly tensionLevel: number;
  readonly navigation: OutlineNavigation;
  readonly consistency: ProgressConsistency;
}

interface BeatLocation { beat: Outline['acts'][number]['beats'][number] }

function findBeat(outline: Outline, beatId: string): BeatLocation | undefined {
  for (const act of outline.acts) {
    const beat = act.beats.find((item) => item.id === beatId);
    if (beat) return { beat };
  }
  return undefined;
}

/** 合并 B5/C6 为进度投影（只读；未知 C6 引用抛错，与 OutlineProgressRepository 同语义）。 */
export function projectOutlineProgress(outline: Outline, progress: OutlineProgress): OutlineProgressProjection {
  const navigation = new OutlineNavigator().navigate(outline, progress);
  const completed = new Set(progress.completedBeats);
  const projectScene = (card: DetailBeat): ProjectedSceneCard => Object.freeze({
    id: card.id,
    title: card.title,
    summary: card.summary,
    pov: card.pov,
    wordTarget: card.wordTarget,
    status: card.status,
  });
  const projectBeat = (beat: Outline['acts'][number]['beats'][number]): ProjectedBeat => {
    const sceneCards = beat.detailBeats.map(projectScene);
    return Object.freeze({
      id: beat.id,
      title: beat.title,
      optional: beat.optional,
      completed: completed.has(beat.id),
      current: beat.id === progress.currentBeat,
      prerequisitesMet: beat.prerequisites.every((id) => completed.has(id)),
      sceneCards: Object.freeze(sceneCards),
      doneScenes: sceneCards.filter((card) => card.status === 'done').length,
      totalScenes: sceneCards.length,
    });
  };
  const acts: ProjectedAct[] = outline.acts
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map((act) => Object.freeze({
      id: act.id,
      index: act.index,
      title: act.title,
      beats: Object.freeze(act.beats
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(projectBeat)),
    }));

  // 一致性判定（只派生、不写层）。
  const completedBeatsWithOpenScenes = [...completed]
    .filter((id) => {
      const location = findBeat(outline, id);
      return location !== undefined && location.beat.detailBeats.some((card) => card.status !== 'done');
    })
    .sort();
  const navigationTarget = findBeat(outline, navigation.beatId);
  const navigationTargetAllScenesDone = navigationTarget !== undefined
    && navigationTarget.beat.detailBeats.length > 0
    && navigationTarget.beat.detailBeats.every((card) => card.status === 'done')
    && !completed.has(navigation.beatId);

  return Object.freeze({
    outlineId: outline.id,
    acts: Object.freeze(acts),
    currentAct: progress.currentAct,
    currentBeat: progress.currentBeat,
    completedBeats: Object.freeze([...progress.completedBeats]),
    deviations: Object.freeze(progress.deviations.map((deviation) => Object.freeze({ ...deviation }))),
    tensionLevel: progress.tensionLevel,
    navigation: Object.freeze({ ...navigation, prerequisites: Object.freeze([...navigation.prerequisites]), deviationIds: Object.freeze([...navigation.deviationIds]) }),
    consistency: Object.freeze({
      currentBeatCompleted: completed.has(progress.currentBeat),
      completedBeatsWithOpenScenes: Object.freeze(completedBeatsWithOpenScenes),
      navigationTargetAllScenesDone,
    }),
  });
}
