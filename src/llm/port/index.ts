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
  /** Provider reasoning delta; it is never merged into candidate prose. */
  readonly reasoning?: string;
  readonly done?: boolean;
}

/** Internal novel-domain stream seam; all DSH adaptation belongs in `asLlmBackend`. */
export const LLM_BACKEND_MARKER = Symbol.for('novel-creation-tool/LlmBackend');

export interface LlmBackend {
  readonly [LLM_BACKEND_MARKER]?: true;
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
  /** Stop sequences (I85/R17-4): the 0.1.1-rc.2 `GenerateOptions` declares `stop`;
   *  adapters map it to the provider stop field (deepseek) or reject it explicitly. */
  stop?: string[];
  /** Thinking effort passed through to the DSH pi-ai adapter (deepseek format). */
  reasoningEffort?: 'low' | 'high' | 'max';
  signal?: AbortSignal;
}

type DshStreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'finish'; reason: { kind: string; failure?: { message?: string } } }
  | { type: 'block-start' | 'tool-call-delta' | 'block-end' | 'usage' };

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
  if ((value as { readonly [LLM_BACKEND_MARKER]?: unknown })[LLM_BACKEND_MARKER] === true) return value as LlmBackend;
  const llm = value as DshLlmService;
  return Object.freeze({
    async *stream(request: GenerationRequest): AsyncIterable<LlmChunk> {
      const { provider, model } = splitModelRef(request.settings.modelRef);
      // I85（R17-4）：`0.1.1-rc.2` 的 `GenerateOptions` 公开声明 `stop`，端口按
      // provider 能力显式处理——`dsh-llm-deepseek` 把 `stop` 映射为 OpenAI stop，
      // `dsh-llm-pi-ai` 对非空 stop 以 `UNSUPPORTED_OPTION` 显式拒绝（见
      // llm-pi-ai/lib/index.js）。端口始终转发已配置的 stopSequences：拒绝由运行时
      // 以显式 error/aborted finish 浮出，绝不静默丢弃。undefined 采样旋钮照旧省略。
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
        ...(request.settings.stopSequences === undefined || request.settings.stopSequences.length === 0 ? {} : { stop: request.settings.stopSequences }),
        // `off`/未配置 → 不发送 effort（pi-ai deepseek 分支会发送 thinking disabled）；
        // 显式档位 → 发送 effort 启用思维链。
        ...(request.settings.reasoning === undefined || request.settings.reasoning === 'off' ? {} : { reasoningEffort: request.settings.reasoning }),
        signal: request.signal,
      };
      for await (const chunk of llm.stream(options)) {
        if (chunk.type === 'text-delta') yield { text: chunk.text };
        if (chunk.type === 'reasoning-delta') yield { reasoning: chunk.text };
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
