import { describe, expect, it } from 'vitest';
import {
  C2_PROMPT_EXAMPLE, c2StateParserOutputSchema, buildC2StateParserPrompt,
} from './state.js';
import {
  B2_PROMPT_EXAMPLE, b2WorldviewParserOutputSchema,
} from './worldview.js';
import {
  C3_PROMPT_EXAMPLE, c3KnowledgeParserOutputSchema,
} from './knowledge.js';
import {
  SPLIT_PROMPT_EXAMPLE, splitAgentOutputSchema,
} from './split.js';
import {
  C4_PROMPT_EXAMPLE, c4CanonParserOutputSchema,
} from './canon.js';
import {
  C1_PROMPT_EXAMPLE, c1RelationshipParserOutputSchema,
} from './relationship.js';

/**
 * I102 prompt 示例单点化一致性（计划 §18 I102，review v2.0 §6）：prompt JSON
 * 示例与 zod schema 的字段集合一致性守卫——示例常量按骨架键与 schema 形状比对，
 * schema 字段改名/增删在测试即暴露（不再双写无保护）。
 *
 * 可解析示例（state/worldview/knowledge/split）直接 JSON.parse 取键集；含 `|`
 * 联合描述的示意图例（canon/relationship）按对象骨架提取键集。
 */

function keysOf(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item) => keysOf(item));
  return [...new Set([...Object.keys(value), ...Object.values(value).flatMap((item) => keysOf(item))])];
}

/** 提取 zod object schema 的键集（含嵌套 shape；数组/union 取全部变体）。 */
function schemaKeys(schema: { shape?: Record<string, unknown> }, seen = new Set<object>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  if (schema.shape === undefined) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    out.push(key);
    const def = (value as { _def?: unknown })?._def as { shape?: Record<string, unknown>; options?: unknown[]; type?: string } | undefined;
    if (def?.shape !== undefined) out.push(...schemaKeys({ shape: def.shape }, seen));
    if (Array.isArray(def?.options)) {
      for (const option of def.options as unknown[]) {
        const optionDef = (option as { _def?: { shape?: Record<string, unknown> } })?._def;
        if (optionDef?.shape !== undefined) out.push(...schemaKeys({ shape: optionDef.shape }, seen));
      }
    }
  }
  return [...new Set(out)];
}

/** 从 JSON 描述文本提取全部键（含 `|` 联合变体，无需完整可解析）。 */
function skeletonKeys(schematic: string): string[] {
  return [...new Set([...schematic.matchAll(/"([A-Za-z][A-Za-z0-9]*)":/g)].map((match) => match[1]))];
}

describe('I102 prompt 示例与 zod schema 键集一致', () => {
  it('state：C2 示例可解析且键集与 c2StateParserOutputSchema 一致', () => {
    const keys = keysOf(JSON.parse(C2_PROMPT_EXAMPLE));
    const schema = schemaKeys(c2StateParserOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key)), `schema 键 ${schema.filter((k) => !keys.includes(k))} 未出现在示例中`).toBe(true);
    expect(buildC2StateParserPrompt({ state: { id: 's', version: 1, seq: 0, storyTime: 'n', scene: { location: '', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [] }, prose: 'x' })).toContain(C2_PROMPT_EXAMPLE);
  });

  it('worldview：B2 示例可解析且键集与 b2WorldviewParserOutputSchema 一致', () => {
    const keys = keysOf(JSON.parse(B2_PROMPT_EXAMPLE));
    const schema = schemaKeys(b2WorldviewParserOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key))).toBe(true);
  });

  it('knowledge：C3 示例可解析且键集与 c3KnowledgeParserOutputSchema 一致', () => {
    const keys = keysOf(JSON.parse(C3_PROMPT_EXAMPLE));
    const schema = schemaKeys(c3KnowledgeParserOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key))).toBe(true);
  });

  it('split：示例可解析且键集与 splitAgentOutputSchema 一致', () => {
    const keys = keysOf(JSON.parse(SPLIT_PROMPT_EXAMPLE));
    const schema = schemaKeys(splitAgentOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key))).toBe(true);
  });

  it('canon：示意图例骨架键集与 c4CanonParserOutputSchema 一致（含 union 变体）', () => {
    const keys = skeletonKeys(C4_PROMPT_EXAMPLE);
    const schema = schemaKeys(c4CanonParserOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key))).toBe(true);
  });

  it('relationship：示意图例骨架键集与 c1RelationshipParserOutputSchema 一致（含 union 变体）', () => {
    const keys = skeletonKeys(C1_PROMPT_EXAMPLE);
    const schema = schemaKeys(c1RelationshipParserOutputSchema as unknown as { shape?: Record<string, unknown> });
    expect(schema.every((key) => keys.includes(key))).toBe(true);
  });
});
