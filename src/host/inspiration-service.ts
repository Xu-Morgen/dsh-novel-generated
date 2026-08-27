import { z } from 'zod';
import { outlineSchema, type Outline } from '../core/schema/outline.js';
import { outlineProgressSchema, type OutlineProgress } from '../core/schema/outline-progress.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';

const directionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  premise: z.string().trim().min(1),
  changes: z.object({
    logline: z.string().trim().min(1).optional(),
    themes: z.array(z.string().trim().min(1)).optional(),
    outlineNote: z.string().trim().min(1),
    progressNote: z.string().trim().min(1),
  }).strict(),
  rationale: z.string().trim().min(1),
}).strict();
/** I45 灵感方向 schema；I68（进度与灵感落地）复用同一 strict 合同复验 select/apply 载荷。 */
export { directionSchema };
export type InspirationDirection = z.infer<typeof directionSchema>;

export const inspirationResultSchema = z.object({
  directions: z.array(directionSchema).min(2).max(3),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.directions.map((direction) => direction.id));
  const premises = new Set(value.directions.map((direction) => direction.premise));
  if (ids.size !== value.directions.length) context.addIssue({ code: 'custom', message: 'Inspiration direction IDs must be distinct' });
  if (premises.size !== value.directions.length) context.addIssue({ code: 'custom', message: 'Inspiration directions must be distinguishable' });
});
export type InspirationResult = z.infer<typeof inspirationResultSchema>;

export interface InspirationRequest {
  readonly prompt: string;
  readonly context?: string;
}

export interface InspirationApplyInput {
  readonly projectId: string;
  readonly proposalId: string;
  readonly direction: InspirationDirection;
  readonly confirmation: ConfirmationRecord;
  readonly outline: Outline;
  readonly progress: OutlineProgress;
  readonly saveOutline: (outline: Outline) => Promise<Outline>;
  readonly saveProgress: (progress: OutlineProgress) => Promise<OutlineProgress>;
}

export interface NovelInspirationService {
  propose(input: InspirationRequest, signal?: AbortSignal): Promise<InspirationResult>;
  validate(input: unknown): InspirationResult;
  apply(input: InspirationApplyInput): Promise<{ outline: Outline; progress: OutlineProgress }>;
}

/**
 * I45 inspiration agent. Candidates are Host-routed and opaque until selected;
 * applying a direction requires an accepted I11 Gate record and preserves C6
 * references while changing only the selected B5 logline/themes. Design §9.5.
 */
export function createInspirationService(llm: unknown, onDispose?: (dispose: () => void) => void): NovelInspirationService {
  const active = new Set<AbortController>();
  onDispose?.(() => { for (const controller of active) controller.abort(); active.clear(); });
  return Object.freeze({
    async propose(input: InspirationRequest, signal?: AbortSignal) {
      if (!llm || typeof (llm as { stream?: unknown }).stream !== 'function') throw new Error('Host LLM route is unavailable');
      const controller = new AbortController();
      active.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const chunks: string[] = [];
        for await (const event of (llm as { stream(request: unknown, signal?: AbortSignal): AsyncIterable<{ type: string; text?: string }> }).stream({ messages: [{ role: 'user', content: [{ type: 'text', text: `灵感 agent\n${input.context ?? ''}\n${input.prompt}` }] }], signal: controller.signal }, controller.signal)) {
          if (event.type === 'text-delta' && event.text) chunks.push(event.text);
        }
        return inspirationResultSchema.parse(JSON.parse(chunks.join('')));
      } finally { signal?.removeEventListener('abort', forwardAbort); active.delete(controller); }
    },
    validate: (input: unknown) => inspirationResultSchema.parse(input),
    async apply(input: InspirationApplyInput) {
      if (input.confirmation.id !== input.proposalId || input.confirmation.status !== 'accepted' || input.confirmation.kind !== 'inspiration.apply') throw new Error('Inspiration application requires an accepted I11 confirmation');
      const direction = directionSchema.parse(input.direction);
      const outline = outlineSchema.parse({ ...input.outline, logline: direction.changes.logline ?? input.outline.logline, themes: direction.changes.themes ?? input.outline.themes, version: input.outline.version + 1 });
      const progress = outlineProgressSchema.parse({ ...input.progress, deviations: [...input.progress.deviations, { id: `${input.proposalId}-deviation`, planned: input.outline.logline, actual: direction.changes.outlineNote, reason: direction.changes.progressNote, reconciled: false }] });
      return { outline: await input.saveOutline(outline), progress: await input.saveProgress(progress) };
    },
  });
}
