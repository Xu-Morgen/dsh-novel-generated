import * as React from 'react';
import { Button } from './ui/button.js';
import type { WorkbenchActions, WorkbenchState } from '../../client/store/types.js';
import type { WorkbenchUi } from '../../client/presenter.js';
import type { DesktopProjectWorkflow } from './project-workflow.js';
import { scheduleFocus } from '../../client/focus.js';

/** I189 / design §14.34: directory presentation; lifecycle and drafts stay in existing owners. */
export function ProjectDirectory({ state, actions, workflow, ui, openMigration }: {
  readonly state: WorkbenchState; readonly actions: WorkbenchActions;
  readonly workflow: DesktopProjectWorkflow; readonly ui: WorkbenchUi; readonly openMigration: () => void;
}): React.ReactElement {
  const h = React.createElement;
  const [creating, setCreating] = React.useState(state.projects.length === 0);
  const recent = state.projects.find((project) => project.id === state.selectedProjectId) ?? state.projects[0];
  const uploadBusy = ['reading', 'uploading', 'finalizing'].includes(state.upload.phase);
  return h('section', { className: 'desktop-library', 'data-novel-project-chooser': '' },
    h('header', { className: 'desktop-library__header' },
      h('div', null, h('p', { className: 'desktop-eyebrow' }, '砚 · 创作台'), h('h1', null, '我的作品'),
        h('p', { className: 'desktop-muted' }, '从一个念头开始，让故事在这里生长。')),
      h('div', { className: 'nv-editor__actions' },
        h(Button, { onClick: () => { setCreating(true); scheduleFocus('[data-novel-project-name-input]'); }, 'data-novel-project-new': '' }, '新建作品'),
        h(Button, { busy: uploadBusy, busyLabel: '正在读取文档…', disabled: state.projectLoading, 'data-novel-upload-main-dialog': '', onClick: () => ui.uploadFile() }, '导入 DOCX'),
        h(Button, { variant: 'ghost', onClick: openMigration, 'data-novel-migration-open': '' }, '旧作品迁移'),
      ),
    ),
    state.projectError ? h('p', { className: 'nv-editor__error', role: 'alert', 'data-novel-project-error': '' }, state.projectError) : null,
    creating ? h('section', { className: 'desktop-library__create', 'data-novel-project-create-section': '' },
      h('h2', null, '新建作品'), h('p', { className: 'desktop-muted' }, '创建空白作品后，可以导入创作思路或已有素材。'),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '作品名称'),
        h('input', { type: 'text', className: 'nv-field__input', value: state.newProjectName,
          placeholder: '留空为「未命名作品」', 'data-novel-project-name-input': '',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => actions.newProjectName(event.target.value) })),
      h('div', { className: 'nv-editor__actions' },
        h(Button, { variant: 'primary', busy: state.projectLoading, busyLabel: '正在创建作品…', 'data-novel-project-create': '', onClick: () => workflow.createBlankProject(state.newProjectName) }, '创建作品'),
        h(Button, { variant: 'ghost', disabled: state.projectLoading, onClick: () => setCreating(false), 'data-novel-project-create-cancel': '' }, '取消'),
      ),
    ) : null,
    recent ? h('section', { className: 'desktop-library__current' },
      h('p', { className: 'desktop-eyebrow' }, recent.id === state.selectedProjectId ? '当前作品' : '打开作品'),
      h('h2', null, recent.name), h('p', { className: 'desktop-muted' }, '回到作品，继续上次的创作任务。'),
      h(Button, { variant: creating ? 'secondary' : 'primary', disabled: state.projectLoading, 'data-novel-project-continue': recent.id,
        onClick: () => state.browsing && recent.id === state.selectedProjectId ? actions.cancelBrowse() : workflow.requestOpen(recent.id) }, '继续创作'),
    ) : h('p', { className: 'desktop-muted', 'data-novel-project-empty': '' }, '作品库还是空的。先为你的故事起个名字。'),
    state.browsing && state.selectedProjectId !== undefined ? h(Button, { variant: 'ghost', 'data-novel-browse-cancel': '', onClick: actions.cancelBrowse }, '返回当前作品') : null,
    h('ul', { className: 'desktop-library__list', 'data-novel-project-list': '' }, state.projects.map((project) => h('li', { key: project.id },
      h(Button, { className: 'desktop-library__project', variant: 'ghost', disabled: state.projectLoading, 'data-novel-project-open': project.id, onClick: () => workflow.requestOpen(project.id) }, project.name),
      h('details', { className: 'desktop-library__more' }, h('summary', { 'aria-label': `${project.name}的更多操作` }, '更多'),
        h(Button, { variant: 'ghost', disabled: state.projectLoading, 'data-novel-project-archive': project.id, onClick: () => workflow.archiveProject(project.id) }, '归档作品')),
    ))),
    state.archivedProjects.length ? h('details', { className: 'desktop-library__archive', 'data-novel-project-archive-section': '' },
      h('summary', null, `已归档作品（${state.archivedProjects.length}）`),
      h('p', { className: 'desktop-muted' }, '归档作品只读，恢复后才能打开或编辑。'),
      h('ul', { className: 'desktop-library__list' }, state.archivedProjects.map((project) => h('li', { key: project.id, 'data-novel-archived-project': project.id },
        h('span', null, project.name), h(Button, { disabled: state.projectLoading, 'data-novel-project-restore': project.id, onClick: () => workflow.restoreProject(project.id) }, '恢复作品'),
      ))),
    ) : null,
  );
}
