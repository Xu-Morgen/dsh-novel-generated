import { homedir } from 'node:os';
import { join } from 'node:path';
import { executeLifecycle, LifecycleJournal, type LifecycleDecision, type LifecycleResult, type LifecycleWriters } from '../core/lifecycle/index.js';
import { projectDirectory } from '../core/io/path.js';
import { createGenerationService } from './generation-service.js';
import { asLlmBackend, type GenerationCandidate, type GenerationSettings } from '../llm/port/index.js';
import { parseC2StateFromNarrative, type C2StateParserInput, type C2StateParserOutput } from '../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative, type C1RelationshipParserInput, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative, type C3KnowledgeParserInput, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative, type C4CanonParserInput, type C4CanonParserOutput } from '../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative, type B2WorldviewParserInput, type B2WorldviewParserOutput } from '../llm/parse/worldview.js';

export interface StoryLifecycleParserInputs {
  readonly c2: Omit<C2StateParserInput, 'prose'>;
  readonly c1: Omit<C1RelationshipParserInput, 'prose'>;
  readonly c3: Omit<C3KnowledgeParserInput, 'prose'>;
  readonly c4: Omit<C4CanonParserInput, 'prose'>;
  readonly b2: Omit<B2WorldviewParserInput, 'prose'>;
}

export interface StoryLifecycleOutputs {
  readonly c2: C2StateParserOutput;
  readonly c1: C1RelationshipParserOutput;
  readonly c3: C3KnowledgeParserOutput;
  readonly c4: C4CanonParserOutput;
  readonly b2: B2WorldviewParserOutput;
}

export interface StoryLifecycleRequest {
  readonly id: string;
  readonly projectId: string;
  readonly prompt: string;
  readonly settings: GenerationSettings;
  readonly decision: LifecycleDecision;
  /** Detector findings already collected by I21/I22/I24 and adjudicated here by I20. */
  readonly afterGenerationViolations: unknown;
  /** Findings over parsed operations, collected before the first layer write. */
  readonly beforeWritebackViolations: unknown;
  readonly parserInputs: StoryLifecycleParserInputs;
  /** Existing canonical layer owners supply these Host-only persistence calls（I96 按层类型化）。 */
  readonly writers: LifecycleWriters<C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput>;
  readonly signal?: AbortSignal;
}

/** Host-only public result of one I30 saga; it never serializes live store objects. */
export interface StoryLifecycleExecution {
  readonly candidate: GenerationCandidate;
  readonly result: LifecycleResult<C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput>;
}

export interface NovelStoryLifecycleService {
  run(request: StoryLifecycleRequest): Promise<StoryLifecycleExecution>;
}

/**
 * I30 Host coordinator. It uses the injected `ctx.llm` for generation and five
 * isolated parser prompts, but delegates every write to existing layer owners.
 * The project-local journal records partial saga progress for explicit recovery.
 */
export function createStoryLifecycleService(
  llm: unknown,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onDispose?: (dispose: () => void) => void,
): NovelStoryLifecycleService {
  const generation = createGenerationService(llm, onDispose);
  const backend = asLlmBackend(llm);
  return Object.freeze({
    async run(request: StoryLifecycleRequest) {
      const candidate = await generation.generate(request.prompt, request.settings, request.signal);
      const prose = candidate.text;
      const result = await executeLifecycle({
        id: request.id,
        decision: request.decision,
        afterGenerationViolations: request.afterGenerationViolations,
        beforeWritebackViolations: request.beforeWritebackViolations,
        journal: await LifecycleJournal.open(projectDirectory(projectsRoot, request.projectId)),
        parsers: {
          c2: () => parseC2StateFromNarrative(backend, { prose, ...request.parserInputs.c2 }, request.settings, request.signal),
          c1: () => parseC1RelationshipsFromNarrative(backend, { prose, ...request.parserInputs.c1 }, request.settings, request.signal),
          c3: () => parseC3KnowledgeFromNarrative(backend, { prose, ...request.parserInputs.c3 }, request.settings, request.signal),
          c4: () => parseC4CanonFromNarrative(backend, { prose, ...request.parserInputs.c4 }, request.settings, request.signal),
          b2: () => parseB2WorldviewFromNarrative(backend, { prose, ...request.parserInputs.b2 }, request.settings, request.signal),
        },
        writers: request.writers,
      });
      return Object.freeze({ candidate, result });
    },
  });
}
