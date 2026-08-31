import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { referenceAuditListInputSchema, referenceAuditListResultSchema } from '../../core/schema/reference-audit.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/**
 * I116 additive audit projection. It exposes bounded mechanism evidence only;
 * retry remains a Host coordinator seam and no error-marking UI is introduced
 * until I117 (design §14.14.2 / plan §18 I116).
 */
const auditInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelReferenceAudit', method, parameters, result);

export const referenceAuditListInvocation = auditInvocation(
  'list',
  [
    param('projectId', stringCodec),
    param('input', strictCodec('novel-creation-tool#novelReferenceAudit:listInput', referenceAuditListInputSchema.optional()), true),
  ],
  strictCodec('novel-creation-tool#novelReferenceAudit:list', referenceAuditListResultSchema),
);

export const referenceAuditInvocations = [referenceAuditListInvocation] as const;
export const referenceAuditRemoteContribution = remoteContribution('novel-creation-tool-reference-audit', referenceAuditInvocations);
