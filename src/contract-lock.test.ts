import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkRemoteContractLock, checkShapeLock } from './contract-lock.js';
import { hostContribution } from './host/remote/host-contribution.js';
import { branchInvocations } from './host/remote/branch.js';
import { writingInvocations, writingProposeAtInvocation } from './host/remote/writing.js';
import { reviewInvocations } from './host/remote/review.js';
import { c5Invocations } from './host/remote/text.js';
import { textMutationInvocations } from './host/remote/text-mutation.js';
import { queueStartAtInvocation } from './host/remote/queue.js';
import {
  sceneOutlineBindingImpactInvocation,
  sceneOutlineBindingInvocations,
  sceneOutlineBindingReadInvocation,
} from './host/remote/scene-outline-binding.js';
import { textDeletionInvocations } from './host/remote/text-deletion.js';
import { outlineGenerationBaselineInvocations } from './host/remote/outline-generation-baseline.js';
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
const stage18Descriptors = [
  ...hostContribution.invocations.filter((descriptor) => !i105DescriptorIds.has(descriptor.id) && !i108DescriptorIds.has(descriptor.id)),
  ...sceneOutlineBindingInvocations,
  writingProposeAtInvocation,
  queueStartAtInvocation,
  ...textDeletionInvocations,
  ...outlineGenerationBaselineInvocations,
];
const stage18ResultDescriptors = [
  ...branchInvocations,
  ...writingInvocations.filter((descriptor) => descriptor !== writingProposeAtInvocation),
  ...reviewInvocations,
  ...c5Invocations,
  ...textMutationInvocations,
  sceneOutlineBindingReadInvocation,
  sceneOutlineBindingImpactInvocation,
  writingProposeAtInvocation,
  queueStartAtInvocation,
  ...textDeletionInvocations,
  ...outlineGenerationBaselineInvocations,
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
  it('I105 的前 115 descriptor / 24 result JSON bodies 与 8636685 结构逐字一致', () => {
    const oldDescriptors = Object.fromEntries(remoteLock.descriptorIds.slice(0, 115).map((id) => [id, remoteLock.descriptors[id]]));
    const oldResults = Object.fromEntries(remoteLock.resultSchemaIds.slice(0, 24).map((id) => [id, remoteLock.resultSchemas[id]]));
    expect(createHash('sha256').update(JSON.stringify(oldDescriptors)).digest('hex'))
      .toBe('15d4da60e3b140b5c1ff70a3fb2043c0c31f7d19c898718b83d2847da437a14b');
    expect(createHash('sha256').update(JSON.stringify(oldResults)).digest('hex'))
      .toBe('b5cf806081ee0fe48c6aac912d3d020b7efc276a084acdac1d66fc28dd16611d');
  });

  it('锁定全部 Host invocation descriptor，I108 在既有基线后追加 4 methods / 4 result entries', () => {
    expect(remoteLock.descriptorIds).toEqual(stage18Descriptors.map((descriptor) => descriptor.id));
    expect(remoteLock.resultSchemaIds).toEqual(stage18ResultDescriptors.map((descriptor) => descriptor.id));
    expect(remoteLock.descriptorIds).toHaveLength(130);
    expect(remoteLock.resultSchemaIds).toHaveLength(36);
    expect(remoteLock.descriptorIds.slice(-15, -8)).toEqual([
      ...sceneOutlineBindingInvocations.map((descriptor) => descriptor.id),
      writingProposeAtInvocation.id,
      queueStartAtInvocation.id,
    ]);
    expect(remoteLock.descriptorIds.slice(-8, -4)).toEqual([
      ...textDeletionInvocations.map((descriptor) => descriptor.id),
    ]);
    expect(remoteLock.descriptorIds.slice(-4)).toEqual(outlineGenerationBaselineInvocations.map((descriptor) => descriptor.id));
    expect(remoteLock.resultSchemaIds.slice(-8, -4)).toEqual(textDeletionInvocations.map((descriptor) => descriptor.id));
    expect(remoteLock.resultSchemaIds.slice(-4)).toEqual(outlineGenerationBaselineInvocations.map((descriptor) => descriptor.id));
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
