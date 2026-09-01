import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { strictCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  importInterpretationAnalysisBeginResultSchema,
  importInterpretationAnalysisIdentitySchema,
  importInterpretationAnalysisResultSchema,
  importInterpretationAnalysisStatusResultSchema,
  importInterpretationInputSchema,
} from '../../core/schema/import-interpretation-analysis.js';

/** I143 zero-write source classifier Remote; Host owns paragraph ranges and the job lifecycle. */
const interpretationAnalysisInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelImportInterpretationAnalysis', method, parameters, resultSchema);

const identityParameter = () => param('input', strictCodec('novel-creation-tool#importInterpretationAnalysisIdentity', importInterpretationAnalysisIdentitySchema));

export const importInterpretationAnalysisBeginInvocation = interpretationAnalysisInvocation('begin', [
  param('input', strictCodec('novel-creation-tool#importInterpretationInput', importInterpretationInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#importInterpretationAnalysisBegin:result', importInterpretationAnalysisBeginResultSchema));
export const importInterpretationAnalysisStatusInvocation = interpretationAnalysisInvocation('status', [identityParameter()], strictCodec('novel-creation-tool#importInterpretationAnalysisStatus', importInterpretationAnalysisStatusResultSchema));
export const importInterpretationAnalysisCancelInvocation = interpretationAnalysisInvocation('cancel', [identityParameter()], strictCodec('novel-creation-tool#importInterpretationAnalysisCancel:result', importInterpretationAnalysisStatusResultSchema));
export const importInterpretationAnalysisResultInvocation = interpretationAnalysisInvocation('result', [identityParameter()], strictCodec('novel-creation-tool#importInterpretationAnalysis:result', importInterpretationAnalysisResultSchema));

export const importInterpretationAnalysisInvocations = [
  importInterpretationAnalysisBeginInvocation,
  importInterpretationAnalysisStatusInvocation,
  importInterpretationAnalysisCancelInvocation,
  importInterpretationAnalysisResultInvocation,
] as const;

export const importInterpretationAnalysisRemoteContribution = remoteContribution(
  'novel-creation-tool-import-interpretation-analysis',
  importInterpretationAnalysisInvocations,
);
