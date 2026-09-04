import * as React from 'react';

import type { IpcEnvelope } from '../../app/ipc-registry.js';
import type { DesktopMigrationExecution, DesktopMigrationPreview, DesktopMigrationRollback } from '../../core/schema/desktop-migration.js';
import type { DesktopMigrationClient } from './migration-client.js';

function statusLabel(status: DesktopMigrationPreview['projects'][number]['status']): string {
  if (status === 'ready') return '可迁移';
  if (status === 'conflict') return '目标冲突';
  return '损坏';
}

/**
 * I182 explicit migration wizard consumer.
 *
 * It is intentionally idle on mount. Preview, execute, and rollback are three
 * visible actions; only the execute button is the user's I11 confirmation.
 */
export function DesktopMigrationPanel(props: { readonly client: DesktopMigrationClient }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('迁移旧 DSH 作品前先检查，不会自动移动源数据。');
  const [preview, setPreview] = React.useState<DesktopMigrationPreview | undefined>();
  const [execution, setExecution] = React.useState<DesktopMigrationExecution | undefined>();
  const [rollback, setRollback] = React.useState<DesktopMigrationRollback | undefined>();
  const activeRef = React.useRef(true);
  React.useEffect(() => () => { activeRef.current = false; }, []);

  const run = async <T,>(request: Promise<IpcEnvelope<T>>, apply: (value: T) => void): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await request;
      if (!activeRef.current) return;
      if (!response.ok) { setMessage(response.error.message); return; }
      apply(response.value);
    } catch {
      if (activeRef.current) setMessage('迁移操作失败，源数据未被自动删除。');
    } finally {
      if (activeRef.current) setBusy(false);
    }
  };

  const h = React.createElement;
  return h('section', { className: 'nv-panel nv-migration', 'data-novel-migration': '', 'aria-label': '旧 DSH 迁移' },
    h('div', { className: 'nv-panel__header' },
      h('div', null,
        h('h2', { className: 'nv-panel__title' }, '旧作品迁移'),
        h('p', { className: 'nv-panel__hint' }, '预览、备份并验证后才会复制；API Key 不参与迁移。'),
      ),
    ),
    h('div', { className: 'nv-assistant__actions' },
      h('button', {
        type: 'button', className: 'nv-btn', disabled: busy, 'data-novel-migration-preview': '',
        onClick: () => { void run(props.client.preview(), (value) => { setPreview(value); setExecution(undefined); setRollback(undefined); setMessage(value.canExecute ? '预览完成，请确认后复制。' : '预览未通过，迁移已停止。'); }); },
      }, busy ? '检查中…' : '检查旧库迁移'),
      preview?.canExecute && preview.confirmation?.status === 'pending' && execution === undefined ? h('button', {
        type: 'button', className: 'nv-btn nv-btn--primary', disabled: busy, 'data-novel-migration-execute': '',
        onClick: () => { void run(props.client.execute(preview.operationId), (value) => { setExecution(value); setMessage('迁移完成；旧源数据保持不变。'); }); },
      }, '确认并复制') : null,
      execution !== undefined && rollback === undefined ? h('button', {
        type: 'button', className: 'nv-btn nv-btn--ghost', disabled: busy, 'data-novel-migration-rollback': '',
        onClick: () => { void run(props.client.rollback(execution.operationId), (value) => { setRollback(value); setMessage('已回滚本次迁移。'); }); },
      }, '回滚本次迁移') : null,
    ),
    h('p', { className: 'nv-panel__hint', role: 'status', 'aria-live': 'polite', 'data-novel-migration-message': '' }, message),
    preview === undefined ? null : h('div', { className: 'nv-migration__result', 'data-novel-migration-preview-result': '' },
      h('p', null, `作品 ${preview.projects.length} 个；备份：${preview.backup.planned ? '已规划' : '未规划'}；${preview.canExecute ? '可执行' : '不可执行'}`),
      preview.projects.length === 0 ? h('p', null, '未发现可迁移作品。') : h('ul', null, preview.projects.map((project) => h('li', { key: project.id }, `${project.name}：${statusLabel(project.status)}`))),
      h('p', null, `A2 设置：${preview.settings.a2.status}；工作台设置：${preview.settings.workbench.status}`),
    ),
    execution === undefined ? null : h('p', { className: 'nv-migration__result', 'data-novel-migration-execution-result': '' }, `已复制作品 ${execution.projectsCopied} 个、设置 ${execution.settingsCopied} 个。`),
    rollback === undefined ? null : h('p', { className: 'nv-migration__result', 'data-novel-migration-rollback-result': '' }, `已移除作品 ${rollback.projectsRemoved} 个、设置 ${rollback.settingsRemoved} 个。`),
  );
}
