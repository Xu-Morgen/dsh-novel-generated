// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// knowledge 层编辑动作 = I66 知情与揭示管理面 ops（R14-1）：刷新/双视图/选中/提案草稿 + Gate 确认，经 knowledgeNamespace。

import { unwrap } from '../shared.js';
import type { KnowledgeApplyOutcomeShape, KnowledgeEditOps, KnowledgeLayerState, KnowledgeProjectionShape, KnowledgeProposalShape, KnowledgeProposeOutcomeShape, KnowledgeViewId } from '../layers/knowledge.js';
import type { OpsContext } from './context.js';

export function createKnowledgeOps(ctx: OpsContext): KnowledgeEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  const knowledgeNamespace = ctx.knowledgeNamespace;
      const knowledgePatch = (patch: Partial<KnowledgeLayerState>): void => act.knowledgePatch(patch);
      return {
        refresh(): void {
          const target = knowledgeNamespace;
          if (!target || projectId === undefined) { knowledgePatch({ status: 'error', message: '知情与揭示服务不可用' }); return; }
          if (!beginOp('knowledge:refresh')) return;
          const release = (): void => endOp('knowledge:refresh');
          knowledgePatch({ status: 'loading', message: undefined });
          // 投影 + 待确认提案并行读取（都为只读 Remote）。
          void Promise.all([
            unwrap(target.list(projectId)),
            unwrap(target.pending(projectId)),
          ]).then(([projection, pendingList]) => {
            release();
            if (!isActive()) return;
            // I77：pending wire 契约即裸数组（组合根不再包 envelope）。
            const pending = (pendingList as KnowledgeProposalShape[] | undefined) ?? [];
            knowledgePatch({ status: 'ready', projection: projection as KnowledgeProjectionShape, pending, message: undefined });
          }, (cause: Error) => { release(); if (!isActive()) return; knowledgePatch({ status: 'error', message: (cause as Error).message }); });
        },
        setView(view: KnowledgeViewId) { knowledgePatch({ view, selectedEntryId: undefined, draft: { holders: [], status: '', revealAt: '' } }); },
        selectFact(entryId: string) {
          const selected = snapshot.knowledge.selectedEntryId === entryId ? undefined : entryId;
          knowledgePatch({ selectedEntryId: selected, draft: { holders: [], status: '', revealAt: '' }, message: undefined });
        },
        toggleDraftHolder(characterId: string) {
          const holders = snapshot.knowledge.draft.holders;
          knowledgePatch({ draft: { ...snapshot.knowledge.draft, holders: holders.includes(characterId) ? holders.filter((id) => id !== characterId) : [...holders, characterId] } });
        },
        setDraftStatus(value: '' | 'partially-revealed' | 'revealed') { knowledgePatch({ draft: { ...snapshot.knowledge.draft, status: value } }); },
        setDraftRevealAt(value: string) { knowledgePatch({ draft: { ...snapshot.knowledge.draft, revealAt: value } }); },
        propose(kind: 'reveal' | 'holder-add'): void {
          const target = knowledgeNamespace;
          const state = snapshot.knowledge;
          if (!target || projectId === undefined || state.status !== 'ready') return;
          if (state.selectedEntryId === undefined || state.draft.holders.length === 0 || state.acting) return;
          if (!beginOp(`knowledge:propose:${kind}`)) return;
          const release = (): void => endOp(`knowledge:propose:${kind}`);
          const revealAt = state.draft.revealAt.trim();
          const input = kind === 'reveal'
            ? {
              kind,
              entryId: state.selectedEntryId,
              holders: [...state.draft.holders],
              ...(state.draft.status === '' ? {} : { status: state.draft.status }),
              ...(revealAt === '' ? {} : { revealAt }),
            }
            : { kind, entryId: state.selectedEntryId, holders: [...state.draft.holders] };
          knowledgePatch({ acting: true, message: undefined });
          void unwrap(target.propose(projectId, input)).then((outcome) => {
            release();
            if (!isActive()) return;
            const result = outcome as KnowledgeProposeOutcomeShape;
            const names = new Map((state.projection?.characters ?? []).map((character) => [character.characterId, character.name]));
            const addedNames = state.draft.holders.map((id) => names.get(id) ?? id).join('、');
            knowledgePatch({
              acting: false,
              selectedEntryId: undefined,
              draft: { holders: [], status: '', revealAt: '' },
              message: `提案已提交待确认（${result.proposalId}）：${result.kind === 'reveal' ? '揭示' : 'holder 变更'}「${result.preview.fact}」→ 新增知情：${addedNames}。确认后生效（知情只增不退）。`,
            });
            // 刷新待确认提案列表（Gate pending 持久化）。
            void unwrap(target.pending(projectId)).then((pendingList) => {
              if (!isActive()) return;
              knowledgePatch({ pending: (pendingList as KnowledgeProposalShape[] | undefined) ?? [] });
            }, () => undefined);
          }, (cause: Error) => { release(); if (!isActive()) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
        },
        accept(proposalId: string): void {
          const target = knowledgeNamespace;
          if (!target || projectId === undefined || snapshot.knowledge.acting) return;
          if (!beginOp(`knowledge:accept:${proposalId}`)) return;
          const release = (): void => endOp(`knowledge:accept:${proposalId}`);
          knowledgePatch({ acting: true, message: undefined });
          void unwrap(target.accept(projectId, proposalId)).then((outcome) => {
            release();
            if (!isActive()) return;
            const result = outcome as KnowledgeApplyOutcomeShape;
            const pending = snapshot.knowledge.pending.filter((proposal) => proposal.proposalId !== proposalId);
            knowledgePatch({
              acting: false,
              projection: result.projection,
              pending,
              message: result.applied
                ? `已确认并应用揭示 / holder 变更（知情只增不退，已同步 holders 与角色知情状态）。`
                : '该变更此前已生效（幂等确认，未重复写 C3）。',
            });
          }, (cause: Error) => { release(); if (!isActive()) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
        },
        reject(proposalId: string): void {
          const target = knowledgeNamespace;
          if (!target || projectId === undefined || snapshot.knowledge.acting) return;
          if (!beginOp(`knowledge:reject:${proposalId}`)) return;
          const release = (): void => endOp(`knowledge:reject:${proposalId}`);
          knowledgePatch({ acting: true, message: undefined });
          void unwrap(target.reject(projectId, proposalId)).then(() => {
            release();
            if (!isActive()) return;
            knowledgePatch({
              acting: false,
              pending: snapshot.knowledge.pending.filter((proposal) => proposal.proposalId !== proposalId),
              message: `已拒绝提案 ${proposalId}（C3 零写）。`,
            });
          }, (cause: Error) => { release(); if (!isActive()) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
        },
        dismiss() { knowledgePatch({ status: 'idle', projection: undefined, message: undefined, selectedEntryId: undefined, draft: { holders: [], status: '', revealAt: '' }, pending: [], acting: false }); },
      };
}
