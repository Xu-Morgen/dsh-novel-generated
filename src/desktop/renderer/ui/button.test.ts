import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button.js';
import { DesktopAssistantPanel } from '../assistant-panel.js';
import { createDesktopAssistantClient } from '../assistant-client.js';
import { createDesktopIpcClient } from '../desktop-ipc-client.js';
import { WORKBENCH_STYLES } from '../../../client/styles.js';

describe('I188 shared controls consumed outside workbench', () => {
  it('preserves native anchors, names and disabled reason on a busy primary action', () => {
    const markup = renderToStaticMarkup(React.createElement(Button, {
      variant: 'primary', busy: true, busyLabel: '正在保存作品', 'data-novel-save': '',
    }, '保存作品'));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-novel-save=""');
    expect(markup).toContain('>保存作品</button>');
    expect(markup).toContain('正在保存作品');
    expect(markup).toContain('aria-describedby=');
    expect(markup).not.toContain('busyLabel=');
    expect(markup).not.toContain('disabledReason=');
  });

  it('defaults to a non-submitting secondary button and keeps caller descriptions', () => {
    const markup = renderToStaticMarkup(React.createElement(Button, {
      disabled: true, disabledReason: '请先选择场景', 'aria-describedby': 'scene-context',
    }, '生成候选'));
    expect(markup).toContain('type="button"');
    expect(markup).toContain('nv-btn--secondary');
    expect(markup).toContain('aria-describedby="scene-context ');
    expect(markup).toContain('请先选择场景');
  });

  it('renders the existing assistant through shared native buttons without a workbench ancestor', () => {
    const ipc = createDesktopIpcClient({ version: 1,
      invoke: async () => ({ ok: false, error: { code: 'handler-unavailable', message: 'fixture', details: {} } }),
      cancel: async () => ({ ok: true, value: undefined }), onProgress: () => () => {},
    });
    const markup = renderToStaticMarkup(React.createElement(DesktopAssistantPanel, {
      client: createDesktopAssistantClient(ipc), projectId: 'fixture',
    }));
    expect(markup).not.toContain('class="nv-workbench"');
    expect(markup).toContain('data-novel-assistant-continue=""');
    expect(markup).toContain('nv-btn nv-btn--primary');
  });

  it('provides one complete root palette and one shared button owner without retired theme dependencies', () => {
    expect(WORKBENCH_STYLES).toContain(':root, .nv-workbench');
    expect(WORKBENCH_STYLES).toContain('--nv-paper: #F4F1EA');
    expect(WORKBENCH_STYLES.match(/(?:^|, )\.nv-btn \{/gm)).toHaveLength(1);
    expect(WORKBENCH_STYLES).not.toMatch(/var\(--dsw-|body\[data-ds-dark-theme\]|@import|@font-face|url\(https?:/);
    expect(WORKBENCH_STYLES).toContain('outline: 2px solid var(--nv-cinnabar)');
  });
});
