import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { workbenchSettingsSaveInputSchema, workbenchSettingsViewSchema } from '../../core/schema/workbench-settings.js';

/**
 * 创作台通用设置 Remote：`load` 回显目标字数与询问开关、`save` 落盘到
 * `novel-settings/workbench-settings.yaml`（Host 侧持久化，跨会话生效）；
 * `openProjectFolder` 用平台文件管理器打开作品落地目录（仅返回路径，不读文件内容）。
 */
// I75：`param`/`workbenchSettingsInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
const workbenchSettingsInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor =>
  remoteInvocation('novelWorkbenchSettings', method, parameters, resultSchema);

const openProjectFolderResultSchema = z.object({
  opened: z.boolean(),
  path: z.string(),
}).strict();

export const workbenchSettingsLoadInvocation = workbenchSettingsInvocation('load', [], strictCodec('novel-creation-tool#workbenchSettingsView', workbenchSettingsViewSchema));
export const workbenchSettingsSaveInvocation = workbenchSettingsInvocation('save', [param('input', strictCodec('novel-creation-tool#workbenchSettingsSaveInput', workbenchSettingsSaveInputSchema))], strictCodec('novel-creation-tool#workbenchSettingsView', workbenchSettingsViewSchema));
export const workbenchSettingsOpenFolderInvocation = workbenchSettingsInvocation('openProjectFolder', [param('projectId', strictCodec('novel-creation-tool#projectId', z.string().min(1).max(64)))], strictCodec('novel-creation-tool#openProjectFolderResult', openProjectFolderResultSchema));
export const workbenchSettingsInvocations = [workbenchSettingsLoadInvocation, workbenchSettingsSaveInvocation, workbenchSettingsOpenFolderInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
export const workbenchSettingsRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-workbench-settings', workbenchSettingsInvocations);
