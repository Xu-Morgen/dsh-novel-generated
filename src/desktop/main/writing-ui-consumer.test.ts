import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { KnowledgeRepository } from '../../core/knowledge/index.js';
import { StyleRepository } from '../../core/style/index.js';
import { LLM_BACKEND_MARKER, type GenerationRequest } from '../../llm/port/index.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers } from './project-handlers.js';

it('I191 previews a writing candidate without visiting B1/B4/C3 editors first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-writing-ui-'));
  const disposers: Array<() => void> = [];
  try {
    const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, {
      llm: { [LLM_BACKEND_MARKER]: true, async *stream(request: GenerationRequest) {
        yield { text: request.prompt.includes('检测器') ? '{"violations":[]}' : '米拉在北港找到了钥匙。' };
        yield { done: true };
      } },
      resolveGenerationSettings: async () => ({ modelRef: 'test/model', credentialRef: 'test/managed' }),
      onDispose: (dispose) => disposers.push(dispose),
    });
    const call = (method: string, ...args: unknown[]) => handlers.get(`novel-creation-tool/${method}`)!(...args) as Promise<any>;
    await call('novelWorkspace/projectCreate', { projectId: 'ui', name: '北港' });
    await call('novelWorkspace/projectOpen', 'ui');
    const knowledge = new KnowledgeRepository(join(root, 'library', 'ui'));
    await knowledge.open();
    await knowledge.saveAll([], [{ characterId: 'mira', knows: [] }]);
    const style = new StyleRepository(join(root, 'library', 'ui'));
    await style.open();
    await style.save({ id: 'style', name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
    const { fingerprint } = await call('novelText/fingerprint', 'ui');
    const created = await call('novelText/chapterCreate', 'ui', { id: 'chapter', index: 1, title: '雨夜', pov: 'mira', status: 'draft', expectedFingerprint: fingerprint });
    await call('novelText/sceneCreate', 'ui', { chapterId: 'chapter', index: 0, scene: { id: 'scene', content: '雨落北港。', summary: '北港', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: created.fingerprint });
    const result = await call('novelWriting/propose', 'ui', { intent: 'rewrite', chapterId: 'chapter', sceneId: 'scene', prompt: '缩短文字' });
    expect(await call('novelWriting/preview', result.candidate.id)).toMatchObject({ text: '米拉在北港找到了钥匙。', validation: { status: 'pass' } });
    await expect(call('novelWriting/preview', 'missing')).rejects.toThrow('Unknown candidate');
  } finally { disposers.forEach(dispose => dispose()); await rm(root, { recursive: true, force: true }); }
});
