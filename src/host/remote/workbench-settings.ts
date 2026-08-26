import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec } from './common.js';
import { workbenchSettingsSaveInputSchema, workbenchSettingsViewSchema } from '../../core/schema/workbench-settings.js';

/**
 * 创作台通用设置 Remote：`load` 回显目标字数与询问开关、`save` 落盘到
 * `novel-settings/workbench-settings.yaml`（Host 侧持久化，跨会话生效）。
 */
const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec });

function workbenchSettingsInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelWorkbenchSettings/${method}`, service: 'novelWorkbenchSettings', namespace: 'novelWorkbenchSettings', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

export const workbenchSettingsLoadInvocation = workbenchSettingsInvocation('load', [], strictCodec('novel-creation-tool#workbenchSettingsView', workbenchSettingsViewSchema));
export const workbenchSettingsSaveInvocation = workbenchSettingsInvocation('save', [param('input', strictCodec('novel-creation-tool#workbenchSettingsSaveInput', workbenchSettingsSaveInputSchema))], strictCodec('novel-creation-tool#workbenchSettingsView', workbenchSettingsViewSchema));
export const workbenchSettingsInvocations = [workbenchSettingsLoadInvocation, workbenchSettingsSaveInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
export const workbenchSettingsRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool-workbench-settings', descriptors: [...workbenchSettingsInvocations] };
