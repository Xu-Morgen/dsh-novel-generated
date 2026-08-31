import { z } from 'zod';
import { textAnchorSchema } from './link.js';

/**
 * I128 审校修复候选的 Client-safe 合同（设计 §14.14.2 / R18-3a）。
 *
 * issueId 是 Host 最近一次 scan 的稳定问题指纹；Client 只能提交这个 id
 * 和作者补充指令，不能提交正文、目标场景或锚点来越过 Host 的新鲜度校验。
 */
export const reviewRepairInputSchema = z.object({
  issueId: z.string().trim().min(1).max(128),
  instruction: z.string().trim().min(1).max(2000).optional(),
}).strict().readonly();
export type ReviewRepairInput = z.infer<typeof reviewRepairInputSchema>;

/** 候选的来源血缘；只记录可重建证据，不记录 resolved 状态。 */
export const reviewRepairLineageSchema = z.object({
  kind: z.literal('review-repair'),
  issueId: z.string().trim().min(1).max(128),
  issueFingerprint: z.string().trim().min(1).max(128),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().readonly();
export type ReviewRepairLineage = z.infer<typeof reviewRepairLineageSchema>;

/** Remote 返回的正文目标与可选精确范围。 */
export const reviewRepairTargetSchema = z.object({
  chapterId: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().readonly();
export type ReviewRepairTarget = z.infer<typeof reviewRepairTargetSchema>;

export const reviewRepairAnchorSchema = textAnchorSchema;
