import type { IpcHandler } from '../../app/ipc-registry.js';
import { DESKTOP_MIGRATION_METHOD_IDS } from '../../core/schema/desktop-migration.js';
import type { DesktopMigrationService } from '../../host/desktop-migration-service.js';

/** I182 Main-owned migration commands; source paths are deliberately absent from every argument. */
export const DESKTOP_MIGRATION_COMMAND_IDS = Object.freeze([
  DESKTOP_MIGRATION_METHOD_IDS.preview,
  DESKTOP_MIGRATION_METHOD_IDS.execute,
  DESKTOP_MIGRATION_METHOD_IDS.rollback,
] as const);

/** Adapt the explicit migration service to the canonical strict IPC registry. */
export function createDesktopMigrationCommandRegistry(service: DesktopMigrationService): ReadonlyMap<string, IpcHandler> {
  return new Map<string, IpcHandler>([
    [DESKTOP_MIGRATION_METHOD_IDS.preview, () => service.preview()],
    [DESKTOP_MIGRATION_METHOD_IDS.execute, (operationId) => service.execute(operationId as string)],
    [DESKTOP_MIGRATION_METHOD_IDS.rollback, (operationId) => service.rollback(operationId as string)],
  ]);
}
