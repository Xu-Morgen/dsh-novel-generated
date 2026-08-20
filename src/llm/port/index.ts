import { z } from 'zod';

/** A host-safe model reference. Secrets are resolved by DSH, never carried here. */
export const GenerationSettingsSchema = z.object({
  modelRef: z.string().min(1),
  credentialRef: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
}).strict();

export type GenerationSettings = z.infer<typeof GenerationSettingsSchema>;

/** Resolve and validate only controlled references; raw keys/endpoints are forbidden. */
export function resolveGenerationSettings(input: unknown): GenerationSettings {
  const result = GenerationSettingsSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid generation settings: ${result.error.message}`);
  return result.data;
}

export interface GenerationRequest {
  readonly prompt: string;
  readonly settings: GenerationSettings;
  readonly signal?: AbortSignal;
}

export interface LlmChunk {
  readonly text?: string;
  readonly done?: boolean;
}

export interface LlmBackend {
  stream(request: GenerationRequest): AsyncIterable<LlmChunk | string>;
}

export interface GenerationCandidate {
  readonly text: string;
  readonly chunks: number;
}

export class GenerationError extends Error {
  readonly code: 'unavailable' | 'cancelled' | 'backend';
  constructor(code: GenerationError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GenerationError';
    this.code = code;
  }
}

/**
 * Collect one streaming candidate through the injected Host LLM route.
 * The port deliberately accepts only a stream method, keeping provider details
 * outside the novel domain (design §0.1.2, I17).
 */
export async function collectCandidate(
  backend: LlmBackend | undefined,
  request: GenerationRequest,
): Promise<GenerationCandidate> {
  if (!backend) throw new GenerationError('unavailable', 'Host LLM route is unavailable');
  if (request.signal?.aborted) throw new GenerationError('cancelled', 'Generation cancelled');
  let text = '';
  let chunks = 0;
  try {
    for await (const chunk of backend.stream(request)) {
      if (request.signal?.aborted) throw new GenerationError('cancelled', 'Generation cancelled');
      const value = typeof chunk === 'string' ? chunk : chunk.text ?? '';
      text += value;
      chunks += 1;
    }
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    if (request.signal?.aborted) throw new GenerationError('cancelled', 'Generation cancelled', { cause: error });
    throw new GenerationError('backend', 'Host LLM route failed', { cause: error });
  }
  return { text, chunks };
}

/** Minimal adapter for DSH ctx.llm implementations exposing stream(). */
export function asLlmBackend(value: unknown): LlmBackend | undefined {
  if (!value || typeof value !== 'object' || typeof (value as { stream?: unknown }).stream !== 'function') return undefined;
  return value as LlmBackend;
}
