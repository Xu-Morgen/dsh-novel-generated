import { z } from 'zod';
import type { IpcCodec, IpcMethodDescriptor } from './ipc-registry.js';
import { ruleStyleImportIdentitySchema, ruleStyleImportProjectionSchema, ruleStyleRegenerationDecisionSchema, ruleStyleRegenerationProposalSchema, type RuleStyleImportIdentity, type RuleStyleImportProjection, type RuleStyleRegenerationDecision, type RuleStyleRegenerationProposal } from '../core/schema/rule-style-import-initialization.js';

/** I201 additive calls share exact Main/Renderer inputs and canonical strict outputs. */
export interface RuleStyleRegenerationNamespace {
  prepareRegeneration(input: RuleStyleImportIdentity): Promise<RuleStyleRegenerationProposal>;
  regenerate(input: RuleStyleRegenerationDecision): Promise<RuleStyleImportProjection>;
  rejectRegeneration(input: RuleStyleRegenerationDecision): Promise<RuleStyleRegenerationProposal>;
}
const codec = <T>(name: string, schema: z.ZodType<T>): IpcCodec<T> => ({ mode: 'strict', typeSymbol: `novel-creation-tool#${name}`, schema: z.toJSONSchema(schema) as IpcCodec['schema'], parse: value => schema.parse(value) });
const descriptor = (method: keyof RuleStyleRegenerationNamespace, input: IpcCodec, result: IpcCodec): IpcMethodDescriptor => ({
  id: `novel-creation-tool/novelRuleStyleImportInitialization/${method}`, service: 'novelRuleStyleImportInitialization', namespace: 'novelRuleStyleImportInitialization', method,
  parameters: [{ name: 'input', wire: 'input', codec: input }], result,
});
/** These descriptors are locked alongside the unchanged legacy invocation baseline. */
export const ruleStyleRegenerationDescriptors = [
  descriptor('prepareRegeneration', codec('ruleStyleRegenerationIdentity', ruleStyleImportIdentitySchema), codec('ruleStyleRegenerationProposal', ruleStyleRegenerationProposalSchema)),
  descriptor('regenerate', codec('ruleStyleRegenerationDecision', ruleStyleRegenerationDecisionSchema), codec('ruleStyleRegenerationResult', ruleStyleImportProjectionSchema)),
  descriptor('rejectRegeneration', codec('ruleStyleRegenerationDecision', ruleStyleRegenerationDecisionSchema), codec('ruleStyleRegenerationProposal', ruleStyleRegenerationProposalSchema)),
] as const;
