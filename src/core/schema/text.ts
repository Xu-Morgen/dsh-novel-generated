import { z } from 'zod';
import { entityIdSchema } from './base.js';

export const chapterStatusSchema = z.enum(['draft', 'revised', 'canon']);

/**
 * C5 场景版本分支（design §5.12 / §14.10「正文版本与分支」/ R14-5）。
 *
 * 语义与不变式：
 * - `branches` 是场景的**全部**版本：既有正文快照（候选/旧版）与当前选中版本同处
 *   一表；`scene.content` 始终等于 chosen 分支的 content（materialized 读路径，
 *   I6/I42/I60–I65 既有消费者无需感知分支即可继续读/写正文）。
 * - 当 `branches` 非空时恰好一个分支 `chosen === true`；chosen 分支 content 必须
 *   等于 `scene.content`（schema 级不变式，见 sceneSchema superRefine）。
 * - `branches` 为空 = 旧单版本文档（I70 迁移前的隐含单版本状态），合法且被
 *   TextRepository 迁移/读取路径支持（见 core/text parseChapterDocument）。
 * - 分支 id 确定性生成（`v-<sha256(content)>` 前缀），同内容不重复入表（幂等）。
 */
export const sceneBranchSchema = z.object({
  id: entityIdSchema,
  label: z.string(),
  content: z.string(),
  chosen: z.boolean(),
}).strict();

export const sceneSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  content: z.string(),
  summary: z.string(),
  beats: z.array(z.string()),
  canonEvents: z.array(entityIdSchema),
  notes: z.string(),
  branches: z.array(sceneBranchSchema),
}).strict().superRefine((scene, context) => {
  const branchIds = new Set<string>();
  let chosenCount = 0;
  let chosenMatchesContent = true;
  scene.branches.forEach((branch, position) => {
    if (branchIds.has(branch.id)) {
      context.addIssue({ code: 'custom', path: ['branches', position, 'id'], message: 'Duplicate branch id' });
    }
    branchIds.add(branch.id);
    if (branch.chosen) {
      chosenCount += 1;
      if (branch.content !== scene.content) chosenMatchesContent = false;
    }
  });
  if (chosenCount > 1) {
    context.addIssue({ code: 'custom', path: ['branches'], message: 'At most one branch may be chosen' });
  }
  if (scene.branches.length > 0 && chosenCount !== 1) {
    context.addIssue({ code: 'custom', path: ['branches'], message: 'Exactly one branch must be chosen when branches exist' });
  }
  if (scene.branches.length > 0 && !chosenMatchesContent) {
    context.addIssue({ code: 'custom', path: ['branches'], message: 'Chosen branch content must equal scene content' });
  }
});

export const chapterSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  pov: entityIdSchema,
  status: chapterStatusSchema,
  scenes: z.array(sceneSchema),
}).strict().superRefine((chapter, context) => {
  const ids = new Set<string>();
  chapter.scenes.forEach((scene, position) => {
    if (ids.has(scene.id)) context.addIssue({ code: 'custom', path: ['scenes', position, 'id'], message: 'Duplicate scene id' });
    ids.add(scene.id);
    if (scene.index !== position) {
      context.addIssue({ code: 'custom', path: ['scenes', position, 'index'], message: 'Scene indexes must be contiguous and ordered' });
    }
  });
});

export type Chapter = z.infer<typeof chapterSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneBranch = z.infer<typeof sceneBranchSchema>;
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;

export type CreateChapterInput = Pick<Chapter, 'id' | 'index' | 'title' | 'pov' | 'status'>;
/** 追加场景的输入：index 与 branches 都由存储层生成（新场景从隐含单版本开始）。 */
export type AppendSceneInput = Omit<Scene, 'index' | 'branches'>;

/**
 * I70 旧单版本文档（migration 前形状，design §14.10「正文版本与分支」/ R14-5）。
 *
 * 这是 I70 之前的 canonical C5 文档形状：scene 没有 `branches` 字段（隐含单版本）。
 * TextRepository 的 `parseChapterDocument` 用它作为**兼容迁移输入**：旧文档经
 * legacy 解析 → 内存迁移（branches: []）→ canonical 校验 → 重开时持久化回写。
 * 该形状与 canonical 形状二选一，二者都不是则 fail closed（坏迁移零猜测零写）。
 */
export const legacySceneSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  content: z.string(),
  summary: z.string(),
  beats: z.array(z.string()),
  canonEvents: z.array(entityIdSchema),
  notes: z.string(),
}).strict();

export const legacyChapterSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  pov: entityIdSchema,
  status: chapterStatusSchema,
  scenes: z.array(legacySceneSchema),
}).strict();

export type LegacyChapter = z.infer<typeof legacyChapterSchema>;
