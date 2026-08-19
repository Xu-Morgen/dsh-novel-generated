/** Roles supported by the I1b OpenAI-compatible chat-completion request. */
export type OpenAICompatRole = 'system' | 'user' | 'assistant';

/** One role-tagged message accepted by the I1b chat-completion seam. */
export interface OpenAICompatMessage {
  role: OpenAICompatRole;
  content: string;
}

/**
 * One OpenAI-compatible streamed generation request.
 * The endpoint may be a `/v1` base URL or a full `/chat/completions` URL.
 */
export interface OpenAICompatRequest {
  /** Base URL such as `https://api.openai.com/v1`. */
  endpoint: string;
  apiKey?: string;
  model: string;
  messages: readonly OpenAICompatMessage[];
  temperature?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

/** Injectable transport hooks used to test the seam without network access. */
export interface OpenAICompatClientOptions {
  fetch?: typeof fetch;
  retryDelay?: (retryNumber: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Thin I1b OpenAI-compatible transport seam (design §5.2).
 *
 * `send()` yields text deltas in wire order. A transient failure is retried
 * only before the first delta is yielded; retrying after visible output would
 * duplicate already-appended prose. Multi-backend abstraction remains owned by
 * I20a and is deliberately not introduced here.
 */
export class OpenAICompatClient {
  readonly #fetch: typeof fetch;
  readonly #retryDelay: (
    retryNumber: number,
    signal?: AbortSignal,
  ) => Promise<void>;

  constructor(options: OpenAICompatClientOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#retryDelay = options.retryDelay ?? defaultRetryDelay;
  }

  async *send(request: OpenAICompatRequest): AsyncIterable<string> {
    validateRequest(request);

    const maxRetries = request.maxRetries ?? 2;
    for (let attempt = 0; ; attempt += 1) {
      request.signal?.throwIfAborted();
      let emittedText = false;

      try {
        for await (const text of this.#sendOnce(request)) {
          emittedText = true;
          yield text;
        }
        return;
      } catch (error) {
        if (
          request.signal?.aborted ||
          emittedText ||
          attempt >= maxRetries ||
          !isRetryable(error)
        ) {
          throw error;
        }

        await this.#retryDelay(attempt + 1, request.signal);
      }
    }
  }

  async *#sendOnce(request: OpenAICompatRequest): AsyncIterable<string> {
    let response: Response;
    try {
      response = await this.#fetch(toChatCompletionsUrl(request.endpoint), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(request.apiKey
            ? { authorization: `Bearer ${request.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          ...(request.temperature === undefined
            ? {}
            : { temperature: request.temperature }),
        }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? error;
      }
      throw error;
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1_000);
      throw new OpenAICompatHttpError(response.status, detail);
    }
    if (response.body === null) {
      throw new OpenAICompatProtocolError('Streaming response has no body');
    }

    for await (const data of readServerSentEvents(response.body)) {
      if (data === '[DONE]') {
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new OpenAICompatProtocolError('Stream event was not valid JSON');
      }

      const text = readTextDelta(payload);
      if (text !== undefined && text.length > 0) {
        yield text;
      }
    }

    throw new OpenAICompatStreamTerminationError();
  }
}

class OpenAICompatHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(
      detail.length > 0
        ? `OpenAI-compatible request failed (${status}): ${detail}`
        : `OpenAI-compatible request failed (${status})`,
    );
    this.name = 'OpenAICompatHttpError';
  }
}

class OpenAICompatProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAICompatProtocolError';
  }
}

class OpenAICompatProviderError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `OpenAI-compatible provider returned a stream error: ${detail}`
        : 'OpenAI-compatible provider returned a stream error',
    );
    this.name = 'OpenAICompatProviderError';
  }
}

class OpenAICompatStreamTerminationError extends Error {
  constructor() {
    super('OpenAI-compatible stream ended before [DONE]');
    this.name = 'OpenAICompatStreamTerminationError';
  }
}

function validateRequest(request: OpenAICompatRequest): void {
  if (request.endpoint.trim().length === 0) {
    throw new TypeError('endpoint must be non-empty');
  }
  if (request.model.trim().length === 0) {
    throw new TypeError('model must be non-empty');
  }
  if (request.messages.length === 0) {
    throw new TypeError('messages must contain at least one message');
  }

  const maxRetries = request.maxRetries ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new TypeError('maxRetries must be a non-negative integer');
  }
}

function toChatCompletionsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function isRetryable(error: unknown): boolean {
  if (
    error instanceof OpenAICompatProtocolError ||
    error instanceof OpenAICompatProviderError
  ) {
    return false;
  }
  if (error instanceof OpenAICompatHttpError) {
    return (
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  return !(error instanceof Error && error.name === 'AbortError');
}

async function defaultRetryDelay(
  retryNumber: number,
  signal?: AbortSignal,
): Promise<void> {
  const delayMs = Math.min(250 * 2 ** (retryNumber - 1), 2_000);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    if (signal?.aborted) {
      rejectPromise(signal.reason);
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      rejectPromise(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolvePromise();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const eventLines: string[] = [];
  let buffer = '';
  let suppressOptionalLineFeed = false;
  let reachedTransportEnd = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      while (true) {
        if (suppressOptionalLineFeed) {
          if (buffer.length === 0) {
            break;
          }
          if (buffer[0] === '\n') {
            buffer = buffer.slice(1);
          }
          suppressOptionalLineFeed = false;
        }

        const lineBreak = findLineBreak(buffer);
        if (lineBreak === undefined) {
          break;
        }

        const line = buffer.slice(0, lineBreak.index);
        suppressOptionalLineFeed = buffer[lineBreak.index] === '\r';
        buffer = buffer.slice(lineBreak.index + 1);
        if (line.length > 0) {
          eventLines.push(line);
          continue;
        }

        const data = parseEventData(eventLines);
        eventLines.length = 0;
        if (data !== undefined) {
          yield data;
        }
      }

      if (done) {
        reachedTransportEnd = true;
        break;
      }
    }

    if (buffer.length > 0) {
      eventLines.push(buffer);
    }
    const trailingData = parseEventData(eventLines);
    if (trailingData !== undefined) {
      yield trailingData;
    }
  } finally {
    if (!reachedTransportEnd) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original parser/consumer result when transport cleanup fails.
      }
    }
    reader.releaseLock();
  }
}

function findLineBreak(text: string): { index: number } | undefined {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n' || text[index] === '\r') {
      return { index };
    }
  }
  return undefined;
}

function parseEventData(lines: readonly string[]): string | undefined {
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  return dataLines.length === 0 ? undefined : dataLines.join('\n');
}

function readTextDelta(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    throw new OpenAICompatProtocolError('Stream payload must be an object');
  }

  const providerError: unknown = Reflect.get(payload, 'error');
  if (providerError !== undefined && providerError !== null) {
    throw new OpenAICompatProviderError(readProviderErrorDetail(providerError));
  }

  const choices = Reflect.get(payload, 'choices');
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice: unknown = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    throw new OpenAICompatProtocolError('Stream choice must be an object');
  }

  const delta: unknown = Reflect.get(firstChoice, 'delta');
  if (typeof delta !== 'object' || delta === null) {
    return undefined;
  }

  const content: unknown = Reflect.get(delta, 'content');
  if (content === undefined || content === null) {
    return undefined;
  }
  if (typeof content !== 'string') {
    throw new OpenAICompatProtocolError('Stream content delta must be text');
  }
  return content;
}

function readProviderErrorDetail(providerError: unknown): string | undefined {
  const rawDetail =
    typeof providerError === 'string'
      ? providerError
      : typeof providerError === 'object' && providerError !== null
        ? Reflect.get(providerError, 'message')
        : undefined;
  if (typeof rawDetail !== 'string') {
    return undefined;
  }

  const sanitized = rawDetail
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return sanitized.length > 0 ? sanitized : undefined;
}
