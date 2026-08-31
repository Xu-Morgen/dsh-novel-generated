import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { chapterStatusSchema } from './text.js';

/**
 * R18-10a 版本树的有界预算（设计 §14.14.2 D25 / 计划 I130）。
 *
 * 聚合是给版本面板使用的可重建投影，不是 C5 的第二份真相。预算超出时
 * 必须整体拒绝，不能静默截断，否则 Client 会把不完整的树当成全书状态。
 */
export const BRANCH_AGGREGATE_MAX_CHAPTERS = 256;
export const BRANCH_AGGREGATE_MAX_SCENES = 4096;
export const BRANCH_AGGREGATE_MAX_BRANCHES_PER_SCENE = 64;
export const BRANCH_AGGREGATE_MAX_SUMMARY_CHARS = 2000;
export const BRANCH_AGGREGATE_MAX_BYTES = 4 * 1024 * 1024;

/** 版本树只携带版本元数据；正文必须经既有 read/diff 按需读取。 */
export const branchAggregateBranchSchema = z.object({
  id: entityIdSchema,
  label: z.string().max(2000),
  chosen: z.boolean(),
  charCount: z.number().int().nonnegative(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().readonly();

export const branchAggregateVersionModeSchema = z.enum(['implicit-single', 'branched']);

/** 场景节点：`branches: []` 明确表示旧 C5 单版本隐含态。 */
export const branchAggregateSceneSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  summary: z.string().max(BRANCH_AGGREGATE_MAX_SUMMARY_CHARS),
  versionMode: branchAggregateVersionModeSchema,
  branches: z.array(branchAggregateBranchSchema)
    .max(BRANCH_AGGREGATE_MAX_BRANCHES_PER_SCENE)
    .readonly(),
}).strict().superRefine((scene, context) => {
  const ids = new Set<string>();
  let chosenCount = 0;
  scene.branches.forEach((branch, position) => {
    if (ids.has(branch.id)) {
      context.addIssue({ code: 'custom', path: ['branches', position, 'id'], message: 'Duplicate branch id' });
    }
    ids.add(branch.id);
    if (branch.chosen) chosenCount += 1;
  });
  if (scene.branches.length === 0 && scene.versionMode !== 'implicit-single') {
    context.addIssue({ code: 'custom', path: ['versionMode'], message: 'Empty branches require implicit-single mode' });
  }
  if (scene.branches.length > 0 && scene.versionMode !== 'branched') {
    context.addIssue({ code: 'custom', path: ['versionMode'], message: 'Non-empty branches require branched mode' });
  }
  if (scene.branches.length > 0 && chosenCount !== 1) {
    context.addIssue({ code: 'custom', path: ['branches'], message: 'Exactly one branch must be chosen when branches exist' });
  }
}).readonly();

/** 章节节点按 `index` 排序，场景节点按其章节内 `index` 排序。 */
export const branchAggregateChapterSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  pov: entityIdSchema,
  status: chapterStatusSchema,
  scenes: z.array(branchAggregateSceneSchema).readonly(),
}).strict().superRefine((chapter, context) => {
  const ids = new Set<string>();
  const indexes = new Set<number>();
  chapter.scenes.forEach((scene, position) => {
    if (ids.has(scene.id)) {
      context.addIssue({ code: 'custom', path: ['scenes', position, 'id'], message: 'Duplicate scene id' });
    }
    if (indexes.has(scene.index)) {
      context.addIssue({ code: 'custom', path: ['scenes', position, 'index'], message: 'Duplicate scene index' });
    }
    ids.add(scene.id);
    indexes.add(scene.index);
  });
}).readonly();

/** 一次性返回的 Host 聚合树；不允许出现任何 C5 正文字段。 */
export const branchAggregateSchema = z.object({
  projectId: entityIdSchema,
  chapters: z.array(branchAggregateChapterSchema).max(BRANCH_AGGREGATE_MAX_CHAPTERS).readonly(),
}).strict().superRefine((aggregate, context) => {
  const chapterIds = new Set<string>();
  const chapterIndexes = new Set<number>();
  let sceneCount = 0;
  aggregate.chapters.forEach((chapter, position) => {
    if (chapterIds.has(chapter.id)) {
      context.addIssue({ code: 'custom', path: ['chapters', position, 'id'], message: 'Duplicate chapter id' });
    }
    if (chapterIndexes.has(chapter.index)) {
      context.addIssue({ code: 'custom', path: ['chapters', position, 'index'], message: 'Duplicate chapter index' });
    }
    chapterIds.add(chapter.id);
    chapterIndexes.add(chapter.index);
    sceneCount += chapter.scenes.length;
  });
  if (sceneCount > BRANCH_AGGREGATE_MAX_SCENES) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'Branch aggregate exceeds scene budget' });
  }
}).readonly();

export type BranchAggregateBranch = z.infer<typeof branchAggregateBranchSchema>;
export type BranchAggregateScene = z.infer<typeof branchAggregateSceneSchema>;
export type BranchAggregateChapter = z.infer<typeof branchAggregateChapterSchema>;
export type BranchAggregate = z.infer<typeof branchAggregateSchema>;
