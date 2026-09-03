import type { MainCredentialResolver } from '../app/credentials.js';
import { resolveGenerationSettings, type GenerationRequest, type LlmBackend, type LlmChunk } from '../llm/port/index.js';

export type OpenAICompatibleErrorCode =
  | 'invalid-config'
  | 'unsupported-provider'
  | 'credential-unavailable'
  | 'cancelled'
  | 'http'
  | 'invalid-response'
  | 'network';

/** Stable Main-side error used before the future IPC error envelope. */
export class OpenAICompatibleError extends Error {
  readonly code: OpenAICompatibleErrorCode;

  constructor(code: OpenAICompatibleErrorCode, message: string) {
    super(message);
    this.name = 'OpenAICompatibleError';
    this.code = code;
  }
}

export interface OpenAICompatibleBackendOptions {
  /** `https://.../v1`-style endpoint; credentials in the URL are rejected. */
  readonly endpoint: string;
  /** The provider segment accepted from `GenerationSettings.modelRef`. */
  readonly providerId: string;
  /** Main-only resolver; the raw result never enters a returned chunk/error. */
  readonly credentials: MainCredentialResolver;
  /** Injectable transport for deterministic consumer fixtures. */
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

/**
 * Main-owned OpenAI-compatible streaming adapter.
 *
 * It sends only validated generation settings plus a resolver-provided
 * Authorization header to `/chat/completions`; the Renderer-facing contract
 * receives text/reasoning/done deltas and stable errors, never the key.
 */
export class OpenAICompatibleBackend implements LlmBackend {
  private readonly endpoint: string;
  private readonly providerId: string;
  private readonly credentials: MainCredentialResolver;
  private readonly request: (input: string, init: RequestInit) => Promise<Response>;

  constructor(options: OpenAICompatibleBackendOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    if (typeof options.providerId !== 'string' || options.providerId.length === 0) {
      throw new OpenAICompatibleError('invalid-config', 'LLM provider id is required');
    }
    this.providerId = options.providerId;
    this.credentials = options.credentials;
    const request = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (request === undefined) throw new OpenAICompatibleError('invalid-config', 'Fetch transport is unavailable');
    this.request = request;
  }

  /** Stream provider deltas while preserving cancellation and reasoning. */
  async *stream(request: GenerationRequest): AsyncIterable<LlmChunk> {
    const settings = resolveGenerationSettings(request.settings);
    const { provider, model } = splitModelRef(settings.modelRef);
    if (provider !== this.providerId) throw new OpenAICompatibleError('unsupported-provider', `Unsupported LLM provider: ${provider}`);
    if (request.signal?.aborted) throw new OpenAICompatibleError('cancelled', 'LLM request cancelled');

    const secret = await this.resolveCredential(settings.credentialRef);
    if (request.signal?.aborted) throw new OpenAICompatibleError('cancelled', 'LLM request cancelled');
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: request.prompt }],
      stream: true,
      ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
      ...(settings.maxTokens === undefined ? {} : { max_tokens: settings.maxTokens }),
      ...(settings.stopSequences === undefined || settings.stopSequences.length === 0 ? {} : { stop: settings.stopSequences }),
      ...(settings.reasoning === undefined || settings.reasoning === 'off' ? {} : { reasoning_effort: settings.reasoning }),
    });

    let response: Response;
    try {
      response = await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body,
        signal: request.signal,
      });
    } catch (cause) {
      if (request.signal?.aborted || isAbortError(cause)) throw new OpenAICompatibleError('cancelled', 'LLM request cancelled');
      throw new OpenAICompatibleError('network', 'LLM network request failed');
    }
    if (!response.ok) throw new OpenAICompatibleError('http', `LLM provider returned HTTP ${response.status}`);
    if (response.body === null) throw new OpenAICompatibleError('invalid-response', 'LLM provider returned no stream body');

    try {
      for await (const event of parseSse(response.body)) {
        if (request.signal?.aborted) throw new OpenAICompatibleError('cancelled', 'LLM request cancelled');
        if (event === '[DONE]') {
          yield { done: true };
          return;
        }
        yield event;
      }
    } catch (cause) {
      if (cause instanceof OpenAICompatibleError) throw cause;
      if (request.signal?.aborted || isAbortError(cause)) throw new OpenAICompatibleError('cancelled', 'LLM request cancelled');
      throw new OpenAICompatibleError('network', 'LLM response stream failed');
    }
  }

  private async resolveCredential(ref: string): Promise<string> {
    let secret: string | undefined;
    try {
      secret = await this.credentials.resolve(ref);
    } catch {
      throw new OpenAICompatibleError('credential-unavailable', 'LLM credential is unavailable');
    }
    if (secret === undefined || secret.length === 0) throw new OpenAICompatibleError('credential-unavailable', 'LLM credential is unavailable');
    return secret;
  }
}

/** Construct the production Main adapter without exposing provider details to Renderer. */
export function createOpenAICompatibleBackend(options: OpenAICompatibleBackendOptions): LlmBackend {
  return new OpenAICompatibleBackend(options);
}

function normalizeEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || endpoint.length === 0) throw new OpenAICompatibleError('invalid-config', 'LLM endpoint is required');
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new OpenAICompatibleError('invalid-config', 'LLM endpoint is invalid'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new OpenAICompatibleError('invalid-config', 'LLM endpoint protocol is unsupported');
  if (parsed.username !== '' || parsed.password !== '') throw new OpenAICompatibleError('invalid-config', 'LLM endpoint must not contain credentials');
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/chat/completions`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function splitModelRef(modelRef: string): { provider: string; model: string } {
  const separator = modelRef.indexOf('/');
  if (separator <= 0 || separator === modelRef.length - 1) throw new OpenAICompatibleError('invalid-config', 'LLM modelRef must use provider/model format');
  return { provider: modelRef.slice(0, separator), model: modelRef.slice(separator + 1) };
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<'[DONE]' | LlmChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const result = await reader.read();
      buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseSseLine(line);
        if (event !== undefined) yield event;
      }
      if (result.done) break;
    }
    const event = parseSseLine(buffer);
    if (event !== undefined) yield event;
  } finally {
    reader.releaseLock();
  }
}

function parseSseLine(line: string): '[DONE]' | LlmChunk | undefined {
  if (!line.startsWith('data:')) return undefined;
  const raw = line.slice('data:'.length).trim();
  if (raw === '[DONE]') return '[DONE]';
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new OpenAICompatibleError('invalid-response', 'LLM SSE event is invalid'); }
  if (!value || typeof value !== 'object') throw new OpenAICompatibleError('invalid-response', 'LLM SSE event is invalid');
  const choice = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choice) || choice.length === 0 || !choice[0] || typeof choice[0] !== 'object') throw new OpenAICompatibleError('invalid-response', 'LLM SSE choice is invalid');
  const delta = (choice[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== 'object') throw new OpenAICompatibleError('invalid-response', 'LLM SSE delta is invalid');
  const text = (delta as { content?: unknown }).content;
  const reasoning = (delta as { reasoning_content?: unknown }).reasoning_content;
  if (text !== undefined && typeof text !== 'string') throw new OpenAICompatibleError('invalid-response', 'LLM text delta is invalid');
  if (reasoning !== undefined && typeof reasoning !== 'string') throw new OpenAICompatibleError('invalid-response', 'LLM reasoning delta is invalid');
  if (text === undefined && reasoning === undefined) return {};
  return Object.freeze({
    ...(text === undefined ? {} : { text }),
    ...(reasoning === undefined ? {} : { reasoning }),
  });
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}
