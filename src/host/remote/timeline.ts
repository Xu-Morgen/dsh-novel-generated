import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// Client bundle 会经 shared.ts 解析本文件完整导入图；core/timeline/index.ts
// 依赖 node:fs 不得入图（与 core/review/ledger 同模式），因此只入图纯 schema。
import { timelineSchema } from '../../core/timeline/schema.js';

/**
 * 剧情时间线 Remote（方案 A 时间线层）。
 *
 * `novelTimeline` 是 Client 时间线面板的唯一读写面：
 * - `read`：读取当前时间线（null = 未自建，Client 提示先自建/等大纲就绪）；
 * - `ensureFromOutline`：大纲就绪后自建骨架（onboarding 落地 B5 后 Client 也可
 *   主动调用兜底）；
 * - `setCurrentNode`：手动选择当前时间线节点（null 恢复自动锚定）；
 * - `save`：保存作者安排（reveals/relationships/storyTime/currentNodeId）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；wire 形状与 core/timeline schema
 * 对齐（strict），由 Host 服务端经 timelineSchema 严格复验。
 */
export const timelineWireSchema = timelineSchema;

// I75：`param`/`timelineInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
const timelineInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor =>
  remoteInvocation('novelTimeline', method, parameters, resultSchema);

const timelineReadResult = strictCodec('novel-creation-tool#novelTimeline:read', timelineWireSchema.nullable());

export const timelineReadInvocation = timelineInvocation('read', [
  param('projectId', stringCodec),
], timelineReadResult);
export const timelineEnsureInvocation = timelineInvocation('ensureFromOutline', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelTimeline:ensureFromOutline', timelineWireSchema));
export const timelineSetCurrentInvocation = timelineInvocation('setCurrentNode', [
  param('projectId', stringCodec),
  param('nodeId', stringCodec, true),
], strictCodec('novel-creation-tool#novelTimeline:setCurrentNode', timelineWireSchema));
export const timelineSaveInvocation = timelineInvocation('save', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelTimeline:saveInput', timelineWireSchema)),
], strictCodec('novel-creation-tool#novelTimeline:save', timelineWireSchema));

export const timelineInvocations = [
  timelineReadInvocation,
  timelineEnsureInvocation,
  timelineSetCurrentInvocation,
  timelineSaveInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const timelineRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-timeline', timelineInvocations);
