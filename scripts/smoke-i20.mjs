import assert from 'node:assert/strict';
import {
  createConsistencyValidator,
  detectForbiddenExpressions,
} from '../lib/core/validate/index.js';

const validator = createConsistencyValidator();
const forbidden = detectForbiddenExpressions('The fog swallowed the harbor.', ['swallowed', 'sparkled']);
assert.equal(forbidden.length, 1);
assert.equal(forbidden[0].kind, 'forbidden-expression');
assert.equal(validator.afterGeneration(forbidden).status, 'warn');
assert.equal(validator.beforeWriteback([{ kind: 'canon-conflict', severity: 'hard', message: 'Canon mismatch.', references: ['canon-1'] }]).status, 'reject');
assert.equal(validator.afterGeneration([]).status, 'pass');
assert.throws(() => validator.beforeWriteback([{ kind: 'bad', severity: 'fatal', message: 'invalid', references: [] }]));
console.log('I20 smoke passed: structured violations adjudicated at both gates');
