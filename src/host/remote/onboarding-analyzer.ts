import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import {
  onboardingAnalysisResultSchema,
  onboardingAnalysisStartInputSchema,
  onboardingAnalysisStatusSchema,
} from '../../core/schema/onboarding.js';

/**
 * I52→I53 Host analyzer Remote: start/status/cancel/regenerate for the six-layer
 * candidate package. I53 drives start from the client (free-text or DOCX-derived
 * text), then reviews/adjudicates/lands via the `novelOnboarding` adjudication
 * Remote. This namespace stays strictly candidate-producing; it never writes a
 * layer (I53 owns the Gate-backed apply).
 */
const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown())): InvocationParameterDescriptor => ({ name, wire: name, source: 'json', codec });

function analyzerInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelOnboardingAnalyzer/${method}`, service: 'novelOnboardingAnalyzer', namespace: 'novelOnboardingAnalyzer', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

export const onboardingAnalysisStartInvocation = analyzerInvocation('start', [param('input', strictCodec('novel-creation-tool#onboardingAnalysisStartInput', onboardingAnalysisStartInputSchema)), param('settings')], strictCodec('novel-creation-tool#onboardingAnalysis:result', onboardingAnalysisResultSchema));
export const onboardingAnalysisStatusInvocation = analyzerInvocation('status', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#onboardingAnalysisStatus', onboardingAnalysisStatusSchema));
export const onboardingAnalysisCancelInvocation = analyzerInvocation('cancel', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#novelOnboardingAnalyzerCancel', z.undefined()));
export const onboardingAnalyzerInvocations = [onboardingAnalysisStartInvocation, onboardingAnalysisStatusInvocation, onboardingAnalysisCancelInvocation] as const;
export const onboardingAnalyzerRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool', descriptors: [...onboardingAnalyzerInvocations] };
