import { z } from 'zod';
import { entityIdSchema } from './base.js';

export const chapterStatusSchema = z.enum(['draft', 'revised', 'canon']);

export const sceneSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  content: z.string(),
  summary: z.string(),
  beats: z.array(z.string()),
  canonEvents: z.array(entityIdSchema),
  notes: z.string(),
}).strict();

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
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;

export type CreateChapterInput = Pick<Chapter, 'id' | 'index' | 'title' | 'pov' | 'status'>;
export type AppendSceneInput = Omit<Scene, 'index'>;
