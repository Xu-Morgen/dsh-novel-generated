import { describe, expect, it } from 'vitest';
import {
  adjudicateViolations,
  createConsistencyValidator,
  detectForbiddenExpressions,
  detectStructuralSoftViolations,
} from './index.js';

const soft = { kind: 'outline-deviation', severity: 'soft', message: 'Beat was skipped.', references: ['beat-2'] };
const hard = { kind: 'canon-conflict', severity: 'hard', message: 'Canon contradicts the prose.', references: ['canon-4'] };

describe('I20 deterministic consistency adjudicator', () => {
  it('rejects when any hard violation is present, even alongside soft findings', () => {
    expect(adjudicateViolations([soft, hard])).toMatchObject({ status: 'reject', violations: [soft, hard] });
  });

  it('returns a deep-readonly decision view independent of caller-owned input', () => {
    const input = [{ ...hard, references: [...hard.references] }];
    const result = adjudicateViolations(input);
    input[0].severity = 'soft';
    input[0].references.push('caller-change');
    expect(result).toMatchObject({ status: 'reject', violations: [hard] });
    expect(Object.isFrozen(result.violations[0])).toBe(true);
    expect(Object.isFrozen(result.violations[0].references)).toBe(true);
  });

  it('warns for soft-only findings and passes an empty set', () => {
    expect(adjudicateViolations([soft]).status).toBe('warn');
    expect(adjudicateViolations([])).toEqual({ status: 'pass', violations: [] });
  });

  it('emits a structured soft violation for each literal forbidden expression', () => {
    const violations = detectForbiddenExpressions('Mira smiled, then smiled again.', ['smiled', 'vanished']);
    expect(violations).toEqual([{
      kind: 'forbidden-expression',
      severity: 'soft',
      message: 'Forbidden expression used: smiled',
      references: ['smiled'],
    }]);
    expect(adjudicateViolations(violations).status).toBe('warn');
  });

  it('fails closed for malformed violations and malformed forbidden inputs', () => {
    expect(() => adjudicateViolations([{ ...hard, severity: 'blocking' }])).toThrow();
    expect(() => adjudicateViolations([{ ...soft, extra: true }])).toThrow();
    expect(() => detectForbiddenExpressions('prose', [''])).toThrow();
  });

  it('exercises the same adjudication contract after generation and before writeback', () => {
    const validator = createConsistencyValidator();
    expect(validator.afterGeneration([hard]).status).toBe('reject');
    expect(validator.beforeWriteback([soft]).status).toBe('warn');
    expect(validator.afterGeneration([]).status).toBe('pass');
    expect(validator.beforeWriteback([]).status).toBe('pass');
  });
});

describe('I23 deterministic structural soft checks', () => {
  const baseInput = {
    progress: {
      outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1',
      completedBeats: [], tensionLevel: 50,
      deviations: [{
        id: 'deviation-1', planned: 'Mira enters the harbor.', actual: 'Mira stays inland.',
        reason: 'The scene followed the emergent investigation.', reconciled: false,
      }],
    },
    entityReferences: ['mira', 'unknown-ship'],
    knownEntityIds: ['mira', 'lin'],
  };

  it('emits one soft warning for each unresolved deviation and dangling entity reference', () => {
    const violations = detectStructuralSoftViolations(baseInput);
    expect(violations).toEqual([
      {
        kind: 'unresolved-outline-deviation', severity: 'soft',
        message: 'Outline deviation remains unresolved: deviation-1', references: ['deviation-1'],
      },
      {
        kind: 'dangling-entity-reference', severity: 'soft',
        message: 'Entity reference does not resolve: unknown-ship', references: ['unknown-ship'],
      },
    ]);
    expect(adjudicateViolations(violations).status).toBe('warn');
  });

  it('does not warn for reconciled deviations or legal entity references', () => {
    const violations = detectStructuralSoftViolations({
      ...baseInput,
      progress: { ...baseInput.progress, deviations: [{ ...baseInput.progress.deviations[0], reconciled: true }] },
      entityReferences: ['mira', 'lin'],
    });
    expect(violations).toEqual([]);
    expect(adjudicateViolations(violations).status).toBe('pass');
  });

  it('deduplicates repeated dangling references while preserving a frozen result array', () => {
    const violations = detectStructuralSoftViolations({ ...baseInput, entityReferences: ['unknown-ship', 'unknown-ship'] });
    expect(violations).toHaveLength(2);
    expect(Object.isFrozen(violations)).toBe(true);
  });

  it('fails closed for malformed progress or entity-reference inputs', () => {
    expect(() => detectStructuralSoftViolations({ ...baseInput, progress: { ...baseInput.progress, extra: true } })).toThrow();
    expect(() => detectStructuralSoftViolations({ ...baseInput, entityReferences: [''] })).toThrow();
    expect(() => detectStructuralSoftViolations({ ...baseInput, knownEntityIds: 'mira' })).toThrow();
  });
});
