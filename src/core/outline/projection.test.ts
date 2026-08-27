import { describe, expect, it } from 'vitest';
import { projectOutlineProgress } from './projection.js';
import type { Outline } from '../schema/outline.js';
import type { OutlineProgress } from '../schema/outline-progress.js';

const outline: Outline = {
  id: 'outline', version: 1, structure: 'three-act', logline: 'A test.', themes: ['trust'],
  acts: [
    { id: 'act-one', index: 1, title: '第一幕', goal: 'Goal', beats: [
      { id: 'first', title: 'First', description: 'Find the key.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
        { id: 'scene-1', title: '雨夜入港', summary: '米拉抵达旧港。', pov: 'mira', wordTarget: 800, points: ['到达'], status: 'done' },
        { id: 'scene-2', title: '守夜人', summary: '遇见守夜人。', pov: 'mira', wordTarget: 700, points: ['对话'], status: 'writing' },
      ] },
      { id: 'second', title: 'Second', description: 'Open the door.', charactersInvolved: [], conflictType: 'world', prerequisites: ['first'], optional: false, detailBeats: [
        { id: 'scene-3', title: '开门', summary: '打开封印之门。', pov: 'lin', wordTarget: 900, points: ['解谜'], status: 'planned' },
      ] },
    ] },
    { id: 'act-two', index: 2, title: '第二幕', goal: 'Goal 2', beats: [
      { id: 'optional', title: 'Optional', description: 'Notice the rain.', charactersInvolved: [], conflictType: 'internal', prerequisites: [], optional: true, detailBeats: [] },
    ] },
  ],
  foreshadowing: [], endings: [],
};

const progress: OutlineProgress = {
  outlineId: 'outline', currentAct: 'act-one', currentBeat: 'first', completedBeats: [],
  deviations: [{ id: 'drift-1', planned: 'X', actual: 'Y', reason: 'Z', reconciled: false }], tensionLevel: 20,
};

describe('I68 C6 进度投影（core/outline/projection）', () => {
  it('projects acts/beats/scene cards with completion state and navigation without writing', () => {
    const projection = projectOutlineProgress(outline, progress);
    expect(projection.outlineId).toBe('outline');
    expect(projection.acts.map((act) => act.id)).toEqual(['act-one', 'act-two']);
    const first = projection.acts[0].beats.find((beat) => beat.id === 'first')!;
    expect(first.current).toBe(true);
    expect(first.completed).toBe(false);
    expect(first.totalScenes).toBe(2);
    expect(first.doneScenes).toBe(1);
    expect(first.sceneCards.map((card) => [card.id, card.status])).toEqual([['scene-1', 'done'], ['scene-2', 'writing']]);
    expect(projection.navigation.beatId).toBe('first');
    expect(projection.navigation.prerequisitesMet).toBe(true);
    expect(projection.deviations).toEqual(progress.deviations);
    expect(projection.tensionLevel).toBe(20);
    // 纯函数零写：输入 outline 未被修改。
    expect(outline.acts[0].beats[0].detailBeats[1].status).toBe('writing');
  });

  it('derives navigation target with prerequisite awareness from completed beats', () => {
    const advanced: OutlineProgress = { ...progress, currentAct: 'act-one', currentBeat: 'second', completedBeats: ['first'] };
    const projection = projectOutlineProgress(outline, advanced);
    expect(projection.navigation.beatId).toBe('second');
    expect(projection.acts[0].beats.find((beat) => beat.id === 'first')!.completed).toBe(true);
    expect(projection.acts[0].beats.find((beat) => beat.id === 'first')!.current).toBe(false);
    expect(projection.acts[0].beats.find((beat) => beat.id === 'second')!.prerequisitesMet).toBe(true);
  });

  it('reports navigation/detailBeat consistency findings without changing either layer', () => {
    // 一致性：当前节不应已完成；已完成节不应有未 done 场景卡；导航目标全 done 提示。
    const openCompleted: OutlineProgress = { ...progress, currentBeat: 'first', completedBeats: ['first'] };
    const inconsistent = projectOutlineProgress(outline, openCompleted);
    expect(inconsistent.consistency.currentBeatCompleted).toBe(true);
    expect(inconsistent.consistency.completedBeatsWithOpenScenes).toContain('first');

    const clean: OutlineProgress = {
      ...progress,
      currentAct: 'act-one', currentBeat: 'second', completedBeats: ['first'],
      deviations: [],
    };
    // 全部场景已 done 的完成节 → 无「已完成节含未 done 场景」发现。
    const outlineClean: Outline = {
      ...outline,
      acts: outline.acts.map((act) => ({
        ...act,
        beats: act.beats.map((beat) => beat.id === 'first'
          ? { ...beat, detailBeats: beat.detailBeats.map((card) => ({ ...card, status: 'done' as const })) }
          : beat),
      })),
    };
    const consistent = projectOutlineProgress(outlineClean, clean);
    expect(consistent.consistency.currentBeatCompleted).toBe(false);
    expect(consistent.consistency.completedBeatsWithOpenScenes).toEqual([]);
    // 第二幕 optional 节无场景卡 → 不作为「全 done 未标记」提示。
    expect(consistent.consistency.navigationTargetAllScenesDone).toBe(false);

    // 导航目标节全部场景 done 但未完成 → 提示可标记完成。
    const allDone: OutlineProgress = { ...progress, currentBeat: 'first', completedBeats: [] };
    const outlineAllDone: Outline = {
      ...outline,
      acts: [{ ...outline.acts[0], beats: [{ ...outline.acts[0].beats[0], detailBeats: [
        { ...outline.acts[0].beats[0].detailBeats[0], status: 'done' },
        { ...outline.acts[0].beats[0].detailBeats[1], status: 'done' },
      ] }] }],
    };
    expect(projectOutlineProgress(outlineAllDone, allDone).consistency.navigationTargetAllScenesDone).toBe(true);
  });

  it('rejects unknown current beat through the navigator (same semantics as C6 repository)', () => {
    expect(() => projectOutlineProgress(outline, { ...progress, currentBeat: 'missing' })).toThrow(/Unknown current beat/);
  });
});
