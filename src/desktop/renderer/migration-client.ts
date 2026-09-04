import type { IpcEnvelope } from '../../app/ipc-registry.js';
import {
  desktopMigrationExecutionSchema,
  desktopMigrationPreviewSchema,
  desktopMigrationRollbackSchema,
  DESKTOP_MIGRATION_METHOD_IDS,
  type DesktopMigrationExecution,
  type DesktopMigrationPreview,
  type DesktopMigrationRollback,
} from '../../core/schema/desktop-migration.js';
import type { DesktopIpcClient } from './desktop-ipc-client.js';

export interface DesktopMigrationClient {
  preview(): Promise<IpcEnvelope<DesktopMigrationPreview>>;
  execute(operationId: string): Promise<IpcEnvelope<DesktopMigrationExecution>>;
  rollback(operationId: string): Promise<IpcEnvelope<DesktopMigrationRollback>>;
}

function invalidResult<T>(): IpcEnvelope<T> {
  return { ok: false, error: { code: 'invalid-result', message: '迁移服务返回了无效结果', details: {} } };
}

async function invoke<T>(client: DesktopIpcClient, methodId: string, args: readonly unknown[], schema: { parse(value: unknown): T }): Promise<IpcEnvelope<T>> {
  const result = await client.invoke(methodId, args);
  if (!result.ok) return result;
  try {
    return { ok: true, value: schema.parse(result.value) };
  } catch {
    return invalidResult<T>();
  }
}

/**
 * I182 Renderer adapter for the explicit migration wizard.
 *
 * The client carries only operation/result projections. Source paths,
 * credentials, and filesystem capabilities remain Main-owned.
 */
export function createDesktopMigrationClient(client: DesktopIpcClient): DesktopMigrationClient {
  return Object.freeze({
    preview: () => invoke(client, DESKTOP_MIGRATION_METHOD_IDS.preview, [], desktopMigrationPreviewSchema),
    execute: (operationId: string) => invoke(client, DESKTOP_MIGRATION_METHOD_IDS.execute, [operationId], desktopMigrationExecutionSchema),
    rollback: (operationId: string) => invoke(client, DESKTOP_MIGRATION_METHOD_IDS.rollback, [operationId], desktopMigrationRollbackSchema),
  });
}
