import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, flush, mount, READY_MODEL, type FakeNode } from './test-harness.js';
import { WORKFLOW_STAGES, freshWorkflow, readWorkflowResume, workflowStageForView, writeWorkflowResume } from './workflow.js';

afterEach(cleanupClientTestEnv);

describe('I139 作者主流程模型与恢复态', () => {
  it('defines the eight README stages and maps them to existing panel owners', () => {
    expect(WORKFLOW_STAGES.map((stage) => stage.id)).toEqual(['import', 'outline', 'detail', 'baseline', 'prose', 'finalization', 'review', 'export']);
    expect(WORKFLOW_STAGES.map((stage) => stage.view)).toEqual(['onboarding', 'outline', 'outline', 'chapters', 'chapters', 'chapters', 'review', 'importExport']);
    expect(freshWorkflow('book')).toEqual({ projectId: 'book', stage: 'import' });
    expect(workflowStageForView('characters')).toBeUndefined();
    expect(workflowStageForView('outline')).toBe('outline');
    expect(workflowStageForView('chapters')).toBe('prose');
    expect(workflowStageForView('review')).toBe('review');
    expect(workflowStageForView('importExport')).toBe('export');
  });

  it('round-trips only valid project-scoped resume records and ignores corrupt entries', () => {
    const original = (globalThis as { localStorage?: Storage }).localStorage;
    const values = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as unknown as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
    try {
      writeWorkflowResume({ projectId: 'book', stage: 'finalization', chapterId: 'chapter-1', sceneId: 'scene-2' });
      expect(readWorkflowResume('book')).toEqual({ projectId: 'book', stage: 'finalization', chapterId: 'chapter-1', sceneId: 'scene-2' });
      expect(readWorkflowResume('other')).toBeUndefined();
      values.set('novel-creation-tool.workflow.v1', JSON.stringify({
        book: { projectId: 'book', stage: 'unknown' },
        other: { projectId: 'book', stage: 'outline' },
      }));
      expect(readWorkflowResume('book')).toBeUndefined();
      expect(readWorkflowResume('other')).toBeUndefined();
    } finally {
      if (original === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});

describe('I139 创作流程面板与导航恢复', () => {
  it('opens at workflow, exposes eight stages, and routes a stage through its existing owner', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(render().props?.['data-novel-route']).toBe('workflow');
    const panel = () => collect(render(), 'section').find((node) => node.props?.['data-novel-workflow-panel'] !== undefined);
    expect(panel()).toBeDefined();
    expect(collect(panel(), 'li').filter((node) => node.props?.['data-novel-workflow-stage'] !== undefined)).toHaveLength(8);
    expect(collect(panel(), 'button').filter((node) => node.props?.['data-novel-workflow-open-stage'] !== undefined)).toHaveLength(8);

    const detail = collect(panel(), 'button').find((node) => node.props?.['data-novel-workflow-open-stage'] === 'detail');
    (detail?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('outline');
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-workflow-back'] === '')).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workflow-back'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('workflow');
    expect(collect(render(), 'div').find((node) => node.props?.['data-novel-workflow-next'] !== undefined)?.props?.['data-novel-workflow-next']).toBe('detail');
  });

  it('reopens the project at its saved stage and selected scene without exposing technical state', async () => {
    const original = (globalThis as { localStorage?: Storage }).localStorage;
    const values = new Map<string, string>([['novel-creation-tool.workflow.v1', JSON.stringify({
      'fixture-project': { projectId: 'fixture-project', stage: 'finalization', chapterId: 'chapter-1', sceneId: 'scene-2' },
    })]]);
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as unknown as Storage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
    try {
      const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
      await flush();
      const render = () => registrations['shell.overlay'][0].component() as FakeNode;
      expect(render().props?.['data-novel-route']).toBe('workflow');
      const current = collect(render(), 'li').find((node) => node.props?.['data-novel-workflow-stage-state'] === 'current');
      expect(current?.props?.['data-novel-workflow-stage']).toBe('finalization');
      expect(collect(render(), 'section').some((node) => node.props?.['data-novel-workflow-panel'] !== undefined && String(node.children).includes('chapter-1'))).toBe(false);
    } finally {
      if (original === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
      else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
