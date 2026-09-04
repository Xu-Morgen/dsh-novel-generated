import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createIpcDispatcher, createIpcRegistry, type IpcMethodDescriptor } from './ipc-registry.js';

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
const unknownCodec = strictCodec('test#unknown', z.unknown());

const method: IpcMethodDescriptor = {
  id: 'novel-creation-tool/test/accept',
  service: 'test',
  namespace: 'test',
  method: 'accept',
  parameters: [{ name: 'input', wire: 'input', codec: inputCodec }],
  result: resultCodec,
};

describe('framework-neutral strict IPC registry', () => {
  it('parses arguments before dispatch and results before returning an envelope', async () => {
    const registry = createIpcRegistry([method] as const);
    const calls: unknown[] = [];
    const result = await registry.invoke(method.id, [{ text: '正文' }], async (input) => {
      calls.push(input);
      return { accepted: true };
    });

    expect(calls).toEqual([{ text: '正文' }]);
    expect(result).toEqual({ ok: true, value: { accepted: true } });
  });

  it('fails closed for unknown methods, wrong arguments, invalid results, and unavailable handlers', async () => {
    const registry = createIpcRegistry([method] as const);
    const calls: unknown[] = [];
    const wrongCount = await registry.invoke(method.id, [], async () => { calls.push('called'); return { accepted: true }; });
    const wrongShape = await registry.invoke(method.id, [{ text: 1 }], async () => { calls.push('called'); return { accepted: true }; });
    const invalidResult = await registry.invoke(method.id, [{ text: 'x' }], async () => ({ accepted: 'yes' }));
    const unknown = await registry.invoke('novel-creation-tool/test/missing', [], async () => ({ accepted: true }));
    const unavailable = await registry.invoke(method.id, [{ text: 'x' }]);

    expect(wrongCount).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(wrongShape).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(invalidResult).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
    expect(unknown).toMatchObject({ ok: false, error: { code: 'unknown-method' } });
    expect(unavailable).toMatchObject({ ok: false, error: { code: 'handler-unavailable' } });
    expect(calls).toEqual([]);
  });

  it('rejects non-serializable values even when a legacy JSON codec accepts them', async () => {
    const looseMethod: IpcMethodDescriptor = {
      id: 'novel-creation-tool/test/loose', service: 'test', namespace: 'test', method: 'loose',
      parameters: [{ name: 'value', wire: 'value', codec: unknownCodec }], result: unknownCodec,
    };
    const registry = createIpcRegistry([looseMethod] as const);
    const input = await registry.invoke(looseMethod.id, [() => undefined], async (value) => value);
    const output = await registry.invoke(looseMethod.id, [null], async () => () => undefined);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const cycle = await registry.invoke(looseMethod.id, [cyclic], async (value) => value);

    expect(input).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(output).toMatchObject({ ok: false, error: { code: 'not-serializable' } });
    expect(cycle).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('allows only explicitly optional undefined and rejects duplicate registry keys', () => {
    const optional: IpcMethodDescriptor = {
      id: 'novel-creation-tool/test/optional', service: 'test', namespace: 'test', method: 'optional',
      parameters: [{ name: 'value', wire: 'value', acceptsUndefined: true, codec: unknownCodec }], result: resultCodec,
    };
    const registry = createIpcRegistry([optional] as const);
    expect(registry.parseArguments(optional.id, [undefined])).toEqual([undefined]);
    expect(() => registry.parseArguments(optional.id, [])).toThrow(/argument count/);

    const optionalString: IpcMethodDescriptor = {
      id: 'novel-creation-tool/test/optional-string', service: 'test', namespace: 'test', method: 'optional-string',
      parameters: [{ name: 'value', wire: 'value', acceptsUndefined: true, codec: inputCodec }], result: resultCodec,
    };
    const optionalStringRegistry = createIpcRegistry([optionalString] as const);
    expect(optionalStringRegistry.parseArguments(optionalString.id, [undefined])).toEqual([undefined]);

    expect(() => createIpcRegistry([method, method])).toThrow(/duplicate IPC method id/);
    expect(() => createIpcRegistry([method, { ...method, id: 'novel-creation-tool/test/other', method: 'other' }])).not.toThrow();
    expect(() => createIpcRegistry([method, { ...method, id: 'novel-creation-tool/other/accept', namespace: 'test' }])).toThrow(/duplicate IPC namespace\/method/);
  });

  it('provides a handler-map dispatcher keyed only by canonical ids', async () => {
    const registry = createIpcRegistry([method] as const);
    const dispatcher = createIpcDispatcher(registry, new Map([[method.id, async () => ({ accepted: true })]]));

    await expect(dispatcher.invoke(method.id, [{ text: 'x' }])).resolves.toEqual({ ok: true, value: { accepted: true } });
    await expect(dispatcher.invoke('test/accept', [{ text: 'x' }])).resolves.toMatchObject({ ok: false, error: { code: 'unknown-method' } });
  });
});
