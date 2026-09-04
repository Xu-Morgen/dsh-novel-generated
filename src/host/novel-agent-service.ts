import { validateProjectId } from '../core/io/path.js';
import type { ProjectOpenResult } from '../core/schema/project-lifecycle.js';
import type { CandidateTargetSelection } from '../core/schema/candidate-target.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { GenerationSettings } from '../llm/port/index.js';
import type { NovelProjectService } from './project-service.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelStyleService } from './style-service.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelInspirationService, InspirationResult } from './inspiration-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelWritingAdjudicationService, WritingAdjudicationOutcome } from './writing-adjudication-service.js';
import type { WritingCandidate } from '../core/candidate/index.js';
import type { NextSceneContextProvider, NovelAgentContext, NovelCreationSettingsView } from './writing-context.js';

/**
 * Main-owned domain orchestration for the former novel Agent commands.
 *
 * This module contains no DSH, Electron, IPC, or storage registration code. It
 * owns no repository and only coordinates the already-composed Host services;
 * `context` and `writing` must be the same instances consumed by the desktop
 * writing workflow (design §14.32.2 / plan I181).
 *
 * Invariants:
 * - opening validates and reopens the explicit project id through the shared
 *   project, layer, text, and writing owners;
 * - context is read-only and comes from the injected provider;
 * - continue creates a candidate only; adjudicate is the sole path that can
 *   reach the existing ConfirmationGate-backed writing owner.
 */
export interface NovelAgentDeps {
  readonly project: NovelProjectService;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly state: NovelStateService;
  readonly canon: NovelCanonService;
  readonly style: NovelStyleService;
  readonly rules: NovelRuleService;
  readonly knowledge: NovelKnowledgeService;
  readonly text: NovelTextService;
  readonly writing: NovelWritingAdjudicationService;
  readonly inspiration: NovelInspirationService;
  readonly confirmation: NovelConfirmationService;
  readonly context: NextSceneContextProvider;
  readonly resolveSettings: () => Promise<GenerationSettings>;
  readonly workbenchSettings: {
    load(): Promise<{ readonly wordTarget: number; readonly askWhenThin: boolean }>;
  };
}

/** Compact status view safe for the Renderer and assistant command surface. */
export interface NovelProjectStatus {
  readonly projectId: string;
  readonly layers: ProjectOpenResult['layers'];
  readonly characters: number;
  readonly worldview: number;
  readonly relationships: number;
  readonly canonEvents: number;
  readonly scenes: number;
  readonly outlineReady: boolean;
  readonly creation: NovelCreationSettingsView;
}

export interface NovelAgentService {
  open(projectId: string): Promise<ProjectOpenResult>;
  listProjects(): Promise<readonly { id: string; name: string }[]>;
  status(projectId: string): Promise<NovelProjectStatus>;
  context(projectId: string): Promise<NovelAgentContext>;
  proposeContinue(projectId: string, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  proposeContinue(projectId: string, target: CandidateTargetSelection, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', signal?: AbortSignal): Promise<WritingAdjudicationOutcome>;
  inspire(projectId: string, signal?: AbortSignal): Promise<InspirationResult>;
}

export function createNovelAgentService(deps: NovelAgentDeps): NovelAgentService {
  const opened = new Set<string>();

  async function openProject(projectId: string): Promise<ProjectOpenResult> {
    validateProjectId(projectId);
    if (!opened.has(projectId)) {
      await Promise.all([
        deps.project.openProject(projectId),
        deps.style.open(projectId),
        deps.rules.open(projectId),
        deps.knowledge.open(projectId),
        deps.text.open(projectId),
        deps.writing.open(projectId),
      ]);
      opened.add(projectId);
    }
    return deps.project.openProject(projectId);
  }

  const service: NovelAgentService = {
    open: openProject,
    listProjects: () => deps.project.listProjects(),
    async status(projectId) {
      const openedResult = await openProject(projectId);
      const [characters, worldview, relationships, canonViews, chapters, outline] = await Promise.all([
        deps.characters.list(projectId),
        deps.worldview.list(projectId),
        deps.relationship.read(projectId),
        deps.canon.query(projectId),
        deps.text.listChapters(projectId),
        deps.outline.readiness(projectId),
      ]);
      return Object.freeze({
        projectId,
        layers: openedResult.layers,
        characters: characters.length,
        worldview: worldview.length,
        relationships: relationships.length,
        canonEvents: canonViews.length,
        scenes: chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
        outlineReady: outline === 'ready',
        creation: await deps.workbenchSettings.load(),
      });
    },
    async context(projectId) {
      await openProject(projectId);
      return deps.context.context(projectId);
    },
    async proposeContinue(projectId, targetOrSignal?: CandidateTargetSelection | AbortSignal, explicitSignal?: AbortSignal) {
      await openProject(projectId);
      const target = targetOrSignal !== undefined && 'chapterId' in targetOrSignal && 'sceneId' in targetOrSignal
        ? targetOrSignal
        : undefined;
      const signal = target === undefined ? targetOrSignal as AbortSignal | undefined : explicitSignal;
      return target === undefined
        ? deps.writing.propose(projectId, { intent: 'continue' }, undefined, signal)
        : deps.writing.proposeAt(projectId, { intent: 'continue', ...target }, undefined, signal);
    },
    adjudicate: (candidateId, decision, signal) => deps.writing.adjudicate(candidateId, decision, undefined, signal),
    async inspire(projectId, signal) {
      await openProject(projectId);
      const outline = await deps.outline.read(projectId);
      const progress = await deps.outline.readProgress(projectId);
      return deps.inspiration.propose({
        prompt: `基于当前大纲「${outline.logline}」给出 2-3 个可区分的下一阶段创作方向。`,
        context: `当前幕/节：${progress.currentAct}/${progress.currentBeat}`,
      }, signal);
    },
  };
  return Object.freeze(service);
}

export type { ProjectOpenResult, NovelAgentContext, NovelCreationSettingsView, OutlineNavigation, DetailBeat };
