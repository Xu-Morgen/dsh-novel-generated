import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { createProjectInputSchema, projectArchiveListResultSchema, projectArchiveResultSchema, projectCreateResultSchema, projectListResultSchema, projectOpenResultSchema, projectRestoreResultSchema } from '../../core/schema/project-lifecycle.js';

// I75：手写 descriptor 收敛到统一 `remoteInvocation`（见架构审查 §6.3/§9#1）。
// I91：删除 `: InvocationDescriptor` 标注 —— 保留 parameters/result/method 字面
// 类型供 Client 派生 namespace（probe.ts 同模式）。
export const projectListInvocation = remoteInvocation('novelWorkspace', 'projectList', [], strictCodec('novel-creation-tool#projectList', projectListResultSchema));
export const projectCreateInvocation = remoteInvocation('novelWorkspace', 'projectCreate', [param('input', strictCodec('novel-creation-tool#createProjectInput', createProjectInputSchema))], strictCodec('novel-creation-tool#projectCreate', projectCreateResultSchema));
export const projectOpenInvocation = remoteInvocation('novelWorkspace', 'projectOpen', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#projectOpen', projectOpenResultSchema));
export const projectArchiveListInvocation = remoteInvocation('novelWorkspace', 'projectArchiveList', [], strictCodec('novel-creation-tool#projectArchiveList', projectArchiveListResultSchema));
export const projectArchiveInvocation = remoteInvocation('novelWorkspace', 'projectArchive', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#projectArchive', projectArchiveResultSchema));
export const projectRestoreInvocation = remoteInvocation('novelWorkspace', 'projectRestore', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#projectRestore', projectRestoreResultSchema));
export const projectLifecycleInvocations = [projectListInvocation, projectCreateInvocation, projectOpenInvocation, projectArchiveListInvocation, projectArchiveInvocation, projectRestoreInvocation] as const;
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const projectLifecycleRemoteContribution = remoteContribution('novel-creation-tool', projectLifecycleInvocations);
