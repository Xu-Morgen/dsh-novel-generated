import { desktopSaveFileInputSchema, desktopSaveFileInvocation, desktopSaveFileResultSchema } from '../file-dialog-contract.js';
import type { DesktopIpcClient } from './desktop-ipc-client.js';

export interface DesktopFileDialog {
  saveFile(fileName: string, content: string, mimeType?: string): Promise<{ readonly saved: boolean; readonly fileName: string }>;
}

/** I180 Renderer adapter for Main-owned save dialogs; no host path is accepted or returned. */
export function createDesktopFileDialog(client: Pick<DesktopIpcClient, 'invoke'>): DesktopFileDialog {
  return Object.freeze({
    async saveFile(fileName: string, content: string, mimeType?: string) {
      const input = desktopSaveFileInputSchema.parse({
        fileName,
        content,
        ...(mimeType === undefined ? {} : { mimeType }),
      });
      const result = await client.invoke(desktopSaveFileInvocation.id, [input]);
      if (!result.ok) throw new Error(result.error.message);
      return desktopSaveFileResultSchema.parse(result.value);
    },
  });
}
