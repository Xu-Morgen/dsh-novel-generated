// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// relationship 层编辑动作 = C1 关系层编辑动作（选择/新建草稿/变更/保存，经 Host relationshipSave；I49 行为等价，I82 拆分）。

import { slug, unwrap } from '../shared.js';
import { relationshipInput as buildRelationshipInput } from '../layers/relationship.js';
import type { RelationshipEditOps, RelationshipShape } from '../layers/relationship.js';
import { freshRelationshipEditor } from '../store/index.js';
import type { OpsContext } from './context.js';

export function createRelationshipOps(ctx: OpsContext): RelationshipEditOps {
  const { act, snapshot, beginOp, endOp, active } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  return {
      select: (entry) => act.relationshipDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '', saving: false, saveMessage: '' }),
      newDraft: () => act.relationshipDraft({ selectedId: undefined, draft: freshRelationshipEditor().draft, dirty: false, error: '', saving: false, saveMessage: '' }),
      mutate: (update) => act.relationshipMutate(update),
      save: () => {
        const e = snapshot.relationshipEditor;
        if (e.saving || !beginOp('relationship:save')) return;
        const release = (): void => endOp('relationship:save');
        if (!workspace || projectId === undefined) { release(); act.relationshipDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.draft.from.trim() === '' || e.draft.to.trim() === '') { release(); act.relationshipDraft({ error: '关系两端（from/to）不能为空' }); return; }
        const effectiveId = e.selectedId ?? `${slug(e.draft.from)}+${slug(e.draft.to)}`;
        act.relationshipDraft({ saving: true, error: '', saveMessage: '' });
        void unwrap(workspace.relationshipSave(projectId, buildRelationshipInput({ ...e.draft, id: effectiveId }))).then((saved) => { release(); if (!active) return; act.relationshipDraft({ draft: { ...(saved as RelationshipShape) }, selectedId: (saved as RelationshipShape).id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.relationshipRead(projectId)).then((list) => act.setRelationship('ready', list as unknown[]), (cause: Error) => { act.setRelationship('error', [], cause.message); act.relationshipDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.relationshipDraft({ saving: false, saveMessage: '', error: cause.message }); });
      },
  };
}
