import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  importInterpretationSessionConfirmInputSchema,
  importInterpretationSessionCreateInputSchema,
  importInterpretationSessionDiscardInputSchema,
  importInterpretationSessionReadInputSchema,
  importInterpretationSessionSchema,
} from '../../core/schema/import-interpretation-session.js';

/** I142 manual checkpoint Remote; every command is bound to project and source hash. */
const importInterpretationInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelImportInterpretation', method, parameters, resultSchema);

const sessionResult = strictCodec('novel-creation-tool#importInterpretationSession:result', importInterpretationSessionSchema);

export const importInterpretationCreateInvocation = importInterpretationInvocation('create', [
  param('input', strictCodec('novel-creation-tool#importInterpretationSessionCreateInput', importInterpretationSessionCreateInputSchema)),
], sessionResult);
export const importInterpretationReadInvocation = importInterpretationInvocation('read', [
  param('input', strictCodec('novel-creation-tool#importInterpretationSessionReadInput', importInterpretationSessionReadInputSchema)),
], sessionResult);
export const importInterpretationConfirmInvocation = importInterpretationInvocation('confirm', [
  param('input', strictCodec('novel-creation-tool#importInterpretationSessionConfirmInput', importInterpretationSessionConfirmInputSchema)),
], sessionResult);
export const importInterpretationDiscardInvocation = importInterpretationInvocation('discard', [
  param('input', strictCodec('novel-creation-tool#importInterpretationSessionDiscardInput', importInterpretationSessionDiscardInputSchema)),
], sessionResult);

export const importInterpretationInvocations = [
  importInterpretationCreateInvocation,
  importInterpretationReadInvocation,
  importInterpretationConfirmInvocation,
  importInterpretationDiscardInvocation,
] as const;

export const importInterpretationRemoteContribution = remoteContribution(
  'novel-creation-tool-import-interpretation',
  importInterpretationInvocations,
);
