import type { ActiveRuleView } from '../schema/rules.js';
import type { ConstantStyleSegment } from '../schema/style.js';
import type { SceneCharacterView } from '../schema/characters.js';
import type { WorldEntryHit } from '../schema/worldview.js';
import type { WorldState } from '../schema/state.js';
import type { RelationshipSummarySource } from '../schema/relationship.js';

/**
 * The fixed injection order (development plan I13 / design §8.1). Constant
 * layers (rules, style) come first to establish the "story foundation",
 * followed by scene-relevant characters, trigger-hit worldview entries, and the
 * C2 structured snapshot. The order is immutable; later iterations extend it
 * only through an explicit contract change.
 */
export const contextSectionOrder = Object.freeze([
  'rules',
  'style',
  'characters',
  'worldview',
  'relationships',
  'state',
] as const);
export type ContextSectionId = typeof contextSectionOrder[number];

/** Values substituted into supported prompt macros before any budget is measured. */
export interface ContextMacroValues {
  readonly user: string;
  readonly pov: string;
}

/**
 * Caller-owned structured inputs for the assembled sections.
 *
 * The assembler deliberately receives views rather than repositories so it owns
 * no files or domain truth (design §0.1.2 / §8). `characters` carries only the
 * scene-relevant {@link SceneCharacterView} slice, `worldview` only the
 * trigger-hit {@link WorldEntryHit} slice, and `state` the current
 * {@link WorldState} snapshot — the caller filters before handing them over.
 */
export interface ContextAssemblySources {
  readonly rules: readonly ActiveRuleView[];
  readonly style: ConstantStyleSegment;
  readonly characters: readonly SceneCharacterView[];
  readonly worldview: readonly WorldEntryHit[];
  readonly relationships?: RelationshipSummarySource;
  readonly state: WorldState;
}

/**
 * Immutable I12 UTF-16 code-unit limits for the two constant sections and
 * their combined prompt (development plan I12 / design §8.1 item 6).
 * `totalCharacters` is the historical two-section total; the I13 five-section
 * assembly is governed by {@link i13ContextBudget.totalCharacters}. Callers
 * cannot override either value.
 */
export const i12ContextBudget = Object.freeze({
  totalCharacters: 6_000,
  sectionCharacters: Object.freeze({ rules: 4_000, style: 3_000 }),
});

/**
 * Immutable I13 UTF-16 code-unit limits for the B3/B2/C2 sections and the full
 * six-section prompt (development plan I13/I16). Unlike B1/B4, whose over-budget
 * behaviour fails closed, these sections deterministically truncate and mark
 * themselves (see {@link contextTruncationMarker}); the combined total remains
 * a hard cap that fails closed. The total mirrors the I12 pattern of being
 * tighter than the sum of per-section caps (4_000 + 3_000 + 4_000 + 3_000 +
 * 3_000 + 3_000 − 4_000 = 16_000).
 */
export const i13ContextBudget = Object.freeze({
  totalCharacters: 16_000,
  sectionCharacters: Object.freeze({ characters: 4_000, worldview: 3_000, relationships: 3_000, state: 3_000 }),
});

/** Suffix appended when a truncatable section is deterministically cut to budget. */
export const contextTruncationMarker = '… [truncated]';

/** One registered serializer in the fixed section registry. */
export interface ContextSectionSerializer {
  readonly id: ContextSectionId;
  readonly heading: string;
  /**
   * When `true`, an over-budget section is deterministically truncated and
   * marked instead of failing closed (I13 B3/B2/C2 behaviour). Defaults to the
   * fail-closed B1/B4 behaviour.
   */
  readonly truncatable?: boolean;
  /**
   * When `true`, an empty serialized body omits the section instead of failing
   * closed. Trigger-driven sections (worldview hits, scene characters) may
   * legitimately be empty; constant/required sections never are.
   */
  readonly optional?: boolean;
  serialize(source: unknown): string;
}

/** Immutable result owned by the caller after one deterministic assembly. */
export interface ContextAssembly {
  readonly prompt: string;
  readonly sections: readonly ContextAssemblySection[];
  readonly characterCount: number;
}

/** A rendered section and its measured contribution to the final prompt. */
export interface ContextAssemblySection {
  readonly id: ContextSectionId;
  readonly text: string;
  readonly characterCount: number;
  readonly truncated: boolean;
}

/** Input contract for one ContextAssembler invocation. */
export interface ContextAssemblyRequest {
  readonly macros: ContextMacroValues;
  readonly sources: ContextAssemblySources;
}

/** Raised for invalid assembly input, registry state, macro, or budget failures. */
export class ContextAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextAssemblyError';
  }
}

const macroPattern = /{{\s*([^{}\s]+)\s*}}/g;

/**
 * Deterministically assembles registered section serializers in the immutable
 * fixed order. Registration is explicit so later layers cannot silently replace
 * a section; duplicate and unknown section IDs fail closed, and every required
 * section must be registered before assembly.
 */
export class ContextAssembler {
  private readonly serializers = new Map<ContextSectionId, ContextSectionSerializer>();

  /** Register exactly one serializer for a fixed section. */
  register(serializer: ContextSectionSerializer): this {
    if (!contextSectionOrder.includes(serializer.id)) {
      throw new ContextAssemblyError(`Unknown context section: ${serializer.id}`);
    }
    if (!serializer.heading.trim()) {
      throw new ContextAssemblyError(`Context section heading is required: ${serializer.id}`);
    }
    if (serializer.heading.includes('{{') || serializer.heading.includes('}}')) {
      throw new ContextAssemblyError(`Context section heading cannot contain macro syntax: ${serializer.id}`);
    }
    if (this.serializers.has(serializer.id)) {
      throw new ContextAssemblyError(`Context serializer already registered: ${serializer.id}`);
    }
    this.serializers.set(serializer.id, serializer);
    return this;
  }

  /**
   * Render the complete context. The same sources, macros, registry, and
   * budgets always produce byte-identical prompt text and section metadata.
   * Optional (trigger-driven) sections are omitted when they serialize empty;
   * required sections and the combined total fail closed when exceeded.
   */
  assemble(request: ContextAssemblyRequest): ContextAssembly {
    validateMacroValues(request.macros);

    const rendered: ContextAssemblySection[] = [];
    for (const id of contextSectionOrder) {
      const serializer = this.serializers.get(id);
      if (!serializer) throw new ContextAssemblyError(`Missing context serializer: ${id}`);

      const body = expandMacros(serializer.serialize(request.sources[id]), request.macros);
      if (!body.trim()) {
        if (serializer.optional) continue;
        throw new ContextAssemblyError(`Context serializer produced empty section: ${id}`);
      }

      const { text, truncated } = renderSection(
        id,
        serializer.heading,
        body,
        sectionBudget(id),
        serializer.truncatable === true,
      );
      rendered.push(Object.freeze({ id, text, characterCount: text.length, truncated }));
    }

    const sections = Object.freeze(rendered);
    const prompt = rendered.map((section) => section.text).join('\n\n');
    if (prompt.length > i13ContextBudget.totalCharacters) {
      throw new ContextAssemblyError(
        `Context total budget exceeded: ${prompt.length} > ${i13ContextBudget.totalCharacters}`,
      );
    }
    return Object.freeze({ prompt, sections, characterCount: prompt.length });
  }
}

/** Expand only the documented `{{user}}` and `{{pov}}` macros, failing on residue. */
export function expandMacros(text: string, macros: ContextMacroValues): string {
  if (typeof text !== 'string') throw new ContextAssemblyError('Context serializer must return text');
  const expanded = text.replace(macroPattern, (_whole, key: string) => {
    if (key === 'user' || key === 'pov') return macros[key];
    throw new ContextAssemblyError(`Unknown context macro: ${key}`);
  });
  if (expanded.includes('{{') || expanded.includes('}}')) {
    throw new ContextAssemblyError('Unresolved context macro');
  }
  return expanded;
}

/** Per-section UTF-16 code-unit cap; B1/B4 keep the I12 limits, B3/B2/C2 the I13 limits. */
function sectionBudget(id: ContextSectionId): number {
  if (id === 'rules' || id === 'style') return i12ContextBudget.sectionCharacters[id];
  return i13ContextBudget.sectionCharacters[id];
}

/** Build the `## Heading\nBody` text, truncating deterministically when allowed. */
function renderSection(
  id: ContextSectionId,
  heading: string,
  body: string,
  budget: number,
  truncatable: boolean,
): { text: string; truncated: boolean } {
  const text = `## ${heading}\n${body}`;
  if (text.length <= budget) return { text, truncated: false };
  if (!truncatable) {
    throw new ContextAssemblyError(`Context section budget exceeded: ${id} (${text.length} > ${budget})`);
  }

  // Cut the expanded body so the heading + kept body + marker stay within the
  // budget. UTF-16 code units are the budget unit, so slice is deterministic.
  const prefix = `## ${heading}\n`;
  const marker = `\n${contextTruncationMarker}`;
  const available = budget - prefix.length;
  let kept = '';
  let applied = '';
  if (available >= marker.length) {
    kept = body.slice(0, available - marker.length);
    applied = marker;
  } else if (available > 0) {
    kept = body.slice(0, available);
  }
  return { text: prefix + kept + applied, truncated: true };
}

/** Validate mandatory macro values without letting empty substitutions hide input defects. */
function validateMacroValues(macros: ContextMacroValues): void {
  for (const key of ['user', 'pov'] as const) {
    if (typeof macros[key] !== 'string' || !macros[key].trim()) {
      throw new ContextAssemblyError(`Context macro value is required: ${key}`);
    }
    if (macros[key].includes('{{') || macros[key].includes('}}')) {
      throw new ContextAssemblyError(`Context macro value contains unresolved syntax: ${key}`);
    }
  }
}
