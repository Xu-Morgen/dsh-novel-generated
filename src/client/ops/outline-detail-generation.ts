import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import type { OutlineGenerationScopeInput } from '../../core/schema/outline-generation-scope.js';
import type { OutlineDetailGenerationEditOps, OutlineDetailGenerationLayerState } from '../layers/outline-detail-generation.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type GenerationPort = Pick<OpsPorts, 'outlineDetailGeneration'>;

/** I134 candidate commands. The Client stores only review state; Host owns B5. */
export function createOutlineDetailGenerationOps(runtime: OpsRuntime, port: GenerationPort): OutlineDetailGenerationEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const patch = (value: Partial<OutlineDetailGenerationLayerState>): void => act.outlineDetailGenerationPatch(value);
  const namespace = port.outlineDetailGeneration;
  const scope = (): OutlineGenerationScopeInput => {
    const state = snapshot.outlineDetailGeneration;
    if (state.scopeKind === 'act') return { kind: 'act', actId: state.scopeId };
    if (state.scopeKind === 'outline-beat') return { kind: 'outline-beat', beatId: state.scopeId };
    if (state.scopeKind === 'bound-chapter') return { kind: 'bound-chapter', chapterId: state.scopeId };
    return { kind: 'all' };
  };
  const command = (key: string, call: () => Promise<unknown>, onValue: (value: unknown) => void): void => {
    if (!beginOp(key)) return;
    patch({ status: 'acting', message: undefined });
    void unwrap(call()).then((value) => { endOp(key); if (!isActive()) return; onValue(value); }, (cause: Error) => { endOp(key); if (!isActive()) return; patch({ status: 'error', message: toUserMessage(cause) }); });
  };
  return {
    setScopeKind(value) { patch({ scopeKind: value, scopeId: '', candidate: undefined, proposalId: undefined, message: undefined, status: 'idle' }); },
    setScopeId(value) { patch({ scopeId: value, candidate: undefined, proposalId: undefined, message: undefined, status: 'idle' }); },
    generate() {
      if (namespace === undefined || projectId === undefined) { patch({ status: 'error', message: '细纲生成服务不可用' }); return; }
      const key = `outline-detail-generation:generate:${projectId}`;
      command(key, () => namespace.generate(projectId, { scope: scope() }, undefined), (value) => patch({ status: 'ready', candidate: value as OutlineDetailGenerationLayerState['candidate'], proposalId: undefined, message: '候选已生成；逐卡编辑或选择操作后提交确认。' }));
    },
    edit(detailBeatId: string, value: DetailBeat) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:edit:${detailBeatId}`, () => namespace.edit(projectId, { candidateId, detailBeatId, value }), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], message: undefined }));
    },
    regenerate(detailBeatId: string) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:regenerate:${detailBeatId}`, () => namespace.regenerate(projectId, { candidateId, detailBeatId }, undefined), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], message: '已生成逐卡替代候选；确认前不会改动原卡。' }));
    },
    skip(detailBeatId: string) {
      if (namespace === undefined || projectId === undefined || snapshot.outlineDetailGeneration.candidate === undefined) return;
      const candidateId = snapshot.outlineDetailGeneration.candidate.candidateId;
      command(`outline-detail-generation:skip:${detailBeatId}`, () => namespace.skip(projectId, { candidateId, detailBeatId }), (result) => patch({ status: 'ready', candidate: result as OutlineDetailGenerationLayerState['candidate'], message: undefined }));
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
      command(`outline-detail-generation:accept:${proposalId}`, () => namespace.accept(projectId, proposalId), (result) => { const value = result as { status: string }; patch({ status: 'ready', proposalId: undefined, message: value.status === 'accepted' ? '已确认并应用范围内细纲。' : '该候选此前已应用，未重复写入。' }); });
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
