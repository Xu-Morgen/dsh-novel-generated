import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { bindRemote, jsonCodec } from './common.js';

/**
 * I75 共享 Remote 接线层（design §0.1.2；架构审查 §6.3 / §9#1）。
 *
 * 本模块是 `host/remote/*.ts` 与 `src/index.ts` 接线层的单一 helper 源：
 * - `param` / `remoteInvocation` / `remoteContribution`：收敛原 19 份逐文件复制的
 *   `param()` / `xxxInvocation()` / `{ package, descriptors }` 助手（审查 §6.3）；
 * - `defineRemote`：参数化 Remote 适配工厂，替换组合根的 16 个 bindRemote 适配块
 *   （审查 §9#1），同步消除接线层 18 处 `as Parameters<...>` 与 6 处 `as never`
 *   —— domain 方法签名变更时适配闭包体直接报编译错（I75 验收负向夹具）。
 *
 * 契约与不变式：
 * - 本模块只依赖 zod 类型与纯函数，可被 Client bundle 完整导入（无 node 内置模块）。
 * - `remoteInvocation` 生成的 descriptor 与原逐文件工厂字节等价（id/service/
 *   namespace/method/invocation/parameters/result 语义不变，typeSymbol 由调用方
 *   显式传入的 `TypertCodec` 原样携带）；公开 wire 契约形状不变。
 * - `defineRemote` 返回的适配对象带 `typertRemote` 绑定（gateway 按
 *   serviceKey/namespace 派发 strict descriptor）；methods 为空时直接绑定
 *   domain service 本身（如 `novelWorkspace` 直通面）。
 */

/** 统一 wire 参数声明：`optional` 时 wire 字段缺失解码为 `undefined`（acceptsUndefined）。 */
export function param(name: string, codec: TypertCodec = jsonCodec, optional = false): InvocationParameterDescriptor {
  return { name, wire: name, source: 'json', codec, ...(optional ? { acceptsUndefined: true } : {}) };
}

/**
 * 统一 InvocationDescriptor 工厂。
 * `resultSchema` 必须是完整的 `TypertCodec`（含 mode/typeSymbol/schema），
 * 因此各 remote 文件的既有 typeSymbol 字符串原样保留。
 */
export function remoteInvocation(
  service: string,
  method: string,
  parameters: readonly InvocationParameterDescriptor[],
  resultSchema: TypertCodec,
  options: { namespace?: string } = {},
): InvocationDescriptor {
  const namespace = options.namespace ?? service;
  return { id: `novel-creation-tool/${service}/${method}`, service, namespace, method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

/** 统一 Remote 挂载贡献：每个 Client 挂载必须携带唯一 `package`（见 editor.ts 注释）。 */
export function remoteContribution(packageName: string, descriptors: readonly InvocationDescriptor[]): TypertRemoteContribution {
  return { package: packageName, descriptors: [...descriptors] };
}

/**
 * 一个 wire 方法的适配规格。
 * `method` 是公开 wire 方法名（即适配对象上 gateway 派发要查找的方法名），可以
 * 与 domain service 的方法名不同（如 wire `list` → `listBranches`、`rebuild` →
 * `build`）；domain 方法名与参数由 `call` 闭包体直接调用绑定（见下）。
 */
export interface RemoteMethodSpec {
  readonly method: string;
  /**
   * 适配闭包：接收 gateway 按 wire codec 解码后的实参并转发给 domain service。
   * 形参用 `any[]`（rest）是为了容纳各 wire 方法不同的实参数量/形状；类型安全点
   * 在闭包体 —— 直接以 wire 类型调用 domain 方法、禁止 `as Parameters<...>` 断言，
   * 因此 domain 方法签名变更时接线层即报编译错（I75 验收负向夹具）。
   */
  readonly call: (...args: any[]) => unknown;
}

/**
 * 参数化 Remote 适配工厂（I75）：由方法规格数组构建适配对象并绑定 gateway 派发
 * 元数据。`methods` 为空时直接绑定 domain service 本身（直通面）。
 */
export function defineRemote<TService extends object>(
  serviceKey: string,
  namespace: string,
  service: TService,
  methods: readonly RemoteMethodSpec[] = [],
): TService {
  if (methods.length === 0) return bindRemote(service, serviceKey, namespace);
  const adapter = {} as Record<string, (...args: unknown[]) => unknown>;
  for (const spec of methods) adapter[spec.method] = spec.call;
  return bindRemote(adapter as unknown as TService, serviceKey, namespace);
}
