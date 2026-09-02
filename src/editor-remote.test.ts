import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';
import {
  NOVEL_WORKSPACE_NAMESPACE, characterCreateInvocation, characterListInvocation,
  characterCoreInputWireSchema, canonCorrectionInputWireSchema, outlineInputWireSchema,
  editorInvocations, createWorkspaceEditorService, workspaceContribution,
  workspaceRemoteContribution,
} from './remote.js';

describe('I34 B3/B2 Host Remote editor contract', () => {
  it('exports list/read/create/update/rewrite descriptors with JSON-only boundary args', () => {
    expect(editorInvocations.map((item) => `${item.namespace}/${item.method}`)).toEqual([
      'novelWorkspace/characterList', 'novelWorkspace/characterRead', 'novelWorkspace/characterCreate', 'novelWorkspace/characterUpdate',
      'novelWorkspace/worldviewList', 'novelWorkspace/worldviewRead', 'novelWorkspace/worldviewCreate', 'novelWorkspace/worldviewRewrite',
      'novelWorkspace/outlineRead', 'novelWorkspace/outlineSave', 'novelWorkspace/outlineBeatCards',
      'novelWorkspace/relationshipRead', 'novelWorkspace/relationshipSave',
      'novelWorkspace/stateCurrent', 'novelWorkspace/stateSnapshots', 'novelWorkspace/stateRollback', 'novelWorkspace/stateDiff',
      'novelWorkspace/canonQuery', 'novelWorkspace/canonCorrectionPropose', 'novelWorkspace/canonCorrectionAccept',
      'novelWorkspace/chapterList', 'novelWorkspace/chapterRead', 'novelWorkspace/sceneRead',
      'novelWorkspace/sceneEdit', 'novelWorkspace/sceneReparsePropose', 'novelWorkspace/sceneReparseAccept', 'novelWorkspace/sceneReparseReject', 'novelWorkspace/sceneReparsePreview',
    ]);
    expect(characterListInvocation.parameters[0]).toMatchObject({ name: 'projectId', wire: 'projectId', source: 'json' });
    expect(characterCreateInvocation.parameters[1]).toMatchObject({ name: 'input', wire: 'input', source: 'json' });
    expect(editorInvocations.every((item) => item.parameters.every((parameter) => parameter.codec.mode === 'strict'))).toBe(true);
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
    const service = createWorkspaceEditorService({ characters, worldview, outline, relationship, state: characters, canon: characters, confirmation: characters, projects: characters, upload: characters, text: characters, textEdit: characters });
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
    expect(workspaceRemoteContribution.descriptors).toHaveLength(39);
    disposer();
    expect(root.typert.local.get('novelWorkspace/characterCreate')).toBeUndefined();
    await root.fiber.dispose();
  });

  it('I97 expresses the exact write request contract at the wire boundary and rejects invalid requests', () => {
    // 合法请求按精确 wire schema 完整通过（请求/响应与精确 schema 完全一致）。
    const validCharacter = characterCoreInputWireSchema.parse({
      id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师',
      motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    expect(validCharacter.id).toBe('mira');
    // 非法请求（缺必填/多未知字段）在 wire 边界拒绝。
    expect(() => characterCoreInputWireSchema.parse({ id: 'mira', name: '' })).toThrow();
    expect(() => characterCoreInputWireSchema.parse({ ...validCharacter, unexpected: 1 })).toThrow();
    expect(() => canonCorrectionInputWireSchema.parse({ storyTime: 'dawn', summary: 'x' })).toThrow();
    expect(() => outlineInputWireSchema.parse({ id: 'outline' })).toThrow();
    // 写方法 wire 参数携带精确 schema（不再落到通用 #json）。
    for (const method of ['characterCreate', 'characterUpdate', 'worldviewCreate', 'worldviewRewrite', 'outlineSave', 'relationshipSave', 'canonCorrectionPropose']) {
      const descriptor = editorInvocations.find((item) => item.method === method);
      expect(descriptor, `missing ${method}`).toBeDefined();
      const parameters = (descriptor!.parameters as readonly { codec: { typeSymbol: string } }[]);
      expect(parameters[1], `${method} missing input param`).toBeDefined();
      expect(parameters[1].codec.typeSymbol).not.toBe('novel-creation-tool#json');
    }
  });
});
