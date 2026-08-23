import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import type { Chapter, CreateChapterInput, Scene } from '../core/schema/text.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import type { LifecycleDecision } from '../core/lifecycle/index.js';
import { ContextAssembler } from '../core/assemble/index.js';
import { registerContextSerializers } from '../core/assemble/serializers.js';
import { assembleStoryContext } from '../core/pipeline/index.js';
import type { GenerationCandidate, GenerationSettings } from '../llm/port/index.js';
import type { StoryLifecycleExecution, StoryLifecycleParserInputs, StoryLifecycleRequest } from './story-lifecycle-service.js';
import { createStoryLifecycleService } from './story-lifecycle-service.js';
import { buildContinuationPrompt } from '../write/continuation.js';

export interface ContinuationRequest {
  readonly id: string;
  readonly projectId: string;
  readonly chapter: CreateChapterInput;
  readonly scene: Omit<Scene, 'index' | 'content'> & { readonly content?: string };
  readonly sources: StoryGenerationSources;
  readonly card: DetailBeat;
  readonly navigation: OutlineNavigation;
  readonly settings: GenerationSettings;
  readonly decision: LifecycleDecision;
  readonly afterGenerationViolations: unknown;
  readonly beforeWritebackViolations: unknown;
  readonly parserInputs: StoryLifecycleParserInputs;
  readonly writers: StoryLifecycleRequest['writers'];
  readonly signal?: AbortSignal;
}

export interface ContinuationResult {
  readonly execution: StoryLifecycleExecution;
  readonly scene?: Scene;
}

export interface NovelContinuationService {
  open(projectId: string): Promise<void>;
  continue(request: ContinuationRequest): Promise<ContinuationResult>;
}

/**
 * I44 Host owner for explicit continuation. I19 assembles all context and I30
 * owns validation, decision, parser fan-out, and structured writeback. C5 is
 * appended only after the lifecycle reports `written` (design §9.4).
 */
export function createContinuationService(
  llm: unknown,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onDispose?: (dispose: () => void) => void,
): NovelContinuationService {
  const lifecycle = createStoryLifecycleService(llm, projectsRoot, onDispose);
  const assembler = registerContextSerializers(new ContextAssembler());
  const repositories = new Map<string, TextRepository>();
  const get = (projectId: string): TextRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Continuation project is not open: ${projectId}`);
    return repository;
  };
  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      const repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    async continue(request: ContinuationRequest) {
      const repository = get(request.projectId);
      const context = assembleStoryContext(assembler, request.sources);
      const prompt = buildContinuationPrompt(context, request.card, request.navigation);
      const execution = await lifecycle.run({
        id: request.id, projectId: request.projectId, prompt, settings: request.settings,
        decision: request.decision, afterGenerationViolations: request.afterGenerationViolations,
        beforeWritebackViolations: request.beforeWritebackViolations,
        parserInputs: request.parserInputs, writers: request.writers, signal: request.signal,
      });
      if (execution.result.status !== 'written') return Object.freeze({ execution });
      const chapter = await ensureChapter(repository, request.chapter);
      const scene = await repository.appendScene(chapter.id, {
        id: request.scene.id, content: execution.candidate.text, summary: request.scene.summary,
        beats: request.scene.beats, canonEvents: request.scene.canonEvents, notes: request.scene.notes,
      });
      return Object.freeze({ execution, scene });
    },
  });
}

async function ensureChapter(repository: TextRepository, input: CreateChapterInput): Promise<Chapter> {
  try { return await repository.readChapter(input.id); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
    return repository.createChapter(input);
  }
}

export type { GenerationCandidate };
