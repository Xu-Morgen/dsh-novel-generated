import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createWorkbenchSettingsService, WORKBENCH_SETTINGS_FILE } from './workbench-settings-service.js';

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'novel-workbench-settings-'));
}

describe('创作台通用设置（workbench-settings）', () => {
  it('returns official defaults when the file is missing, and persists on save', async () => {
    const root = await makeRoot();
    const service = createWorkbenchSettingsService(root);
    try {
      await expect(service.load()).resolves.toEqual({ wordTarget: 500, askWhenThin: true });
      await expect(service.save({ wordTarget: 1200, askWhenThin: false })).resolves.toEqual({ wordTarget: 1200, askWhenThin: false });
      // 落盘到文件，重启后（新实例）仍可读回。
      const reopened = createWorkbenchSettingsService(root);
      await expect(reopened.load()).resolves.toEqual({ wordTarget: 1200, askWhenThin: false });
      expect(join(root, WORKBENCH_SETTINGS_FILE)).toContain('workbench-settings.yaml');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects out-of-range word targets', async () => {
    const root = await makeRoot();
    const service = createWorkbenchSettingsService(root);
    try {
      await expect(service.save({ wordTarget: 50, askWhenThin: true })).rejects.toThrow();
      await expect(service.save({ wordTarget: 2_000_000, askWhenThin: true })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
