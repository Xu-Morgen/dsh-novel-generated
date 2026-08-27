import { z } from 'zod';
import { characterCoreSchema } from '../core/schema/characters.js';
import { actSchema, beatSchema, detailBeatSchema, outlineSchema } from '../core/schema/outline.js';
import { relationshipSchema } from '../core/schema/relationship.js';
import { worldEntrySchema } from '../core/schema/worldview.js';

/**
 * I78 Client 投影 shape 单一来源（design §14.12 ③ / D22；架构审查 §6.3 / §9#3）。
 *
 * 编辑器表单模型（draft）不再是手写的「全 optional + `[key: string]: unknown` +
 * `kind: string` 失型」接口，而是从 canonical core schema 派生的纯 zod 直用：
 * - `CharacterShape` / `WorldShape` 允许部分草稿（store 初始编辑态只有 id/name），
 *   但已知字段类型精确（`kind` 是 core 枚举联合，不再是 `string`）；
 * - `OutlineShape` / `RelationshipShape` 与 canonical 输入类型同形
 *   （`Omit<X, 'version'> & { version?: number }`）；
 * - 无索引签名；字段集合、枚举与 optionality 全部单一来源 core schema —— 形状
 *   漂移在编译期即暴露（见 `contracts/stage15/client-projection.json` 契约锁与
 *   `src/contract-lock.test.ts` 一致性断言）。
 *
 * 不变式：这些 schema 只依赖 zod 与 core 纯 schema 模块，可完整进入 Client
 * bundle（白名单内）；Host 仍是领域校验唯一 owner，Client 不解析/不复验草稿。
 */

/** B3 角色编辑器表单模型：`{ id, name, version? }` + canonical 其余字段可缺省。 */
export const characterFormSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive().optional(),
}).and(characterCoreSchema.omit({ id: true, name: true, version: true }).partial());
export type CharacterShape = z.infer<typeof characterFormSchema>;

/** B5 大纲编辑器表单模型：与 canonical 输入类型（`Omit<Outline, 'version'>`）同形。 */
export const outlineFormSchema = outlineSchema.omit({ version: true }).extend({
  version: z.number().int().positive().optional(),
});
export type OutlineShape = z.infer<typeof outlineFormSchema>;
export type OutlineActShape = z.infer<typeof actSchema>;
export type OutlineBeatShape = z.infer<typeof beatSchema>;
export type OutlineDetailBeatShape = z.infer<typeof detailBeatSchema>;

/** C1 关系编辑器表单模型：与 canonical 输入类型同形。 */
export const relationshipFormSchema = relationshipSchema.omit({ version: true }).extend({
  version: z.number().int().positive().optional(),
});
export type RelationshipShape = z.infer<typeof relationshipFormSchema>;

/** B2 世界观编辑器表单模型：`{ id, version? }` + canonical 其余字段可缺省。 */
export const worldFormSchema = z.object({
  id: z.string(),
  version: z.number().int().positive().optional(),
}).and(worldEntrySchema.omit({ id: true, version: true }).partial());
export type WorldShape = z.infer<typeof worldFormSchema>;
