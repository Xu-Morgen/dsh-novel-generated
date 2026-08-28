import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import {
  onboardingAnalysisBeginResultSchema,
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
 *
 * I57 adds the session-first `begin`/`result` pair (R12-4): `begin` creates the
 * job and returns its session id immediately, the client polls `status` and can
 * `cancel` mid-flight, then fetches the full candidate package through `result`
 * once the status reports `succeeded`. The legacy blocking `start` stays for
 * backward compatibility (adjudication tests / direct consumers).
 */
// I75：`param`/`analyzerInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const analyzerInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelOnboardingAnalyzer', method, parameters, resultSchema);

export const onboardingAnalysisBeginInvocation = analyzerInvocation('begin', [param('input', strictCodec('novel-creation-tool#onboardingAnalysisStartInput', onboardingAnalysisStartInputSchema)), param('settings', undefined, true)], strictCodec('novel-creation-tool#onboardingAnalysisBegin:result', onboardingAnalysisBeginResultSchema));
export const onboardingAnalysisStartInvocation = analyzerInvocation('start', [param('input', strictCodec('novel-creation-tool#onboardingAnalysisStartInput', onboardingAnalysisStartInputSchema)), param('settings', undefined, true)], strictCodec('novel-creation-tool#onboardingAnalysis:result', onboardingAnalysisResultSchema));
export const onboardingAnalysisStatusInvocation = analyzerInvocation('status', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#onboardingAnalysisStatus', onboardingAnalysisStatusSchema));
export const onboardingAnalysisCancelInvocation = analyzerInvocation('cancel', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#novelOnboardingAnalyzerCancel', z.undefined()));
export const onboardingAnalysisResultInvocation = analyzerInvocation('result', [param('onboardingSessionId', stringCodec)], strictCodec('novel-creation-tool#onboardingAnalysis:result', onboardingAnalysisResultSchema));
export const onboardingAnalyzerInvocations = [onboardingAnalysisBeginInvocation, onboardingAnalysisStartInvocation, onboardingAnalysisStatusInvocation, onboardingAnalysisCancelInvocation, onboardingAnalysisResultInvocation] as const;
// Unique `package` per client-mounted contribution (see editor.ts note).
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const onboardingAnalyzerRemoteContribution = remoteContribution('novel-creation-tool-analyzer', onboardingAnalyzerInvocations);
