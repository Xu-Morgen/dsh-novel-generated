import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { branchAggregateSchema } from '../../core/schema/branch-aggregate.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/**
 * I70 C5 正文版本与分支 Remote（design §14.10「正文版本与分支」/ R14-5）。
 *
 * `novelBranches` 是 Client 分支面板的唯一读写面：
 * - `list`：场景版本元数据投影（id/label/chosen/charCount/hash，无正文）；
 * - `read`：单分支全文（最小读取合同，正文按需读取）；
 * - `save`：给当前正文打命名版本（幂等；不改变正文）；
 * - `choose`：可逆切换 chosen 分支并同步正文（只写 C5，绝不隐式改结构层）；
 * - `diff`：分支 A → 分支 B 的确定性行 diff（B 缺省 = 当前 chosen 分支）。
 * - `aggregate`：一次性有界的章节→场景→版本元数据树（无正文）；正文仍按需读取。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径；服务端（novelBranches）经 TextRepository（C5 唯一存储 owner）复验与写回，
 * wire 形状与 host/branch-service 投影对齐（strict）。本模块只依赖 zod 与纯 schema
 * （Client bundle 会经 shared.ts 解析本文件完整导入图；core/text 与 host 服务是
 * Host-only 校验/写回逻辑，不得入图）。
 */

export const branchSummaryWireSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string(),
  chosen: z.boolean(),
  charCount: z.number().int().nonnegative(),
  hash: z.string().min(1),
}).strict();

export const branchListResultWireSchema = z.object({
  branches: z.array(branchSummaryWireSchema),
}).strict();

export const branchReadResultWireSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string(),
  chosen: z.boolean(),
  content: z.string(),
}).strict();

/** save/choose 共用结果：新分支元数据列表 + 切换后的当前正文。 */
export const branchMutateResultWireSchema = z.object({
  branches: z.array(branchSummaryWireSchema),
  content: z.string(),
}).strict();

export const branchDiffLineWireSchema = z.object({
  kind: z.enum(['same', 'del', 'add']),
  text: z.string(),
}).strict();

export const branchDiffResultWireSchema = z.object({
  from: branchReadResultWireSchema,
  to: branchReadResultWireSchema,
  lines: z.array(branchDiffLineWireSchema),
}).strict();

/** I130 canonical aggregate result；复用 core schema，禁止 Remote 自行复制树形状。 */
export const branchAggregateWireSchema = branchAggregateSchema;

// I75：`param`/`branchInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const branchInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelBranches', method, parameters, resultSchema);

const projectParameter = param('projectId', stringCodec);
const chapterParameter = param('chapterId', stringCodec);
const sceneParameter = param('sceneId', stringCodec);
const branchIdParameter = param('branchId', stringCodec);
const labelParameter = param('label', stringCodec);
const toBranchIdParameter = param('toBranchId', stringCodec, true);

export const branchListInvocation = branchInvocation('list', [projectParameter, chapterParameter, sceneParameter], strictCodec('novel-creation-tool#novelBranches:list', branchListResultWireSchema));
export const branchReadInvocation = branchInvocation('read', [projectParameter, chapterParameter, sceneParameter, branchIdParameter], strictCodec('novel-creation-tool#novelBranches:read', branchReadResultWireSchema));
export const branchSaveInvocation = branchInvocation('save', [projectParameter, chapterParameter, sceneParameter, labelParameter], strictCodec('novel-creation-tool#novelBranches:save', branchMutateResultWireSchema));
export const branchChooseInvocation = branchInvocation('choose', [projectParameter, chapterParameter, sceneParameter, branchIdParameter], strictCodec('novel-creation-tool#novelBranches:choose', branchMutateResultWireSchema));
export const branchDiffInvocation = branchInvocation('diff', [projectParameter, chapterParameter, sceneParameter, branchIdParameter, toBranchIdParameter], strictCodec('novel-creation-tool#novelBranches:diff', branchDiffResultWireSchema));
export const branchAggregateInvocation = branchInvocation('aggregate', [projectParameter], strictCodec('novel-creation-tool#novelBranches:aggregate', branchAggregateWireSchema));

export const branchInvocations = [
  branchListInvocation,
  branchReadInvocation,
  branchSaveInvocation,
  branchChooseInvocation,
  branchDiffInvocation,
  branchAggregateInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const branchRemoteContribution = remoteContribution('novel-creation-tool-branches', branchInvocations);
