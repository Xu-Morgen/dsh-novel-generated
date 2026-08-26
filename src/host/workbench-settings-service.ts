import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
import { projectDirectory, validateProjectId } from '../core/io/path.js';

/** Host-only persistence filename for 创作台通用设置（与 A2 同目录，非作品数据）。 */
export const WORKBENCH_SETTINGS_FILE = 'workbench-settings.yaml';

/** 平台对应的文件管理器打开命令（Windows 用 explorer，其余 open/xdg-open）。 */
export function platformOpenCommand(): string {
  return process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
}

/** 打开作品落地文件夹的结果。 */
export interface OpenProjectFolderResult {
  readonly opened: boolean;
  readonly path: string;
}

/**
 * 创作台通用设置持久化 owner：每次续写目标字数 + 内容不足时是否询问。
 * 文件缺失/损坏时回退官方默认（500 字、询问开启），save 为读-改-写。
 * `openProjectFolder` 用平台文件管理器打开指定作品的落地目录（仅本机操作，
 * 不读取/不返回任何文件内容）。
 */
export interface NovelWorkbenchSettingsService {
  load(): Promise<WorkbenchSettingsView>;
  save(input: WorkbenchSettingsSaveInput): Promise<WorkbenchSettingsView>;
  openProjectFolder(projectId: string): Promise<OpenProjectFolderResult>;
}

export function createWorkbenchSettingsService(
  settingsRoot: string = join(homedir(), '.dsh', 'novel-settings'),
  projectsRoot: string = join(homedir(), '.dsh', 'novel-projects'),
  open: (directory: string) => void = (directory) => {
    // 分离进程打开文件管理器，不阻塞 Host；失败静默（explorer 无返回值语义）。
    const child = spawn(platformOpenCommand(), [directory], { detached: true, stdio: 'ignore' });
    child.unref();
  },
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
    async openProjectFolder(projectId) {
      validateProjectId(projectId);
      const directory = projectDirectory(projectsRoot, projectId);
      // 目录尚不存在（未初始化）时不误触发打开空路径。
      await access(directory);
      open(directory);
      return Object.freeze({ opened: true, path: directory });
    },
  };
}
