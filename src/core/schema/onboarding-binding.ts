import { z } from 'zod';
import { entityIdSchema } from './base.js';

/**
 * I102 onboarding 绑定基座（计划 §18 I102，review v2.0 §6）：projectId /
 * onboardingSessionId / sourceHash 与六层 enum 的单一 schema 定义，供 analysis /
 * adjudication 合同复用，消除 6 次重列。
 */

/** 作品 id 复用 core/base 的 entityIdSchema（与 validateProjectId 同源）。 */
export const onboardingProjectIdSchema = entityIdSchema;
/** Host 生成的分析会话 id（不约束字符集，仅非空）。 */
export const onboardingSessionIdSchema = z.string().min(1);
/** 输入原文的 SHA-256 十六进制指纹。 */
export const sourceHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** 六层候选层 id（B3/B2/B5/C1/C2/C4）——analysis 与 adjudication 合同唯一 enum。 */
export const onboardingLayerSchema = z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']);
export type OnboardingLayerId = z.infer<typeof onboardingLayerSchema>;

/** 绑定三元组：每个后续操作必须与宿主会话的绑定逐字一致。 */
export const onboardingBindingSchema = z.object({
  projectId: onboardingProjectIdSchema,
  onboardingSessionId: onboardingSessionIdSchema,
  sourceHash: sourceHashSchema,
}).strict();
export type OnboardingBinding = z.infer<typeof onboardingBindingSchema>;
