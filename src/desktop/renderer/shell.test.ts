import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DesktopWorkbenchShell, createDesktopShellUi, mountDesktopWorkbench } from './shell.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';
import type { DesktopProjectWorkflow } from './project-workflow.js';
import type { ImportInterpretationController } from '../../client/import-interpretation-review.js';

function createClient() {
  return createDesktopIpcClient({
    version: 1,
    invoke: async () => ({ ok: false, error: { code: 'handler-unavailable', message: 'fixture', details: {} } }),
    cancel: async () => ({ ok: true, value: undefined }),
    onProgress: () => () => {},
  });
}

describe('I173 desktop Renderer shell', () => {
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
    const workflow = {
      saveSettings: vi.fn(), openProjectFolder: vi.fn(), requestOpen: vi.fn(), requestBrowse: vi.fn(), confirmLeave: vi.fn(),
      cancelLeave: vi.fn(), archiveProject: vi.fn(), restoreProject: vi.fn(), createBlankProject: vi.fn(), createImportedProject: vi.fn(),
      start: vi.fn(), dispose: vi.fn(),
    } as unknown as DesktopProjectWorkflow;
    const ui = createDesktopShellUi(store.getSnapshot(), store.actions, workflow, {
      upload: { uploadFile },
      sourceImport: { normalizeText },
      importInterpretation,
    });

    expect(ui.uploadUsesMainDialog).toBe(true);
    ui.uploadFile();
    ui.submitSourceText();
    expect(uploadFile).toHaveBeenCalledWith(undefined, false, false);
    expect(normalizeText).toHaveBeenCalledTimes(1);
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
