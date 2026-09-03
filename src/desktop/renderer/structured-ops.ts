import type { WorkbenchOps } from '../../client/store/types.js';
import { createCanonOps } from '../../client/ops/canon.js';
import { createCharactersOps } from '../../client/ops/characters.js';
import { createKnowledgeOps } from '../../client/ops/knowledge.js';
import { createOutlineOps } from '../../client/ops/outline.js';
import { createRelationshipOps } from '../../client/ops/relationship.js';
import { createRuleStyleOps } from '../../client/ops/rule-style.js';
import { createStateOps } from '../../client/ops/state.js';
import { createWorldviewOps } from '../../client/ops/worldview.js';
import { createWorkbenchOps } from '../../client/ops/index.js';
import type { OpsPorts, OpsRuntime } from '../../client/ops/context.js';

/** Ports owned by the I176 structured editing slice. */
export type StructuredOpsPorts = Pick<OpsPorts, 'workspace' | 'knowledgeNamespace' | 'ruleStyleNamespace'>;

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
 * receive DesktopServiceBag ports here, so C5, review, and queue cannot make a
 * remote call before their owning migration cards are complete.
 */
export function createDesktopStructuredOps(runtime: OpsRuntime, ports: StructuredOpsPorts): WorkbenchOps {
  const unavailable = createWorkbenchOps(runtime, EMPTY_PORTS);
  return {
    ...unavailable,
    characters: createCharactersOps(runtime, { workspace: ports.workspace }),
    worldview: createWorldviewOps(runtime, { workspace: ports.workspace }),
    outline: createOutlineOps(runtime, { workspace: ports.workspace }),
    relationship: createRelationshipOps(runtime, { workspace: ports.workspace }),
    state: createStateOps(runtime, { workspace: ports.workspace }),
    canon: createCanonOps(runtime, { workspace: ports.workspace }),
    knowledge: createKnowledgeOps(runtime, { workspace: ports.workspace, knowledgeNamespace: ports.knowledgeNamespace }),
    ruleStyle: createRuleStyleOps(runtime, { ruleStyleNamespace: ports.ruleStyleNamespace }),
  };
}
