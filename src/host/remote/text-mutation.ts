import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import {
  chapterCreateMutationSchema,
  chapterMutationResultSchema,
  chapterUpdateMutationSchema,
  projectFingerprintSchema,
  projectReorderMutationSchema,
  projectReorderResultSchema,
  sceneCreateMutationSchema,
  sceneMutationResultSchema,
  sceneUpdateMutationSchema,
} from '../../core/schema/text-mutation.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/**
 * I104 additive C5 mutation Remote（design §14.14.2 / R18-1a）。
 *
 * Existing `novelWorkspace` read/edit/reparse invocations stay byte-compatible.
 * This namespace exposes only non-delete CRUD/reorder commands; hard deletion is
 * Host-only until I106 composes impact analysis with I11 ConfirmationGate.
 */
const textMutationInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelText', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
export const textFingerprintResultSchema = z.object({ fingerprint: projectFingerprintSchema }).strict();

export const textFingerprintInvocation = textMutationInvocation('fingerprint', [projectParameter], strictCodec('novel-creation-tool#novelText:fingerprint', textFingerprintResultSchema));
export const textChapterCreateInvocation = textMutationInvocation('chapterCreate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelText:chapterCreateInput', chapterCreateMutationSchema))], strictCodec('novel-creation-tool#novelText:chapterCreate', chapterMutationResultSchema));
export const textChapterUpdateInvocation = textMutationInvocation('chapterUpdate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelText:chapterUpdateInput', chapterUpdateMutationSchema))], strictCodec('novel-creation-tool#novelText:chapterUpdate', chapterMutationResultSchema));
export const textSceneCreateInvocation = textMutationInvocation('sceneCreate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelText:sceneCreateInput', sceneCreateMutationSchema))], strictCodec('novel-creation-tool#novelText:sceneCreate', sceneMutationResultSchema));
export const textSceneUpdateInvocation = textMutationInvocation('sceneUpdate', [projectParameter, param('input', strictCodec('novel-creation-tool#novelText:sceneUpdateInput', sceneUpdateMutationSchema))], strictCodec('novel-creation-tool#novelText:sceneUpdate', sceneMutationResultSchema));
export const textReorderInvocation = textMutationInvocation('reorder', [projectParameter, param('input', strictCodec('novel-creation-tool#novelText:reorderInput', projectReorderMutationSchema))], strictCodec('novel-creation-tool#novelText:reorder', projectReorderResultSchema));

export const textMutationInvocations = [
  textFingerprintInvocation,
  textChapterCreateInvocation,
  textChapterUpdateInvocation,
  textSceneCreateInvocation,
  textSceneUpdateInvocation,
  textReorderInvocation,
] as const;

export const textMutationRemoteContribution = remoteContribution('novel-creation-tool-text-mutations', textMutationInvocations);
