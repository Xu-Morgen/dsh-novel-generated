import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { createProjectInputSchema, projectCreateResultSchema, projectListResultSchema, projectOpenResultSchema } from '../../core/schema/project-lifecycle.js';

const param = (name: string, codec = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor => ({ name, wire: name, source: 'json', codec });
export const projectListInvocation: InvocationDescriptor = { id: 'novel-creation-tool/novelWorkspace/projectList', service: 'novelWorkspace', namespace: 'novelWorkspace', method: 'projectList', invocation: { kind: 'direct' }, parameters: [], result: strictCodec('novel-creation-tool#projectList', projectListResultSchema) };
export const projectCreateInvocation: InvocationDescriptor = { id: 'novel-creation-tool/novelWorkspace/projectCreate', service: 'novelWorkspace', namespace: 'novelWorkspace', method: 'projectCreate', invocation: { kind: 'direct' }, parameters: [param('input', strictCodec('novel-creation-tool#createProjectInput', createProjectInputSchema))], result: strictCodec('novel-creation-tool#projectCreate', projectCreateResultSchema) };
export const projectOpenInvocation: InvocationDescriptor = { id: 'novel-creation-tool/novelWorkspace/projectOpen', service: 'novelWorkspace', namespace: 'novelWorkspace', method: 'projectOpen', invocation: { kind: 'direct' }, parameters: [param('projectId', stringCodec)], result: strictCodec('novel-creation-tool#projectOpen', projectOpenResultSchema) };
export const projectLifecycleInvocations = [projectListInvocation, projectCreateInvocation, projectOpenInvocation] as const;
export const projectLifecycleRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool', descriptors: [...projectLifecycleInvocations] };
