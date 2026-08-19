// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('../llm/backend/openai-compat.js', () => ({
  OpenAICompatClient: class {
    send(request: unknown): AsyncIterable<string> {
      return sendMock(request);
    }
  },
}));

import { App } from './App.js';

beforeEach(() => {
  sendMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('App streaming request ownership', () => {
  it('appends current request chunks in arrival order', async () => {
    const controlled = createControlledStream();
    sendMock.mockReturnValue(controlled.stream);
    const view = render(<App />);

    submit(view.container);
    await act(async () => {
      controlled.emit('甲');
      controlled.emit('乙');
      controlled.finish();
      await Promise.resolve();
    });

    expect(readOutput(view.container)).toBe('甲乙');
    expect(screen.getByRole('status').textContent).toContain('生成完成');
  });

  it('ignores chunks that arrive from a superseded request', async () => {
    const first = createControlledStream();
    const second = createControlledStream();
    sendMock
      .mockReturnValueOnce(first.stream)
      .mockReturnValueOnce(second.stream);
    const view = render(<App />);

    submit(view.container);
    submit(view.container);
    await act(async () => {
      first.emit('旧正文');
      second.emit('新正文');
      second.finish();
      await Promise.resolve();
    });

    expect(readOutput(view.container)).toBe('新正文');
    const firstSignal = readSignal(sendMock.mock.calls[0]?.[0]);
    expect(firstSignal.aborted).toBe(true);
  });

  it('ignores late errors from a superseded request', async () => {
    const first = createControlledStream();
    const second = createControlledStream();
    sendMock
      .mockReturnValueOnce(first.stream)
      .mockReturnValueOnce(second.stream);
    const view = render(<App />);

    submit(view.container);
    submit(view.container);
    await act(async () => {
      first.fail(new Error('stale failure'));
      second.emit('当前正文');
      second.finish();
      await Promise.resolve();
    });

    expect(readOutput(view.container)).toBe('当前正文');
    expect(screen.queryByText('stale failure')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('生成完成');
  });

  it('returns to idle immediately and ignores late work after cancellation', async () => {
    const controlled = createControlledStream();
    sendMock.mockReturnValue(controlled.stream);
    const view = render(<App />);

    submit(view.container);
    fireEvent.click(screen.getByRole('button', { name: '停止' }));
    await act(async () => {
      controlled.emit('取消后正文');
      controlled.fail(new Error('cancelled late failure'));
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toContain('等待输入');
    expect(readOutput(view.container)).toBe('正文将在这里随流式响应逐步出现。');
    expect(screen.queryByText('cancelled late failure')).toBeNull();
  });
});

function submit(container: HTMLElement): void {
  fireEvent.change(screen.getByLabelText('模型'), {
    target: { value: 'test-model' },
  });
  const form = container.querySelector('form');
  if (form === null) {
    throw new Error('Expected generation form');
  }
  fireEvent.submit(form);
}

function readOutput(container: HTMLElement): string {
  const output = container.querySelector('pre');
  if (output === null) {
    throw new Error('Expected output element');
  }
  return output.textContent ?? '';
}

function readSignal(value: unknown): AbortSignal {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected request object');
  }
  const signal: unknown = Reflect.get(value, 'signal');
  if (!(signal instanceof AbortSignal)) {
    throw new Error('Expected request AbortSignal');
  }
  return signal;
}

interface ControlledStream {
  stream: AsyncIterable<string>;
  emit(value: string): void;
  finish(): void;
  fail(error: unknown): void;
}

function createControlledStream(): ControlledStream {
  const buffered: IteratorResult<string>[] = [];
  let pending:
    | {
        resolve(result: IteratorResult<string>): void;
        reject(error: unknown): void;
      }
    | undefined;
  let storedError: unknown;
  let hasStoredError = false;
  let closed = false;

  const stream: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          const result = buffered.shift();
          if (result !== undefined) {
            return Promise.resolve(result);
          }
          if (hasStoredError) {
            hasStoredError = false;
            return Promise.reject(storedError);
          }
          if (closed) {
            return Promise.resolve({ done: true, value: undefined });
          }
          return new Promise((resolve, reject) => {
            pending = { resolve, reject };
          });
        },
        return(): Promise<IteratorResult<string>> {
          closed = true;
          pending?.resolve({ done: true, value: undefined });
          pending = undefined;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };

  return {
    stream,
    emit(value) {
      if (closed) return;
      if (pending !== undefined) {
        const current = pending;
        pending = undefined;
        current.resolve({ done: false, value });
        return;
      }
      buffered.push({ done: false, value });
    },
    finish() {
      if (closed) return;
      closed = true;
      pending?.resolve({ done: true, value: undefined });
      pending = undefined;
    },
    fail(error) {
      if (closed) return;
      if (pending !== undefined) {
        const current = pending;
        pending = undefined;
        current.reject(error);
        return;
      }
      storedError = error;
      hasStoredError = true;
    },
  };
}
