import type { WorkspaceViewModel } from '../../client/shared.js';
import { slug, unwrap } from '../../client/shared.js';
import type { WorkbenchActions, WorkbenchState } from '../../client/store/types.js';
import type { WorkbenchSettingsDraftShape, WorkbenchSettingsViewShape } from '../../client/workbench-settings.js';
import type { DesktopServiceBag } from './desktop-ipc-client.js';
import type { DesktopStoreInstance } from './store-adapter.js';
import { reloadProject } from '../../client/project-session.js';

export const LAST_PROJECT_PREFERENCE = 'novel-creation-tool:last-project';

export interface ProjectPreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DesktopProjectWorkflow {
  start(): Promise<void>;
  createBlankProject(name: string): void;
  requestOpen(projectId: string): void;
  requestBrowse(): void;
  confirmLeave(): void;
  cancelLeave(): void;
  archiveProject(projectId: string): void;
  restoreProject(projectId: string): void;
  saveSettings(draft: WorkbenchSettingsDraftShape): void;
  openProjectFolder(): void;
  dispose(): void;
}

interface ProjectShape { readonly id: string; readonly name: string }
interface OpenShape { readonly project: ProjectShape; readonly layers?: { readonly outline?: 'ready' | 'empty' | 'uninitialized' | 'corrupt' } }

function hasDirtyDrafts(state: WorkbenchState): boolean {
  return state.characterEditor.dirty
    || state.worldEditor.dirty
    || state.outlineEditor.dirty
    || state.relationshipEditor.dirty
    || state.canonEditor.dirty
    || state.chapters.editor.dirty;
}

/**
 * I175 Renderer project/session coordinator.
 *
 * The remembered id is an untrusted UI preference. Startup restores it only after
 * it appears in Main's active catalog and a fresh `projectOpen` succeeds. All draft
 * disposal stays in the existing Workbench actions, preserving the I55 dirty-state
 * decision rather than inventing a second project state owner.
 */
export function createDesktopProjectWorkflow(options: {
  readonly store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>;
  readonly services: Pick<DesktopServiceBag, 'workspace' | 'workbenchSettings'>;
  readonly preference: ProjectPreferenceStore;
}): DesktopProjectWorkflow {
  let active = true;
  let pending: { readonly kind: 'browse' } | { readonly kind: 'open'; readonly projectId: string } | undefined;
  const inFlight = new Set<string>();
  const { store, services, preference } = options;

  const runOnce = (key: string, operation: () => Promise<void>): void => {
    if (!active || inFlight.has(key)) return;
    inFlight.add(key);
    void operation().finally(() => inFlight.delete(key));
  };

  const fail = (message: string): void => {
    if (active) store.actions.projectFailed(message);
  };

  const refreshCatalog = async (): Promise<ProjectShape[]> => {
    const [projects, archived] = await Promise.all([
      unwrap(services.workspace.projectList()),
      unwrap(services.workspace.projectArchiveList()),
    ]);
    if (active) {
      store.actions.setProjects(projects);
      store.actions.setArchivedProjects(archived);
    }
    return projects as ProjectShape[];
  };

  const openVerified = async (projectId: string): Promise<boolean> => {
    store.actions.projectOperationStarted();
    try {
      const result = await unwrap(services.workspace.projectOpen(projectId)) as OpenShape;
      if (!active) return false;
      store.actions.selectProject(result.project.id, result.project.name);
      store.actions.resetEditors();
      preference.setItem(LAST_PROJECT_PREFERENCE, result.project.id);
      reloadProject(
        services.workspace,
        result.project.id,
        store.actions,
        (apply) => {
          if (!active || store.getSnapshot().selectedProjectId !== result.project.id || store.getSnapshot().browsing) return;
          apply(store.actions);
        },
        () => active && store.getSnapshot().selectedProjectId === result.project.id && !store.getSnapshot().browsing,
        result.layers,
        { includeChapters: false },
      );
      return true;
    } catch {
      if (active) fail('作品打开失败：主进程未能验证该作品');
      return false;
    }
  };

  const performPending = (): void => {
    const decision = pending;
    pending = undefined;
    store.actions.showLeaveConfirm(false);
    if (decision?.kind === 'browse') {
      store.actions.resetEditors();
      store.actions.browseProjects();
      runOnce('catalog', async () => { await refreshCatalog(); });
    } else if (decision?.kind === 'open') {
      store.actions.resetEditors();
      runOnce(`open:${decision.projectId}`, async () => { await openVerified(decision.projectId); });
    }
  };

  const workflow: DesktopProjectWorkflow = {
    async start() {
      try {
        const [model, projects, settings] = await Promise.all([
          unwrap(services.workspace.viewModel()),
          refreshCatalog(),
          unwrap(services.workbenchSettings.load()),
        ]);
        if (!active) return;
        store.actions.ready(model as WorkspaceViewModel);
        store.actions.creationSettingsLoaded(settings as WorkbenchSettingsViewShape);
        const remembered = preference.getItem(LAST_PROJECT_PREFERENCE);
        if (remembered !== null && projects.some((project) => project.id === remembered)) {
          if (!await openVerified(remembered)) preference.removeItem(LAST_PROJECT_PREFERENCE);
        } else if (remembered !== null) {
          preference.removeItem(LAST_PROJECT_PREFERENCE);
        }
      } catch {
        if (active) store.actions.fail('桌面作品目录装载失败');
      }
    },
    createBlankProject(name) {
      runOnce('create', async () => {
        const normalizedName = name.trim() || '未命名作品';
        store.actions.createProject({ projectId: slug(normalizedName), name: normalizedName });
        try {
          const project = await unwrap(services.workspace.projectCreate({ projectId: slug(normalizedName), name: normalizedName })) as ProjectShape;
          if (!active) return;
          await refreshCatalog();
          await openVerified(project.id);
        } catch {
          fail('作品创建失败');
        }
      });
    },
    requestOpen(projectId) {
      if (projectId === store.getSnapshot().selectedProjectId) {
        store.actions.cancelBrowse();
        return;
      }
      if (hasDirtyDrafts(store.getSnapshot())) {
        pending = { kind: 'open', projectId };
        store.actions.showLeaveConfirm(true);
        return;
      }
      runOnce(`open:${projectId}`, async () => { await openVerified(projectId); });
    },
    requestBrowse() {
      if (hasDirtyDrafts(store.getSnapshot())) {
        pending = { kind: 'browse' };
        store.actions.showLeaveConfirm(true);
        return;
      }
      store.actions.browseProjects();
      runOnce('catalog', async () => { await refreshCatalog(); });
    },
    confirmLeave: performPending,
    cancelLeave() {
      pending = undefined;
      store.actions.showLeaveConfirm(false);
    },
    archiveProject(projectId) {
      runOnce(`archive:${projectId}`, async () => {
        store.actions.projectOperationStarted();
        try {
          await unwrap(services.workspace.projectArchive(projectId));
          if (!active) return;
          if (store.getSnapshot().selectedProjectId === projectId) {
            preference.removeItem(LAST_PROJECT_PREFERENCE);
            store.actions.clearProjectSelection();
            store.actions.resetEditors();
          }
          await refreshCatalog();
        } catch {
          fail('作品归档失败');
        }
      });
    },
    restoreProject(projectId) {
      runOnce(`restore:${projectId}`, async () => {
        store.actions.projectOperationStarted();
        try {
          await unwrap(services.workspace.projectRestore(projectId));
          if (active) await refreshCatalog();
        } catch {
          fail('作品恢复失败');
        }
      });
    },
    saveSettings(draft) {
      runOnce('settings:save', async () => {
        if (!Number.isInteger(draft.wordTarget) || draft.wordTarget < 100) {
          store.actions.creationSettingsSettled({ error: '目标字数至少 100' });
          return;
        }
        store.actions.creationSettingsSettled({ saving: true, message: '', error: '' });
        try {
          const view = await unwrap(services.workbenchSettings.save({ wordTarget: draft.wordTarget, askWhenThin: draft.askWhenThin }));
          if (!active) return;
          store.actions.creationSettingsLoaded(view as WorkbenchSettingsViewShape);
          store.actions.creationSettingsSettled({ saving: false, message: '创作设置已保存' });
        } catch {
          if (active) store.actions.creationSettingsSettled({ saving: false, error: '创作设置保存失败' });
        }
      });
    },
    openProjectFolder() {
      const projectId = store.getSnapshot().selectedProjectId;
      if (projectId === undefined) {
        store.actions.creationSettingsSettled({ error: '请先选择作品' });
        return;
      }
      runOnce('settings:open-folder', async () => {
        try {
          await unwrap(services.workbenchSettings.openProjectFolder(projectId));
          if (active) store.actions.creationSettingsSettled({ message: '已在系统文件管理器中打开作品文件夹', error: '' });
        } catch {
          if (active) store.actions.creationSettingsSettled({ error: '作品文件夹打开失败' });
        }
      });
    },
    dispose() {
      active = false;
      pending = undefined;
      inFlight.clear();
    },
  };
  return Object.freeze(workflow);
}
