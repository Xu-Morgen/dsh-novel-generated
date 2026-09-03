import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createIpcRegistry, type IpcHandler, type IpcMethodDescriptor } from '../app/ipc-registry.js';
import { IPC_CANCEL_CHANNEL, IPC_INVOKE_CHANNEL, IPC_PROGRESS_CHANNEL } from '../app/ipc-transport.js';
import { bindElectronIpc, type DesktopIpcInvokeEvent, type DesktopIpcSender, type ElectronIpcMainLike } from './electron-ipc-binder.js';

function strictCodec<Output>(typeSymbol: string, schema: z.ZodType<Output>) {
  return {
    mode: 'strict' as const,
    typeSymbol,
    schema: z.toJSONSchema(schema) as never,
    parse: (value: unknown) => schema.parse(value),
  };
}

const inputCodec = strictCodec('test#input', z.object({ text: z.string() }));
const resultCodec = strictCodec('test#result', z.object({ accepted: z.boolean() }));
const method: IpcMethodDescriptor = {
  id: 'novel-creation-tool/test/accept', service: 'test', namespace: 'test', method: 'accept',
  parameters: [{ name: 'input', wire: 'input', codec: inputCodec }], result: resultCodec,
};

class FakeIpcMain implements ElectronIpcMainLike {
  readonly handlers = new Map<string, (event: DesktopIpcInvokeEvent, payload: unknown) => Promise<unknown>>();
  handle(channel: string, listener: (event: DesktopIpcInvokeEvent, payload: unknown) => Promise<unknown>): void {
    if (this.handlers.has(channel)) throw new Error(`duplicate channel ${channel}`);
    this.handlers.set(channel, listener);
  }
  removeHandler(channel: string): void { this.handlers.delete(channel); }
  invoke(channel: string, event: DesktopIpcInvokeEvent, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) return Promise.reject(new Error(`missing channel ${channel}`));
    return handler(event, payload);
  }
}

function sender(): DesktopIpcSender & { readonly messages: unknown[] } {
  const messages: unknown[] = [];
  return { messages, send: (_channel, payload) => { messages.push(payload); } };
}

function eventFor(value: DesktopIpcSender): DesktopIpcInvokeEvent { return { sender: value }; }

describe('I172 Main Electron IPC binder', () => {
  it('binds fixed invoke/cancel channels and validates sender, request, args, and result', async () => {
    const ipcMain = new FakeIpcMain();
    const registry = createIpcRegistry([method] as const);
    const mainSender = sender();
    const foreignSender = sender();
    let calls = 0;
    const binder = bindElectronIpc({
      ipcMain, registry,
      handlers: new Map<string, IpcHandler>([[method.id, async (input) => { calls += 1; const text = (input as { text: string }).text; return { accepted: text === 'bad' ? 'yes' : text.length > 0 }; }]]),
      isSenderAllowed: (event) => event.sender === mainSender,
    });

    expect([...ipcMain.handlers.keys()]).toEqual([IPC_INVOKE_CHANNEL, IPC_CANCEL_CHANNEL]);
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: '正文' }], requestId: 'req-1' }))
      .resolves.toEqual({ ok: true, value: { accepted: true } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(foreignSender), { methodId: method.id, args: [{ text: '正文' }], requestId: 'req-2' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'forbidden-sender' } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 1 }], requestId: 'req-3' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [], requestId: 'req-4' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'x' }], requestId: 'req-5' }))
      .resolves.toEqual({ ok: true, value: { accepted: true } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'bad' }], requestId: 'req-6' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
    expect(calls).toBe(3);
    await binder.dispose();
    expect(binder.snapshot()).toEqual({ active: false, pendingRequests: 0, inFlight: 0 });
    expect(ipcMain.handlers.size).toBe(0);
  });

  it('projects progress, cancels an in-flight handler, and drains late responses on dispose', async () => {
    const ipcMain = new FakeIpcMain();
    const registry = createIpcRegistry([method] as const);
    const mainSender = sender();
    let handlerStarted: (() => void) | undefined;
    const handlerReady = new Promise<void>((resolve) => { handlerStarted = resolve; });
    const handler: IpcHandler = async (...args) => {
      const context = args.at(-1) as { signal: AbortSignal; reportProgress(value: { readonly phase: string }): void };
      context.reportProgress({ phase: 'working' });
      handlerStarted?.();
      await new Promise<void>((resolve) => context.signal.addEventListener('abort', () => resolve(), { once: true }));
      throw new Error('handler observed cancellation');
    };
    const binder = bindElectronIpc({ ipcMain, registry, handlers: new Map([[method.id, handler]]), isSenderAllowed: (event) => event.sender === mainSender });
    const pending = ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'x' }], requestId: 'long-1' });
    await handlerReady;
    expect(mainSender.messages).toEqual([{ requestId: 'long-1', value: { phase: 'working' } }]);
    const cancel = await ipcMain.invoke(IPC_CANCEL_CHANNEL, eventFor(mainSender), { requestId: 'long-1' });
    expect(cancel).toEqual({ ok: true, value: undefined });
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(binder.snapshot()).toMatchObject({ pendingRequests: 0, inFlight: 0 });

    const neverIpcMain = new FakeIpcMain();
    const never = bindElectronIpc({ ipcMain: neverIpcMain, registry, handlers: new Map([[method.id, async (...args) => {
      const context = args.at(-1) as { signal: AbortSignal };
      await new Promise<void>((resolve) => context.signal.addEventListener('abort', () => resolve(), { once: true }));
      return { accepted: true };
    }]]) });
    expect(never.snapshot().active).toBe(true);
    const late = neverIpcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'late' }], requestId: 'late-1' });
    await Promise.resolve();
    await never.dispose();
    await expect(late).resolves.toMatchObject({ ok: false, error: { code: 'bridge-closed' } });
    expect(never.snapshot()).toEqual({ active: false, pendingRequests: 0, inFlight: 0 });
    expect(IPC_PROGRESS_CHANNEL).toBe('novelDesktop.progress');
    await binder.dispose();
  });

  it('returns stable failures for malformed control messages and rejects duplicate request ids', async () => {
    const ipcMain = new FakeIpcMain();
    const registry = createIpcRegistry([method] as const);
    const mainSender = sender();
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const binder = bindElectronIpc({ ipcMain, registry, handlers: new Map([[method.id, async () => { await wait; return { accepted: true }; }]]) });

    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), null)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'x' }], requestId: 'extra', unexpected: true })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(ipcMain.invoke(IPC_CANCEL_CHANNEL, eventFor(mainSender), { requestId: 'has spaces' })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    const first = ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'x' }], requestId: 'same' });
    await expect(ipcMain.invoke(IPC_INVOKE_CHANNEL, eventFor(mainSender), { methodId: method.id, args: [{ text: 'x' }], requestId: 'same' })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    release?.();
    await expect(first).resolves.toEqual({ ok: true, value: { accepted: true } });
    await binder.dispose();
  });
});
