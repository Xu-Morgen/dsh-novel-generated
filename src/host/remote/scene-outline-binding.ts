import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import {
  sceneOutlineBindingImpactInputSchema,
  sceneOutlineBindingImpactResultSchema,
  sceneOutlineBindingReadResultSchema,
  sceneOutlineBindingRebindSchema,
  sceneOutlineBindingSaveSchema,
  sceneOutlineBindingUnbindSchema,
} from '../../core/schema/scene-outline-binding.js';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';

/** I105 additive binding namespace; existing Remote descriptors remain unchanged. */
const bindingInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  result: R,
) => remoteInvocation('novelSceneOutlineBinding', method, parameters, result);

const projectParameter = param('projectId', stringCodec);
const readResultCodec = strictCodec('novel-creation-tool#novelSceneOutlineBinding:read', sceneOutlineBindingReadResultSchema);

export const sceneOutlineBindingReadInvocation = bindingInvocation('read', [projectParameter], readResultCodec);
export const sceneOutlineBindingSaveInvocation = bindingInvocation('save', [projectParameter, param('input', strictCodec('novel-creation-tool#novelSceneOutlineBinding:saveInput', sceneOutlineBindingSaveSchema))], readResultCodec);
export const sceneOutlineBindingRebindInvocation = bindingInvocation('rebind', [projectParameter, param('input', strictCodec('novel-creation-tool#novelSceneOutlineBinding:rebindInput', sceneOutlineBindingRebindSchema))], readResultCodec);
export const sceneOutlineBindingUnbindInvocation = bindingInvocation('unbind', [projectParameter, param('input', strictCodec('novel-creation-tool#novelSceneOutlineBinding:unbindInput', sceneOutlineBindingUnbindSchema))], readResultCodec);
export const sceneOutlineBindingImpactInvocation = bindingInvocation('impact', [projectParameter, param('input', strictCodec('novel-creation-tool#novelSceneOutlineBinding:impactInput', sceneOutlineBindingImpactInputSchema))], strictCodec('novel-creation-tool#novelSceneOutlineBinding:impact', sceneOutlineBindingImpactResultSchema));

export const sceneOutlineBindingInvocations = [
  sceneOutlineBindingReadInvocation,
  sceneOutlineBindingSaveInvocation,
  sceneOutlineBindingRebindInvocation,
  sceneOutlineBindingUnbindInvocation,
  sceneOutlineBindingImpactInvocation,
] as const;

export const sceneOutlineBindingRemoteContribution = remoteContribution('novel-creation-tool-scene-outline-binding', sceneOutlineBindingInvocations);
