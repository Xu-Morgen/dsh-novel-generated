import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCharacterService } from '../lib/host/character-service.js';
import { createWorldviewService } from '../lib/host/worldview-service.js';
import { createOutlineService } from '../lib/host/outline-service.js';
import { createRelationshipService } from '../lib/host/relationship-service.js';
import { createStateService } from '../lib/host/state-service.js';
import { createCanonService } from '../lib/host/canon-service.js';
import { createConfirmationService } from '../lib/host/confirmation-service.js';
import { createOnboardingAnalyzerService } from '../lib/host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService } from '../lib/host/onboarding-adjudication-service.js';
import { INITIAL_STATE } from '../lib/core/schema/project-lifecycle.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i53-'));
const projectId = 'smoke';
const sourceHash = 'a'.repeat(64);
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const output = {
  evidence: { e1: { sourceChunkIndex: 0, quote: '米拉抵达北港。' } },
  layers: {
    characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    state: { candidates: [{ id: 'initial-state', storyTime: '清晨', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    canon: { candidates: [{ id: 'arrival', storyTime: '清晨', kind: 'event', summary: '米拉抵达北港', detail: '', participants: ['mira'], location: '北港', consequences: [], affectedLayers: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
  },
};

try {
  const characters = createCharacterService(root);
  const worldview = createWorldviewService(root);
  const outline = createOutlineService(root);
  const relationship = createRelationshipService(root);
  const state = createStateService(root);
  const canon = createCanonService(root);
  const confirmation = createConfirmationService(root);
  await Promise.all([characters.open(projectId), worldview.open(projectId), outline.open(projectId), relationship.open(projectId), state.open(projectId, INITIAL_STATE), canon.open(projectId), confirmation.open(projectId)]);
  const backend = { async *stream() { yield { type: 'text-delta', text: JSON.stringify(output) }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const analyzer = createOnboardingAnalyzerService(backend);
  const adjudication = createOnboardingAdjudicationService({ characters, worldview, outline, relationship, state, canon, confirmation }, {
    getResult: (id) => analyzer.getResult(id),
    async regenerate(id, layer, input) { const result = await analyzer.regenerate(id, layer, input); return { layers: result.layers }; },
  });
  const analysis = await analyzer.start({ projectId, sourceHash, text: '米拉抵达北港。' }, settings);
  for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon', 'relationship']) {
    const decision = layer === 'characters' || layer === 'state' || layer === 'canon' ? 'accept' : 'skip';
    await adjudication.adjudicate({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash, layer, decision });
  }
  const first = await adjudication.finalApply({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash });
  assert.deepEqual(first.pendingLayers, []);
  assert.deepEqual(first.blockedLayers, []);
  assert.equal((await characters.list(projectId)).length, 1);
  assert.equal(canon.query(projectId).length, 1);
  const snapshotsAfterFirstApply = state.snapshots(projectId).length;
  const retry = await adjudication.finalApply({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash });
  assert.deepEqual(retry.blockedLayers, []);
  assert.equal(state.snapshots(projectId).length, snapshotsAfterFirstApply, 'equal retry must not append a state snapshot');
  console.log('I53 smoke: adjudicate, fixed-order apply, and idempotent retry passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
