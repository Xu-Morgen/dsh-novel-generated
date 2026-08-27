import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { strictCodec, stringCodec, numberCodec, jsonCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import type { CharacterCore, CharacterCoreInput, CharacterCorePatch } from '../../core/schema/characters.js';
import type { WorldEntry, WorldEntryInput } from '../../core/schema/worldview.js';
import type { Outline, OutlineBeatCard, OutlineInput } from '../../core/schema/outline.js';
import type { Relationship, RelationshipInput } from '../../core/schema/relationship.js';
import type { WorldState } from '../../core/schema/state.js';
import type { CanonEventView, CanonQuery } from '../../core/canon/index.js';
import type { StateDiff } from '../../core/state/index.js';
import type { CanonCorrectionInput } from '../../core/schema/canon.js';
import type { ConfirmationRecord } from '../../core/schema/confirm.js';
import { uploadInvocations } from './upload.js';
import { projectLifecycleInvocations } from './project-lifecycle.js';
import { c5Invocations } from './text.js';
import { characterCoreSchema } from '../../core/schema/characters.js';
import { worldEntrySchema } from '../../core/schema/worldview.js';
import { outlineSchema, detailBeatSchema } from '../../core/schema/outline.js';
import { relationshipSchema } from '../../core/schema/relationship.js';
import { worldStateSchema } from '../../core/schema/state.js';
import { canonEventSchema } from '../../core/schema/canon.js';
import { confirmationRecordSchema } from '../../core/schema/confirm.js';

const canonEventViewSchema = canonEventSchema.extend({ supersededBy: z.string().nullable() });
const outlineBeatCardSchema = z.object({ actId: z.string(), beatId: z.string(), beatTitle: z.string(), detailBeat: detailBeatSchema });
const stateDiffSchema = z.object({ fromSeq: z.number(), toSeq: z.number(), changes: z.array(z.object({ path: z.string(), before: z.unknown(), after: z.unknown() })) });
const worldviewRewriteResultSchema = z.object({ superseded: worldEntrySchema, replacement: worldEntrySchema });
const canonCorrectionAcceptResultSchema = z.object({ confirmation: confirmationRecordSchema, event: z.unknown() });
// I75：`param` 统一到 shared 接线层；`editorInvocation` 只保留 strictCodec 包装
// （保持既有 typeSymbol `novel-creation-tool#${method}:result`，见架构审查 §6.3/§9#1）。
const editorInvocation = (service: string, method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: { parse(value: unknown): unknown }): InvocationDescriptor =>
  remoteInvocation(service, method, parameters, strictCodec(`novel-creation-tool#${method}:result`, resultSchema));
const projectParameter = param('projectId', stringCodec);
const entityParameter = param('entityId', stringCodec);
const inputParameter = param('input');
const patchParameter = param('patch');
const seqParameter = param('seq', numberCodec);
const fromSeqParameter = param('fromSeq', numberCodec);
const toSeqParameter = param('toSeq', numberCodec);
// `filter` is optional: the Client drops `undefined` positional values, so the
// gateway only accepts an absent wire field when the descriptor marks it so
// (dsh-api-gateway `assertExactArguments`).
const filterParameter = param('filter', undefined, true);
const targetIdParameter = param('targetId', stringCodec);
const proposalIdParameter = param('proposalId', stringCodec);
export interface WorkspaceViewModel { readonly product: 'novel-creation-tool'; readonly version: '2.0.0'; readonly ready: true; readonly capabilities: readonly ['generate', 'rewrite', 'continue', 'inspire']; }
export const NOVEL_WORKSPACE_NAMESPACE = 'novelWorkspace';
export function workspaceViewModel(): WorkspaceViewModel { return { product: 'novel-creation-tool', version: '2.0.0', ready: true, capabilities: ['generate', 'rewrite', 'continue', 'inspire'] }; }
export const workspaceViewModelInvocation: InvocationDescriptor = { id: 'novel-creation-tool/novelWorkspace/viewModel', service: NOVEL_WORKSPACE_NAMESPACE, namespace: NOVEL_WORKSPACE_NAMESPACE, method: 'viewModel', invocation: { kind: 'direct' }, parameters: [], result: strictCodec('novel-creation-tool#workspaceViewModel', z.object({ product: z.literal('novel-creation-tool'), version: z.literal('2.0.0'), ready: z.literal(true), capabilities: z.array(z.enum(['generate', 'rewrite', 'continue', 'inspire'])) })) };
export const characterListInvocation = editorInvocation('novelWorkspace', 'characterList', [projectParameter], z.array(characterCoreSchema));
export const characterReadInvocation = editorInvocation('novelWorkspace', 'characterRead', [projectParameter, entityParameter], characterCoreSchema);
export const characterCreateInvocation = editorInvocation('novelWorkspace', 'characterCreate', [projectParameter, inputParameter], characterCoreSchema);
export const characterUpdateInvocation = editorInvocation('novelWorkspace', 'characterUpdate', [projectParameter, entityParameter, patchParameter], characterCoreSchema);
export const worldviewListInvocation = editorInvocation('novelWorkspace', 'worldviewList', [projectParameter], z.array(worldEntrySchema));
export const worldviewReadInvocation = editorInvocation('novelWorkspace', 'worldviewRead', [projectParameter, entityParameter], worldEntrySchema);
export const worldviewCreateInvocation = editorInvocation('novelWorkspace', 'worldviewCreate', [projectParameter, inputParameter], worldEntrySchema);
export const worldviewRewriteInvocation = editorInvocation('novelWorkspace', 'worldviewRewrite', [projectParameter, entityParameter, inputParameter], worldviewRewriteResultSchema);
export const outlineReadInvocation = editorInvocation('novelWorkspace', 'outlineRead', [projectParameter], outlineSchema);
export const outlineSaveInvocation = editorInvocation('novelWorkspace', 'outlineSave', [projectParameter, inputParameter], outlineSchema);
export const outlineBeatCardsInvocation = editorInvocation('novelWorkspace', 'outlineBeatCards', [projectParameter], z.array(outlineBeatCardSchema));
export const relationshipReadInvocation = editorInvocation('novelWorkspace', 'relationshipRead', [projectParameter], z.array(relationshipSchema));
export const relationshipSaveInvocation = editorInvocation('novelWorkspace', 'relationshipSave', [projectParameter, inputParameter], relationshipSchema);
export const stateCurrentInvocation = editorInvocation('novelWorkspace', 'stateCurrent', [projectParameter], worldStateSchema);
export const stateSnapshotsInvocation = editorInvocation('novelWorkspace', 'stateSnapshots', [projectParameter], z.array(worldStateSchema));
export const stateRollbackInvocation = editorInvocation('novelWorkspace', 'stateRollback', [projectParameter, seqParameter], worldStateSchema);
export const stateDiffInvocation = editorInvocation('novelWorkspace', 'stateDiff', [projectParameter, fromSeqParameter, toSeqParameter], stateDiffSchema);
export const canonQueryInvocation = editorInvocation('novelWorkspace', 'canonQuery', [projectParameter, filterParameter], z.array(canonEventViewSchema));
export const canonCorrectionProposeInvocation = editorInvocation('novelWorkspace', 'canonCorrectionPropose', [projectParameter, targetIdParameter, inputParameter], confirmationRecordSchema);
export const canonCorrectionAcceptInvocation = editorInvocation('novelWorkspace', 'canonCorrectionAccept', [projectParameter, proposalIdParameter], canonCorrectionAcceptResultSchema);
export const editorInvocations = [characterListInvocation, characterReadInvocation, characterCreateInvocation, characterUpdateInvocation, worldviewListInvocation, worldviewReadInvocation, worldviewCreateInvocation, worldviewRewriteInvocation, outlineReadInvocation, outlineSaveInvocation, outlineBeatCardsInvocation, relationshipReadInvocation, relationshipSaveInvocation, stateCurrentInvocation, stateSnapshotsInvocation, stateRollbackInvocation, stateDiffInvocation, canonQueryInvocation, canonCorrectionProposeInvocation, canonCorrectionAcceptInvocation, ...c5Invocations] as const;
export const workspaceContribution: TypertContribution = { package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: [workspaceViewModelInvocation, ...editorInvocations] };
// Client-mounted contributions must each carry a UNIQUE `package`: the client
// Typert registry rejects a second mount whose package is already registered
// (`RemoteStore.register` → "Remote package ... is already registered").
// I60 C5 只读方法（chapterList/chapterRead/sceneRead）经 editorInvocations 并入
// 同一 workspace 挂载面（editorInvocations 已含 c5Invocations，不再重复展开）。
export const workspaceRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-workspace', [workspaceViewModelInvocation, ...editorInvocations, ...uploadInvocations, ...projectLifecycleInvocations]);
export type { CharacterCore, CharacterCoreInput, CharacterCorePatch, WorldEntry, WorldEntryInput, Outline, OutlineBeatCard, OutlineInput, Relationship, RelationshipInput, WorldState, CanonEventView, CanonQuery, StateDiff, CanonCorrectionInput, ConfirmationRecord };
