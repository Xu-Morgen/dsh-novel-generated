import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';

/**
 * I71 全局搜索与上下文追踪 Remote（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * `novelSearch` 是 Client 搜索/追踪面板的唯一读写面：
 * - `build`：从六层 live source-of-truth 重建派生搜索索引（幂等覆盖，零写结构层）；
 * - `drop`：删除派生索引（删除后可重建；索引不是第二真相）；
 * - `stats`：索引存在性 + 分层条目数（可观测性）；
 * - `search`：关键词检索（pov 可选；指定时 knowledge 层结果受该 POV 的 live
 *   knows 过滤，不泄露未授权 POV 知识）；
 * - `references`：实体精确引用（跨层 mentions 交叉引用；pov 语义与 search 相同）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON —— 命中只含有界 preview 与跳转目标
 * （nav），绝不携带完整条目/文件路径；命中排序确定（分数 → 层序 → id）。本模块
 * 只依赖 zod 与纯 schema（Client bundle 会经 shared.ts 解析本文件完整导入图，
 * core/search 依赖 node:fs，不得入图）。
 */

export const searchNavWireSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), chapterId: z.string().min(1), sceneId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('characters'), entryId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('worldview'), entryId: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal('outline'),
    actId: z.string().min(1).optional(),
    beatId: z.string().min(1).optional(),
    detailId: z.string().min(1).optional(),
    entryId: z.string().min(1).optional(),
  }).strict(),
  z.object({ kind: z.literal('canon'), entryId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('knowledge'), entryId: z.string().min(1) }).strict(),
]);
export type SearchNavShape = z.infer<typeof searchNavWireSchema>;

export const searchHitWireSchema = z.object({
  layer: z.enum(['text', 'characters', 'worldview', 'outline', 'canon', 'knowledge']),
  id: z.string().min(1),
  title: z.string(),
  preview: z.string(),
  nav: searchNavWireSchema,
  score: z.number().int().nonnegative(),
  matched: z.enum(['title', 'content']),
}).strict();
export type SearchHitShape = z.infer<typeof searchHitWireSchema>;

export const searchResultWireSchema = z.object({
  query: z.string().min(1),
  pov: z.string().min(1).optional(),
  total: z.number().int().nonnegative(),
  hits: z.array(searchHitWireSchema),
}).strict();
export type SearchResultShape = z.infer<typeof searchResultWireSchema>;

export const referenceResultWireSchema = z.object({
  key: z.string().min(1),
  pov: z.string().min(1).optional(),
  total: z.number().int().nonnegative(),
  hits: z.array(searchHitWireSchema),
}).strict();
export type ReferenceResultShape = z.infer<typeof referenceResultWireSchema>;

const searchLayerCountsSchema = z.object({
  text: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  worldview: z.number().int().nonnegative(),
  outline: z.number().int().nonnegative(),
  canon: z.number().int().nonnegative(),
  knowledge: z.number().int().nonnegative(),
}).strict();

export const searchStatsWireSchema = z.object({
  indexExists: z.boolean(),
  builtAt: z.string().min(1).optional(),
  counts: searchLayerCountsSchema,
  totalEntries: z.number().int().nonnegative(),
}).strict();
export type SearchStatsShape = z.infer<typeof searchStatsWireSchema>;

const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown()), optional = false): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec, ...(optional ? { acceptsUndefined: true } : {}) });

function searchInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelSearch/${method}`, service: 'novelSearch', namespace: 'novelSearch', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

const projectParameter = param('projectId', stringCodec);
const queryParameter = param('query', stringCodec);
const keyParameter = param('key', stringCodec);
const povParameter = param('pov', stringCodec, true);

export const searchBuildInvocation = searchInvocation('build', [projectParameter], strictCodec('novel-creation-tool#novelSearch:build', searchStatsWireSchema));
export const searchDropInvocation = searchInvocation('drop', [projectParameter], strictCodec('novel-creation-tool#novelSearch:drop', searchStatsWireSchema));
export const searchStatsInvocation = searchInvocation('stats', [projectParameter], strictCodec('novel-creation-tool#novelSearch:stats', searchStatsWireSchema));
export const searchQueryInvocation = searchInvocation('search', [projectParameter, queryParameter, povParameter], strictCodec('novel-creation-tool#novelSearch:search', searchResultWireSchema));
export const searchReferencesInvocation = searchInvocation('references', [projectParameter, keyParameter, povParameter], strictCodec('novel-creation-tool#novelSearch:references', referenceResultWireSchema));

export const searchInvocations = [
  searchBuildInvocation,
  searchDropInvocation,
  searchStatsInvocation,
  searchQueryInvocation,
  searchReferencesInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const searchRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool-search', descriptors: [...searchInvocations] };
