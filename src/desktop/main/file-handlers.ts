import { basename } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { IpcHandler } from '../../app/ipc-registry.js';
import { desktopSaveFileInputSchema, desktopSaveFileInvocation } from '../file-dialog-contract.js';

export interface DesktopFileHandlerOptions {
  readonly saveFile?: (fileName: string) => Promise<string | undefined>;
}

/**
 * I180 Main file-dialog adapter. Renderer supplies only an opaque export
 * payload; Main obtains the destination from the native dialog and returns a
 * basename so a host path cannot become UI state (design §0.1.2).
 */
export function createDesktopFileHandlers(options: DesktopFileHandlerOptions): ReadonlyMap<string, IpcHandler> {
  return new Map<string, IpcHandler>([
    [desktopSaveFileInvocation.id, async (rawInput) => {
      if (options.saveFile === undefined) throw new Error('Desktop save dialog is unavailable');
      const input = desktopSaveFileInputSchema.parse(rawInput);
      const target = await options.saveFile(input.fileName);
      if (target === undefined) return { saved: false, fileName: input.fileName };
      await writeFile(target, input.content, 'utf8');
      return { saved: true, fileName: basename(target) || input.fileName };
    }],
  ]);
}
