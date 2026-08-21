import assert from 'node:assert/strict';
import { createKnowledgeLeakDetectionService } from '../lib/host/knowledge-leak-detection-service.js';
import { parseKnowledgeLeakDetectorOutput } from '../lib/llm/validate/knowledge.js';

const seen = [];
const detector = createKnowledgeLeakDetectionService({
  async *stream(request) {
    seen.push(request);
    yield { type: 'text-delta', index: 0, text: JSON.stringify({
      violations: [{
        kind: 'knowledge-leak', severity: 'hard',
        message: '米拉得知了仅林舟持有的北港暗门秘密。', references: ['secret-gate'],
      }],
    }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
});
const result = await detector.detectKnowledgeLeak({
  prose: '米拉知道北港暗门只能在退潮时开启。', pov: 'mira',
  entries: [{ id: 'secret-gate', version: 1, fact: '北港暗门只能在退潮时开启。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' }],
  states: [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: ['secret-gate'] }],
}, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

assert.equal(result.adjudication.status, 'reject');
assert.equal(result.violations[0].kind, 'knowledge-leak');
assert.equal(seen.length, 1);
assert.match(seen[0].messages[0].content[0].text, /POV 已知事实/);
assert.throws(() => parseKnowledgeLeakDetectorOutput('not-json'));
console.log('I22 smoke passed: Host LLM C3 POV leak findings fail closed into I20 reject');
