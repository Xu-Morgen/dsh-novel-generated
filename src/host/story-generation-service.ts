import { ContextAssembler } from '../core/assemble/index.js';
import { registerContextSerializers } from '../core/assemble/serializers.js';
import {
  assembleStoryContext,
  type StoryContextAssembly,
  type StoryGenerationSources,
} from '../core/pipeline/index.js';
import {
  type GenerationCandidate,
  type GenerationSettings,
} from '../llm/port/index.js';
import { createGenerationService } from './generation-service.js';

/** Host facade for I19's full context-to-candidate path; it has no writeback. */
export interface NovelStoryGenerationService {
  generate(
    sources: StoryGenerationSources,
    settings: GenerationSettings,
    signal?: AbortSignal,
  ): Promise<{ readonly context: StoryContextAssembly; readonly candidate: GenerationCandidate }>;
}

/**
 * Build one assembler per service so its fixed serializer registry is isolated
 * from callers. The injected LLM is still the I17 Host route and is never
 * reachable from Client code or from the context sources.
 */
export function createStoryGenerationService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
): NovelStoryGenerationService {
  const generation = createGenerationService(llm, onDispose);
  const assembler = registerContextSerializers(new ContextAssembler());
  return {
    async generate(sources, settings, signal) {
      const context = assembleStoryContext(assembler, sources);
      const candidate = await generation.generate(context.prompt, settings, signal);
      return Object.freeze({ context, candidate });
    },
  };
}
