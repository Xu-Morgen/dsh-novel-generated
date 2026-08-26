import { z } from 'zod';

/**
 * 创作台通用设置（创作参数，非 LLM 路由）：每次续写的目标字数，以及当用户提供的
 * 内容不足以支撑目标字数时是否先向用户确认补充（避免直接注水）。
 *
 * 契约/不变式：
 * - 该设置是 Host 侧持久化（`novel-settings/workbench-settings.yaml`），跨会话生效；
 * - `wordTarget` 为正整数；Agent 续写与 GUI 未来的生成入口共用此默认目标；
 * - `askWhenThin` 只是行为开关：为 true 时创作 Agent 在输入明显不足时先询问用户，
 *   不改变任何 schema 或写回契约。
 */

/** 目标字数下限（避免误填 0 或负值）。 */
export const WORKBENCH_WORD_TARGET_MIN = 100;
export const WORKBENCH_WORD_TARGET_MAX = 100_000;

export const WORKBENCH_WORD_TARGET_DEFAULT = 500;
export const WORKBENCH_ASK_WHEN_THIN_DEFAULT = true;

export const workbenchSettingsSchema = z.object({
  version: z.literal(1),
  wordTarget: z.number().int().min(WORKBENCH_WORD_TARGET_MIN).max(WORKBENCH_WORD_TARGET_MAX),
  askWhenThin: z.boolean(),
}).strict();
export type WorkbenchSettings = z.infer<typeof workbenchSettingsSchema>;

/** save 输入：与持久化形态一致（Remote 契约）。 */
export const workbenchSettingsSaveInputSchema = z.object({
  wordTarget: z.number().int().min(WORKBENCH_WORD_TARGET_MIN).max(WORKBENCH_WORD_TARGET_MAX),
  askWhenThin: z.boolean(),
}).strict();
export type WorkbenchSettingsSaveInput = z.infer<typeof workbenchSettingsSaveInputSchema>;

/** 设置页回显视图：不含任何凭据/路由信息。 */
export const workbenchSettingsViewSchema = z.object({
  wordTarget: z.number().int().min(WORKBENCH_WORD_TARGET_MIN).max(WORKBENCH_WORD_TARGET_MAX),
  askWhenThin: z.boolean(),
}).strict();
export type WorkbenchSettingsView = z.infer<typeof workbenchSettingsViewSchema>;

export function defaultWorkbenchSettings(): WorkbenchSettings {
  return { version: 1, wordTarget: WORKBENCH_WORD_TARGET_DEFAULT, askWhenThin: WORKBENCH_ASK_WHEN_THIN_DEFAULT };
}
