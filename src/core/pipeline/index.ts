import type { CanonEventView } from '../canon/index.js';
import type { ContextAssemblyRequest, ContextAssemblySection, ContextAssembler } from '../assemble/index.js';
import type { FilteredKnowledge } from '../knowledge/filter.js';
import type { OutlineNavigation } from '../schema/outline-progress.js';
import { canonEventSchema } from '../schema/canon.js';
import { sceneSchema, type Scene } from '../schema/text.js';
import { knowledgeEntrySchema } from '../schema/knowledge.js';

/** Immutable I19 limits for the full prompt, measured in UTF-16 code units. */
export const i19ContextBudget = Object.freeze({
  totalCharacters: 24_000,
  sectionCharacters: Object.freeze({ outline: 1_800, knowledge: 3_000, canon: 4_000, history: 5_000 }),
});

export interface StoryHistorySources {
  readonly recentScenes: readonly Scene[];
  readonly historicalSummaries: readonly string[];
}

export interface StoryGenerationSources {
  readonly context: ContextAssemblyRequest;
  readonly navigation: OutlineNavigation;
  readonly knowledge: FilteredKnowledge;
  readonly canon: readonly CanonEventView[];
  readonly history: StoryHistorySources;
}

export interface StoryContextSection {
  readonly id: 'outline' | 'knowledge' | 'canon' | 'history';
  readonly text: string;
  readonly characterCount: number;
  readonly truncated: boolean;
}

export interface StoryContextAssembly {
  readonly prompt: string;
  readonly sections: readonly (ContextAssemblySection | StoryContextSection)[];
  readonly characterCount: number;
  /**
   * I92 双导航一致性校验（review v2.0 §8#3 / 计划 §18 I92）：记录渲染进
   * Outline 段的 OutlineNavigation 实例，供下游（write/continuation）与独立
   * 传入的 navigation 比对，拒绝分叉视图。只读快照，不改变组装语义。
   */
  readonly navigation: OutlineNavigation;
}

/**
 * I19 Host-side composition of all generation inputs (development plan I19,
 * design §8.1/§8.2). It only assembles a candidate prompt; it never writes C5
 * or any structured layer. C3 visibility is accepted only as the already
 * filtered POV view, so hidden entries cannot enter through this seam.
 */
export function assembleStoryContext(
  assembler: ContextAssembler,
  sources: StoryGenerationSources,
): StoryContextAssembly {
  if (sources.knowledge.pov !== sources.context.macros.pov) {
    throw new Error('Knowledge POV must match context POV');
  }
  const base = assembler.assemble(sources.context);
  const extra = [
    renderExtraSection('outline', renderNavigation(sources.navigation), i19ContextBudget.sectionCharacters.outline, false),
    renderExtraSection('knowledge', renderKnowledge(sources.knowledge), i19ContextBudget.sectionCharacters.knowledge, true),
    renderExtraSection('canon', renderCanon(sources.canon), i19ContextBudget.sectionCharacters.canon, true),
    renderExtraSection('history', renderHistory(sources.history), i19ContextBudget.sectionCharacters.history, true),
  ].filter((section): section is StoryContextSection => section !== undefined);
  const sections = Object.freeze([...base.sections, ...extra]);
  const prompt = sections.map((section) => section.text).join('\n\n');
  if (prompt.length > i19ContextBudget.totalCharacters) {
    throw new Error(`Story context total budget exceeded: ${prompt.length} > ${i19ContextBudget.totalCharacters}`);
  }
  return Object.freeze({ prompt, sections, characterCount: prompt.length, navigation: sources.navigation });
}

function renderNavigation(navigation: OutlineNavigation): string {
  if (!navigation.beatId || !navigation.instruction.trim()) throw new Error('Outline navigation is required');
  return [
    `beat: ${navigation.beatId}`,
    `act: ${navigation.actId}`,
    `title: ${navigation.title}`,
    `description: ${navigation.description}`,
    `prerequisitesMet: ${navigation.prerequisitesMet}`,
    `instruction: ${navigation.instruction}`,
    `deviations: ${navigation.deviationIds.length ? navigation.deviationIds.join(', ') : '(none)'}`,
  ].join('\n');
}

function renderKnowledge(knowledge: FilteredKnowledge): string {
  if (!knowledge.pov.trim()) throw new Error('Knowledge POV is required');
  const knownIds = new Set(knowledge.state.knows);
  return knowledge.entries
    .map((entry) => knowledgeEntrySchema.parse(entry))
    .map((entry) => {
      if (!knownIds.has(entry.id) || !entry.holders.includes(knowledge.pov)) {
        throw new Error(`Knowledge entry is not visible to POV: ${entry.id}`);
      }
      return entry;
    })
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => `- id: ${entry.id}\n  kind: ${entry.kind}\n  status: ${entry.status}\n  fact: ${entry.fact}`)
    .join('\n');
}

function renderCanon(canon: readonly CanonEventView[]): string {
  return canon
    .map(({ supersededBy: _supersededBy, ...event }) => canonEventSchema.parse(event))
    .sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id))
    .map((event) => `- seq: ${event.seq}\n  id: ${event.id}\n  storyTime: ${event.storyTime}\n  kind: ${event.kind}\n  summary: ${event.summary}\n  location: ${event.location}`)
    .join('\n');
}

function renderHistory(history: StoryHistorySources): string {
  const recent = history.recentScenes
    .map((scene) => sceneSchema.parse(scene))
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map((scene) => `- recent scene ${scene.id}: ${scene.content}`);
  const summaries = history.historicalSummaries.map((summary, index) => {
    if (typeof summary !== 'string' || !summary.trim()) throw new Error(`Invalid historical summary: ${index}`);
    return `- distant summary ${index + 1}: ${summary}`;
  });
  return [...recent, ...summaries].join('\n');
}

function renderExtraSection(
  id: StoryContextSection['id'],
  body: string,
  budget: number,
  truncatable: boolean,
): StoryContextSection | undefined {
  if (!body.trim()) return undefined;
  const prefix = `## ${id[0].toUpperCase()}${id.slice(1)}\n`;
  const full = prefix + body;
  if (full.length <= budget) return Object.freeze({ id, text: full, characterCount: full.length, truncated: false });
  if (!truncatable) throw new Error(`Story context section budget exceeded: ${id}`);
  const marker = '\n… [truncated]';
  const available = budget - prefix.length;
  const text = prefix + body.slice(0, Math.max(0, available - marker.length)) + marker;
  return Object.freeze({ id, text, characterCount: text.length, truncated: true });
}
