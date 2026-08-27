import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { createProjectInputSchema, projectCreateResultSchema, projectListResultSchema, projectOpenResultSchema } from '../../core/schema/project-lifecycle.js';

// I75：手写 descriptor 收敛到统一 `remoteInvocation`（见架构审查 §6.3/§9#1）。
export const projectListInvocation: InvocationDescriptor = remoteInvocation('novelWorkspace', 'projectList', [], strictCodec('novel-creation-tool#projectList', projectListResultSchema));
export const projectCreateInvocation: InvocationDescriptor = remoteInvocation('novelWorkspace', 'projectCreate', [param('input', strictCodec('novel-creation-tool#createProjectInput', createProjectInputSchema))], strictCodec('novel-creation-tool#projectCreate', projectCreateResultSchema));
export const projectOpenInvocation: InvocationDescriptor = remoteInvocation('novelWorkspace', 'projectOpen', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#projectOpen', projectOpenResultSchema));
export const projectLifecycleInvocations = [projectListInvocation, projectCreateInvocation, projectOpenInvocation] as const;
export const projectLifecycleRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool', projectLifecycleInvocations);
