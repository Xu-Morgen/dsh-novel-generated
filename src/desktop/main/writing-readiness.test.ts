import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopProjectHandlers } from './project-handlers.js';
import { KnowledgeRepository } from '../../core/knowledge/index.js';
import { LLM_BACKEND_MARKER } from '../../llm/port/index.js';
import { toUserMessage } from '../../client/presentation.js';
import { unwrap } from '../../client/shared.js';

it('I205 missing active rules reach the author safely; saving rules restores both writing intents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-i205-'));
  const disposers: Array<() => void> = [];
  let modelCalls = 0;
  let failure: Error | undefined;
  try {
    const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, {
      llm: { [LLM_BACKEND_MARKER]: true, async *stream() { modelCalls++; if (failure) throw failure; yield { text: '雨落北港。' }; yield { done: true }; } },
      resolveGenerationSettings: async () => ({ modelRef: 'test/model', credentialRef: 'test/key' }), onDispose: fn => disposers.push(fn),
    });
    const raw = (method: string, ...args: unknown[]) => handlers.get(`novel-creation-tool/${method}`)!(...args) as Promise<any>;
    const wire = (method: string, ...args: unknown[]) => desktopIpcRegistry.invoke(`novel-creation-tool/${method}`, args, handlers.get(`novel-creation-tool/${method}`));
    await raw('novelWorkspace/projectCreate', { projectId: 'book', name: '测试作品' });
    await raw('novelWorkspace/projectOpen', 'book');
    await raw('novelWorkspace/outlineSave', 'book', { id: 'outline', structure: 'free', logline: '调查', themes: [], acts: [{ id: 'act', index: 0, title: '雨夜', goal: '调查', beats: [{ id: 'beat', title: '调查', description: '寻找线索', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card', title: '线索', summary: '找到线索', pov: 'hero', wordTarget: 100, points: [], status: 'planned' }] }] }], foreshadowing: [], endings: [] });
    await raw('novelRuleStyleManager/saveStyle', 'book', { name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
    const knowledge = new KnowledgeRepository(join(root, 'library/book')); await knowledge.open(); await knowledge.saveAll([], [{ characterId: 'hero', knows: [] }]);
    await writeFile(join(root, 'library/book/outline-progress.yaml'), JSON.stringify({ outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 }));
    const { fingerprint } = await raw('novelText/fingerprint', 'book');
    const created = await raw('novelText/chapterCreate', 'book', { id: 'chapter', index: 1, title: '雨夜', pov: 'hero', status: 'draft', expectedFingerprint: fingerprint });
    const propose = (intent: string) => wire('novelWriting/proposeAt', 'book', { intent, chapterId: 'chapter', sceneId: `new-${intent}` }, undefined);
    const rule = { id: 'rule', scope: 'global', kind: 'genre', statement: '不违背已确定的事实。', priority: 1, immutable: false, examples: [], active: false };
    for (const disabled of [false, true]) {
      if (disabled) await raw('novelRuleStyleManager/createRule', 'book', rule);
      for (const intent of ['continue', 'scene-card']) {
        const result = await propose(intent);
        expect(result).toMatchObject({ ok: false, error: { code: 'handler-failed', message: expect.stringContaining('没有已启用的规则') } });
        const error = await unwrap(Promise.resolve(result)).catch((cause: unknown) => cause);
        expect(toUserMessage(error)).toContain('规则与文风');
        expect(String(error)).toContain('code=handler-failed');
      }
    }
    expect(modelCalls).toBe(0);
    expect((await raw('novelText/fingerprint', 'book')).fingerprint).toBe(created.fingerprint);
    const { id: _id, ...patch } = rule;
    await raw('novelRuleStyleManager/updateRule', 'book', 'rule', { ...patch, active: true });
    for (const intent of ['continue', 'scene-card']) expect(await propose(intent)).toMatchObject({ ok: true });
    expect(modelCalls).toBe(2);
    expect((await raw('novelText/fingerprint', 'book')).fingerprint).toBe(created.fingerprint);
    for (const message of ['Context serializer produced empty section: rules', 'Context serializer produced empty section: rules secret-canary /private/path']) {
      failure = new Error(message);
      const result = await propose('continue');
      expect(result).toMatchObject({ ok: false, error: { message: 'IPC method handler failed' } });
      expect(JSON.stringify(result)).not.toContain('secret-canary');
    }
  } finally { disposers.forEach(fn => fn()); await rm(root, { recursive: true, force: true }); }
});
