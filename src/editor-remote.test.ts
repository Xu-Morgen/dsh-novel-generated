import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';
import {
  NOVEL_WORKSPACE_NAMESPACE, characterCreateInvocation, characterListInvocation,
  editorInvocations, createWorkspaceEditorService, workspaceContribution,
  workspaceRemoteContribution,
} from './remote.js';

describe('I34 B3/B2 Host Remote editor contract', () => {
  it('exports list/read/create/update/rewrite descriptors with JSON-only boundary args', () => {
    expect(editorInvocations.map((item) => `${item.namespace}/${item.method}`)).toEqual([
      'novelCharacter/list', 'novelCharacter/read', 'novelCharacter/create', 'novelCharacter/update',
      'novelWorldview/list', 'novelWorldview/read', 'novelWorldview/create', 'novelWorldview/rewrite',
      'novelOutline/read', 'novelOutline/save', 'novelOutline/beatCards',
      'novelRelationship/read', 'novelRelationship/save',
      'novelState/current', 'novelState/snapshots', 'novelState/rollback', 'novelState/diff',
      'novelCanon/query', 'novelCanon/correctionPropose', 'novelCanon/correctionAccept',
    ]);
    expect(characterListInvocation.parameters[0]).toMatchObject({ name: 'projectId', wire: 'projectId', source: 'json' });
    expect(characterCreateInvocation.parameters[1]).toMatchObject({ name: 'input', wire: 'input', source: 'json' });
    expect(editorInvocations.every((item) => item.parameters.every((parameter) => parameter.codec.mode === 'src-json'))).toBe(true);
  });

  it('forwards every editor operation to the existing Host services', async () => {
    const calls: string[] = [];
    const characters = {
      list: async (projectId: string) => { calls.push(`character:list:${projectId}`); return []; },
      read: async () => ({ id: 'mara' }), create: async () => ({ id: 'mara' }), update: async () => ({ id: 'mara' }),
    } as any;
    const worldview = {
      list: async (projectId: string) => { calls.push(`world:list:${projectId}`); return []; },
      read: async () => ({ id: 'realm' }), create: async () => ({ id: 'realm' }), rewrite: async () => ({ superseded: {}, replacement: {} }),
    } as any;
    const outline = { read: async () => ({}), save: async () => ({}), beatCards: async () => [] } as any;
    const relationship = { read: async () => [], save: async () => ({}) } as any;
    const service = createWorkspaceEditorService(characters, worldview, outline, relationship);
    await service.characterList('book');
    await service.characterRead('book', 'mara');
    await service.characterCreate('book', {} as any);
    await service.characterUpdate('book', 'mara', {} as any);
    await service.worldviewList('book');
    await service.worldviewRead('book', 'realm');
    await service.worldviewCreate('book', {} as any);
    await service.worldviewRewrite('book', 'realm', {} as any);
    await service.outlineRead('book');
    await service.outlineSave('book', {} as any);
    await service.outlineBeatCards('book');
    await service.relationshipRead('book');
    await service.relationshipSave('book', {} as any);
    expect(calls).toEqual(['character:list:book', 'world:list:book']);
  });

  it('registers and withdraws the full contribution with the Fiber', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);
    const disposer = root.typert.register(workspaceContribution);
    expect(root.typert.local.get(`${NOVEL_WORKSPACE_NAMESPACE}/viewModel`)).toBeDefined();
    expect(workspaceRemoteContribution.descriptors).toHaveLength(21);
    disposer();
    expect(root.typert.local.get('novelCharacter/create')).toBeUndefined();
    await root.fiber.dispose();
  });
});
