import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';

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

export const ruleScopeWireSchema = z.enum(['global', 'faction', 'location', 'character', 'item']);
export const ruleKindWireSchema = z.enum(['physics', 'magic', 'technology', 'genre', 'taboo', 'permission']);

/** 管理面 wire 规则：priority 收敛到 1–100（core schema 开放整数；越界在此层拒）。 */
export const ruleWireSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.number().int().positive(),
  scope: ruleScopeWireSchema,
  kind: ruleKindWireSchema,
  statement: z.string().trim().min(1),
  priority: z.number().int().min(1).max(100),
  immutable: z.boolean(),
  examples: z.array(z.string()),
  active: z.boolean(),
}).strict();

export const narrativePersonWireSchema = z.enum(['first', 'second', 'third-limited', 'third-omniscient']);
export const narrativeTenseWireSchema = z.enum(['past', 'present']);
export const povScopeWireSchema = z.enum(['single', 'multi', 'omniscient']);

export const styleWireSchema = z.object({
  id: z.string().min(1).max(64),
  version: z.number().int().positive(),
  name: z.string().trim().min(1),
  person: narrativePersonWireSchema,
  tense: narrativeTenseWireSchema,
  povScope: povScopeWireSchema,
  tone: z.string().trim().min(1),
  proseStyle: z.string().trim().min(1),
  chapterFormat: z.string().trim().min(1),
  dialogueConventions: z.string().trim().min(1),
  forbidden: z.array(z.string().trim().min(1)),
}).strict();

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

const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown()), optional = false): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec, ...(optional ? { acceptsUndefined: true } : {}) });

function ruleStyleInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelRuleStyleManager/${method}`, service: 'novelRuleStyleManager', namespace: 'novelRuleStyleManager', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

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
export const ruleStyleRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool-rule-style', descriptors: [...ruleStyleInvocations] };
