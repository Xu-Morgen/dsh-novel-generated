import { describe, expect, it, vi } from 'vitest';

import {
  OpenAICompatClient,
  type OpenAICompatRequest,
} from './openai-compat.js';

const request: OpenAICompatRequest = {
  endpoint: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  messages: [{ role: 'user', content: '写一个开篇。' }],
  maxRetries: 2,
};

const encoder = new TextEncoder();

describe('OpenAICompatClient', () => {
  it('yields deltas in order across real UTF-8 and event byte boundaries', async () => {
    const payload = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: '甲' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: '乙' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    const bytes = encoder.encode(payload);
    const chineseOffset = findBytes(bytes, encoder.encode('甲'));
    const doneOffset = findBytes(bytes, encoder.encode('[DONE]'));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      streamingByteResponse([
        bytes.slice(0, chineseOffset + 1),
        bytes.slice(chineseOffset + 1, doneOffset + 3),
        bytes.slice(doneOffset + 3, bytes.length - 1),
        bytes.slice(bytes.length - 1),
      ]),
    );
    const client = new OpenAICompatClient({ fetch: fetchMock });

    await expect(collect(client.send(request))).resolves.toEqual(['甲', '乙']);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
        body: JSON.stringify({
          model: 'test-model',
          messages: request.messages,
          stream: true,
        }),
      }),
    );
  });

  it.each([
    ['LF', '\n\n'],
    ['CRLF', '\r\n\r\n'],
    ['CR', '\r\r'],
    ['mixed', '\r\n\n'],
  ])('accepts %s SSE event framing', async (_name, separator) => {
    const response = streamingResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '正文' } }] })}${separator}`,
      `data: [DONE]${separator}`,
    ]);
    const client = new OpenAICompatClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(collect(client.send(request))).resolves.toEqual(['正文']);
  });

  it('handles CRLF terminators split across transport chunks', async () => {
    const payload = JSON.stringify({
      choices: [{ delta: { content: '分片正文' } }],
    });
    const response = streamingResponse([
      `data: ${payload}\r`,
      '\n\r',
      '\ndata: [DONE]\r',
      '\n\r',
      '\n',
    ]);
    const client = new OpenAICompatClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(collect(client.send(request))).resolves.toEqual(['分片正文']);
  });

  it('retries a transient failure before any text is emitted', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(textResponse('重试成功'));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({
      fetch: fetchMock,
      retryDelay,
    });

    await expect(collect(client.send(request))).resolves.toEqual(['重试成功']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledWith(1, undefined);
  });

  it.each([408, 429, 503])(
    'retries transient HTTP status %i before output',
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('retry', { status }))
        .mockResolvedValueOnce(textResponse('恢复'));
      const retryDelay = vi.fn().mockResolvedValue(undefined);
      const client = new OpenAICompatClient({
        fetch: fetchMock,
        retryDelay,
      });

      await expect(collect(client.send(request))).resolves.toEqual(['恢复']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(retryDelay).toHaveBeenCalledOnce();
    },
  );

  it('stops retrying after the configured retry budget', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(
      collect(client.send({ ...request, maxRetries: 1 })),
    ).rejects.toThrow('offline');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledOnce();
  });

  it('retries premature EOF before output', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        streamingResponse(['data: {"choices":[]}\n\n']),
      )
      .mockResolvedValueOnce(textResponse('完整返回'));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(collect(client.send(request))).resolves.toEqual(['完整返回']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledOnce();
  });

  it('does not retry premature EOF after text has been emitted', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(streamingResponse([textEvent('部分正文')]));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });
    const stream = client.send(request)[Symbol.asyncIterator]();

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: '部分正文',
    });
    await expect(stream.next()).rejects.toThrow('ended before [DONE]');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('does not retry a stream failure after text has been emitted', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      streamThatFailsAfter('已输出'),
    );
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({
      fetch: fetchMock,
      retryDelay,
    });
    const stream = client.send(request)[Symbol.asyncIterator]();

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: '已输出',
    });
    await expect(stream.next()).rejects.toThrow('stream interrupted');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('rejects malformed events without retrying', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(streamingResponse(['data: not-json\n\n']));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({
      fetch: fetchMock,
      retryDelay,
    });

    await expect(collect(client.send(request))).rejects.toThrow(
      'not valid JSON',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('rejects stream-level provider errors without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      streamingResponse([
        `data: ${JSON.stringify({ error: { message: 'invalid\u0000 request' } })}\n\n`,
      ]),
    );
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(collect(client.send(request))).rejects.toThrow(
      'stream error: invalid request',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('does not retry non-transient HTTP errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({
      fetch: fetchMock,
      retryDelay,
    });

    await expect(collect(client.send(request))).rejects.toThrow(
      'request failed (401)',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('does not call fetch when already aborted with a custom reason', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled before fetch'));
    const fetchMock = vi.fn<typeof fetch>();
    const client = new OpenAICompatClient({ fetch: fetchMock });

    await expect(
      collect(client.send({ ...request, signal: controller.signal })),
    ).rejects.toThrow('cancelled before fetch');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry when aborted during fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new Error('cancelled during fetch'));
      throw new Error('fetch rejected');
    });
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(
      collect(client.send({ ...request, signal: controller.signal })),
    ).rejects.toThrow('cancelled during fetch');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('does not retry when aborted during a body read', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      streamThatAbortsDuringRead(controller),
    );
    const retryDelay = vi.fn().mockResolvedValue(undefined);
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(
      collect(client.send({ ...request, signal: controller.signal })),
    ).rejects.toThrow('body read interrupted');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).not.toHaveBeenCalled();
  });

  it('does not fetch again when aborted during an injected backoff', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('temporary failure'));
    const retryDelay = vi.fn().mockImplementation(async () => {
      controller.abort(new Error('cancelled during backoff'));
    });
    const client = new OpenAICompatClient({ fetch: fetchMock, retryDelay });

    await expect(
      collect(client.send({ ...request, signal: controller.signal })),
    ).rejects.toThrow('cancelled during backoff');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(retryDelay).toHaveBeenCalledOnce();
  });

  it('recognizes CR-only [DONE] at a chunk boundary and cancels an open transport', async () => {
    const cancel = vi.fn();
    const response = responseThatStaysOpenAfterDone(cancel, '\r\r');
    const client = new OpenAICompatClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(collect(client.send(request))).resolves.toEqual([]);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const values: string[] = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
}

function textEvent(text: string, separator = '\n\n'): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}${separator}`;
}

function textResponse(text: string): Response {
  return streamingResponse([textEvent(text), 'data: [DONE]\n\n']);
}

function streamingResponse(chunks: string[]): Response {
  return streamingByteResponse(chunks.map((chunk) => encoder.encode(chunk)));
}

function streamingByteResponse(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function streamThatFailsAfter(text: string): Response {
  let readCount = 0;

  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (readCount === 0) {
          readCount += 1;
          controller.enqueue(encoder.encode(textEvent(text)));
          return;
        }
        controller.error(new Error('stream interrupted'));
      },
    }),
    { status: 200 },
  );
}

function streamThatAbortsDuringRead(controller: AbortController): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(streamController) {
        controller.abort(new Error('cancelled during body read'));
        streamController.error(new Error('body read interrupted'));
      },
    }),
    { status: 200 },
  );
}

function responseThatStaysOpenAfterDone(
  cancel: () => void,
  separator: string,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: [DONE]${separator}`));
      },
      cancel,
    }),
    { status: 200 },
  );
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (
    let offset = 0;
    offset <= haystack.length - needle.length;
    offset += 1
  ) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        continue outer;
      }
    }
    return offset;
  }
  throw new Error('Expected byte sequence was not found');
}
