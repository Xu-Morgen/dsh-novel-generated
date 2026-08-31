import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkRemoteContractLock, checkShapeLock } from './contract-lock.js';
import { hostContribution } from './host/remote/host-contribution.js';
import { branchAggregateInvocation, branchChooseFreshInvocation, branchInvocations } from './host/remote/branch.js';
import { writingAcceptFinalizationInvocation, writingInvocations, writingAdoptDraftInvocation, writingCancelFinalizationPlanInvocation, writingPrepareFinalizationPlanInvocation, writingPreviewLayersInvocation, writingProposeAtInvocation, writingProposeFinalizationInvocation, writingReadFinalizationPlanInvocation, writingRejectFinalizationInvocation } from './host/remote/writing.js';
import { bookReadinessInvocation, bookScanInvocation, reviewInvocations } from './host/remote/review.js';
import { c5Invocations, sceneReparsePreviewInvocation } from './host/remote/text.js';
import { textMutationInvocations } from './host/remote/text-mutation.js';
import { queueStartAtInvocation } from './host/remote/queue.js';
import {
  sceneOutlineBindingImpactInvocation,
  sceneOutlineBindingInvocations,
  sceneOutlineBindingReadInvocation,
} from './host/remote/scene-outline-binding.js';
import { textDeletionInvocations } from './host/remote/text-deletion.js';
import { outlineGenerationBaselineInvocations } from './host/remote/outline-generation-baseline.js';
import { textChangeImpactInvocations } from './host/remote/text-change-impact.js';
import { outlineReconciliationApplicationInvocations, outlineReconciliationPlannerInvocations } from './host/remote/outline-reconciliation.js';
import { referenceAuditInvocations } from './host/remote/reference-audit.js';
import { referenceCorrectionInvocations } from './host/remote/reference-correction.js';
import { longDraftInvocations } from './host/remote/long-draft.js';
import { reviewRepairInvocations } from './host/remote/review-repair.js';
import { outlineGenerationScopeInvocations } from './host/remote/outline-generation-scope.js';
import { outlineDetailGenerationInvocations } from './host/remote/outline-detail-generation.js';
import { compileManuscriptInvocation } from './host/remote/import-export.js';
import { characterFormSchema, outlineFormSchema, relationshipFormSchema, worldFormSchema } from './client/shapes.js';
import { actSchema, beatSchema, detailBeatSchema } from './core/schema/outline.js';
import { uploadChunkResultSchema, uploadFinalizeResultSchema, uploadStartInputSchema, uploadStartResultSchema, docxTextChunkSchema } from './core/schema/upload.js';
import { projectMetaSchema } from './core/schema/base.js';
import { createProjectInputSchema, projectLayerReadinessSchema, projectOpenResultSchema } from './core/schema/project-lifecycle.js';
import { characterCoreSchema } from './core/schema/characters.js';
import { outlineSchema } from './core/schema/outline.js';

/**
 * I78 `contracts/` 形状本体契约锁一致性断言（design §14.12 ③ / D22；验收：
 * 契约锁与实现一致性断言 —— 形状漂移即失败）。锁文件由
 * `pnpm run update:contracts` 有意识再生成，未经再生成的实现/锁改动必失败。
 */

const readLock = (path: string): { shapes?: Record<string, unknown> } =>
  JSON.parse(readFileSync(new URL(`../contracts/${path}`, import.meta.url), 'utf8'));

const remoteLock = JSON.parse(readFileSync(new URL('../contracts/stage18/remote-descriptors.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};
const i105DescriptorIds = new Set([
  ...sceneOutlineBindingInvocations.map((descriptor) => descriptor.id),
  writingProposeAtInvocation.id,
  queueStartAtInvocation.id,
  ...textDeletionInvocations.map((descriptor) => descriptor.id),
]);
const i108DescriptorIds = new Set(outlineGenerationBaselineInvocations.map((descriptor) => descriptor.id));
const i110DescriptorIds = new Set([writingPreviewLayersInvocation.id]);
const i111DescriptorIds = new Set([sceneReparsePreviewInvocation.id]);
const i112DescriptorIds = new Set(textChangeImpactInvocations.map((descriptor) => descriptor.id));
const i113DescriptorIds = new Set(outlineReconciliationPlannerInvocations.map((descriptor) => descriptor.id));
const i114DescriptorIds = new Set(outlineReconciliationApplicationInvocations.map((descriptor) => descriptor.id));
const i116DescriptorIds = new Set(referenceAuditInvocations.map((descriptor) => descriptor.id));
const i118DescriptorIds = new Set(referenceCorrectionInvocations.map((descriptor) => descriptor.id));
const i119DescriptorIds = new Set(longDraftInvocations.slice(0, 5).map((descriptor) => descriptor.id));
const i120DescriptorIds = new Set(longDraftInvocations.slice(5).map((descriptor) => descriptor.id));
const i130DescriptorIds = new Set([branchAggregateInvocation.id]);
const i131DescriptorIds = new Set([branchChooseFreshInvocation.id]);
const i133DescriptorIds = new Set(outlineGenerationScopeInvocations.map((descriptor) => descriptor.id));
const i134DescriptorIds = new Set(outlineDetailGenerationInvocations.map((descriptor) => descriptor.id));
const i135DescriptorIds = new Set([
  writingAdoptDraftInvocation.id,
  writingPrepareFinalizationPlanInvocation.id,
  writingReadFinalizationPlanInvocation.id,
  writingCancelFinalizationPlanInvocation.id,
]);
const i136DescriptorIds = new Set([
  writingProposeFinalizationInvocation.id,
  writingAcceptFinalizationInvocation.id,
  writingRejectFinalizationInvocation.id,
]);
const i137DescriptorIds = new Set([bookReadinessInvocation.id, bookScanInvocation.id]);
const i138DescriptorIds = new Set([compileManuscriptInvocation.id]);
const stage18Descriptors = [
  ...hostContribution.invocations.filter((descriptor) => !i105DescriptorIds.has(descriptor.id) && !i108DescriptorIds.has(descriptor.id) && !i110DescriptorIds.has(descriptor.id) && !i111DescriptorIds.has(descriptor.id) && !i112DescriptorIds.has(descriptor.id) && !i113DescriptorIds.has(descriptor.id) && !i114DescriptorIds.has(descriptor.id) && !i116DescriptorIds.has(descriptor.id) && !i118DescriptorIds.has(descriptor.id) && !i119DescriptorIds.has(descriptor.id) && !i120DescriptorIds.has(descriptor.id) && !i130DescriptorIds.has(descriptor.id) && !i131DescriptorIds.has(descriptor.id) && !i133DescriptorIds.has(descriptor.id) && !i134DescriptorIds.has(descriptor.id) && !i135DescriptorIds.has(descriptor.id) && !i136DescriptorIds.has(descriptor.id) && !i137DescriptorIds.has(descriptor.id) && !i138DescriptorIds.has(descriptor.id)),
  ...sceneOutlineBindingInvocations,
  writingProposeAtInvocation,
  queueStartAtInvocation,
  ...textDeletionInvocations,
  ...outlineGenerationBaselineInvocations,
  writingPreviewLayersInvocation,
  sceneReparsePreviewInvocation,
  ...textChangeImpactInvocations,
  ...outlineReconciliationPlannerInvocations,
  ...outlineReconciliationApplicationInvocations,
  ...referenceAuditInvocations,
  ...referenceCorrectionInvocations,
  ...longDraftInvocations,
  branchAggregateInvocation,
  branchChooseFreshInvocation,
  ...reviewRepairInvocations,
  ...outlineGenerationScopeInvocations,
  ...outlineDetailGenerationInvocations,
  writingAdoptDraftInvocation,
  writingPrepareFinalizationPlanInvocation,
  writingReadFinalizationPlanInvocation,
  writingCancelFinalizationPlanInvocation,
  writingProposeFinalizationInvocation,
  writingAcceptFinalizationInvocation,
  writingRejectFinalizationInvocation,
  bookReadinessInvocation,
  bookScanInvocation,
  compileManuscriptInvocation,
];
const stage18ResultDescriptors = [
  ...branchInvocations.filter((descriptor) => !i130DescriptorIds.has(descriptor.id) && !i131DescriptorIds.has(descriptor.id)),
  ...writingInvocations.filter((descriptor) => descriptor !== writingProposeAtInvocation && descriptor !== writingPreviewLayersInvocation && !i135DescriptorIds.has(descriptor.id) && !i136DescriptorIds.has(descriptor.id)),
  ...reviewInvocations.filter((descriptor) => !i137DescriptorIds.has(descriptor.id)),
  ...c5Invocations.filter((descriptor) => descriptor !== sceneReparsePreviewInvocation),
  ...textMutationInvocations,
  sceneOutlineBindingReadInvocation,
  sceneOutlineBindingImpactInvocation,
  writingProposeAtInvocation,
  queueStartAtInvocation,
  ...textDeletionInvocations,
  ...outlineGenerationBaselineInvocations,
  writingPreviewLayersInvocation,
  sceneReparsePreviewInvocation,
  ...textChangeImpactInvocations,
  ...outlineReconciliationPlannerInvocations,
  ...outlineReconciliationApplicationInvocations,
  ...referenceAuditInvocations,
  ...referenceCorrectionInvocations,
  ...longDraftInvocations,
  branchAggregateInvocation,
  branchChooseFreshInvocation,
  ...reviewRepairInvocations,
  ...outlineGenerationScopeInvocations,
  ...outlineDetailGenerationInvocations,
  writingAdoptDraftInvocation,
  writingPrepareFinalizationPlanInvocation,
  writingReadFinalizationPlanInvocation,
  writingCancelFinalizationPlanInvocation,
  writingProposeFinalizationInvocation,
  writingAcceptFinalizationInvocation,
  writingRejectFinalizationInvocation,
  bookReadinessInvocation,
  bookScanInvocation,
  compileManuscriptInvocation,
];

const docxSchemas: Record<string, z.ZodType> = {
  UploadStartInput: uploadStartInputSchema,
  UploadStartResult: uploadStartResultSchema,
  UploadChunkResult: uploadChunkResultSchema,
  UploadFinalizeResult: uploadFinalizeResultSchema,
  DocxTextChunk: docxTextChunkSchema,
};

const lifecycleSchemas: Record<string, z.ZodType> = {
  ProjectMeta: projectMetaSchema,
  CreateProjectInput: createProjectInputSchema,
  ProjectOpenResult: projectOpenResultSchema,
  ProjectLayerReadiness: projectLayerReadinessSchema,
};

const clientProjectionSchemas: Record<string, z.ZodType> = {
  CharacterShape: characterFormSchema,
  OutlineShape: outlineFormSchema,
  OutlineActShape: actSchema,
  OutlineBeatShape: beatSchema,
  OutlineDetailBeatShape: detailBeatSchema,
  RelationshipShape: relationshipFormSchema,
  WorldShape: worldFormSchema,
};

describe('contracts/ 形状本体契约锁', () => {
  it('docx-upload 契约锁与实现一致', () => {
    expect(checkShapeLock(readLock('stage10/docx-upload.json'), docxSchemas)).toEqual([]);
  });

  it('project-lifecycle 契约锁与实现一致', () => {
    expect(checkShapeLock(readLock('stage10/project-lifecycle.json'), lifecycleSchemas)).toEqual([]);
  });

  it('client-projection 契约锁与实现一致（CharacterShape/OutlineShape 等）', () => {
    expect(checkShapeLock(readLock('stage15/client-projection.json'), clientProjectionSchemas)).toEqual([]);
  });

  it('负向：实现形状漂移（改用 canonical 全量 schema 冒充表单模型）必须失败', () => {
    const drifted = { ...clientProjectionSchemas, CharacterShape: characterCoreSchema };
    const diffs = checkShapeLock(readLock('stage15/client-projection.json'), drifted);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.join('\n')).toContain('CharacterShape');
  });

  it('负向：契约锁缺少实现 shapeId 本体必须失败', () => {
    const diffs = checkShapeLock({ shapes: {} }, { CharacterShape: characterFormSchema });
    expect(diffs.join('\n')).toContain('CharacterShape');
  });

  it('负向：契约锁含未实现 shapeId 必须失败', () => {
    const diffs = checkShapeLock({ shapes: { GhostShape: {} } }, {});
    expect(diffs.join('\n')).toContain('GhostShape');
  });
});

describe('I103 contracts/stage18 Remote descriptor baseline', () => {
  it('I122 新增 polishMode 后，前 115 descriptor / 24 result JSON bodies 与当前基线逐字一致', () => {
    const oldDescriptors = Object.fromEntries(remoteLock.descriptorIds.slice(0, 115).map((id) => [id, remoteLock.descriptors[id]]));
    const oldResults = Object.fromEntries(remoteLock.resultSchemaIds.slice(0, 24).map((id) => [id, remoteLock.resultSchemas[id]]));
    expect(createHash('sha256').update(JSON.stringify(oldDescriptors)).digest('hex'))
      .toBe('30846a5d98213b32f77033374b31e21c9e7f0641ca9798f11f0b81084d000d86');
    expect(createHash('sha256').update(JSON.stringify(oldResults)).digest('hex'))
      .toBe('2d1e8f69102f7fa951ee480f4fc6833fed716add8f7c8aa306751ebe6fbc34ed');
  });

  it('锁定全部 Host invocation descriptor，I111 在 I110 五层 preview 后追加 reparse preview method / result', () => {
    expect(remoteLock.descriptorIds).toEqual(stage18Descriptors.map((descriptor) => descriptor.id));
    expect(remoteLock.resultSchemaIds).toEqual(stage18ResultDescriptors.map((descriptor) => descriptor.id));
    expect(remoteLock.descriptorIds).toHaveLength(181);
    expect(remoteLock.resultSchemaIds).toHaveLength(87);
    const descriptorSuffix = [
      ...sceneOutlineBindingInvocations.map((descriptor) => descriptor.id),
      writingProposeAtInvocation.id,
      queueStartAtInvocation.id,
      ...textDeletionInvocations.map((descriptor) => descriptor.id),
      ...outlineGenerationBaselineInvocations.map((descriptor) => descriptor.id),
      writingPreviewLayersInvocation.id,
      sceneReparsePreviewInvocation.id,
      ...textChangeImpactInvocations.map((descriptor) => descriptor.id),
      ...outlineReconciliationPlannerInvocations.map((descriptor) => descriptor.id),
      ...outlineReconciliationApplicationInvocations.map((descriptor) => descriptor.id),
      ...referenceAuditInvocations.map((descriptor) => descriptor.id),
      ...referenceCorrectionInvocations.map((descriptor) => descriptor.id),
      ...longDraftInvocations.map((descriptor) => descriptor.id),
      branchAggregateInvocation.id,
      branchChooseFreshInvocation.id,
      ...reviewRepairInvocations.map((descriptor) => descriptor.id),
      ...outlineGenerationScopeInvocations.map((descriptor) => descriptor.id),
      ...outlineDetailGenerationInvocations.map((descriptor) => descriptor.id),
      writingAdoptDraftInvocation.id,
      writingPrepareFinalizationPlanInvocation.id,
      writingReadFinalizationPlanInvocation.id,
      writingCancelFinalizationPlanInvocation.id,
      writingProposeFinalizationInvocation.id,
      writingAcceptFinalizationInvocation.id,
      writingRejectFinalizationInvocation.id,
      bookReadinessInvocation.id,
      bookScanInvocation.id,
      compileManuscriptInvocation.id,
    ];
    expect(remoteLock.descriptorIds.slice(-descriptorSuffix.length)).toEqual(descriptorSuffix);
    const resultSuffix = [
      ...textDeletionInvocations.map((descriptor) => descriptor.id),
      ...outlineGenerationBaselineInvocations.map((descriptor) => descriptor.id),
      writingPreviewLayersInvocation.id,
      sceneReparsePreviewInvocation.id,
      ...textChangeImpactInvocations.map((descriptor) => descriptor.id),
      ...outlineReconciliationPlannerInvocations.map((descriptor) => descriptor.id),
      ...outlineReconciliationApplicationInvocations.map((descriptor) => descriptor.id),
      ...referenceAuditInvocations.map((descriptor) => descriptor.id),
      ...referenceCorrectionInvocations.map((descriptor) => descriptor.id),
      ...longDraftInvocations.map((descriptor) => descriptor.id),
      branchAggregateInvocation.id,
      branchChooseFreshInvocation.id,
      ...reviewRepairInvocations.map((descriptor) => descriptor.id),
      ...outlineGenerationScopeInvocations.map((descriptor) => descriptor.id),
      ...outlineDetailGenerationInvocations.map((descriptor) => descriptor.id),
      writingAdoptDraftInvocation.id,
      writingPrepareFinalizationPlanInvocation.id,
      writingReadFinalizationPlanInvocation.id,
      writingCancelFinalizationPlanInvocation.id,
      writingProposeFinalizationInvocation.id,
      writingAcceptFinalizationInvocation.id,
      writingRejectFinalizationInvocation.id,
      bookReadinessInvocation.id,
      bookScanInvocation.id,
      compileManuscriptInvocation.id,
    ];
    expect(remoteLock.resultSchemaIds.slice(-resultSuffix.length)).toEqual(resultSuffix);
    expect(checkRemoteContractLock(remoteLock, stage18Descriptors, stage18ResultDescriptors)).toEqual([]);
  });

  it('负向：descriptor 字段漂移必须失败', () => {
    const drifted = structuredClone(remoteLock);
    const firstId = drifted.descriptorIds[0];
    (drifted.descriptors[firstId] as { method: string }).method = 'drifted-method';
    expect(checkRemoteContractLock(drifted, stage18Descriptors, stage18ResultDescriptors).join('\n')).toContain('descriptor baseline');
  });

  it('负向：result schema 缺字段或多字段必须失败', () => {
    const missing = structuredClone(remoteLock);
    delete missing.resultSchemas[missing.resultSchemaIds[0]];
    expect(checkRemoteContractLock(missing, stage18Descriptors, stage18ResultDescriptors).join('\n')).toContain('result JSON schema');

    const extra = structuredClone(remoteLock);
    extra.resultSchemas['novel-creation-tool/ghost/result'] = {};
    expect(checkRemoteContractLock(extra, stage18Descriptors, stage18ResultDescriptors).join('\n')).toContain('result JSON schema');
  });
});
