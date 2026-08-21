import assert from 'node:assert/strict';
import { createRelationshipStyleDetectionService } from '../lib/host/relationship-style-detection-service.js';
import { parseRelationshipStyleDetectorOutput } from '../lib/llm/validate/relationship-style.js';

const seen = [];
const detector = createRelationshipStyleDetectionService({
  async *stream(request) {
    seen.push(request);
    yield { type: 'text-delta', index: 0, text: JSON.stringify({
      violations: [{
        kind: 'relationship-drift', severity: 'soft',
        message: '米拉对林舟的无保留信任与既有公开敌对关系显著漂移。', references: ['mira-lin'],
      }],
    }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
});
const result = await detector.detectRelationshipAndStyle({
  prose: '米拉毫无保留地把密钥交给林舟。',
  relationships: [{ id: 'mira-lin', version: 1, from: 'mira', to: 'lin', type: 'rivalry', affinity: -60, trust: 5, status: '公开敌对', milestones: [], knownTo: ['mira', 'lin'] }],
  style: { id: 'style-main', version: 1, name: '港湾阴谋', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制紧张', proseStyle: '冷峻简洁', chapterFormat: '场景标题', dialogueConventions: '使用中文引号', forbidden: [] },
}, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });

assert.equal(result.adjudication.status, 'warn');
assert.equal(result.violations[0].severity, 'soft');
assert.equal(seen.length, 1);
assert.match(seen[0].messages[0].content[0].text, /不得输出 hard/);
assert.throws(() => parseRelationshipStyleDetectorOutput('not-json'));
console.log('I24 smoke passed: Host LLM C1/B4 semantic findings fail closed into I20 warn only');
