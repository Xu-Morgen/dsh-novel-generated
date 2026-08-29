import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { bindRemote, jsonCodec, type CodecOut, type StrictCodec } from './common.js';

/**
 * I75/I91 共享 Remote 接线层（design §0.1.2；架构审查 §6.3 / §9#1 / §3.1）。
 *
 * 本模块是 `host/remote/*.ts` 与 `src/host/composition/*.ts` 接线层的单一 helper 源：
 * - `param` / `remoteInvocation` / `remoteContribution`：收敛原 19 份逐文件复制的
 *   `param()` / `xxxInvocation()` / `{ package, descriptors }` 助手（审查 §6.3）；
 * - `defineRemote`：参数化 Remote 适配工厂，替换组合根的 16 个 bindRemote 适配块
 *   （审查 §9#1），同步消除接线层 18 处 `as Parameters<...>` 与 6 处 `as never`
 *   —— domain 方法签名变更时适配闭包体直接报编译错（I75 验收负向夹具）。
 *
 * I91 类型耦合（review v2.0 §3.1 根因 / 计划 §18 I91）：descriptor 的参数/返回
 * 类型经幻影类型（`TypedParameter._out`、`InvocationDescriptor` 交集的
 * `parameters`/`result`/`method` 字面量）穿透到接线层与 Client 派生 namespace：
 * - `param` 把 codec 输出类型带进参数描述符（`CodecOut<C>`，optional 时并入
 *   `| undefined`）；
 * - `remoteInvocation` / 局部 `xxxInvocation` 辅助必须**泛型透传**（不得标注
 *   `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉且不报错；
 * - `defineRemote` 的 `methods` 逐个与 `descriptors` 的派生调用形状对齐 ——
 *   方法签名变更（增删参数/类型漂移）在接线层即报编译错（I91 负向夹具）。
 *
 * 契约与不变式：
 * - 本模块只依赖 zod 类型与纯函数，可被 Client bundle 完整导入（无 node 内置模块）。
 * - `remoteInvocation` 生成的 descriptor 与原逐文件工厂字节等价（id/service/
 *   namespace/method/invocation/parameters/result 语义不变，typeSymbol 由调用方
 *   显式传入的 `TypertCodec` 原样携带）；公开 wire 契约形状不变。
 * - `defineRemote` 返回的适配对象带 `typertRemote` 绑定（gateway 按
 *   serviceKey/namespace 派发 strict descriptor）；methods 为空时直接绑定
 *   domain service 本身（如 `novelWorkspace` 直通面）；`descriptors` 参数仅
 *   类型面（运行时装配行为与 I75 逐字等价）。
 */

/**
 * I91 类型化参数描述符：在协议 `InvocationParameterDescriptor` 上叠加幻影
 * `_out`（携带 wire 校验输出类型）与 `_optional`（acceptsUndefined 标记）。
 * 两个幻影都是**必填**属性：`_optional: true/false` 字面量在接线层/Client 派生的
 * 泛型延迟求值上下文中不被吞掉（`_out?: Out` 的 optional 属性在延迟 infer 时会
 * 丢失 `| undefined`，故 undefined 由 `_optional` 分支显式补回）。`_out` 不进入
 * 运行语义；`_optional` 是运行时布尔（与 `acceptsUndefined` 同源）。
 */
export interface TypedParameter<Out> extends InvocationParameterDescriptor {
  readonly _out?: Out;
  readonly _optional: boolean;
}

/** 从参数描述符提取输出类型（无 `_out` 幻影时退化为 unknown）。 */
export type TypedParameterOf<P> = P extends TypedParameter<infer Out> ? Out : unknown;

/** 单参数调用形参：`_optional: true`（wire acceptsUndefined）→ `T | undefined`。 */
export type ParameterShapeOf<P> = P extends { readonly _optional: true } ? TypedParameterOf<P> | undefined : TypedParameterOf<P>;

/**
 * 由参数元组递归派生调用形参元组（I91）：acceptsUndefined 参数 → `T | undefined`，
 * 普通参数 → `T`，无 `_out` 的裸描述符 → `unknown`。递归（非 `keyof` 映射）保证
 * 在泛型延迟求值上下文中仍产出**元组**（keyof 映射会把延迟元组退化成对象）。
 */
export type ParametersCallShape<Params extends readonly unknown[]> =
  Params extends readonly [infer Head, ...infer Tail]
    ? [ParameterShapeOf<Head>, ...ParametersCallShape<Tail>]
    : [];

/** 统一 wire 参数声明：`optional` 时 wire 字段缺失解码为 `undefined`（acceptsUndefined）。 */
export function param<const C extends TypertCodec, O extends boolean = false>(name: string, codec?: C, optional?: O): TypedParameter<CodecOut<C> | (O extends true ? undefined : never)> & { codec: C; readonly _optional: O } {
  // I91：codec 类型参数 C 携带输出类型；`codec ?? jsonCodec` 保持既有
  // `param(name)` / `param(name, undefined, true)` 缺省 jsonCodec 调用点零改动。
  const resolved = (codec ?? jsonCodec) as C;
  return { name, wire: name, source: 'json', codec: resolved, _optional: (optional ?? false) as O, ...(optional ? { acceptsUndefined: true as const } : {}) };
}

/**
 * I91 类型化 InvocationDescriptor：以字面类型覆盖基类同名属性。
 * 用 `Omit` 而非直接交集 `InvocationDescriptor & { parameters: P }` —— 直接交集
 * 会让 `desc['parameters']` 索引得到 `readonly InvocationParameterDescriptor[] & P`
 * 的交集（基类宽化与字面类型叠加），污染 `ParametersCallShape` 的元组映射。
 */
export type TypedInvocation<
  Params extends readonly InvocationParameterDescriptor[],
  Result extends TypertCodec,
  Method extends string,
  Service extends string,
> = Omit<InvocationDescriptor, 'parameters' | 'result' | 'method' | 'service'> & {
  parameters: Params;
  result: Result;
  method: Method;
  service: Service;
};

/**
 * 统一 InvocationDescriptor 工厂（I91 泛型透传）。
 * `resultSchema` 必须是完整的 `TypertCodec`（含 mode/typeSymbol/schema），
 * 因此各 remote 文件的既有 typeSymbol 字符串原样保留。返回类型保留
 * `parameters`/`result`/`method`/`service` 的字面类型，供接线层与 Client 派生。
 */
export function remoteInvocation<
  const S extends string,
  const M extends string,
  const P extends readonly InvocationParameterDescriptor[],
  const R extends TypertCodec,
>(service: S, method: M, parameters: P, resultSchema: R, options: { namespace?: string } = {}): TypedInvocation<P, R, M, S> {
  const namespace = options.namespace ?? service;
  return { id: `novel-creation-tool/${service}/${method}`, service, namespace, method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

/** 统一 Remote 挂载贡献：每个 Client 挂载必须携带唯一 `package`（见 editor.ts 注释）。 */
export function remoteContribution<const D extends readonly InvocationDescriptor[]>(packageName: string, descriptors: D): Omit<TypertRemoteContribution, 'descriptors'> & { descriptors: readonly D[number][] } {
  // I91：保留元素字面类型（`readonly D[number][]`）以便 Client `NamespaceOf` 派生；
  // 用 Omit 覆盖而非直接交集，避免 `contribution['descriptors'][number]` 索引得到
  // `readonly InvocationDescriptor[] & D[number]` 的交集（污染派生参数/返回类型）。
  // 展开拷贝与 I75 逐字等价（descriptors 数组只读，无调用方持有可变引用）。
  return { package: packageName, descriptors: [...descriptors] };
}

/**
 * 一个 wire 方法的适配规格。
 * `method` 是公开 wire 方法名（即适配对象上 gateway 派发要查找的方法名），可以
 * 与 domain service 的方法名不同（如 wire `list` → `listBranches`、`rebuild` →
 * `build`）；domain 方法名与参数由 `call` 闭包体直接调用绑定（见下）。
 *
 * I91：`call` 形参由类型参数 `A` 携带（不再 `(...args: any[])`）；`A` 在
 * `defineRemote` 的 descriptor 耦合路径由闭包声明推断并在接线层与 descriptor
 * 派生形状对齐。裸 `RemoteMethodSpec`（默认 `readonly unknown[]`）仅用于既有
 * 夹具/测试的宽松标注（I75 正负夹具已显式给出 `A` 保持断言意图）。
 */
export type RemoteMethodSpec<A extends readonly unknown[] = readonly unknown[]> = {
  readonly method: string;
  /**
   * 适配闭包：接收 gateway 按 wire codec 解码后的实参并转发给 domain service。
   * 类型安全点在闭包体 —— 直接以 wire 类型调用 domain 方法、禁止 `as Parameters<...>`
   * 断言，因此 domain 方法签名变更时接线层即报编译错（I75/I91 验收负向夹具）。
   */
  readonly call: (...args: A) => unknown;
};

/**
 * Adapter 可返回 schema 输出的可深只读表示；JSON codec 会重新物化 owned JSON，
 * 因此 Domain view 的 readonly 容器不应迫使 Host adapter 复制领域对象。
 */
export type RemoteResultShape<Out> =
  unknown extends Out ? unknown
  : Out extends undefined ? undefined
  : Out extends readonly (infer Item)[] ? readonly RemoteResultShape<Item>[]
  : Out extends object ? { readonly [K in keyof Out]: RemoteResultShape<Out[K]> }
  : Out;

/** 由 descriptor result codec 派生的单个方法规格；允许同步值或 Promise。 */
export type MethodSpecFor<D extends InvocationDescriptor> = {
  readonly method: D['method'];
  readonly call: (...args: ParametersCallShape<D['parameters']>) => RemoteResultShape<CodecOut<D['result']>> | Promise<RemoteResultShape<CodecOut<D['result']>>>;
};

/** 按位置把 methods 与 descriptors 逐一对齐的类型（方法名/调用形参任一漂移即编译错）。 */
export type MethodsForDescriptors<D extends readonly InvocationDescriptor[]> = {
  [K in keyof D]: MethodSpecFor<D[K]>;
};

/**
 * 参数化 Remote 适配工厂（I75/I91）：由方法规格数组构建适配对象并绑定 gateway
 * 派发元数据。`methods` 为空时直接绑定 domain service 本身（直通面）。
 *
 * I91 类型耦合：第 5 参 `descriptors` 仅类型面 —— `methods` 逐位与
 * `MethodsForDescriptors<D>` 对齐（method 名一致 + call 形参与 descriptor 参数
 * 派生形状一致），方法签名变更在接线层即报编译错。运行时装配行为与 I75 逐字等价。
 */
export function defineRemote<
  TService extends object,
  const D extends readonly InvocationDescriptor[] = readonly InvocationDescriptor[],
  const M extends readonly { method: string; call: Function }[] = readonly { method: string; call: Function }[],
>(
  serviceKey: string,
  namespace: string,
  service: TService,
  methods: M & MethodsForDescriptors<D> = [] as never,
  descriptors: D = [] as never,
): TService {
  const specs: readonly { method: string; call: Function }[] = methods;
  if (specs.length === 0) return bindRemote(service, serviceKey, namespace);
  const adapter = {} as TService;
  const surface = adapter as Record<string, Function>;
  for (const spec of specs) surface[spec.method] = spec.call;
  return bindRemote(adapter, serviceKey, namespace);
}
