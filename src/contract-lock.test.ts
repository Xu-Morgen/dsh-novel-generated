import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkRemoteContractLock, checkShapeLock } from './contract-lock.js';
import { hostContribution } from './remote.js';
import { branchInvocations } from './host/remote/branch.js';
import { writingInvocations } from './host/remote/writing.js';
import { reviewInvocations } from './host/remote/review.js';
import { c5Invocations } from './host/remote/text.js';
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
const stage18ResultDescriptors = [...branchInvocations, ...writingInvocations, ...reviewInvocations, ...c5Invocations];

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
  it('锁定全部既有 Host invocation descriptor 字段与 Branch/Writing/Review/C5 result schema', () => {
    expect(remoteLock.descriptorIds).toEqual(hostContribution.invocations.map((descriptor) => descriptor.id));
    expect(remoteLock.resultSchemaIds).toEqual(stage18ResultDescriptors.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(remoteLock, hostContribution.invocations, stage18ResultDescriptors)).toEqual([]);
  });

  it('负向：descriptor 字段漂移必须失败', () => {
    const drifted = structuredClone(remoteLock);
    const firstId = drifted.descriptorIds[0];
    (drifted.descriptors[firstId] as { method: string }).method = 'drifted-method';
    expect(checkRemoteContractLock(drifted, hostContribution.invocations, stage18ResultDescriptors).join('\n')).toContain('descriptor baseline');
  });

  it('负向：result schema 缺字段或多字段必须失败', () => {
    const missing = structuredClone(remoteLock);
    delete missing.resultSchemas[missing.resultSchemaIds[0]];
    expect(checkRemoteContractLock(missing, hostContribution.invocations, stage18ResultDescriptors).join('\n')).toContain('result JSON schema');

    const extra = structuredClone(remoteLock);
    extra.resultSchemas['novel-creation-tool/ghost/result'] = {};
    expect(checkRemoteContractLock(extra, hostContribution.invocations, stage18ResultDescriptors).join('\n')).toContain('result JSON schema');
  });
});
