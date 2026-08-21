import assert from 'node:assert/strict';
import {
  adjudicateViolations,
  detectStructuralSoftViolations,
} from '../lib/core/validate/index.js';

const violations = detectStructuralSoftViolations({
  progress: {
    outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], tensionLevel: 50,
    deviations: [{
      id: 'deviation-1', planned: 'Mira enters the harbor.', actual: 'Mira stays inland.',
      reason: 'The investigation took precedence.', reconciled: false,
    }],
  },
  entityReferences: ['mira', 'unknown-ship'],
  knownEntityIds: ['mira'],
});

assert.deepEqual(violations.map((violation) => violation.kind), [
  'unresolved-outline-deviation',
  'dangling-entity-reference',
]);
assert.equal(adjudicateViolations(violations).status, 'warn');
assert.throws(() => detectStructuralSoftViolations({ progress: {}, entityReferences: [], knownEntityIds: [] }));
console.log('I23 smoke passed: deterministic outline and entity findings remain soft warnings');
