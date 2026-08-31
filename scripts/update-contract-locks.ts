/**
 * I78 `contracts/` 形状本体契约锁再生成工具（design D22；架构审查 §6.3）。
 *
 * 用法：`pnpm run update:contracts`（tsx 直读 src 实现 schema）。
 * 语义：以当前实现 zod schema 经 `z.toJSONSchema` 重新生成形状本体并写回锁文件。
 * 这是「有意识改契约」的唯一入口 —— 未经本工具再生成、直接改动锁文件或实现，
 * `pnpm test`（src/contract-lock.test.ts）与 `pnpm run verify:i78`（smoke-i78）
 * 的一致性断言都会失败（形状漂移即失败）。本工具不是构建步骤，不引入第二构建面。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { remoteDescriptorLockBodies, remoteResultShapeBodies, shapeLockBody } from '../src/contract-lock.js';
import { hostContribution } from '../src/host/remote/host-contribution.js';
import { branchAggregateInvocation, branchChooseFreshInvocation, branchInvocations } from '../src/host/remote/branch.js';
import { writingInvocations, writingPreviewLayersInvocation, writingProposeAtInvocation } from '../src/host/remote/writing.js';
import { reviewInvocations } from '../src/host/remote/review.js';
import { c5Invocations, sceneReparsePreviewInvocation } from '../src/host/remote/text.js';
import { textMutationInvocations } from '../src/host/remote/text-mutation.js';
import { queueStartAtInvocation } from '../src/host/remote/queue.js';
import {
  sceneOutlineBindingImpactInvocation,
  sceneOutlineBindingInvocations,
  sceneOutlineBindingReadInvocation,
} from '../src/host/remote/scene-outline-binding.js';
import { textDeletionInvocations } from '../src/host/remote/text-deletion.js';
import { outlineGenerationBaselineInvocations } from '../src/host/remote/outline-generation-baseline.js';
import { textChangeImpactInvocations } from '../src/host/remote/text-change-impact.js';
import { outlineReconciliationApplicationInvocations, outlineReconciliationPlannerInvocations } from '../src/host/remote/outline-reconciliation.js';
import { referenceAuditInvocations } from '../src/host/remote/reference-audit.js';
import { referenceCorrectionInvocations } from '../src/host/remote/reference-correction.js';
import { longDraftInvocations } from '../src/host/remote/long-draft.js';
import { reviewRepairInvocations } from '../src/host/remote/review-repair.js';
import { outlineGenerationScopeInvocations } from '../src/host/remote/outline-generation-scope.js';
import {
  uploadChunkResultSchema,
  uploadFinalizeResultSchema,
  uploadStartInputSchema,
  uploadStartResultSchema,
  docxTextChunkSchema,
} from '../src/core/schema/upload.js';
import { projectMetaSchema } from '../src/core/schema/base.js';
import {
  createProjectInputSchema,
  projectLayerReadinessSchema,
  projectOpenResultSchema,
} from '../src/core/schema/project-lifecycle.js';
import {
  characterFormSchema,
  outlineFormSchema,
  relationshipFormSchema,
  worldFormSchema,
} from '../src/client/shapes.js';
import { actSchema, beatSchema, detailBeatSchema } from '../src/core/schema/outline.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => JSON.parse(readFileSync(resolve(repoRoot, p), 'utf8'));
const write = (p, value) => {
  const target = resolve(repoRoot, p);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

/** 现有锁：保留原文件其余字段，仅重生成 shapes 本体。 */
const EXISTING_LOCKS = [
  {
    file: 'contracts/stage10/docx-upload.json',
    shapes: {
      UploadStartInput: uploadStartInputSchema,
      UploadStartResult: uploadStartResultSchema,
      UploadChunkResult: uploadChunkResultSchema,
      UploadFinalizeResult: uploadFinalizeResultSchema,
      DocxTextChunk: docxTextChunkSchema,
    },
  },
  {
    file: 'contracts/stage10/project-lifecycle.json',
    shapes: {
      ProjectMeta: projectMetaSchema,
      CreateProjectInput: createProjectInputSchema,
      ProjectOpenResult: projectOpenResultSchema,
      ProjectLayerReadiness: projectLayerReadinessSchema,
    },
  },
] as const;

/** 新增锁：I78 客户投影形状本体（编辑器表单模型，派生自 core schema）。 */
const CLIENT_PROJECTION_LOCK = {
  file: 'contracts/stage15/client-projection.json',
  namespace: 'clientProjection',
  contractNote: 'I78 Client 投影形状契约锁：CharacterShape/OutlineShape/RelationshipShape/WorldShape 为编辑器表单模型，派生自 canonical core schema（见 src/client/shapes.ts）；OutlineAct/Beat/DetailBeat 直接锁定 canonical 嵌套 schema。',
  shapes: {
    CharacterShape: characterFormSchema,
    OutlineShape: outlineFormSchema,
    OutlineActShape: actSchema,
    OutlineBeatShape: beatSchema,
    OutlineDetailBeatShape: detailBeatSchema,
    RelationshipShape: relationshipFormSchema,
    WorldShape: worldFormSchema,
  },
} as const;

function shapeBodies(shapes: Record<string, z.ZodType>): Record<string, unknown> {
  const bodies: Record<string, unknown> = {};
  for (const [shapeId, schema] of Object.entries(shapes)) bodies[shapeId] = shapeLockBody(schema);
  return bodies;
}

for (const lock of EXISTING_LOCKS) {
  const current = read(lock.file);
  write(lock.file, { ...current, shapes: shapeBodies(lock.shapes) });
  console.log(`updated ${lock.file}`);
}

{
  const { file, namespace, contractNote, shapes } = CLIENT_PROJECTION_LOCK;
  write(file, {
    schemaVersion: 1,
    namespace,
    contractNote,
    shapeIds: Object.keys(shapes),
    shapes: shapeBodies(shapes),
  });
  console.log(`created ${file}`);
}

/** I103 Stage 18 Remote descriptor/result baseline（计划 §19 I103）。 */
{
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
  const descriptorSequence = [
    ...hostContribution.invocations.filter((descriptor) => !i105DescriptorIds.has(descriptor.id) && !i108DescriptorIds.has(descriptor.id) && !i110DescriptorIds.has(descriptor.id) && !i111DescriptorIds.has(descriptor.id) && !i112DescriptorIds.has(descriptor.id) && !i113DescriptorIds.has(descriptor.id) && !i114DescriptorIds.has(descriptor.id) && !i116DescriptorIds.has(descriptor.id) && !i118DescriptorIds.has(descriptor.id) && !i119DescriptorIds.has(descriptor.id) && !i120DescriptorIds.has(descriptor.id) && !i130DescriptorIds.has(descriptor.id) && !i131DescriptorIds.has(descriptor.id) && !i133DescriptorIds.has(descriptor.id)),
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
  ];
  const resultDescriptors = [
    ...branchInvocations.filter((descriptor) => !i130DescriptorIds.has(descriptor.id) && !i131DescriptorIds.has(descriptor.id)),
    ...writingInvocations.filter((descriptor) => descriptor !== writingProposeAtInvocation && descriptor !== writingPreviewLayersInvocation),
    ...reviewInvocations,
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
  ];
  const descriptors = remoteDescriptorLockBodies(descriptorSequence);
  const resultSchemas = remoteResultShapeBodies(resultDescriptors);
  write('contracts/stage18/remote-descriptors.json', {
    schemaVersion: 1,
    namespace: 'stage18RemoteBaseline',
    contractNote: 'Stage 18 Remote baseline：I103 锁定全部既有 descriptor 与 Branch/Writing/Review/C5 result；后续迭代只追加各自 strict descriptor/result schema。',
    descriptorIds: Object.keys(descriptors),
    descriptors,
    resultSchemaIds: Object.keys(resultSchemas),
    resultSchemas,
  });
  console.log('created contracts/stage18/remote-descriptors.json');
}
