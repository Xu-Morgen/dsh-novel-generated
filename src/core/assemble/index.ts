import type { ActiveRuleView } from '../schema/rules.js';
import type { ConstantStyleSegment } from '../schema/style.js';

/** The I12 fixed injection order; later iterations extend it only by an explicit contract change. */
export const contextSectionOrder = Object.freeze(['rules', 'style'] as const);
export type ContextSectionId = typeof contextSectionOrder[number];

/** Values substituted into supported prompt macros before any budget is measured. */
export interface ContextMacroValues {
  readonly user: string;
  readonly pov: string;
}

/**
 * Caller-owned structured inputs for the I12 sections.
 *
 * The assembler deliberately receives views rather than repositories so it owns
 * no files or domain truth (design §0.1.2 / §8). Later injectors add their own
 * typed section input without changing B1/B4 storage semantics.
 */
export interface ContextAssemblySources {
  readonly rules: readonly ActiveRuleView[];
  readonly style: ConstantStyleSegment;
}

/**
 * Immutable I12 UTF-16 code-unit limits for the two currently available
 * sections and their combined prompt (development plan I12 / design §8.1).
 * Tokenizer and model configuration are deliberately not an I12 seam; callers
 * cannot override these limits. Exceeding them fails closed.
 */
export const i12ContextBudget = Object.freeze({
  totalCharacters: 6_000,
  sectionCharacters: Object.freeze({ rules: 4_000, style: 3_000 }),
});

/** One registered serializer in the fixed I12 section registry. */
export interface ContextSectionSerializer {
  readonly id: ContextSectionId;
  readonly heading: string;
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
 * I12 order. Registration is explicit so later layers cannot silently replace
 * B1/B4 serialization; duplicate and unknown section IDs fail closed.
 */
export class ContextAssembler {
  private readonly serializers = new Map<ContextSectionId, ContextSectionSerializer>();

  /** Register exactly one serializer for a fixed I12 section. */
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
   * Render the complete I12 context. The same sources, macros, registry, and
   * budgets always produce byte-identical prompt text and section metadata.
   */
  assemble(request: ContextAssemblyRequest): ContextAssembly {
    validateMacroValues(request.macros);

    const sections = contextSectionOrder.map((id) => {
      const serializer = this.serializers.get(id);
      if (!serializer) throw new ContextAssemblyError(`Missing context serializer: ${id}`);

      const body = expandMacros(serializer.serialize(request.sources[id]), request.macros);
      if (!body.trim()) throw new ContextAssemblyError(`Context serializer produced empty section: ${id}`);

      const text = `## ${serializer.heading}\n${body}`;
      const characterCount = text.length;
      if (characterCount > i12ContextBudget.sectionCharacters[id]) {
        throw new ContextAssemblyError(
          `Context section budget exceeded: ${id} (${characterCount} > ${i12ContextBudget.sectionCharacters[id]})`,
        );
      }
      return Object.freeze({ id, text, characterCount });
    });

    const prompt = sections.map((section) => section.text).join('\n\n');
    if (prompt.length > i12ContextBudget.totalCharacters) {
      throw new ContextAssemblyError(
        `Context total budget exceeded: ${prompt.length} > ${i12ContextBudget.totalCharacters}`,
      );
    }
    return Object.freeze({ prompt, sections: Object.freeze(sections), characterCount: prompt.length });
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
