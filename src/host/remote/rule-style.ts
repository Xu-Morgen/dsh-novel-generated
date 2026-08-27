import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：B1/B4 wire schema 从 core schema 派生（架构审查 §6.3/§9#3；core/schema
// 是纯 zod 模块，可被 Client bundle 经 shared.ts 完整导入）。唯一 wire 级差异是
// 管理面 priority 收敛到 1–100（core ruleSchema 保持开放整数，§5.3 —— UI 控制面
// 约束用 extend 覆盖，形状字段集仍以 core 为单一来源）。
import { ruleKindSchema, ruleSchema, ruleScopeSchema } from '../../core/schema/rules.js';
import {
  narrativePersonSchema,
  narrativeTenseSchema,
  povScopeSchema,
  styleProfileSchema,
} from '../../core/schema/style.js';

/**
 * I67 B1 规则与 B4 文风控制面 Remote（design §14.10「B1/B4 控制面」/ R14-2）。
 *
 * `novelRuleStyleManager` 是 Client 规则/风格表单的唯一读写面：
 * - `list`：规则列表（优先级降序 + id 升序，与 I13 消费者排序一致）+ 风格档案
 *   投影（未初始化 style 为 null）；只读零写；
 * - `readRule` / `createRule` / `updateRule`：规则 round-trip；非法枚举与越界
 *   优先级在 wire 层 fail-fast，immutable 改写由 Host 服务拒绝（零写）；
 * - `readStyle` / `saveStyle`：风格档案 round-trip；人称/时态/POV 非法枚举零写拒绝。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相、不复制
 * 领域校验（本文件只依赖 zod 与纯 schema，可被 Client bundle 经 shared.ts 完整
 * 导入图解析）。优先级 1–100 是 UI 控制面约束（core ruleSchema 保持开放整数，
 * §5.3），wire 层与 Host 服务双重拒绝越界值。
 */

export const ruleScopeWireSchema = ruleScopeSchema;
export const ruleKindWireSchema = ruleKindSchema;

/** 管理面 wire 规则：core ruleSchema 派生，priority 收敛到 1–100（core 开放整数；越界在此层拒）。 */
export const ruleWireSchema = ruleSchema.extend({
  priority: z.number().int().min(1).max(100),
});

export const narrativePersonWireSchema = narrativePersonSchema;
export const narrativeTenseWireSchema = narrativeTenseSchema;
export const povScopeWireSchema = povScopeSchema;

export const styleWireSchema = styleProfileSchema;

/** createRule 入参：RuleInput 形状（id 必填，version 缺省 1）。 */
const ruleInputWireSchema = ruleWireSchema.omit({ version: true }).extend({ version: z.number().int().positive().optional() });
/** updateRule 入参：RulePatch 形状（id/version 由路径/仓库持有）。 */
const rulePatchWireSchema = ruleWireSchema.omit({ id: true, version: true });
/** saveStyle 入参：StyleProfileInput 去掉 id 的形状（id 由 Host 管理：沿用既有或默认 global-style）。 */
const styleInputWireSchema = styleWireSchema.omit({ id: true, version: true }).extend({ version: z.number().int().positive().optional() });

export const ruleStyleProjectionWireSchema = z.object({
  projectId: z.string().min(1),
  rules: z.array(ruleWireSchema),
  style: styleWireSchema.nullable(),
}).strict();

// I75：`param`/`ruleStyleInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
const ruleStyleInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor =>
  remoteInvocation('novelRuleStyleManager', method, parameters, resultSchema);

export const ruleStyleListInvocation = ruleStyleInvocation('list', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelRuleStyleManager:list', ruleStyleProjectionWireSchema));
export const ruleStyleReadRuleInvocation = ruleStyleInvocation('readRule', [
  param('projectId', stringCodec),
  param('ruleId', stringCodec),
], strictCodec('novel-creation-tool#novelRuleStyleManager:readRule', ruleWireSchema));
export const ruleStyleCreateRuleInvocation = ruleStyleInvocation('createRule', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelRuleStyleManager:createRuleInput', ruleInputWireSchema)),
], strictCodec('novel-creation-tool#novelRuleStyleManager:createRule', ruleWireSchema));
export const ruleStyleUpdateRuleInvocation = ruleStyleInvocation('updateRule', [
  param('projectId', stringCodec),
  param('ruleId', stringCodec),
  param('patch', strictCodec('novel-creation-tool#novelRuleStyleManager:updateRulePatch', rulePatchWireSchema)),
], strictCodec('novel-creation-tool#novelRuleStyleManager:updateRule', ruleWireSchema));
export const ruleStyleReadStyleInvocation = ruleStyleInvocation('readStyle', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelRuleStyleManager:readStyle', styleWireSchema.nullable()));
export const ruleStyleSaveStyleInvocation = ruleStyleInvocation('saveStyle', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelRuleStyleManager:saveStyleInput', styleInputWireSchema)),
], strictCodec('novel-creation-tool#novelRuleStyleManager:saveStyle', styleWireSchema));

export const ruleStyleInvocations = [
  ruleStyleListInvocation,
  ruleStyleReadRuleInvocation,
  ruleStyleCreateRuleInvocation,
  ruleStyleUpdateRuleInvocation,
  ruleStyleReadStyleInvocation,
  ruleStyleSaveStyleInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const ruleStyleRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-rule-style', ruleStyleInvocations);
