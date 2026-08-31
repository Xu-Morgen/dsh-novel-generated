// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// characters 层编辑动作 = B3 角色层编辑动作（选择/新建草稿/变更/保存，全部经 store actions 写回；I47/I49 行为等价，I82 拆分）。

import { slug, unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { characterCreateInput as buildCharacterCreateInput } from '../layers/characters.js';
import type { CharacterEditOps, CharacterShape } from '../layers/characters.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type CharactersPort = Pick<OpsPorts, 'workspace'>;

export function createCharactersOps(runtime: OpsRuntime, port: CharactersPort): CharacterEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const workspace = port.workspace;
  return {
      select: (character) => act.characterDraft({ selectedId: character.id, draft: { ...character }, dirty: false, error: '', saving: false, saveMessage: '' }),
      newDraft: () => { const draft: CharacterShape = { id: '', name: '', kind: 'extra', aliases: [], personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }; act.characterDraft({ selectedId: undefined, draft, dirty: false, error: '', saving: false, saveMessage: '' }); },
      mutate: (update) => act.characterMutate(update),
      save: () => {
        const e = snapshot.characterEditor;
        // I59：saving 忙碌挡 + 同 tick 连点 inflight 挡（R12-6 至多一次 Remote）。
        if (e.saving || !beginOp('characters:save')) return;
        const release = (): void => endOp('characters:save');
        if (!workspace || projectId === undefined) { release(); act.characterDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.draft.name.trim() === '') { release(); act.characterDraft({ error: '角色名不能为空' }); return; }
        const effectiveId = e.selectedId ?? slug(e.draft.name);
        act.characterDraft({ saving: true, error: '', saveMessage: '' });
        if (e.selectedId === undefined) {
          void unwrap(workspace.characterCreate(projectId, buildCharacterCreateInput({ ...e.draft, id: effectiveId }))).then((created) => { release(); if (!isActive()) return; const shape = created as CharacterShape; act.characterDraft({ draft: shape, selectedId: shape.id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { const message = toUserMessage(cause); act.setCharacters('error', [], message); act.characterDraft({ error: message }); }); }, (cause: Error) => { release(); act.characterDraft({ saving: false, saveMessage: '', error: toUserMessage(cause) }); });
        } else {
          void unwrap(workspace.characterUpdate(projectId, e.selectedId, buildCharacterCreateInput({ ...e.draft, id: e.selectedId }))).then((updated) => { release(); if (!isActive()) return; act.characterDraft({ draft: { ...(updated as CharacterShape) }, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { const message = toUserMessage(cause); act.setCharacters('error', [], message); act.characterDraft({ error: message }); }); }, (cause: Error) => { release(); act.characterDraft({ saving: false, saveMessage: '', error: toUserMessage(cause) }); });
        }
      },
  };
}
