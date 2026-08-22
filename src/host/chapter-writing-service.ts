import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import { exportPlainText } from '../core/export/index.js';
import type { Chapter, CreateChapterInput, Scene } from '../core/schema/text.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { LifecycleDecision } from '../core/lifecycle/index.js';
import type { StoryLifecycleExecution, StoryLifecycleParserInputs, StoryLifecycleRequest } from './story-lifecycle-service.js';
import { createStoryLifecycleService } from './story-lifecycle-service.js';
import { assertCompleteProse, buildChapterWritingPrompt, reportWordTarget, type WordTargetReport } from '../write/chapter.js';

export interface ChapterWritingRequest {
  readonly id: string;
  readonly projectId: string;
  readonly chapter: CreateChapterInput;
  readonly scene: Omit<Scene, 'index' | 'content'> & { readonly content?: string };
  readonly card: DetailBeat;
  readonly navigation: OutlineNavigation;
  readonly settings: StoryLifecycleRequest['settings'];
  readonly decision: LifecycleDecision;
  readonly afterGenerationViolations: unknown;
  readonly beforeWritebackViolations: unknown;
  readonly parserInputs: StoryLifecycleParserInputs;
  readonly writers: StoryLifecycleRequest['writers'];
  readonly signal?: AbortSignal;
}

export interface ChapterWritingResult {
  readonly execution: StoryLifecycleExecution;
  readonly scene?: Scene;
  readonly wordTarget: WordTargetReport;
  readonly exports: Readonly<Record<string, string>>;
}

export interface NovelChapterWritingService {
  open(projectId: string): Promise<void>;
  write(request: ChapterWritingRequest): Promise<ChapterWritingResult>;
}

/**
 * I43 Host owner for outline-guided chapter materialization. It delegates
 * generation and structured writeback to I30, then appends accepted prose to C5
 * and reuses I39's deterministic txt/md export view. Word targets are evidence,
 * never a hard acceptance gate (development plan I43, design §9.4).
 */
export function createChapterWritingService(
  llm: unknown,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onDispose?: (dispose: () => void) => void,
): NovelChapterWritingService {
  const lifecycle = createStoryLifecycleService(llm, projectsRoot, onDispose);
  const repositories = new Map<string, TextRepository>();
  const get = (projectId: string): TextRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Chapter writing project is not open: ${projectId}`);
    return repository;
  };
  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      const repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    async write(request: ChapterWritingRequest) {
      const repository = get(request.projectId);
      const prompt = buildChapterWritingPrompt(request.card, request.navigation);
      const execution = await lifecycle.run({
        id: request.id,
        projectId: request.projectId,
        prompt,
        settings: request.settings,
        decision: request.decision,
        afterGenerationViolations: request.afterGenerationViolations,
        beforeWritebackViolations: request.beforeWritebackViolations,
        parserInputs: request.parserInputs,
        writers: request.writers,
        signal: request.signal,
      });
      const wordTarget = reportWordTarget(request.card.wordTarget, execution.candidate.text);
      if (execution.result.status !== 'written') {
        return Object.freeze({ execution, wordTarget, exports: Object.freeze({}) });
      }
      assertCompleteProse(execution.candidate.text);
      const chapter = await ensureChapter(repository, request.chapter);
      const scene = await repository.appendScene(chapter.id, {
        id: request.scene.id,
        content: execution.candidate.text,
        summary: request.scene.summary,
        beats: request.scene.beats,
        canonEvents: request.scene.canonEvents,
        notes: request.scene.notes,
      });
      const files = await exportPlainText(projectDirectory(projectsRoot, request.projectId));
      return Object.freeze({ execution, scene, wordTarget, exports: Object.freeze(files) });
    },
  });
}

async function ensureChapter(repository: TextRepository, input: CreateChapterInput): Promise<Chapter> {
  try {
    return await repository.readChapter(input.id);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
    return repository.createChapter(input);
  }
}
