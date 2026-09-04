import { describe, expect, it, vi } from 'vitest';

import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { DESKTOP_MIGRATION_METHOD_IDS } from '../../core/schema/desktop-migration.js';
import { createDesktopMigrationCommandRegistry } from './migration-command-registry.js';

describe('I182 Main migration command registry', () => {
  it('binds only preview/execute/rollback and leaves argument validation to canonical IPC', async () => {
    const service = {
      preview: vi.fn(async () => ({ operationId: 'migration-op', sourceFingerprint: 'a'.repeat(64), source: { projects: 'missing' as const, settings: 'missing' as const, projectCount: 0, invalidEntries: 0 }, projects: [], settings: { a2: { status: 'absent' as const, bytes: 0 }, workbench: { status: 'absent' as const, bytes: 0 } }, backup: { planned: true as const }, canExecute: false, confirmation: null })),
      execute: vi.fn(async () => ({ operationId: 'migration-op', status: 'completed' as const, sourceFingerprint: 'a'.repeat(64), projectsCopied: 0, projectsSkipped: 0, settingsCopied: 0, settingsSkipped: 0, backupManifestHash: 'b'.repeat(64) })),
      rollback: vi.fn(async () => ({ operationId: 'migration-op', status: 'rolled-back' as const, projectsRemoved: 0, settingsRemoved: 0 })),
      dispose: vi.fn(),
    };
    const handlers = createDesktopMigrationCommandRegistry(service);
    await expect(desktopIpcRegistry.invoke(DESKTOP_MIGRATION_METHOD_IDS.preview, [], handlers.get(DESKTOP_MIGRATION_METHOD_IDS.preview))).resolves.toMatchObject({ ok: true, value: { canExecute: false } });
    await expect(desktopIpcRegistry.invoke(DESKTOP_MIGRATION_METHOD_IDS.execute, ['migration-op'], handlers.get(DESKTOP_MIGRATION_METHOD_IDS.execute))).resolves.toMatchObject({ ok: true, value: { status: 'completed' } });
    await expect(desktopIpcRegistry.invoke(DESKTOP_MIGRATION_METHOD_IDS.rollback, ['migration-op'], handlers.get(DESKTOP_MIGRATION_METHOD_IDS.rollback))).resolves.toMatchObject({ ok: true, value: { status: 'rolled-back' } });
    await expect(desktopIpcRegistry.invoke(DESKTOP_MIGRATION_METHOD_IDS.execute, [42], handlers.get(DESKTOP_MIGRATION_METHOD_IDS.execute))).resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(service.execute).toHaveBeenCalledWith('migration-op');
    expect(service.rollback).toHaveBeenCalledWith('migration-op');
  });
});
