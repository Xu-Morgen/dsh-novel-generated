import type { LifecycleWriters } from '../../src/core/lifecycle/index.js';
import type { C2StateParserOutput } from '../../src/llm/parse/state.js';
import type { C1RelationshipParserOutput } from '../../src/llm/parse/relationship.js';
import type { C3KnowledgeParserOutput } from '../../src/llm/parse/knowledge.js';
import type { C4CanonParserOutput } from '../../src/llm/parse/canon.js';
import type { B2WorldviewParserOutput } from '../../src/llm/parse/worldview.js';

/**
 * I96 五层写回阶段合同类型化正向夹具（review v2.0 §8#1 / 计划 §18 I96）：
 * 按层参数化的 LifecycleWriters 五层类型完全匹配时编译通过。
 */
type Writers = LifecycleWriters<
  C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput
>;

export const matching: Writers = {
  c2: async (output) => { void output.ops; },
  c1: async (output) => { void output.ops; },
  c3: async (output) => { void output.ops; },
  c4: async (output) => { void output.ops; },
  b2: async (output) => { void output.ops; },
};
