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
