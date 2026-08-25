import type { TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

export const strictCodec = (typeSymbol: string, schema: { parse(value: unknown): unknown }): TypertCodec =>
  ({ mode: 'strict', typeSymbol, schema });
export const stringCodec = strictCodec('novel-creation-tool#string', z.string());
export const numberCodec = strictCodec('novel-creation-tool#number', z.number());
export const jsonCodec = strictCodec('novel-creation-tool#json', z.unknown());

/** Attach the gateway binding used to dispatch a strict descriptor to a Host service. */
export function bindRemote<T extends object>(service: T, serviceKey: string, namespace: string): T {
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey, namespace }, enumerable: false, writable: true, configurable: true,
  });
  return service;
}
