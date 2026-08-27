// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// canon 层编辑动作 = C4 正史层编辑动作（更正提案/接受，经 Host canonCorrection；I49 行为等价，I82 拆分）。

import { unwrap } from '../shared.js';
import { canonCorrectionInput as buildCanonCorrectionInput } from '../layers/canon.js';
import type { CanonEditOps } from '../layers/canon.js';
import type { OpsContext } from './context.js';

export function createCanonOps(ctx: OpsContext): CanonEditOps {
  const { act, snapshot, beginOp, endOp, active } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  return {
      select: (event) => act.canonDraft({ selectedId: event.id, proposalId: undefined, draft: { storyTime: event.storyTime, summary: event.summary, detail: event.detail ?? '' }, dirty: false, error: '', saving: false, saveMessage: '' }),
      mutate: (update) => act.canonDraft({ draft: update(snapshot.canonEditor.draft), dirty: true }),
      propose: () => {
        const e = snapshot.canonEditor;
        if (e.saving || !beginOp('canon:propose')) return;
        const release = (): void => endOp('canon:propose');
        if (!workspace || projectId === undefined) { release(); act.canonDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.selectedId === undefined) { release(); act.canonDraft({ error: '请先选择一个正史事件再发起更正' }); return; }
        if ((e.draft.summary ?? '').trim() === '') { release(); act.canonDraft({ error: '更正摘要不能为空' }); return; }
        act.canonDraft({ saving: true, saveMessage: '', error: '' });
        void unwrap(workspace.canonCorrectionPropose(projectId, e.selectedId, buildCanonCorrectionInput(e.draft))).then((proposal) => { release(); if (!active) return; act.canonDraft({ proposalId: (proposal as { id?: string }).id, saving: false, saveMessage: '更正提案已发起', error: '' }); }, (cause: Error) => { release(); act.canonDraft({ saving: false, saveMessage: '', error: cause.message }); });
      },
      accept: () => {
        const e = snapshot.canonEditor;
        if (e.saving || !beginOp('canon:accept')) return;
        const release = (): void => endOp('canon:accept');
        if (!workspace || projectId === undefined) { release(); act.canonDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.proposalId === undefined) { release(); act.canonDraft({ error: '请先发起更正提案' }); return; }
        act.canonDraft({ saving: true, saveMessage: '', error: '' });
        void unwrap(workspace.canonCorrectionAccept(projectId, e.proposalId)).then(() => { release(); if (!active) return; act.canonDraft({ proposalId: undefined, dirty: false, saving: false, saveMessage: '已确认更正', error: '' }); void unwrap(workspace!.canonQuery(projectId, undefined)).then((events) => act.setCanon('ready', events as unknown[]), (cause: Error) => { act.setCanon('error', [], cause.message); act.canonDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.canonDraft({ saving: false, saveMessage: '', error: cause.message }); });
      },
  };
}
