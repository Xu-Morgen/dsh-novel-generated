import { z } from 'zod';

/** Controlled Host generation settings; raw keys/endpoints are forbidden. */
export const GenerationSettingsSchema = z.object({
  modelRef: z.string().min(1),
  credentialRef: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stopSequences: z.array(z.string().min(1)).optional(),
  /** DeepSeek thinking control: off disables it; other values select effort. */
  reasoning: z.enum(['off', 'low', 'high', 'max']).optional(),
}).strict();

export type GenerationSettings = z.infer<typeof GenerationSettingsSchema>;
