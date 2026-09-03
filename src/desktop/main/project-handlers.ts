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

export const DESKTOP_MANAGED_PATH = '[desktop-managed]';

export type OpenDesktopDirectory = (directory: string) => void;

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
): ReadonlyMap<string, IpcHandler> {
  const characters = createCharacterService(paths.libraryRoot);
  const worldview = createWorldviewService(paths.libraryRoot);
  const outline = createOutlineService(paths.libraryRoot);
  const relationship = createRelationshipService(paths.libraryRoot);
  const state = createStateService(paths.libraryRoot);
  const canon = createCanonService(paths.libraryRoot);
  const confirmation = createConfirmationService(paths.libraryRoot);
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

  return new Map<string, IpcHandler>([
    ['novel-creation-tool/novelWorkspace/viewModel', async () => workspaceViewModel()],
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
