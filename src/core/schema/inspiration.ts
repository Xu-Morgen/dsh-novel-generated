import { z } from 'zod';

/**
 * I45 灵感方向与灵感结果 schema（design §9.5「灵感」；I68 进度与灵感落地复用）。
 *
 * 本模块是灵感方向的纯 zod 单一来源（core 归 core）：`host/inspiration-service.ts`
 * 从本模块导入并 re-export（既有导入面不变）；`host/remote/progress.ts`（Client
 * bundle 会经 shared.ts 解析本文件完整导入图）只入图本模块 —— 不再在 wire 层
 * 手写与 `directionSchema` 同构的副本（架构审查 §6.3/§9#3：wire schema 从 core
 * schema 派生）。
 *
 * 契约与不变式：
 * - `directionSchema` 是 select/apply 载荷的 strict 合同（trim 非空；changes 内
 *   logline/themes 可选、outlineNote/progressNote 必填），Host 服务端经它复验；
 * - `inspirationResultSchema` 要求 2–3 个可区分方向（id/premise 均唯一），
 *   由 LLM 结果 parse 与 `validate` 共用。
 */
export const directionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  premise: z.string().trim().min(1),
  changes: z.object({
    logline: z.string().trim().min(1).optional(),
    themes: z.array(z.string().trim().min(1)).optional(),
    outlineNote: z.string().trim().min(1),
    progressNote: z.string().trim().min(1),
  }).strict(),
  rationale: z.string().trim().min(1),
}).strict();
export type InspirationDirection = z.infer<typeof directionSchema>;

export const inspirationResultSchema = z.object({
  directions: z.array(directionSchema).min(2).max(3),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.directions.map((direction) => direction.id));
  const premises = new Set(value.directions.map((direction) => direction.premise));
  if (ids.size !== value.directions.length) context.addIssue({ code: 'custom', message: 'Inspiration direction IDs must be distinct' });
  if (premises.size !== value.directions.length) context.addIssue({ code: 'custom', message: 'Inspiration directions must be distinguishable' });
});
export type InspirationResult = z.infer<typeof inspirationResultSchema>;
