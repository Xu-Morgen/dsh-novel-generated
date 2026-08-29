import type { InvocationDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

/**
 * I78 `contracts/` 形状本体契约锁校验（design §14.12 ③ / D22；架构审查 §6.3）。
 *
 * `contracts/stage10/*.json` 与 `contracts/stage15/client-projection.json` 以 JSON
 * Schema（zod `toJSONSchema` 生成）存形状本体；本模块提供「实现 ↔ 契约锁」一致性
 * 断言：以当前实现 schema 重新生成形状本体并与锁内本体逐字节比较，任何形状漂移
 * （字段改名/增删、类型/枚举/optionality 变化、zod 版本升级改变输出）都会返回
 * diff —— 形状漂移即失败（I78 验收负向）。
 *
 * 契约语义：
 * - 锁是刻意评审过的制品：有意识改契约时用 `pnpm run update:contracts`
 *   （scripts/update-contract-locks.ts）再生成并随 commit 一并提交；
 * - 本模块只依赖 zod 与纯 JSON 数据，可被测试与 smoke 复用（无 node 内置模块）。
 */

/** 由实现 schema 生成形状本体（JSON Schema）。 */
export function shapeLockBody(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema);
}

/**
 * 校验一份契约锁与实现 schema 集的一致性，返回差异列表（空数组 = 一致）。
 * `lock.shapes` 是锁文件中的形状本体映射 `{ shapeId: jsonSchema }`；
 * `schemas` 是当前实现 `{ shapeId: zodSchema }`。
 */
export function checkShapeLock(
  lock: { shapes?: Record<string, unknown> },
  schemas: Record<string, z.ZodType>,
): string[] {
  const diffs: string[] = [];
  const locked = lock.shapes ?? {};
  for (const [shapeId, schema] of Object.entries(schemas)) {
    const generated = JSON.stringify(shapeLockBody(schema));
    if (!(shapeId in locked)) {
      diffs.push(`契约锁缺少 shapeId 本体: ${shapeId}（先运行 pnpm run update:contracts 有意识补充）`);
      continue;
    }
    if (generated !== JSON.stringify(locked[shapeId])) {
      diffs.push(`形状漂移: ${shapeId} 的实现与契约锁本体不一致（字段/类型/枚举/optionality 变化；有意变更请审阅后运行 pnpm run update:contracts）`);
    }
  }
  for (const shapeId of Object.keys(locked)) {
    if (!(shapeId in schemas)) diffs.push(`契约锁含未实现 shapeId: ${shapeId}（锁已过时，请审阅后更新）`);
  }
  return diffs;
}

/** I103：把 codec 的公开字段与 canonical schema 一并投影为稳定 JSON。 */
function codecLockBody(codec: TypertCodec): Record<string, unknown> {
  if (!('schema' in codec)) return { ...codec };
  const schema = codec.schema as z.ZodType;
  // JSON Schema 没有 undefined；void Remote 用显式 DSH 标记锁定，禁止伪装成 `{}`。
  const schemaBody = schema instanceof z.ZodUndefined ? { $dshType: 'undefined' } : shapeLockBody(schema);
  return { ...codec, schema: schemaBody };
}

/** I103：锁定 invocation descriptor 的全部既有 enumerable 字段。 */
export function remoteDescriptorLockBody(descriptor: InvocationDescriptor): Record<string, unknown> {
  return {
    ...descriptor,
    invocation: { ...descriptor.invocation },
    parameters: descriptor.parameters.map((parameter) => ({
      ...parameter,
      codec: codecLockBody(parameter.codec),
    })),
    result: codecLockBody(descriptor.result),
  };
}

/** I103：以 descriptor id 为键生成稳定基线，重复 id 立即 fail closed。 */
export function remoteDescriptorLockBodies(descriptors: readonly InvocationDescriptor[]): Record<string, unknown> {
  const bodies: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    if (descriptor.id in bodies) throw new Error(`duplicate Remote descriptor id: ${descriptor.id}`);
    bodies[descriptor.id] = remoteDescriptorLockBody(descriptor);
  }
  return bodies;
}

/** I103：只生成指定 descriptor 的 result JSON Schema 锁。 */
export function remoteResultShapeBodies(descriptors: readonly InvocationDescriptor[]): Record<string, unknown> {
  const bodies: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    if (descriptor.id in bodies) throw new Error(`duplicate Remote result descriptor id: ${descriptor.id}`);
    if (!('schema' in descriptor.result)) throw new Error(`Remote result codec has no schema: ${descriptor.id}`);
    bodies[descriptor.id] = shapeLockBody(descriptor.result.schema as z.ZodType);
  }
  return bodies;
}

/** I103 Remote baseline 一致性检查；descriptor 或 result schema 任一漂移即失败。 */
export function checkRemoteContractLock(
  lock: { descriptors?: Record<string, unknown>; resultSchemas?: Record<string, unknown> },
  descriptors: readonly InvocationDescriptor[],
  resultDescriptors: readonly InvocationDescriptor[],
): string[] {
  const diffs: string[] = [];
  const generatedDescriptors = remoteDescriptorLockBodies(descriptors);
  const generatedResults = remoteResultShapeBodies(resultDescriptors);
  if (JSON.stringify(lock.descriptors ?? {}) !== JSON.stringify(generatedDescriptors)) {
    diffs.push('Remote invocation descriptor baseline 漂移（字段/codec/schema/顺序或集合变化）');
  }
  if (JSON.stringify(lock.resultSchemas ?? {}) !== JSON.stringify(generatedResults)) {
    diffs.push('Branch/Writing/Review/C5 result JSON schema baseline 漂移');
  }
  return diffs;
}
