// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// outline 层编辑动作 = B5 大纲层编辑动作（幕/节/场景卡增删改 + 保存，全部经 store actions 写回；I48 行为等价，I82 拆分）。

import { unwrap } from '../shared.js';
import { outlineInput as buildOutlineInput } from '../layers/outline.js';
import type { OutlineBeatShape, OutlineDetailBeatShape, OutlineEditOps, OutlineShape } from '../layers/outline.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type OutlinePort = Pick<OpsPorts, 'workspace'>;

export function createOutlineOps(runtime: OpsRuntime, port: OutlinePort): OutlineEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const workspace = port.workspace;
  return {
      mutate: (update) => act.outlineMutate(update),
      selectAct: (id) => act.outlineDraft({ selectedActId: id, selectedBeatId: undefined, selectedDetailId: undefined }),
      selectBeat: (actId, beatId) => act.outlineDraft({ selectedActId: actId, selectedBeatId: beatId, selectedDetailId: undefined }),
      selectDetail: (id) => act.outlineDraft({ selectedDetailId: id }),
      addAct: () => { const acts = snapshot.outlineEditor.draft.acts ?? []; const id = `act-${acts.length + 1}`; act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts: acts.concat({ id, index: acts.length, title: '', goal: '', beats: [] }) }, dirty: true, selectedActId: id, selectedBeatId: undefined, selectedDetailId: undefined }); },
      removeAct: (actId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).filter((act) => act.id !== actId).map((act, index) => ({ ...act, index })); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedActId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedActId, selectedBeatId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedBeatId, selectedDetailId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
      addBeat: (actId) => { const foundAct = (snapshot.outlineEditor.draft.acts ?? []).find((x) => x.id === actId); const count = foundAct?.beats?.length ?? 0; const id = `beat-${count + 1}`; const beat: OutlineBeatShape = { id, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }; const acts = (snapshot.outlineEditor.draft.acts ?? []).map((x) => x.id === actId ? { ...x, beats: (x.beats ?? []).concat(beat) } : x); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedActId: actId, selectedBeatId: id, selectedDetailId: undefined }); },
      removeBeat: (actId, beatId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).filter((b) => b.id !== beatId) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedBeatId: snapshot.outlineEditor.selectedBeatId === beatId ? undefined : snapshot.outlineEditor.selectedBeatId, selectedDetailId: snapshot.outlineEditor.selectedBeatId === beatId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
      addDetailBeat: (actId, beatId) => { const foundAct = (snapshot.outlineEditor.draft.acts ?? []).find((x) => x.id === actId); const foundBeat = foundAct?.beats?.find((x) => x.id === beatId); const id = `detail-${actId}-${beatId}-${(foundBeat?.detailBeats?.length ?? 0) + 1}`; const card: OutlineDetailBeatShape = { id, title: '', summary: '', pov: '', wordTarget: 500, points: [], status: 'planned' }; const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).map((beat) => beat.id === beatId ? { ...beat, detailBeats: (beat.detailBeats ?? []).concat(card) } : beat) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedDetailId: id }); },
      removeDetailBeat: (actId, beatId, cardId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).map((beat) => beat.id === beatId ? { ...beat, detailBeats: (beat.detailBeats ?? []).filter((card) => card.id !== cardId) } : beat) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedDetailId: snapshot.outlineEditor.selectedDetailId === cardId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
      save: () => {
        const e = snapshot.outlineEditor;
        if (e.saving || !beginOp('outline:save')) return;
        const release = (): void => endOp('outline:save');
        if (!workspace || projectId === undefined) { release(); act.outlineDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.draft.logline.trim() === '') { release(); act.outlineDraft({ error: '一句话梗概（logline）不能为空' }); return; }
        act.outlineDraft({ saving: true, error: '', saveMessage: '' });
        void unwrap(workspace.outlineSave(projectId, buildOutlineInput(e.draft))).then((saved) => { release(); if (!isActive()) return; const outline = saved as OutlineShape; act.outlineDraft({ draft: { ...outline }, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setOutline('ready', outline); }, (cause: Error) => { release(); act.outlineDraft({ saving: false, saveMessage: '', error: cause.message }); });
      },
  };
}
