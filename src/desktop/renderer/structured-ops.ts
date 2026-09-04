import type { WorkbenchOps } from '../../client/store/types.js';
import { createWorkbenchOps } from '../../client/ops/index.js';
import type { OpsPorts, OpsRuntime } from '../../client/ops/context.js';
import type { ImportExportSavePort } from '../../client/ops/import-export.js';

/** Ports owned by the I176–I178 structured, writing, review, and queue slices. */
export type StructuredOpsPorts = Pick<OpsPorts, 'workspace' | 'knowledgeNamespace' | 'ruleStyleNamespace' | 'progressNamespace' | 'importExportNamespace' | 'writing' | 'reviewNamespace' | 'reviewRepairNamespace' | 'queueNamespace' | 'branchNamespace' | 'searchNamespace' | 'statisticsNamespace' | 'timelineNamespace' | 'textMutation' | 'sceneOutlineBinding' | 'textDeletion' | 'outlineReconciliation' | 'referenceAuditNamespace' | 'referenceCorrectionNamespace' | 'outlineDetailGeneration'> & { saveFile?: ImportExportSavePort };

const EMPTY_PORTS: OpsPorts = {
  workspace: undefined,
  writing: undefined,
  reviewNamespace: undefined,
  reviewRepairNamespace: undefined,
  queueNamespace: undefined,
  knowledgeNamespace: undefined,
  ruleStyleNamespace: undefined,
  progressNamespace: undefined,
  importExportNamespace: undefined,
  branchNamespace: undefined,
  searchNamespace: undefined,
  statisticsNamespace: undefined,
  timelineNamespace: undefined,
  sceneOutlineBinding: undefined,
  textMutation: undefined,
  textDeletion: undefined,
  outlineReconciliation: undefined,
  referenceAuditNamespace: undefined,
  referenceCorrectionNamespace: undefined,
  outlineDetailGeneration: undefined,
};

/**
 * Compose the B1–B5/C1–C4 operations for the desktop Renderer.
 *
 * The base composition supplies stable unavailable operations and router shape
 * for views that belong to later iterations. Only the nine structured panels
 * receive DesktopServiceBag ports here. I177 adds the C5 workbench and I178
 * adds review/repair/reference/queue ports; later panels remain fail-closed.
 */
export function createDesktopStructuredOps(runtime: OpsRuntime, ports: StructuredOpsPorts): WorkbenchOps {
  return createWorkbenchOps(runtime, {
    ...EMPTY_PORTS,
    ...ports,
  });
}
