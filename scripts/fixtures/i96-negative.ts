import type { LifecycleWriters } from '../../src/core/lifecycle/index.js';
import type { C2StateParserOutput } from '../../src/llm/parse/state.js';
import type { C1RelationshipParserOutput } from '../../src/llm/parse/relationship.js';
import type { C3KnowledgeParserOutput } from '../../src/llm/parse/knowledge.js';
import type { C4CanonParserOutput } from '../../src/llm/parse/canon.js';
import type { B2WorldviewParserOutput } from '../../src/llm/parse/worldview.js';

/**
 * I96 五层写回阶段合同类型化负向夹具（review v2.0 §8#1 / 计划 §18 I96）：
 * b2 writer 的入参形状与 B2WorldviewParserOutput 漂移（缺 ops、多 wrong）时
 * 必须编译失败，报错定位在本文件。
 */
type Writers = LifecycleWriters<
  C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput
>;

export const drifted: Writers = {
  c2: async () => undefined,
  c1: async () => undefined,
  c3: async () => undefined,
  c4: async () => undefined,
  b2: async (output: { wrong: string }) => { void output.wrong; },
};
