import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import type { NovelOutlineService } from './outline-service.js';
import {
  sceneOutlineBindingImpactInvocation,
  sceneOutlineBindingInvocations,
  sceneOutlineBindingReadInvocation,
  sceneOutlineBindingSaveInvocation,
} from './remote/scene-outline-binding.js';
import type { MethodSpecFor } from './remote/shared.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextService } from './text-service.js';

const invalidBindingReadSpec: MethodSpecFor<typeof sceneOutlineBindingReadInvocation> = {
  method: 'read',
  // @ts-expect-error binding Remote result requires bounded manual/effective arrays and fingerprint
  call: async () => ({ bindings: [] }),
};
void invalidBindingReadSpec;

describe('I105 SceneOutlineBinding Remote', () => {
  it('keeps strict additive descriptors and rejects malformed input/result projections', () => {
    expect(sceneOutlineBindingInvocations.map((descriptor) => `${descriptor.service}/${descriptor.method}`)).toEqual([
      'novelSceneOutlineBinding/read', 'novelSceneOutlineBinding/save', 'novelSceneOutlineBinding/rebind',
      'novelSceneOutlineBinding/unbind', 'novelSceneOutlineBinding/impact',
    ]);
    const inputSchema = sceneOutlineBindingSaveInvocation.parameters[1].codec.schema;
    expect(() => inputSchema.parse({ sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: 'a'.repeat(64), extra: true })).toThrow();
    expect(() => sceneOutlineBindingReadInvocation.result.schema.parse({ manual: [], effective: [], fingerprint: 'bad' })).toThrow();
    expect(() => sceneOutlineBindingReadInvocation.result.schema.parse({ manual: [], effective: [], fingerprint: 'a'.repeat(64), liveService: {} })).toThrow();

    const impactSchema = sceneOutlineBindingImpactInvocation.result.schema;
    const fingerprint = 'a'.repeat(64);
    expect(() => impactSchema.parse({ kind: 'scene', chapterId: 'chapter-a', bindings: [], fingerprint })).toThrow();
    expect(() => impactSchema.parse({ kind: 'chapter', chapterId: 'chapter-a', sceneId: 'scene-a', bindings: [], fingerprint })).toThrow();
    expect(impactSchema.parse({ kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a', bindings: [], fingerprint })).toEqual({
      kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a', bindings: [], fingerprint,
    });
    expect(impactSchema.parse({ kind: 'chapter', chapterId: 'chapter-a', bindings: [], fingerprint })).toEqual({
      kind: 'chapter', chapterId: 'chapter-a', bindings: [], fingerprint,
    });
  });

  it('registers one real Host receiver and consumes the descriptor-shaped result', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-binding-remote-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot });
    const text = root.get('novelText') as NovelTextService;
    const outline = root.get('novelOutline') as NovelOutlineService;
    const binding = root.get('novelSceneOutlineBinding') as NovelSceneOutlineBindingService & { typertRemote: { serviceKey: string; namespace: string } };
    await text.open('project');
    await outline.open('project');
    await text.createChapter('project', { id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft' });
    await text.appendScene('project', 'chapter-a', { id: 'scene-a', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
    await outline.save('project', {
      id: 'outline', structure: 'free', logline: 'Remote.', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-a', index: 0, title: 'Act', goal: 'Bind.', beats: [{ id: 'beat-a', title: 'Beat', description: 'Bind.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card-a', title: 'Card', summary: 'Card.', pov: 'hero', wordTarget: 10, points: [], status: 'planned' }] }] }],
    });

    expect(binding.typertRemote).toMatchObject({ serviceKey: 'novelSceneOutlineBinding', namespace: 'novelSceneOutlineBinding' });
    const initial = await binding.read('project');
    const saved = await binding.save('project', { sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: initial.fingerprint });
    expect(sceneOutlineBindingReadInvocation.result.schema.parse(saved)).toEqual(saved);

    await fiber.dispose();
    expect(root.get('novelSceneOutlineBinding', false)).toBeUndefined();
    await rm(projectsRoot, { recursive: true, force: true });
  });
});
