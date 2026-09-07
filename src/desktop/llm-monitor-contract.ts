import { z } from 'zod';

/** I197 / design §14.36: push-only, bounded and already redacted Main projection. */
export const LLM_MONITOR_CHANNEL = 'novel:llm-monitor:v1';
export const llmMonitorSchema = z.object({
  version: z.literal(1),
  requests: z.array(z.object({
    id: z.number().int().positive(),
    status: z.enum(['connecting', 'reasoning', 'generating', 'complete', 'failed', 'cancelled']),
    text: z.string().max(16000),
    reasoning: z.string().max(16000),
    error: z.string().max(300),
  }).strict()).max(30),
}).strict();
export type LlmMonitorSnapshot = z.infer<typeof llmMonitorSchema>;
