import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { createDesktopMigrationService, type DesktopMigrationPaths } from './desktop-migration-service.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<{ root: string; paths: DesktopMigrationPaths }> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i182-migration-'));
  roots.push(root);
  const paths: DesktopMigrationPaths = {
    legacyProjectsRoot: join(root, 'legacy-projects'),
    legacySettingsRoot: join(root, 'legacy-settings'),
    libraryRoot: join(root, 'library'),
    settingsRoot: join(root, 'settings'),
    backupRoot: join(root, 'backups'),
  };
  const project = join(paths.legacyProjectsRoot, 'legacy');
  await mkdir(project, { recursive: true });
  await Promise.all(['rules', 'worldview', 'characters', 'relationships', 'state', 'knowledge', 'canon', 'text'].map((directory) => mkdir(join(project, directory), { recursive: true })));
  await mkdir(paths.legacySettingsRoot, { recursive: true });
  await Promise.all([
    writeFile(join(project, 'project.yaml'), '{"id":"legacy","version":1,"name":"Legacy work"}\n', 'utf8'),
    writeFile(join(project, 'style.yaml'), '{}\n', 'utf8'),
    writeFile(join(project, 'outline.yaml'), '{}\n', 'utf8'),
    writeFile(join(paths.legacySettingsRoot, 'workbench-settings.yaml'), '{"version":1,"wordTarget":500,"askWhenThin":true}\n', 'utf8'),
    writeFile(join(paths.legacySettingsRoot, 'credentials.bin'), 'secret-never-copied\n', 'utf8'),
  ]);
  return { root, paths };
}

async function absent(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

describe('I182 explicit desktop migration service', () => {
  it('previews, backs up, copies byte-identically, repeats idempotently, and rolls back', async () => {
    const { root, paths } = await fixture();
    const service = createDesktopMigrationService(paths);
    const sourceProject = join(paths.legacyProjectsRoot, 'legacy', 'project.yaml');
    const sourceSettings = join(paths.legacySettingsRoot, 'workbench-settings.yaml');
    const sourceBytes = await readFile(sourceProject);
    const settingsBytes = await readFile(sourceSettings);

    const preview = await service.preview();
    expect(preview).toMatchObject({ canExecute: true, confirmation: { status: 'pending' }, projects: [{ id: 'legacy', status: 'ready' }], settings: { a2: { status: 'absent' }, workbench: { status: 'ready' } } });
    expect(JSON.stringify(preview)).not.toContain('secret-never-copied');
    await absent(join(paths.libraryRoot, 'legacy'));

    const execution = await service.execute(preview.operationId);
    expect(execution).toMatchObject({ status: 'completed', projectsCopied: 1, settingsCopied: 1 });
    expect(await readFile(join(paths.libraryRoot, 'legacy', 'project.yaml'))).toEqual(sourceBytes);
    expect(await readFile(join(paths.settingsRoot, 'workbench-settings.yaml'))).toEqual(settingsBytes);
    await absent(join(paths.settingsRoot, 'credentials.bin'));
    expect(await readFile(sourceProject)).toEqual(sourceBytes);
    expect(await readFile(sourceSettings)).toEqual(settingsBytes);

    await expect(service.execute(preview.operationId)).resolves.toEqual(execution);
    const manifest = JSON.parse(await readFile(join(paths.backupRoot, preview.operationId, 'manifest.json'), 'utf8')) as { status: string; backupManifestHash: string };
    expect(manifest).toMatchObject({ status: 'completed' });
    expect(manifest.backupManifestHash).toMatch(/^[a-f0-9]{64}$/);

    await expect(service.rollback(preview.operationId)).resolves.toMatchObject({ status: 'rolled-back', projectsRemoved: 1, settingsRemoved: 1 });
    await absent(join(paths.libraryRoot, 'legacy'));
    await absent(join(paths.settingsRoot, 'workbench-settings.yaml'));
    await expect(service.rollback(preview.operationId)).resolves.toMatchObject({ status: 'rolled-back', projectsRemoved: 0, settingsRemoved: 0 });
    service.dispose();
    expect(root).toContain('novel-i182-migration-');
  });

  it('fails closed for missing, corrupt, conflicting, and changed sources', async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), 'novel-i182-missing-'));
    roots.push(missingRoot);
    const missing = createDesktopMigrationService({
      legacyProjectsRoot: join(missingRoot, 'projects'), legacySettingsRoot: join(missingRoot, 'settings'),
      libraryRoot: join(missingRoot, 'library'), settingsRoot: join(missingRoot, 'target-settings'), backupRoot: join(missingRoot, 'backups'),
    });
    await expect(missing.preview()).resolves.toMatchObject({ canExecute: false, confirmation: null, source: { projects: 'missing', settings: 'missing' } });
    missing.dispose();

    const corruptFixture = await fixture();
    await writeFile(join(corruptFixture.paths.legacyProjectsRoot, 'legacy', 'style.yaml'), '{"unexpected":true}\n', 'utf8');
    const corrupt = createDesktopMigrationService(corruptFixture.paths);
    await expect(corrupt.preview()).resolves.toMatchObject({ canExecute: false, projects: [{ status: 'corrupt' }] });
    corrupt.dispose();

    const conflictFixture = await fixture();
    await mkdir(join(conflictFixture.paths.libraryRoot, 'legacy'), { recursive: true });
    const conflict = createDesktopMigrationService(conflictFixture.paths);
    await expect(conflict.preview()).resolves.toMatchObject({ canExecute: false, projects: [{ status: 'conflict', issue: 'destination-conflict' }] });
    conflict.dispose();

    const changedFixture = await fixture();
    const changed = createDesktopMigrationService(changedFixture.paths);
    const preview = await changed.preview();
    await writeFile(join(changedFixture.paths.legacyProjectsRoot, 'legacy', 'project.yaml'), '{"id":"legacy","version":1,"name":"Changed"}\n', 'utf8');
    await expect(changed.execute(preview.operationId)).rejects.toThrow('source changed');
    await absent(join(changedFixture.paths.libraryRoot, 'legacy'));
    changed.dispose();
  });
});
