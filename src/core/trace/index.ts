import { registerContextSerializers } from '../assemble/serializers.js';
import { ContextAssembler, i12ContextBudget, i13ContextBudget, type ContextAssemblySection } from '../assemble/index.js';
import { assembleStoryContext, i19ContextBudget, type StoryContextSection, type StoryGenerationSources } from '../pipeline/index.js';
import type { DetailBeat } from '../schema/outline.js';
import type { OutlineNavigation } from '../schema/outline-progress.js';

/**
 * I71 生成注入解释（context trace，design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 职责与不变式：
 * - trace 解释「本次生成注入了哪些层、触发原因与裁剪/预算摘要」，是
 *   ContextAssembler 实际选择的**确定性摘要**：generate/continue 输入携带
 *   `sources` 时，本模块用与生成路径完全相同的注册器与组装器
 *   （`registerContextSerializers(new ContextAssembler())` → `assembleStoryContext`）
 *   重新组装，逐层记录 characterCount/预算/truncated —— 组装器确定性保证 trace
 *   与生成实际注入一致（同输入同输出），绝不另起一套选择逻辑。
 * - 不泄露：trace 只含层 id、字符数、预算、截断标记、触发关键词与有界导航标题，
 *   绝不携带 prompt 文本、知识事实、完整条目或任何非 POV 可见的 C3 内容
 *   （knowledge 只报告注入条数 `knowledgeVisibleCount`，不出现 entry id/fact）。
 * - scene-card / rewrite 不经 ContextAssembler：trace 如实报告
 *   `sections: []`（无结构层注入），scene-card 附带场景卡与导航摘要，rewrite 只
 *   报告重写指令长度。
 * - 输出是纯 owned JSON（冻结），可直接进 Remote wire（见 host/remote/writing）。
 */

/** 每个注入层的预算/裁剪摘要（层 id 与组装结果一致）。 */
export interface ContextTraceSection {
  readonly id: string;
  readonly characterCount: number;
  /** 该层的 UTF-16 预算（B1/B4 用 I12，B3/B2/C1/C2 与大纲/知情/正史/历史用对应 I13/I19 预算）。 */
  readonly budget: number;
  readonly truncated: boolean;
}

/** 世界观触发原因：被注入的命中条目 + 在触发文本中实际命中的关键词。 */
export interface WorldviewTrigger {
  readonly entryId: string;
  readonly title: string;
  readonly matchedKeywords: readonly string[];
}

/** 有界导航摘要（scene-card/continue 才有；不含完整 instruction）。 */
export interface ContextTraceNavigation {
  readonly actId: string;
  readonly beatId: string;
  readonly title: string;
}

/** 场景卡紧凑摘要（scene-card 注入的卡片信息；不含完整 points/summary 全文）。 */
export interface SceneCardTrace {
  readonly title: string;
  readonly pov: string;
  readonly wordTarget: number;
}

/** 一次生成的注入解释（最小 owned JSON；不泄露 secret/完整对象）。 */
export interface ContextTrace {
  readonly intent: 'generate' | 'continue' | 'scene-card' | 'rewrite';
  readonly pov: string;
  readonly navigation?: ContextTraceNavigation;
  readonly sections: readonly ContextTraceSection[];
  readonly triggers: readonly WorldviewTrigger[];
  readonly totals: { readonly characterCount: number; readonly budget: number; readonly truncatedSectionCount: number };
  /** rewrite 只注入重写指令：记录其长度（不记录内容）。 */
  readonly rewritePromptCharacters: number;
  /** C3 注入条数（POV 可见 filtered 视图的条目数；不出现 id/fact）。 */
  readonly knowledgeVisibleCount: number;
  /** scene-card 的卡片摘要（仅 scene-card）。 */
  readonly sceneCard?: SceneCardTrace;
}

export interface ContextTraceInput {
  readonly intent: 'generate' | 'continue' | 'scene-card' | 'rewrite';
  readonly pov?: string;
  /** generate/continue 的组装输入（与生成路径同一份 sources）。 */
  readonly sources?: StoryGenerationSources;
  /** 世界观触发的判定文本（writing-context 计算；用于复现命中关键词）。 */
  readonly triggerText?: string;
  readonly navigation?: OutlineNavigation;
  readonly card?: DetailBeat;
  readonly rewritePrompt?: string;
}

/** 确定性构建一次生成的注入解释。 */
export function buildContextTrace(input: ContextTraceInput): ContextTrace {
  if (input.intent === 'generate' || input.intent === 'continue') {
    if (input.sources === undefined) throw new Error('Context trace requires sources for generate/continue');
    return traceFromAssembly(input);
  }
  if (input.intent === 'scene-card') {
    const card = input.card;
    const navigation = input.navigation;
    return Object.freeze({
      intent: 'scene-card',
      pov: card?.pov ?? input.pov ?? '',
      ...(navigation !== undefined ? { navigation: traceNavigation(navigation) } : {}),
      sections: Object.freeze([]),
      triggers: Object.freeze([]),
      totals: Object.freeze({ characterCount: 0, budget: 0, truncatedSectionCount: 0 }),
      rewritePromptCharacters: 0,
      knowledgeVisibleCount: 0,
      ...(card !== undefined ? { sceneCard: Object.freeze({ title: card.title, pov: card.pov, wordTarget: card.wordTarget }) } : {}),
    });
  }
  // rewrite：不注入任何结构层，只注入调用方重写指令（长度仅作摘要）。
  return Object.freeze({
    intent: 'rewrite',
    pov: '',
    sections: Object.freeze([]),
    triggers: Object.freeze([]),
    totals: Object.freeze({ characterCount: 0, budget: 0, truncatedSectionCount: 0 }),
    rewritePromptCharacters: input.rewritePrompt?.length ?? 0,
    knowledgeVisibleCount: 0,
  });
}

/** 与生成路径相同的确定性组装 → 逐层摘要 + 触发原因 + 预算/裁剪汇总。 */
function traceFromAssembly(input: ContextTraceInput): ContextTrace {
  const sources = input.sources as StoryGenerationSources;
  const assembly = assembleStoryContext(registerContextSerializers(new ContextAssembler()), sources);
  const sections: ContextTraceSection[] = assembly.sections.map((section) => ({
    id: section.id,
    characterCount: section.characterCount,
    budget: sectionBudget(section.id),
    truncated: section.truncated,
  }));
  const triggers = sources.context.sources.worldview.map((hit) => ({
    entryId: hit.entryId,
    title: hit.entry.title,
    matchedKeywords: matchedKeywords(hit.entry.title, hit.entry.keywords, input.triggerText),
  }));
  const truncatedSectionCount = sections.filter((section) => section.truncated).length;
  return Object.freeze({
    intent: input.intent,
    pov: sources.context.macros.pov,
    ...(input.navigation !== undefined ? { navigation: traceNavigation(input.navigation) } : {}),
    sections: Object.freeze(sections),
    triggers: Object.freeze(triggers),
    totals: Object.freeze({
      characterCount: assembly.characterCount,
      budget: i19ContextBudget.totalCharacters,
      truncatedSectionCount,
    }),
    rewritePromptCharacters: 0,
    knowledgeVisibleCount: sources.knowledge.entries.length,
  });
}

function traceNavigation(navigation: OutlineNavigation): ContextTraceNavigation {
  return Object.freeze({ actId: navigation.actId, beatId: navigation.beatId, title: navigation.title });
}

/** 复现命中关键词：条目关键词 ∩ 触发文本（大小写不敏感；确定性排序去重）。 */
function matchedKeywords(title: string, keywords: readonly string[], triggerText?: string): readonly string[] {
  if (triggerText === undefined || triggerText.trim() === '') return Object.freeze([]);
  const lowered = triggerText.toLowerCase();
  const matched = new Set<string>();
  for (const keyword of [title, ...keywords]) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized.length > 0 && lowered.includes(normalized)) matched.add(normalized);
  }
  return Object.freeze([...matched].sort());
}

/** 各层固定预算（B1/B4 用 I12；B3/B2/C1/C2 与大纲/知情/正史/历史用 I13/I19）。 */
export function sectionBudget(id: ContextAssemblySection['id'] | StoryContextSection['id']): number {
  if (id === 'rules' || id === 'style') return i12ContextBudget.sectionCharacters[id];
  if (id === 'characters' || id === 'worldview' || id === 'relationships' || id === 'state') {
    return i13ContextBudget.sectionCharacters[id];
  }
  return i19ContextBudget.sectionCharacters[id as 'outline' | 'knowledge' | 'canon' | 'history'];
}
