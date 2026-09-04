import type { SelectedDocxResult } from '../core/schema/upload.js';
import type { WorkspaceNamespace } from './shared.js';
import { unwrap } from './shared.js';
import type { UploadProgress, UploadedDocx } from './upload.js';

/**
 * I179 Desktop-only upload port. Main owns the native chooser, bytes, ZIP/XML
 * validation, and upload session; this module receives only an opaque finalized
 * source projection (design §0.1.2 / §14.32.3).
 */
export async function selectDocxFromMain(
  workspace: WorkspaceNamespace,
  report: (progress: UploadProgress) => void,
): Promise<UploadedDocx | undefined> {
  report({ phase: 'reading' });
  const selected = await unwrap(workspace.selectDocx()) as SelectedDocxResult;
  if (selected === null) {
    report({ phase: 'idle' });
    return undefined;
  }
  report({ phase: 'done' });
  return selected;
}
