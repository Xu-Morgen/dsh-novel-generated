import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import type { OutlineGenerationScopeInput } from '../../core/schema/outline-generation-scope.js';
import type { OutlineDetailGenerationEditOps, OutlineDetailGenerationLayerState } from '../layers/outline-detail-generation.js';
import type { OutlineShape } from '../layers/outline.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type GenerationPort = Pick<OpsPorts, 'outlineDetailGeneration' | 'workspace'>;

/** I134 candidate commands. The Client stores only review state; Host owns B5. */
export function createOutlineDetailGenerationOps(runtime: OpsRuntime, port: GenerationPort): OutlineDetailGenerationEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const patch = (value: Partial<OutlineDetailGenerationLayerState>): void => act.outlineDetailGenerationPatch(value);
  const namespace = port.outlineDetailGeneration;
  const scopeIdFor = (kind: OutlineDetailGenerationLayerState['scopeKind']): string => {
    if (kind === 'act') return snapshot.outlineEditor.selectedActId ?? '';
    if (kind === 'outline-beat') return snapshot.outlineEditor.selectedBeatId ?? '';
    if (kind === 'bound-chapter') return snapshot.chapters.selectedChapterId ?? '';
    return '';
  };
  const scope = (): OutlineGenerationScopeInput => {
    const state = snapshot.outlineDetailGeneration;
    if (state.scopeKind === 'act') return { kind: 'act', actId: snapshot.outlineEditor.selectedActId ?? '' };
    if (state.scopeKind === 'outline-beat') return { kind: 'outline-beat', beatId: snapshot.outlineEditor.selectedBeatId ?? '' };
    if (state.scopeKind === 'bound-chapter') return { kind: 'bound-chapter', chapterId: snapshot.chapters.selectedChapterId ?? '' };
    return { kind: 'all' };
  };
  const command = (key: string, call: () => Promise<unknown>, onValue: (value: unknown) => void): void => {
    if (!beginOp(key)) return;
    patch({ status: 'acting', message: undefined });
    void unwrap(call()).then((value) => { endOp(key); if (!isActive()) return; onValue(value); }, (cause: Error) => { endOp(key); if (!isActive()) return; patch({ status: 'error', message: toUserMessage(cause) }); });
  };
  return {
    setScopeKind(value) { patch({ scopeKind: value, scopeId: scopeIdFor(value), candidate: undefined, candidateMode: undefined, proposalId: undefined, message: undefined, status: 'idle' }); },
    setScopeId(value) { patch({ scopeId: value, candidate: undefined, proposalId: undefined, message: undefined, status: 'idle' }); },
    setGuidance(value) { patch({ guidance: value, candidate: undefined, candidateMode: undefined, proposalId: undefined, message: undefined, status: 'idle' }); },
    generate() {
      if (namespace === undefined || projectId === undefined) { patch({ status: 'error', message: '细纲生成服务不可用' }); return; }
      if (snapshot.outlineEditor.dirty) { patch({ status: 'error', message: '大纲有未保存修改，请先保存大纲再生成。' }); return; }
      const inputScope = scope();
      if (inputScope.kind !== 'all' && scopeIdFor(inputScope.kind) === '') { patch({ status: 'error', message: '请先选择要生成的当前范围。' }); return; }
      const key = `outline-detail-generation:generate:${projectId}`;
      command(key, () => namespace.generate(projectId, { scope: inputScope }, undefined), (value) => patch({ status: 'ready', candidate: value as OutlineDetailGenerationLayerState['candidate'], candidateMode: 'fill-missing', proposalId: undefined, message: '候选已生成；逐卡编辑或选择操作后提交确认。' }));
    },
    append() {
      if (namespace === undefined || projectId === undefined) { patch({ status: 'error', message: '细纲生成服务不可用' }); return; }
      if (snapshot.outlineEditor.dirty) { patch({ status: 'error', message: '大纲有未保存修改，请先保存大纲再生成。' }); return; }
      const beatId = snapshot.outlineEditor.selectedBeatId;
      const guidance = snapshot.outlineDetailGeneration.guidance.trim();
      if (beatId === undefined) { patch({ status: 'error', message: '请先选择当前节。' }); return; }
      if (guidance === '') { patch({ status: 'error', message: '请填写本次生成要求。' }); return; }
      const key = `outline-detail-generation:append:${projectId}:${beatId}`;
      command(key, () => namespace.append(projectId, { mode: 'append-to-selected-beat', beatId, guidance }, undefined), (value) => patch({ status: 'ready', scopeKind: 'outline-beat', scopeId: beatId, candidate: value as OutlineDetailGenerationLayerState['candidate'], candidateMode: 'append', proposalId: undefined, message: '新候选已生成；逐卡编辑并选择是否保留到当前节。' }));
    },
    edit(detailBeatId: string, value: DetailBeat) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:edit:${detailBeatId}`, () => namespace.edit(projectId, { candidateId, detailBeatId, value }), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], proposalId: undefined, message: undefined }));
    },
    regenerate(detailBeatId: string) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:regenerate:${detailBeatId}`, () => namespace.regenerate(projectId, { candidateId, detailBeatId }, undefined), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], proposalId: undefined, message: '已生成逐卡替代候选；确认前不会改动原卡。' }));
    },
    skip(detailBeatId: string) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:skip:${detailBeatId}`, () => namespace.skip(projectId, { candidateId, detailBeatId }), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], proposalId: undefined, message: undefined }));
    },
    select(detailBeatId: string, keep: boolean) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:select:${detailBeatId}`, () => namespace.select(projectId, { candidateId, detailBeatId, keep }), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], proposalId: undefined, message: undefined }));
    },
    propose() {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:propose:${candidateId}`, () => namespace.propose(projectId, { candidateId }), (result) => { const value = result as { proposalId: string }; patch({ status: 'ready', proposalId: value.proposalId, message: '候选已提交确认门；确认后才会应用。' }); });
    },
    accept() {
      const state = snapshot.outlineDetailGeneration;
      if (namespace === undefined || projectId === undefined || state.proposalId === undefined) return;
      const proposalId = state.proposalId;
      command(`outline-detail-generation:accept:${proposalId}`, () => namespace.accept(projectId, proposalId), (result) => {
        const value = result as { status: string };
        const message = value.status === 'accepted' ? '已确认并应用范围内细纲。' : '该候选此前已应用，未重复写入。';
        if (port.workspace === undefined) { patch({ status: 'error', proposalId: undefined, message: `${message}大纲刷新失败，请重新打开作品。` }); return; }
        patch({ status: 'acting', proposalId: undefined, message: '已应用，正在刷新大纲…' });
        void unwrap(port.workspace.outlineRead(projectId)).then((outline) => {
          if (!isActive()) return;
          const fresh = outline as OutlineShape;
          act.outlineDraft({ draft: { ...fresh }, dirty: false, error: '', saving: false, saveMessage: '已刷新' });
          act.setOutline('ready', fresh);
          patch({ status: 'ready', candidate: undefined, candidateMode: undefined, message });
        }, (cause: Error) => { if (isActive()) patch({ status: 'error', candidate: undefined, candidateMode: undefined, message: `${message}但重新读取失败：${toUserMessage(cause)}` }); });
      });
    },
    reject() {
      const state = snapshot.outlineDetailGeneration;
      if (namespace === undefined || projectId === undefined || state.proposalId === undefined) return;
      const proposalId = state.proposalId;
      command(`outline-detail-generation:reject:${proposalId}`, () => namespace.reject(projectId, proposalId), () => patch({ status: 'ready', proposalId: undefined, message: '已拒绝候选；大纲未写入。' }));
    },
    cancel() {
      const candidate = snapshot.outlineDetailGeneration.candidate;
      if (namespace === undefined || projectId === undefined || candidate === undefined) return;
      const candidateId = candidate.candidateId;
      command(`outline-detail-generation:cancel:${candidateId}`, () => namespace.cancel(projectId, candidateId), () => { act.outlineDetailGenerationReset(); });
    },
  };
}
