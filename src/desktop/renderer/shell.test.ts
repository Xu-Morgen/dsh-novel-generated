import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DesktopLlmStreamWindow, DesktopWorkbenchShell, createDesktopShellUi, desktopRuleStyleStream, mountDesktopWorkbench } from './shell.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';
import type { DesktopProjectWorkflow } from './project-workflow.js';
import type { ImportInterpretationController } from '../../client/import-interpretation-review.js';
import type { SettingsController } from '../../client/controllers.js';

function createClient() {
  return createDesktopIpcClient({
    version: 1,
    invoke: async () => ({ ok: false, error: { code: 'handler-unavailable', message: 'fixture', details: {} } }),
    cancel: async () => ({ ok: true, value: undefined }),
    onProgress: () => () => {},
  });
}

describe('I173 desktop Renderer shell', () => {
  it('accepts only bounded rule/style stream progress from the canonical begin method', () => {
    expect(desktopRuleStyleStream({
      requestId: 'desktop:4',
      methodId: 'novel-creation-tool/novelRuleStyleImportInitialization/begin',
      value: { phase: 'ruleStyleImportInitialization.begin', status: 'running', streamPhase: 'generating', receivedCharacters: 42, latestText: '{"rules":[' },
    })).toEqual({ phase: 'generating', receivedCharacters: 42, latestText: '{"rules":[' });
    expect(desktopRuleStyleStream({
      requestId: 'desktop:5', methodId: 'another-method', value: { streamPhase: 'generating', receivedCharacters: 42, latestText: 'ignored' },
    })).toBeUndefined();
    expect(desktopRuleStyleStream({
      requestId: 'desktop:6', methodId: 'novel-creation-tool/novelRuleStyleImportInitialization/begin', value: { streamPhase: 'generating', receivedCharacters: 42, latestText: 'x'.repeat(241) },
    })).toBeUndefined();

    const active = renderToStaticMarkup(React.createElement(DesktopLlmStreamWindow, { progress: {
      requestId: 'desktop:7', methodId: 'novel-creation-tool/novelRuleStyleImportInitialization/begin',
      value: { status: 'running', streamPhase: 'generating', receivedCharacters: 42, latestText: '{"rules":[' },
    } }));
    expect(active).toContain('data-novel-llm-stream-window="generating"');
    expect(active).toContain('流式接收中 · 42 字');
    const completed = renderToStaticMarkup(React.createElement(DesktopLlmStreamWindow, { progress: {
      requestId: 'desktop:7', methodId: 'novel-creation-tool/novelRuleStyleImportInitialization/begin',
      value: { phase: 'ruleStyleImportInitialization.begin', status: 'complete' },
    } }));
    expect(completed).toBe('');
  });

  it('mounts the existing Chinese workbench presenter inside the single desktop shell', () => {
    const store = createDesktopWorkbenchStore();
    const client = createClient();
    const markup = renderToStaticMarkup(React.createElement(DesktopWorkbenchShell, { store, client }));

    expect(markup).toContain('data-novel-desktop-root="true"');
    expect(markup).toContain('data-novel-connection-status="ready"');
    expect(markup).toContain('data-novel-workspace="loading"');
    expect(markup).toContain('创作台');
    expect(markup).toContain('正在装载创作台');
    expect(markup).toContain('data-novel-workbench="desktop-styles"');
    expect(markup).toContain('data-novel-migration=""');
    expect(markup).not.toContain('Electron 桌面骨架已启动');
  });

  it('routes the desktop source entry to Main-dialog controllers', () => {
    const store = createDesktopWorkbenchStore();
    const uploadFile = vi.fn();
    const normalizeText = vi.fn();
    const importInterpretation = Object.fromEntries([
      'begin', 'retry', 'cancel', 'confirm', 'setSourceRole', 'setTreatment', 'setNarrativeIntent',
      'setParagraphRole', 'setParagraphDecision', 'splitParagraph', 'mergeParagraphWithNext',
      'setRuleStyleRulesDraft', 'setRuleStyleStyleDraft', 'retryRuleStyleInitialization',
      'proposeRuleStyleInitialization', 'acceptRuleStyleInitialization', 'rejectRuleStyleInitialization', 'dispose',
    ].map((name) => [name, vi.fn()])) as unknown as ImportInterpretationController;
    const settings = Object.fromEntries([
      'ensureLlmConfigLoaded', 'saveLlmConfig', 'ensureCreationSettingsLoaded', 'saveCreationSettings', 'openProjectFolder',
    ].map((name) => [name, vi.fn()])) as unknown as SettingsController;
    const workflow = {
      saveSettings: vi.fn(), openProjectFolder: vi.fn(), requestOpen: vi.fn(), requestBrowse: vi.fn(), confirmLeave: vi.fn(),
      cancelLeave: vi.fn(), archiveProject: vi.fn(), restoreProject: vi.fn(), createBlankProject: vi.fn(), createImportedProject: vi.fn(),
      start: vi.fn(), dispose: vi.fn(),
    } as unknown as DesktopProjectWorkflow;
    const ui = createDesktopShellUi(store.getSnapshot(), store.actions, workflow, {
      upload: { uploadFile },
      sourceImport: { normalizeText },
      importInterpretation,
      settings,
    });

    expect(ui.uploadUsesMainDialog).toBe(true);
    ui.uploadFile();
    ui.submitSourceText();
    expect(uploadFile).toHaveBeenCalledWith(undefined, false, false);
    expect(normalizeText).toHaveBeenCalledTimes(1);
  });

  it('loads, renders, and saves AI settings through the desktop settings controller', () => {
    const store = createDesktopWorkbenchStore();
    const workflow = {
      saveSettings: vi.fn(), openProjectFolder: vi.fn(), requestOpen: vi.fn(), requestBrowse: vi.fn(), confirmLeave: vi.fn(),
      cancelLeave: vi.fn(), archiveProject: vi.fn(), restoreProject: vi.fn(), createBlankProject: vi.fn(), createImportedProject: vi.fn(),
      start: vi.fn(), dispose: vi.fn(),
    } as unknown as DesktopProjectWorkflow;
    const settings = Object.fromEntries([
      'ensureLlmConfigLoaded', 'saveLlmConfig', 'ensureCreationSettingsLoaded', 'saveCreationSettings', 'openProjectFolder',
    ].map((name) => [name, vi.fn()])) as unknown as SettingsController;
    const controllers = {
      upload: { uploadFile: vi.fn() },
      sourceImport: { normalizeText: vi.fn() },
      importInterpretation: { dispose: vi.fn() } as unknown as ImportInterpretationController,
      settings,
    };

    createDesktopShellUi(store.getSnapshot(), store.actions, workflow, controllers).activateView('settings');
    expect(store.getSnapshot().activeView).toBe('settings');
    expect(settings.ensureLlmConfigLoaded).toHaveBeenCalledWith(true);

    store.actions.settingsLoaded({
      providerId: 'custom', baseUrl: 'https://example.test/v1', model: 'novel-model', hasKey: true,
      maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high',
    });
    createDesktopShellUi(store.getSnapshot(), store.actions, workflow, controllers).saveLlmConfig();
    expect(settings.saveLlmConfig).toHaveBeenCalledWith(store.getSnapshot().settingsDraft, true);
  });

  it('routes workflow stage actions to the matching page and keeps direct page navigation in sync', () => {
    const store = createDesktopWorkbenchStore();
    const workflow = {
      saveSettings: vi.fn(), openProjectFolder: vi.fn(), requestOpen: vi.fn(), requestBrowse: vi.fn(), confirmLeave: vi.fn(),
      cancelLeave: vi.fn(), archiveProject: vi.fn(), restoreProject: vi.fn(), createBlankProject: vi.fn(), createImportedProject: vi.fn(),
      start: vi.fn(), dispose: vi.fn(),
    } as unknown as DesktopProjectWorkflow;
    store.actions.selectProject('book', '测试作品');

    createDesktopShellUi(store.getSnapshot(), store.actions, workflow).openWorkflowStage('import');
    expect(store.getSnapshot().workflow.stage).toBe('import');
    expect(store.getSnapshot().activeView).toBe('onboarding');

    createDesktopShellUi(store.getSnapshot(), store.actions, workflow).activateView('outline');
    expect(store.getSnapshot().workflow.stage).toBe('outline');
    expect(store.getSnapshot().activeView).toBe('outline');
  });

  it('binds root and store to one idempotent unmount disposer', () => {
    const store = createDesktopWorkbenchStore();
    const client = createClient();
    const render = vi.fn();
    const unmount = vi.fn();
    const listener = vi.fn();
    store.subscribe(listener);

    const dispose = mountDesktopWorkbench({ render, unmount }, store, client);
    expect(render).toHaveBeenCalledTimes(1);

    dispose();
    dispose();
    store.actions.collapse();

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
