import type { TypertCodec, TypertSchema } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

/**
 * I91 strict codec 携带其校验输出类型（review v2.0 §3.1 / §9.2，计划 §18 I91）。
 *
 * 类型机制：`schema: TypertSchema<Out>` 让 `Out` 出现在类型（非值）位置 ——
 * `StrictCodec<Out>` 对协议 `TypertCodec` 的 strict 变体协变可赋值（schema 的
 * parse 返回 Out），因此既有把 codec 传给 `TypertCodec` 槽位的调用点零改动，
 * 同时 `Out` 可被接线层（param/remoteInvocation/defineRemote 与 Client 派生
 * namespace）提取，让「descriptor ↔ Host adapter ↔ Client namespace」三方在
 * 编译期共享参数/返回类型 —— 方法签名变更在接线层即报编译错。
 *
 * 不变式：运行时形状与 I75 前逐字等价（mode/typeSymbol/schema 三字段），
 * 公开 wire 契约不变；`Out` 是纯类型层信息，不进入运行值。
 */
export interface StrictCodec<Out> {
  readonly mode: 'strict';
  readonly typeSymbol: string;
  readonly schema: TypertSchema<Out>;
}

/** 从任意协议 codec 提取其校验输出类型；非 strict 形状时退化为 unknown。 */
export type CodecOut<C extends TypertCodec> = C extends StrictCodec<infer Out> ? Out : unknown;

export function strictCodec<const Out>(typeSymbol: string, schema: TypertSchema<Out>): StrictCodec<Out> {
  return { mode: 'strict', typeSymbol, schema };
}
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
