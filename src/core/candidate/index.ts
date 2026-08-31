import { createHash } from 'node:crypto';
import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';

/**
 * I62 统一写作候选命令合同（design §14.9「候选优先」/ R13-3）。
 *
 * 四种写作意图（生成 generate / 续写 continue / 按场景卡写作 scene-card /
 * 局部重写 rewrite）共用同一份 Host 候选契约：调用只产生绑定
 * project/chapter/scene/sourceHash 的候选，绝不预先接受或写任何层。
 *
 * 合同与不变式：
 * - schema 全部 strict、精确类型；任何多余字段 / 非法枚举 / 非法绑定立即失败。
 * - `target.sourceHash` 存在时必须是 64 位小写 sha256（与 I61 正文哈希同语义）；
 *   语义上它是「目标场景源正文哈希」——rewrite 必须绑定，其余意图（新场景）省略。
 * - `validateCandidateTarget` 冻结 intent→target 绑定约束：rewrite 必须有
 *   chapterId+sceneId+sourceHash；continue / scene-card 必须有 chapterId+sceneId
 *   （目标场景为新场景，无源正文哈希）；generate 只绑定 projectId。
 * - 过期语义：候选落地（I63 消费）前，Host 必须用当前场景正文核对
 *   `sourceHash`；`isCandidateStale` / `assertCandidateFresh` 是唯一裁决入口，
 *   正文变化后旧候选不可静默落地（stale 候选必须重新生成，绝不零写）。
 */

export const writingIntentSchema = z.enum(['generate', 'continue', 'scene-card', 'rewrite']);
export type WritingIntent = z.infer<typeof writingIntentSchema>;

/**
 * I122 单章润色的参数化模式（design §14.14.2 D25 / R18-4）：模式属于
 * rewrite 请求，不是新的 writing intent。I123 负责为这三个稳定值冻结 prompt
 * preset；本迭代只锁定 Host/Client 可传递的 strict selector。
 */
export const polishModeSchema = z.enum(['language', 'condense', 'expand']);
export type PolishMode = z.infer<typeof polishModeSchema>;

export const candidateIdSchema = z.string().min(1).max(128);
export const sourceHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** 候选的领域绑定：projectId 必填；chapter/scene/sourceHash 按 intent 约束。 */
export const candidateTargetSchema = z.object({
  projectId: entityIdSchema,
  chapterId: entityIdSchema.optional(),
  sceneId: entityIdSchema.optional(),
  sourceHash: sourceHashSchema.optional(),
}).strict();
export type CandidateTarget = z.infer<typeof candidateTargetSchema>;

/** 冻结的候选：id / intent / 绑定 / 生成 prompt（审计与重试）/ 正文 / 分块数 / 时间戳。 */
export const writingCandidateSchema = z.object({
  id: candidateIdSchema,
  intent: writingIntentSchema,
  target: candidateTargetSchema,
  prompt: z.string().min(1),
  text: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict();
export type WritingCandidate = z.infer<typeof writingCandidateSchema>;

/** 目标场景正文的 SHA-256（与 I61 编辑证据同语义，utf8 hex）。 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 校验一个候选 target 满足 intent 的绑定约束（§14.9 候选优先：绑定必须可追溯）。
 * 非法 projectId（entityIdSchema）或缺失绑定一律抛错，调用方不得落地。
 */
export function validateCandidateTarget(intent: WritingIntent, target: CandidateTarget): void {
  candidateTargetSchema.parse(target);
  if (intent === 'rewrite') {
    if (target.chapterId === undefined) throw new Error('Rewrite candidate requires chapterId');
    if (target.sceneId === undefined) throw new Error('Rewrite candidate requires sceneId');
    if (target.sourceHash === undefined) throw new Error('Rewrite candidate requires sourceHash');
  }
  if (intent === 'continue' || intent === 'scene-card') {
    if (target.chapterId === undefined) throw new Error(`${intent} candidate requires chapterId`);
    if (target.sceneId === undefined) throw new Error(`${intent} candidate requires sceneId`);
  }
}

/** 解析并冻结一个候选（strict）；非法候选抛错，不进入任何消费路径。 */
export function parseWritingCandidate(input: unknown): WritingCandidate {
  const candidate = writingCandidateSchema.parse(input);
  validateCandidateTarget(candidate.intent, candidate.target);
  return Object.freeze({ ...candidate, target: Object.freeze({ ...candidate.target }) });
}

/**
 * 过期判定：候选绑定了 `sourceHash` 时，当前场景正文哈希不一致即 stale。
 * 未绑定 sourceHash 的候选（待创建新场景）不存在源正文，永不因正文变化过期
 * （其落地约束由 I63 消费方校验 scene 未占用，见 §14.9）。
 */
export function isCandidateStale(candidate: WritingCandidate, currentText: string): boolean {
  const bound = candidate.target.sourceHash;
  return bound !== undefined && hashText(currentText) !== bound;
}

/** 过期候选拒绝落地：抛错（零写），要求调用方基于当前正文重新生成。 */
export function assertCandidateFresh(candidate: WritingCandidate, currentText: string): void {
  if (isCandidateStale(candidate, currentText)) {
    throw new Error(`Candidate ${candidate.id} is stale: source text changed since generation`);
  }
}
