import type { InvocationDescriptor, InvocationParameterDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { chapterStatusSchema } from '../../core/schema/text.js';

/**
 * I60 C5 最小只读 Remote 描述符（design §5.12 / R13-1）。
 *
 * 三个只读方法挂在 `novelWorkspace` 命名空间（与既有六层编辑器同一 Client 挂载面）：
 * - `chapterList(projectId)` → 章节树列表项（无正文）。
 * - `chapterRead(projectId, chapterId)` → 章节元数据 + 场景摘要（无正文）。
 * - `sceneRead(projectId, chapterId, sceneId)` → 唯一携带正文的投影。
 *
 * 契约与不变式：
 * - 结果 schema 都是 strict、精确类型（绝不使用 `#json` 透传），与
 *   `src/core/text/projection.ts` 的投影类型一一对应（最小 owned JSON）。
 * - 没有任何参数/结果携带文件路径或 live repository 句柄；章节/场景引用只经
 *   Host 侧 `validateProjectId` / 按项目目录隔离解析（跨项目引用必然失败）。
 * - 只有读方法：不暴露 create/append/edit/delete 描述符（I61 才引入受控编辑）。
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

const param = (name: string, codec: InvocationParameterDescriptor['codec'] = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec });
const projectParameter = param('projectId', stringCodec);
const chapterParameter = param('chapterId', stringCodec);
const sceneParameter = param('sceneId', stringCodec);

function c5Invocation(service: string, method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: { parse(value: unknown): unknown }): InvocationDescriptor {
  return { id: `novel-creation-tool/${service}/${method}`, service, namespace: service, method, invocation: { kind: 'direct' }, parameters, result: strictCodec(`novel-creation-tool#${method}:result`, resultSchema) };
}

export const chapterListInvocation = c5Invocation('novelWorkspace', 'chapterList', [projectParameter], z.array(chapterListItemSchema));
export const chapterReadInvocation = c5Invocation('novelWorkspace', 'chapterRead', [projectParameter, chapterParameter], chapterReadResultSchema);
export const sceneReadInvocation = c5Invocation('novelWorkspace', 'sceneRead', [projectParameter, chapterParameter, sceneParameter], sceneReadResultSchema);

export const c5Invocations = [chapterListInvocation, chapterReadInvocation, sceneReadInvocation] as const;
