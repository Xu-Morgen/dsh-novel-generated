import type { IpcHandler } from '../../app/ipc-registry.js';
import type { DesktopPaths } from '../../app/paths.js';
import { workspaceViewModel } from '../../host/remote/editor.js';
import { createCanonService } from '../../host/canon-service.js';
import { createCharacterService } from '../../host/character-service.js';
import { createConfirmationService } from '../../host/confirmation-service.js';
import { createOutlineService } from '../../host/outline-service.js';
import { createProjectService } from '../../host/project-service.js';
import { createRelationshipService } from '../../host/relationship-service.js';
import { createStateService } from '../../host/state-service.js';
import { createWorkbenchSettingsService } from '../../host/workbench-settings-service.js';
import { createWorldviewService } from '../../host/worldview-service.js';
import { createKnowledgeService } from '../../host/knowledge-service.js';
import { createKnowledgeManagerService } from '../../host/knowledge-manager-service.js';
import { createRuleService } from '../../host/rule-service.js';
import { createStyleService } from '../../host/style-service.js';
import { createRuleStyleManagerService } from '../../host/rule-style-manager-service.js';
import { createDesktopC5Handlers, type DesktopC5HandlerDependencies, type DesktopC5Services } from './c5-handlers.js';
import { createDesktopReviewQueueHandlers } from './review-queue-handlers.js';

export const DESKTOP_MANAGED_PATH = '[desktop-managed]';

export type OpenDesktopDirectory = (directory: string) => void;

export interface DesktopProjectHandlerOptions {
  readonly llm?: unknown;
  readonly resolveGenerationSettings?: DesktopC5HandlerDependencies['resolveGenerationSettings'];
  readonly onDispose?: DesktopC5HandlerDependencies['onDispose'];
}

/**
 * I175 Main-owned project catalog composition.
 *
 * Every operation remains explicitly keyed by a validated project id. The service
 * deliberately owns no current-project field: Renderer may remember an id as a UI
 * preference, but `projectOpen` always reloads `project.yaml` and all readiness owners
 * before that id becomes usable again (design §14.7.1 / §14.32.3).
 */
export function createDesktopProjectHandlers(
  paths: DesktopPaths,
  openDirectory: OpenDesktopDirectory,
  options: DesktopProjectHandlerOptions = {},
): ReadonlyMap<string, IpcHandler> {
  const characters = createCharacterService(paths.libraryRoot);
  const worldview = createWorldviewService(paths.libraryRoot);
  const outline = createOutlineService(paths.libraryRoot);
  const relationship = createRelationshipService(paths.libraryRoot);
  const state = createStateService(paths.libraryRoot);
  const canon = createCanonService(paths.libraryRoot);
  const confirmation = createConfirmationService(paths.libraryRoot);
  const knowledge = createKnowledgeService(paths.libraryRoot);
  const knowledgeManager = createKnowledgeManagerService({ knowledge, characters, confirmation, projectsRoot: paths.libraryRoot });
  const rules = createRuleService(paths.libraryRoot);
  const style = createStyleService(paths.libraryRoot);
  const ruleStyleManager = createRuleStyleManagerService({ rules, style, projectsRoot: paths.libraryRoot });
  const projects = createProjectService(paths.libraryRoot, {
    characters,
    worldview,
    outline,
    relationship,
    state,
    canon,
    confirmation,
  });
  const settings = createWorkbenchSettingsService(paths.settingsRoot, paths.libraryRoot, openDirectory);

  let c5Services: DesktopC5Services | undefined;
  const c5Handlers = createDesktopC5Handlers({
    paths,
    characters,
    worldview,
    outline,
    relationship,
    state,
    canon,
    confirmation,
    projects,
    rules,
    style,
    knowledge,
    workbenchSettings: settings,
    llm: options.llm,
    resolveGenerationSettings: options.resolveGenerationSettings,
    onDispose: options.onDispose,
    onServices: (services) => { c5Services = services; },
  });
  if (c5Services === undefined) throw new Error('Desktop C5 services were not composed');
  const reviewQueueHandlers = createDesktopReviewQueueHandlers({
    c5: c5Services,
    paths,
    llm: options.llm,
    resolveGenerationSettings: options.resolveGenerationSettings,
    onDispose: options.onDispose,
    characters,
    canon,
    confirmation,
    knowledge,
    outline,
    relationship,
    rules,
    style,
  });

  return new Map<string, IpcHandler>([
    ...c5Handlers,
    ...reviewQueueHandlers,
    ['novel-creation-tool/novelWorkspace/viewModel', async () => workspaceViewModel()],
    ['novel-creation-tool/novelWorkspace/characterList', async (projectId) => characters.list(projectId as string)],
    ['novel-creation-tool/novelWorkspace/characterRead', async (projectId, characterId) => characters.read(projectId as string, characterId as string)],
    ['novel-creation-tool/novelWorkspace/characterCreate', async (projectId, input) => characters.create(projectId as string, input as Parameters<typeof characters.create>[1])],
    ['novel-creation-tool/novelWorkspace/characterUpdate', async (projectId, characterId, patch) => characters.update(projectId as string, characterId as string, patch as Parameters<typeof characters.update>[2])],
    ['novel-creation-tool/novelWorkspace/worldviewList', async (projectId) => worldview.list(projectId as string)],
    ['novel-creation-tool/novelWorkspace/worldviewRead', async (projectId, entryId) => worldview.read(projectId as string, entryId as string)],
    ['novel-creation-tool/novelWorkspace/worldviewCreate', async (projectId, input) => worldview.create(projectId as string, input as Parameters<typeof worldview.create>[1])],
    ['novel-creation-tool/novelWorkspace/worldviewRewrite', async (projectId, entryId, input) => worldview.rewrite(projectId as string, entryId as string, input as Parameters<typeof worldview.rewrite>[2])],
    ['novel-creation-tool/novelWorkspace/outlineRead', async (projectId) => outline.read(projectId as string)],
    ['novel-creation-tool/novelWorkspace/outlineSave', async (projectId, input) => outline.save(projectId as string, input as Parameters<typeof outline.save>[1])],
    ['novel-creation-tool/novelWorkspace/outlineBeatCards', async (projectId) => outline.beatCards(projectId as string)],
    ['novel-creation-tool/novelWorkspace/relationshipRead', async (projectId) => relationship.read(projectId as string)],
    ['novel-creation-tool/novelWorkspace/relationshipSave', async (projectId, input) => relationship.save(projectId as string, input as Parameters<typeof relationship.save>[1])],
    ['novel-creation-tool/novelWorkspace/stateCurrent', async (projectId) => state.current(projectId as string)],
    ['novel-creation-tool/novelWorkspace/stateSnapshots', async (projectId) => state.snapshots(projectId as string)],
    ['novel-creation-tool/novelWorkspace/stateRollback', async (projectId, seq) => state.rollback(projectId as string, seq as number)],
    ['novel-creation-tool/novelWorkspace/stateDiff', async (projectId, fromSeq, toSeq) => state.diff(projectId as string, fromSeq as number, toSeq as number)],
    ['novel-creation-tool/novelWorkspace/canonQuery', async (projectId, filter) => canon.query(projectId as string, filter as Parameters<typeof canon.query>[1])],
    ['novel-creation-tool/novelWorkspace/canonCorrectionPropose', async (projectId, targetId, input) => {
      const correction = input as Parameters<typeof canon.supersede>[2];
      return confirmation.propose(projectId as string, { id: correction.id, kind: 'canon-supersede', payload: { targetId: targetId as string, correction } });
    }],
    ['novel-creation-tool/novelWorkspace/canonCorrectionAccept', async (projectId, proposalId) => {
      const record = await confirmation.accept(projectId as string, proposalId as string);
      if (record.kind !== 'canon-supersede') throw new Error('Invalid canon correction proposal kind');
      const payload = record.payload as { targetId?: string; correction?: Parameters<typeof canon.supersede>[2] };
      if (!payload.targetId || !payload.correction) throw new Error('Invalid canon correction proposal payload');
      const existing = canon.query(projectId as string).find((event) => event.id === payload.correction?.id);
      return { confirmation: record, event: existing ?? await canon.supersede(projectId as string, payload.targetId, payload.correction) };
    }],
    ['novel-creation-tool/novelKnowledgeManager/list', async (projectId) => knowledgeManager.list(projectId as string)],
    ['novel-creation-tool/novelKnowledgeManager/read', async (projectId, entryId) => knowledgeManager.read(projectId as string, entryId as string)],
    ['novel-creation-tool/novelKnowledgeManager/propose', async (projectId, input) => knowledgeManager.propose(projectId as string, input as Parameters<typeof knowledgeManager.propose>[1])],
    ['novel-creation-tool/novelKnowledgeManager/accept', async (projectId, proposalId) => knowledgeManager.accept(projectId as string, proposalId as string)],
    ['novel-creation-tool/novelKnowledgeManager/reject', async (projectId, proposalId) => knowledgeManager.reject(projectId as string, proposalId as string)],
    ['novel-creation-tool/novelKnowledgeManager/pending', async (projectId) => knowledgeManager.pending(projectId as string)],
    ['novel-creation-tool/novelRuleStyleManager/list', async (projectId) => ruleStyleManager.list(projectId as string)],
    ['novel-creation-tool/novelRuleStyleManager/readRule', async (projectId, ruleId) => ruleStyleManager.readRule(projectId as string, ruleId as string)],
    ['novel-creation-tool/novelRuleStyleManager/createRule', async (projectId, input) => ruleStyleManager.createRule(projectId as string, input as Parameters<typeof ruleStyleManager.createRule>[1])],
    ['novel-creation-tool/novelRuleStyleManager/updateRule', async (projectId, ruleId, patch) => ruleStyleManager.updateRule(projectId as string, ruleId as string, patch as Parameters<typeof ruleStyleManager.updateRule>[2])],
    ['novel-creation-tool/novelRuleStyleManager/readStyle', async (projectId) => ruleStyleManager.readStyle(projectId as string)],
    ['novel-creation-tool/novelRuleStyleManager/saveStyle', async (projectId, input) => ruleStyleManager.saveStyle(projectId as string, input as Parameters<typeof ruleStyleManager.saveStyle>[1])],
    ['novel-creation-tool/novelWorkspace/projectList', async () => projects.listProjects()],
    ['novel-creation-tool/novelWorkspace/projectCreate', async (input) => projects.createProject(input as Parameters<typeof projects.createProject>[0])],
    ['novel-creation-tool/novelWorkspace/projectOpen', async (projectId) => projects.openProject(projectId as string)],
    ['novel-creation-tool/novelWorkspace/projectArchiveList', async () => projects.listArchivedProjects()],
    ['novel-creation-tool/novelWorkspace/projectArchive', async (projectId) => projects.archiveProject(projectId as string)],
    ['novel-creation-tool/novelWorkspace/projectRestore', async (projectId) => projects.restoreProject(projectId as string)],
    ['novel-creation-tool/novelWorkbenchSettings/load', async () => settings.load()],
    ['novel-creation-tool/novelWorkbenchSettings/save', async (input) => settings.save(input as Parameters<typeof settings.save>[0])],
    ['novel-creation-tool/novelWorkbenchSettings/openProjectFolder', async (projectId) => {
      const result = await settings.openProjectFolder(projectId as string);
      // The legacy result shape is contract-locked. Preserve it while replacing the
      // Host path with an explicit opaque marker before it crosses into Renderer.
      return Object.freeze({ opened: result.opened, path: DESKTOP_MANAGED_PATH });
    }],
  ]);
}
