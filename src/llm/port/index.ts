import { GenerationSettingsSchema, type GenerationSettings } from '../../core/schema/generation-settings.js';

// Compatibility surface: existing llm/port consumers retain their public imports.
export { GenerationSettingsSchema, type GenerationSettings } from '../../core/schema/generation-settings.js';

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

/** Internal novel-domain stream seam; all DSH adaptation belongs in `asLlmBackend`. */
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

/** Minimum structural projection of the current DSH `llm.stream(GenerateOptions)` contract. */
interface DshLlmService {
  stream(options: DshGenerateOptions): AsyncIterable<DshStreamChunk>;
}

interface DshGenerateOptions {
  provider: string;
  model: string;
  messages: readonly [{ id: string; role: 'user'; content: readonly [{ type: 'text'; text: string }]; source: { kind: 'plugin'; plugin: string } }];
  temperature?: number;
  maxTokens?: number;
  /** Thinking effort passed through to the DSH pi-ai adapter (deepseek format). */
  reasoningEffort?: 'low' | 'high' | 'max';
  signal?: AbortSignal;
}

type DshStreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'finish'; reason: { kind: string; failure?: { message?: string } } }
  | { type: 'block-start' | 'reasoning-delta' | 'tool-call-delta' | 'block-end' | 'usage' };

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
    // Surface the adapter/provider cause so a failing route is diagnosable from
    // the Remote error instead of a bare "Host LLM route failed".
    throw new GenerationError('backend', `Host LLM route failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return { text, chunks };
}

/**
 * Adapt the exact current DSH `llm.stream(GenerateOptions)` surface to the
 * novel-domain stream seam. DSH owns provider credentials; `credentialRef`
 * remains a controlled project setting and is never sent as a raw key.
 */
export function asLlmBackend(value: unknown): LlmBackend | undefined {
  if (!value || typeof value !== 'object' || typeof (value as { stream?: unknown }).stream !== 'function') return undefined;
  const llm = value as DshLlmService;
  return Object.freeze({
    async *stream(request: GenerationRequest): AsyncIterable<LlmChunk> {
      const { provider, model } = splitModelRef(request.settings.modelRef);
      // The current DSH `llm.stream` contract rejects `GenerateOptions.stop`,
      // so `stopSequences` is deliberately not forwarded; only defined sampling
      // knobs are included (undefined members are omitted).
      const options: DshGenerateOptions = {
        provider,
        model,
        messages: [{
          id: 'novel-generation-request',
          role: 'user',
          content: [{ type: 'text', text: request.prompt }],
          source: { kind: 'plugin', plugin: 'novel-creation-tool' },
        }],
        ...(request.settings.temperature === undefined ? {} : { temperature: request.settings.temperature }),
        ...(request.settings.maxTokens === undefined ? {} : { maxTokens: request.settings.maxTokens }),
        // `off`/未配置 → 不发送 effort（pi-ai deepseek 分支会发送 thinking disabled）；
        // 显式档位 → 发送 effort 启用思维链。DSH `llm.stream` 不支持 `stop`，故
        // stopSequences 永不转发（见 I52 修复）。
        ...(request.settings.reasoning === undefined || request.settings.reasoning === 'off' ? {} : { reasoningEffort: request.settings.reasoning }),
        signal: request.signal,
      };
      for await (const chunk of llm.stream(options)) {
        if (chunk.type === 'text-delta') yield { text: chunk.text };
        if (chunk.type === 'finish') {
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            throw new Error(chunk.reason.failure?.message ?? `DSH LLM finished with ${chunk.reason.kind}`);
          }
          yield { done: true };
        }
      }
    },
  });
}

/** Parse the configured `provider/model` route without admitting raw endpoint syntax. */
function splitModelRef(modelRef: string): { provider: string; model: string } {
  const separator = modelRef.indexOf('/');
  if (separator <= 0 || separator === modelRef.length - 1) {
    throw new Error('Generation modelRef must use provider/model format');
  }
  return { provider: modelRef.slice(0, separator), model: modelRef.slice(separator + 1) };
}
