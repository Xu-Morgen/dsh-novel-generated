import { describe, expect, it, vi } from 'vitest';

import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import type { NovelAgentService } from '../../host/novel-agent-service.js';
import { createDesktopAssistantCommandRegistry } from './assistant-command-registry.js';

const layers = { characters: 'empty', worldview: 'empty', outline: 'empty', relationship: 'empty', state: 'ready', canon: 'empty' } as const;
const openResult = { project: { id: 'demo', version: 1, name: '演示作品' }, layers };
const statusResult = {
  projectId: 'demo', layers, characters: 1, worldview: 2, relationships: 3, canonEvents: 4, scenes: 5,
  outlineReady: true, creation: { wordTarget: 800, askWhenThin: true },
};
const contextResult = {
  projectId: 'demo',
  navigation: { actId: 'act-1', beatId: 'beat-1', title: '开场', description: '开始', prerequisites: [], prerequisitesMet: true, instruction: '开始', deviationIds: [] },
  card: { id: 'card-1', title: '第一幕', summary: '开场', pov: 'hero', wordTarget: 800, points: ['冲突'], status: 'planned' as const },
  sources: { context: { sources: { characters: [{ id: 'hero' }], worldview: [{ id: 'world' }] } }, canon: [{ id: 'event' }] },
  recentScenes: 2,
  creation: { wordTarget: 800, askWhenThin: true },
};
const candidate = { id: 'candidate-1', intent: 'continue' as const, text: '她推开门。', target: { projectId: 'demo', chapterId: 'chapter-1', sceneId: 'scene-1' } };

function fakeService() {
  return {
    open: vi.fn(async () => openResult),
    listProjects: vi.fn(async () => [{ id: 'demo', name: '演示作品' }]),
    status: vi.fn(async () => statusResult),
    context: vi.fn(async () => contextResult),
    proposeContinue: vi.fn(async () => ({ candidate })),
    adjudicate: vi.fn(async () => ({ status: 'rejected' as const, candidateId: candidate.id })),
    inspire: vi.fn(async () => ({ directions: [
      { id: 'one', title: '方向一', premise: '先行', changes: { outlineNote: '保留', progressNote: '推进' }, rationale: '稳妥' },
      { id: 'two', title: '方向二', premise: '转折', changes: { outlineNote: '转向', progressNote: '调整' }, rationale: '激进' },
    ] })),
  } as unknown as NovelAgentService;
}

describe('I181 Main desktop assistant command registry', () => {
  it('projects the former open/status/context/continue/inspire commands through one service', async () => {
    const service = fakeService();
    const handlers = createDesktopAssistantCommandRegistry(service);

    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/open', ['demo'], handlers.get('novel-creation-tool/novelAssistant/open')))
      .resolves.toEqual({ ok: true, value: openResult });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/status', [undefined], handlers.get('novel-creation-tool/novelAssistant/status')))
      .resolves.toEqual({ ok: true, value: { projects: [{ id: 'demo', name: '演示作品' }] } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/context', ['demo'], handlers.get('novel-creation-tool/novelAssistant/context')))
      .resolves.toMatchObject({ ok: true, value: { projectId: 'demo', recentScenes: 2, characters: 1, worldview: 1, canon: 1 } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/continue', ['demo', undefined, undefined], handlers.get('novel-creation-tool/novelAssistant/continue')))
      .resolves.toEqual({ ok: true, value: { candidateId: 'candidate-1', intent: 'continue', text: '她推开门。', target: candidate.target } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/inspire', ['demo'], handlers.get('novel-creation-tool/novelAssistant/inspire')))
      .resolves.toMatchObject({ ok: true, value: { directions: [{ id: 'one' }, { id: 'two' }] } });
    expect(service.open).toHaveBeenCalledWith('demo');
    expect(service.context).toHaveBeenCalledWith('demo');
    expect(service.proposeContinue).toHaveBeenCalledWith('demo', undefined);
  });

  it('rejects unknown, malformed, and cross-field commands before domain execution', async () => {
    const service = fakeService();
    const handlers = createDesktopAssistantCommandRegistry(service);
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/missing', [], handlers.get('novel-creation-tool/novelAssistant/missing')))
      .resolves.toMatchObject({ ok: false, error: { code: 'unknown-method' } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/open', [undefined], handlers.get('novel-creation-tool/novelAssistant/open')))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/adjudicate', ['candidate-1', 'accept-now'], handlers.get('novel-creation-tool/novelAssistant/adjudicate')))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelAssistant/continue', ['demo', 'chapter-1', undefined], handlers.get('novel-creation-tool/novelAssistant/continue')))
      .resolves.toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(service.proposeContinue).not.toHaveBeenCalled();
  });
});
