import assert from 'node:assert/strict';
import { createConsistencyDetectionService } from '../lib/host/consistency-detection-service.js';
import { parseRuleCanonDetectorOutput } from '../lib/llm/validate/index.js';

const seen = [];
const detector = createConsistencyDetectionService({
  async *stream(request) {
    seen.push(request);
    yield { type: 'text-delta', index: 0, text: JSON.stringify({
      violations: [{
        kind: 'canon-conflict', severity: 'hard',
        message: '正文让已死亡的林舟出现，和正史矛盾。', references: ['canon-lin-dead'],
      }],
    }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
});
const result = await detector.detectRuleAndCanon({
  prose: '林舟推开港口的门.',
  rules: [{ id: 'rule-no-magic', statement: '人类不能施放魔法。', immutable: true, active: true }],
  canon: [{ id: 'canon-lin-dead', summary: '林舟已经死亡。', detail: '葬于旧桥。' }],
}, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

assert.equal(result.adjudication.status, 'reject');
assert.equal(result.violations[0].kind, 'canon-conflict');
assert.equal(seen.length, 1);
assert.match(seen[0].messages[0].content[0].text, /不得检查知情泄漏/);
assert.throws(() => parseRuleCanonDetectorOutput('not-json'));
console.log('I21 smoke passed: Host LLM rule/canon findings fail closed into I20 reject');
