import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';

import { apply } from '../lib/index.js';
import { analyzeOnboardingText } from '../lib/llm/analyze/onboarding.js';

const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i52-projects-'));
const configRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i52-config-'));
const baseUrl = new URL(`${configRoot.replace(/\\/g, '/')}/`).href;
const configPath = join(configRoot, 'cordis.yml');
const root = new Context();

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const sourceHash = 'a'.repeat(64);
const output = {
  evidence: { e1: { sourceChunkIndex: 0, quote: '北港位于内海西岸。' } },
  layers: {
    characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    worldview: { candidates: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    outline: { candidates: [{ id: 'outline', structure: 'free', logline: '故事。', themes: [], acts: [], foreshadowing: [], endings: [] }], confidence: 'low', warnings: [], evidenceIds: [] },
    relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    state: { candidates: [{ id: 'initial-state', storyTime: '', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'medium', warnings: [], evidenceIds: ['e1'] },
    canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  },
};

async function run() {
  root.baseUrl = baseUrl;
  await root.plugin(Loader, { baseUrl });
  await root.plugin(Include, {
    path: pathToFileURL(configPath).href,
    initial: [{ id: 'novel-creation-tool', name: new URL('../lib/index.js', import.meta.url).href, config: { projectsRoot } }],
    enableLogs: false,
  });
  await root.loader.await();

  // Composition smoke: the I52 Host service must be provided after boot.
  const analyzer = root.get('novelOnboardingAnalyzer', false);
  assert.ok(analyzer, 'novelOnboardingAnalyzer service missing after boot');

  // Direct analyzer smoke: reduced six-layer candidate package via fake backend.
  const fake = { async *stream() { yield JSON.stringify(output); } };
  const result = await analyzeOnboardingText(fake, {
    projectId: 'demo',
    onboardingSessionId: 'sess-smoke',
    sourceHash,
    chunks: [{ index: 0, text: '北港位于内海西岸。米拉是一名测绘师。', startOffset: 0, endOffset: 20 }],
  }, settings);
  assert.equal(result.projectId, 'demo');
  assert.equal(result.onboardingSessionId, 'sess-smoke');
  assert.equal(result.layers.characters.candidates.length, 1, 'expected one character candidate');
  assert.equal(result.layers.worldview.candidates.length, 1, 'expected one worldview candidate');
  assert.deepEqual(Object.keys(result.layers), ['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']);

  // Unavailable backend fails closed before any write.
  await assert.rejects(() => analyzeOnboardingText(undefined, { projectId: 'demo', onboardingSessionId: 's', sourceHash, chunks: [{ index: 0, text: '正文', startOffset: 0, endOffset: 2 }] }, settings), /unavailable/);

  // Fiber dispose removes the Host service.
  await root.fiber.dispose();
  if (root.get('novelOnboardingAnalyzer', false) !== undefined) throw new Error('novelOnboardingAnalyzer survived Fiber dispose');
  console.log('I52 composition smoke: six-layer analysis service + reduced package + fail-closed + dispose passed');
}

try {
  await run();
} finally {
  try { await root.fiber.dispose(); } catch {}
  try { await rm(configRoot, { recursive: true, force: true }); } catch {}
  try { await rm(projectsRoot, { recursive: true, force: true }); } catch {}
}
