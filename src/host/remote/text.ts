import type { InvocationDescriptor, InvocationParameterDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteInvocation } from './shared.js';
import { chapterStatusSchema } from '../../core/schema/text.js';
import type { EditRange } from '../../core/edit/index.js';

/**
 * 线上范围边界：与 `core/edit.editRangeSchema` 同构，但内联定义以避免 Client
 * bundle 拉入 Host-only 的 `core/edit`（其 `fingerprintEdit` 依赖 node:crypto）。
 * Host 侧 `novelTextEdit` 仍以领域 schema 与文本长度做最终校验（非法范围零写）。
 */
const editRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).strict().superRefine((range, context) => {
  if (range.end < range.start) context.addIssue({ code: 'custom', path: ['end'], message: 'Range end must not precede start' });
});

/**
 * I60/I61 C5 Remote 描述符（design §5.12 / R13-1 / R13-2）。
 *
 * 只读方法挂在 `novelWorkspace` 命名空间（与既有六层编辑器同一 Client 挂载面）：
 * - `chapterList(projectId)` → 章节树列表项（无正文）。
 * - `chapterRead(projectId, chapterId)` → 章节元数据 + 场景摘要（无正文）。
 * - `sceneRead(projectId, chapterId, sceneId)` → 唯一携带正文的投影。
 *
 * I61 受控编辑（R13-2，均复用 I42 / I11）：
 * - `sceneEdit(projectId, chapterId, sceneId, range, replacement, baseHash?)` →
 *   固定范围逐字保存（只写 C5），返回变更 diff 证据（before/after 哈希 + 未变前后缀）。
 * - `sceneReparsePropose(projectId, chapterId, sceneId, range, replacement, baseHash?)`
 *   → 把范围修改作为 I11 提案交给 Gate；返回最小提案投影（id + 三态）。
 * - `sceneReparseAccept(projectId, chapterId, sceneId, range, replacement, proposalId)`
 *   → 幂等 accept 后走既有 parser fan-out 并写 C5。
 * - `sceneReparseReject(projectId, proposalId)` → Gate 置 rejected，零写。
 *
 * 契约与不变式：
 * - 结果 schema 都是 strict、精确类型（绝不使用 `#json` 透传）；`range` 参数在
 *   线上以严格 `editRangeSchema` 校验（负向：start>end、小数、越界由 Host 校验）。
 * - 没有任何参数/结果携带文件路径或 live repository 句柄；引用只经 Host 侧
 *   `validateProjectId` / 按项目目录隔离解析（跨项目引用必然失败）。
 * - `baseHash` 为可选脏文本保护：缺省时由 Host 直接按当前文本执行（测试/兼容），
 *   携带时 Host 必须先核对当前正文哈希，不一致即拒绝（零写）。
 */
export const sceneSummarySchema = z.object({
  id: z.string().min(1).max(64),
  index: z.number().int().nonnegative(),
  summary: z.string(),
}).strict();

export const chapterListItemSchema = z.object({
  id: z.string().min(1).max(64),
  index: z.number().int().positive(),
  title: z.string(),
  pov: z.string(),
  status: chapterStatusSchema,
  sceneCount: z.number().int().nonnegative(),
}).strict();

export const chapterReadResultSchema = z.object({
  id: z.string().min(1).max(64),
  index: z.number().int().positive(),
  title: z.string(),
  pov: z.string(),
  status: chapterStatusSchema,
  scenes: z.array(sceneSummarySchema),
}).strict();

export const sceneReadResultSchema = z.object({
  chapter: z.object({
    id: z.string().min(1).max(64),
    index: z.number().int().positive(),
    title: z.string(),
    pov: z.string(),
  }).strict(),
  scene: z.object({
    id: z.string().min(1).max(64),
    index: z.number().int().nonnegative(),
    summary: z.string(),
    content: z.string(),
    beats: z.array(z.string()),
    canonEvents: z.array(z.string()),
    notes: z.string(),
  }).strict(),
}).strict();

/** I61 变更 diff 证据：before/after 是目标场景全文 SHA-256；未变前后缀逐字证明范围外不变。 */
export const sceneEditEvidenceSchema = z.object({
  before: z.string(),
  after: z.string(),
  unchangedPrefix: z.string(),
  unchangedSuffix: z.string(),
}).strict();

export const sceneEditResultSchema = z.object({
  scene: sceneReadResultSchema.shape.scene,
  evidence: sceneEditEvidenceSchema,
}).strict();

/** 最小提案投影：payload（业务 JSON）与 before/after 指纹不出现在线上。 */
export const sceneReparseProposeResultSchema = z.object({
  proposalId: z.string().min(1).max(64),
  status: z.enum(['pending', 'accepted', 'rejected']),
}).strict();

export const sceneReparseAcceptResultSchema = z.object({
  status: z.literal('written'),
  scene: sceneReadResultSchema.shape.scene,
  layers: z.array(z.enum(['c2', 'c1', 'c3', 'c4', 'b2'])),
}).strict();

export const sceneReparseRejectResultSchema = z.object({
  proposalId: z.string().min(1).max(64),
  status: z.literal('rejected'),
}).strict();

// I75：`param` 统一到 shared 接线层；`c5Invocation` 只保留 strictCodec 包装
// （保持既有 typeSymbol `novel-creation-tool#${method}:result`，见架构审查 §6.3/§9#1）。
const projectParameter = param('projectId', stringCodec);
const chapterParameter = param('chapterId', stringCodec);
const sceneParameter = param('sceneId', stringCodec);
const replacementParameter = param('replacement', stringCodec);
const baseHashParameter = param('baseHash', stringCodec, true);
const proposalIdParameter = param('proposalId', stringCodec);
const rangeParameter = param('range', strictCodec('novel-creation-tool#editRange', editRangeSchema));

const c5Invocation = (service: string, method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: { parse(value: unknown): unknown }): InvocationDescriptor =>
  remoteInvocation(service, method, parameters, strictCodec(`novel-creation-tool#${method}:result`, resultSchema));

export const chapterListInvocation = c5Invocation('novelWorkspace', 'chapterList', [projectParameter], z.array(chapterListItemSchema));
export const chapterReadInvocation = c5Invocation('novelWorkspace', 'chapterRead', [projectParameter, chapterParameter], chapterReadResultSchema);
export const sceneReadInvocation = c5Invocation('novelWorkspace', 'sceneRead', [projectParameter, chapterParameter, sceneParameter], sceneReadResultSchema);
export const sceneEditInvocation = c5Invocation('novelWorkspace', 'sceneEdit', [projectParameter, chapterParameter, sceneParameter, rangeParameter, replacementParameter, baseHashParameter], sceneEditResultSchema);
export const sceneReparseProposeInvocation = c5Invocation('novelWorkspace', 'sceneReparsePropose', [projectParameter, chapterParameter, sceneParameter, rangeParameter, replacementParameter, baseHashParameter], sceneReparseProposeResultSchema);
export const sceneReparseAcceptInvocation = c5Invocation('novelWorkspace', 'sceneReparseAccept', [projectParameter, chapterParameter, sceneParameter, rangeParameter, replacementParameter, proposalIdParameter, baseHashParameter], sceneReparseAcceptResultSchema);
export const sceneReparseRejectInvocation = c5Invocation('novelWorkspace', 'sceneReparseReject', [projectParameter, proposalIdParameter], sceneReparseRejectResultSchema);

export const c5Invocations = [
  chapterListInvocation, chapterReadInvocation, sceneReadInvocation,
  sceneEditInvocation, sceneReparseProposeInvocation, sceneReparseAcceptInvocation, sceneReparseRejectInvocation,
] as const;
