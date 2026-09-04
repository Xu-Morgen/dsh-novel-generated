import type { IpcHandler, IpcInvocationContext } from '../../app/ipc-registry.js';
import { DESKTOP_ASSISTANT_METHOD_IDS } from '../../core/schema/desktop-assistant.js';
import type { NovelAgentService } from '../../host/novel-agent-service.js';

/** I181 Main-owned assistant command ids; no shell or provider command is accepted. */
export const DESKTOP_ASSISTANT_COMMAND_IDS = Object.freeze([
  DESKTOP_ASSISTANT_METHOD_IDS.open,
  DESKTOP_ASSISTANT_METHOD_IDS.status,
  DESKTOP_ASSISTANT_METHOD_IDS.context,
  DESKTOP_ASSISTANT_METHOD_IDS.continue,
  DESKTOP_ASSISTANT_METHOD_IDS.adjudicate,
  DESKTOP_ASSISTANT_METHOD_IDS.inspire,
] as const);

function contextOf(value: unknown): IpcInvocationContext | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const candidate = value as Partial<IpcInvocationContext>;
  return typeof candidate.reportProgress === 'function' && candidate.signal instanceof AbortSignal
    ? candidate as IpcInvocationContext
    : undefined;
}

function candidateProjection(candidate: { readonly id: string; readonly intent: 'continue' | string; readonly text: string; readonly target: object }) {
  return { candidateId: candidate.id, intent: candidate.intent, text: candidate.text, target: candidate.target };
}

function contextProjection(value: Awaited<ReturnType<NovelAgentService['context']>>) {
  return {
    projectId: value.projectId,
    navigation: value.navigation,
    currentCard: value.card,
    recentScenes: value.recentScenes,
    characters: value.sources.context.sources.characters.length,
    worldview: value.sources.context.sources.worldview.length,
    canon: value.sources.canon.length,
    creation: value.creation,
  };
}

function adjudicationProjection(value: Awaited<ReturnType<NovelAgentService['adjudicate']>>) {
  switch (value.status) {
    case 'rejected':
    case 'generation-rejected':
    case 'prewrite-rejected':
      return { status: value.status, candidateId: value.candidateId };
    case 'pending-compensation':
      return { status: value.status, candidateId: value.candidateId, failedStage: value.failedStage };
    case 'rewritten':
      return {
        status: value.status,
        candidateId: value.candidateId,
        superseded: value.superseded,
        candidate: candidateProjection(value.candidate),
      };
    case 'written':
      return { status: value.status, candidateId: value.candidateId, scene: value.scene, layers: value.layers };
  }
}

/**
 * Build the strict desktop command registry around one already-composed Agent
 * service. Cross-field checks happen before the domain service is called;
 * write decisions remain delegated to the shared ConfirmationGate-backed
 * writing owner (design §14.32.2 / requirements R34-10).
 */
export function createDesktopAssistantCommandRegistry(service: NovelAgentService): ReadonlyMap<string, IpcHandler> {
  const commands = new Map<string, IpcHandler>();
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[0], (projectId) => service.open(projectId as string));
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[1], (projectId) => projectId === undefined
    ? service.listProjects().then((projects) => ({ projects: projects.map(({ id, name }) => ({ id, name })) }))
    : service.status(projectId as string));
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[2], async (projectId) => contextProjection(await service.context(projectId as string)));
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[3], async (projectId, chapterId, sceneId, rawContext) => {
    const invocation = contextOf(rawContext);
    const hasChapter = chapterId !== undefined;
    const hasScene = sceneId !== undefined;
    if (hasChapter !== hasScene) throw new Error('chapterId and sceneId must be provided together');
    const result = hasChapter
      ? await service.proposeContinue(projectId as string, { chapterId: chapterId as string, sceneId: sceneId as string }, invocation?.signal)
      : await service.proposeContinue(projectId as string, invocation?.signal);
    return candidateProjection(result.candidate);
  });
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[4], async (candidateId, decision, rawContext) => {
    const invocation = contextOf(rawContext);
    return adjudicationProjection(await service.adjudicate(candidateId as string, decision as 'accept' | 'reject' | 'rewrite', invocation?.signal));
  });
  commands.set(DESKTOP_ASSISTANT_COMMAND_IDS[5], async (projectId, rawContext) => {
    const invocation = contextOf(rawContext);
    return service.inspire(projectId as string, invocation?.signal);
  });
  return commands;
}
