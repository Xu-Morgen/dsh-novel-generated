import {
  editableFields,
  outlineReconciliationDiffSchema,
  suggestionOf,
  type OutlineReconciliationDiff,
} from '../schema/outline-reconciliation.js';
import type { DetailBeat } from '../schema/outline.js';

/** Build the stable five-field B5 diff without changing either detail beat. */
export function buildOutlineReconciliationDiff(before: DetailBeat, after: DetailBeat): OutlineReconciliationDiff {
  const beforeProjection = suggestionOf(before);
  const afterProjection = suggestionOf(after);
  return outlineReconciliationDiffSchema.parse({
    changedFields: editableFields.filter((field) => JSON.stringify(beforeProjection[field]) !== JSON.stringify(afterProjection[field])),
    before: beforeProjection,
    after: afterProjection,
  });
}

export { outlineReconciliationDiffSchema } from '../schema/outline-reconciliation.js';
