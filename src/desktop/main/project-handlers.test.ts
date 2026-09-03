import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers, DESKTOP_MANAGED_PATH } from './project-handlers.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i175-main-'));
  roots.push(root);
  const paths = await createDesktopPaths({ userDataRoot: root });
  const opened: string[] = [];
  return { paths, opened, handlers: createDesktopProjectHandlers(paths, (directory) => opened.push(directory)) };
}

async function invoke(handlers: ReadonlyMap<string, (...args: readonly unknown[]) => unknown>, methodId: string, args: readonly unknown[] = []) {
  return desktopIpcRegistry.invoke(methodId, args, handlers.get(methodId));
}

describe('I175 Main project and settings handlers', () => {
  it('keeps two projects isolated and revalidates every explicit project id', async () => {
    const { handlers } = await fixture();
    for (const input of [{ projectId: 'alpha', name: '甲书' }, { projectId: 'beta', name: '乙书' }]) {
      expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [input])).toMatchObject({ ok: true, value: { id: input.projectId, name: input.name } });
    }
    const alpha = await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['alpha']);
    const beta = await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['beta']);
    expect(alpha).toMatchObject({ ok: true, value: { project: { id: 'alpha', name: '甲书' } } });
    expect(beta).toMatchObject({ ok: true, value: { project: { id: 'beta', name: '乙书' } } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['../alpha'])).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', [42])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
  });

  it('keeps archives non-openable until restore', async () => {
    const { handlers } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'archived', name: '归档书' }]);
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectArchive', ['archived']);
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['archived'])).toMatchObject({ ok: false, error: { code: 'handler-failed' } });
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectArchiveList')).toMatchObject({ ok: true, value: [{ id: 'archived' }] });
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectRestore', ['archived']);
    expect(await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectOpen', ['archived'])).toMatchObject({ ok: true, value: { project: { id: 'archived' } } });
  });

  it('opens a controlled Main path but returns only the locked opaque path marker', async () => {
    const { handlers, opened, paths } = await fixture();
    await invoke(handlers, 'novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'safe', name: '安全书' }]);
    const response = await invoke(handlers, 'novel-creation-tool/novelWorkbenchSettings/openProjectFolder', ['safe']);
    expect(response).toEqual({ ok: true, value: { opened: true, path: DESKTOP_MANAGED_PATH } });
    expect(opened).toEqual([paths.projectDirectory('safe')]);
    expect(JSON.stringify(response)).not.toContain(paths.libraryRoot);
    expect(await readFile(join(paths.libraryRoot, 'safe', 'project.yaml'), 'utf8')).toContain('安全书');
  });
});
