import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';

import {
  defaultWorkbenchSettings,
  workbenchSettingsSaveInputSchema,
  workbenchSettingsSchema,
  type WorkbenchSettings,
  type WorkbenchSettingsSaveInput,
  type WorkbenchSettingsView,
} from '../core/schema/workbench-settings.js';

/** Host-only persistence filename for 创作台通用设置（与 A2 同目录，非作品数据）。 */
export const WORKBENCH_SETTINGS_FILE = 'workbench-settings.yaml';

/**
 * 创作台通用设置持久化 owner：每次续写目标字数 + 内容不足时是否询问。
 * 文件缺失/损坏时回退官方默认（500 字、询问开启），save 为读-改-写。
 */
export interface NovelWorkbenchSettingsService {
  load(): Promise<WorkbenchSettingsView>;
  save(input: WorkbenchSettingsSaveInput): Promise<WorkbenchSettingsView>;
}

export function createWorkbenchSettingsService(
  settingsRoot: string = join(homedir(), '.dsh', 'novel-settings'),
): NovelWorkbenchSettingsService {
  const filePath = join(settingsRoot, WORKBENCH_SETTINGS_FILE);

  const read = async (): Promise<WorkbenchSettings> => {
    try {
      const raw = await readFile(filePath, 'utf8');
      return workbenchSettingsSchema.parse(load(raw));
    } catch {
      return defaultWorkbenchSettings();
    }
  };

  return {
    async load() {
      const settings = await read();
      return Object.freeze({ wordTarget: settings.wordTarget, askWhenThin: settings.askWhenThin });
    },
    async save(input) {
      const parsed = workbenchSettingsSaveInputSchema.parse(input);
      const next: WorkbenchSettings = { version: 1, wordTarget: parsed.wordTarget, askWhenThin: parsed.askWhenThin };
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, dump(next, { noRefs: true, lineWidth: 120 }), 'utf8');
      return Object.freeze({ wordTarget: next.wordTarget, askWhenThin: next.askWhenThin });
    },
  };
}
