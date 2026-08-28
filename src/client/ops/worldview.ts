// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// worldview 层编辑动作 = B2 世界观层编辑动作（选择/新建草稿/变更/保存+改写，经 Host worldRewrite 与 Gate；I49 行为等价，I82 拆分）。

import { slug, unwrap } from '../shared.js';
import { worldviewInput as buildWorldviewInput } from '../layers/worldview.js';
import type { WorldEditOps, WorldShape } from '../layers/worldview.js';
import type { OpsContext } from './context.js';

export function createWorldviewOps(ctx: OpsContext): WorldEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  return {
      select: (entry) => act.worldDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '', saving: false, saveMessage: '' }),
      newDraft: () => { const draft: WorldShape = { id: '', kind: 'concept', title: '', content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null }; act.worldDraft({ selectedId: undefined, draft, dirty: false, error: '', saving: false, saveMessage: '' }); },
      mutate: (update) => act.worldMutate(update),
      save: () => {
        const e = snapshot.worldEditor;
        if (e.saving || !beginOp('worldview:save')) return;
        const release = (): void => endOp('worldview:save');
        if (!workspace || projectId === undefined) { release(); act.worldDraft({ error: '创作台远程服务不可用' }); return; }
        if ((e.draft.title ?? '').trim() === '') { release(); act.worldDraft({ error: '标题不能为空' }); return; }
        act.worldDraft({ saving: true, error: '', saveMessage: '' });
        if (e.selectedId === undefined) {
          const effectiveId = slug(e.draft.title ?? 'untitled');
          void unwrap(workspace.worldviewCreate(projectId, buildWorldviewInput({ ...e.draft, id: effectiveId }))).then((created) => { release(); if (!isActive()) return; act.worldDraft({ draft: created as WorldShape, selectedId: (created as WorldShape).id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.worldDraft({ saving: false, saveMessage: '', error: cause.message }); });
        } else {
          const replacementId = slug(e.draft.title ?? e.selectedId);
          void unwrap(workspace.worldviewRewrite(projectId, e.selectedId, buildWorldviewInput({ ...e.draft, id: replacementId }))).then((result) => { release(); if (!isActive()) return; const replacement = (result as { replacement: WorldShape }).replacement; act.worldDraft({ draft: replacement, selectedId: replacement.id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.worldDraft({ saving: false, saveMessage: '', error: cause.message }); });
        }
      },
  };
}
