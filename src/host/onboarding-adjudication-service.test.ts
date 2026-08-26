import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCharacterService } from './character-service.js';
import { createWorldviewService } from './worldview-service.js';
import { createOutlineService } from './outline-service.js';
import { createRelationshipService } from './relationship-service.js';
import { createStateService } from './state-service.js';
import { createCanonService } from './canon-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOnboardingAnalyzerService } from './onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService, type OnboardingLayerSource } from './onboarding-adjudication-service.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import type { OnboardingAnalysisOutput } from '../core/schema/onboarding.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-service-i53-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const sourceHash = 'a'.repeat(64);
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

function output(): OnboardingAnalysisOutput {
  return {
    evidence: { e1: { sourceChunkIndex: 0, quote: '北港位于内海西岸。' } },
    layers: {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      outline: { candidates: [{ id: 'outline', structure: 'free', logline: '一个测绘师的故事。', themes: [], acts: [{ id: 'act-1', index: 0, title: '开端', goal: '抵达北港', beats: [{ id: 'beat-1', title: '抵达北港', description: '米拉抵达北港开始测绘', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'db-1', title: '测绘', summary: '米拉测绘海岸线', pov: 'mira', wordTarget: 100, points: [], status: 'planned' }] }] }], foreshadowing: [], endings: [] }], confidence: 'low', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [{ id: 'initial-state', storyTime: '清晨', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'medium', warnings: [], evidenceIds: ['e1'] },
      canon: { candidates: [{ id: 'evt-1', storyTime: '清晨', kind: 'event', summary: '米拉抵达北港', detail: '', participants: ['mira'], location: '北港', consequences: [], affectedLayers: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    },
  };
}

/** Deterministic backend: full analysis then a single-layer regenerate return. */
function backend() {
  let calls = 0;
  return { async *stream() {
    const value = calls++ === 0 ? output() : output().layers.characters;
    yield { type: 'text-delta', text: JSON.stringify(value) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } };
}

/** Backend whose regenerate pass returns a *changed* characters layer. */
function changedCharactersBackend() {
  let calls = 0;
  return { async *stream() {
    const value = calls++ === 0 ? output() : (() => {
      const characters = structuredClone(output().layers.characters);
      characters.candidates[0].personality = '果敢';
      return characters;
    })();
    yield { type: 'text-delta', text: JSON.stringify(value) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } };
}

async function fixture(backendValue?: unknown) {
  const rootPath = await temporaryRoot();
  const characters = createCharacterService(rootPath);
  const worldview = createWorldviewService(rootPath);
  const outline = createOutlineService(rootPath);
  const relationship = createRelationshipService(rootPath);
  const state = createStateService(rootPath);
  const canon = createCanonService(rootPath);
  const confirmation = createConfirmationService(rootPath);
  const analyzer = createOnboardingAnalyzerService(backendValue ?? backend());
  const layerSource: OnboardingLayerSource = {
    getResult: (id) => analyzer.getResult(id),
    async regenerate(id, layer, settings) {
      const result = await analyzer.regenerate(id, layer, settings);
      return { layers: result.layers };
    },
  };
  const adjudication = createOnboardingAdjudicationService({
    characters, worldview, outline, relationship, state, canon, confirmation,
  }, layerSource);
  const open = async (projectId: string) => {
    await characters.open(projectId);
    await worldview.open(projectId);
    await outline.open(projectId);
    await relationship.open(projectId);
    await state.open(projectId, INITIAL_STATE);
    await canon.open(projectId);
    await confirmation.open(projectId);
  };
  const start = async (projectId: string) => {
    await open(projectId);
    const result = await analyzer.start({ projectId, sourceHash, text: '北港位于内海西岸。米拉是一名测绘师。' }, settings);
    return result.onboardingSessionId;
  };
  return { rootPath, adjudication, characters, worldview, outline, relationship, state, canon, confirmation, analyzer, open, start };
}

describe('I53 onboarding adjudication + idempotent landing', () => {
  it('accept + apply lands B3/B2/B5/C2/C4 and marks canon correctly', async () => {
    const { start, adjudication, characters, worldview, outline, state, canon } = await fixture();
    const sessionId = await start('demo');

    // I56/R12-3: the empty-candidate layer (relationship) cannot be accepted —
    // 空候选阻止裁决; it must be explicitly skipped or regenerated.
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });

    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.pendingLayers).toEqual([]);
    expect(result.appliedLayers.sort()).toEqual(['canon', 'characters', 'outline', 'state', 'worldview'].sort());
    expect(result.skippedLayers).toEqual(['relationship']);
    expect(result.blockedLayers).toEqual([]);
    expect(result.retryable).toBe(false);

    expect((await characters.list('demo')).map((c) => c.id)).toEqual(['mira']);
    expect((await worldview.list('demo')).map((w) => w.id)).toEqual(['north-harbor']);
    expect((await outline.read('demo')).logline).toBe('一个测绘师的故事。');
    expect(state.current('demo').storyTime).toBe('清晨');
    expect(canon.query('demo').map((e) => e.id)).toEqual(['evt-1']);
  });

  it('marks a skipped layer and does not apply it', async () => {
    const { start, adjudication, characters } = await fixture();
    const sessionId = await start('demo');

    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'skip' });
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'worldview', decision: 'accept' });
    for (const layer of ['outline', 'relationship', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'skip' });
    }

    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.skippedLayers).toContain('characters');
    expect((await characters.list('demo'))).toEqual([]);
  });

  it('blocks dependent layers when a B5 reference dangles onto a skipped B3', async () => {
    const { start, adjudication, outline } = await fixture();
    const sessionId = await start('demo');

    // Skip B3 (characters), so B5.charactersInvolved refs 'mira' dangles.
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'skip' });
    for (const layer of ['worldview', 'outline', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });

    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.blockedLayers).toContain('outline');
    // Independent layers still apply.
    expect(result.appliedLayers).toContain('worldview');
    expect(result.retryable).toBe(true);
    await expect(outline.read('demo')).rejects.toThrow();
  });

  it('is idempotent: re-applying after success continues only unfinished layers', async () => {
    const { start, adjudication, characters } = await fixture();
    const sessionId = await start('demo');
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });
    const first = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(first.appliedLayers).toHaveLength(5);
    expect(first.blockedLayers).toEqual([]);

    const second = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    // Already-applied layers are skipped on retry; no duplicate, no error.
    expect(second.blockedLayers).toEqual([]);
    expect((await characters.list('demo')).map((c) => c.id)).toEqual(['mira']);
  });

  it('treats an undecided layer as pending and performs no writes', async () => {
    const { start, adjudication, characters } = await fixture();
    const sessionId = await start('demo');
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'accept' });
    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.pendingLayers).toContain('worldview');
    expect(result.appliedLayers).toEqual([]);
    expect(await characters.list('demo')).toEqual([]);
  });

  it('rejects binding mismatch on adjudicate and final apply', async () => {
    const { start, adjudication } = await fixture();
    const sessionId = await start('demo');
    await expect(adjudication.adjudicate({ projectId: 'other', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'accept' })).rejects.toThrow(/binding mismatch/);
    await expect(adjudication.finalApply({ projectId: 'other', onboardingSessionId: sessionId, sourceHash })).rejects.toThrow(/binding mismatch/);
  });
});

describe('I56 six-layer adjudication correctness (R12-3)', () => {
  it('edit submits the exact user value and never falls back to the original candidate', async () => {
    const { start, adjudication, characters, confirmation } = await fixture();
    const sessionId = await start('demo');
    // Original analyzer candidate has personality 谨慎; the user edits it to 大胆.
    const editedLayer = {
      candidates: [{ ...output().layers.characters.candidates[0], personality: '大胆' }],
      confidence: 'high', warnings: [], evidenceIds: ['e1'],
    };
    const record = await adjudication.adjudicate({
      projectId: 'demo', onboardingSessionId: sessionId, sourceHash,
      layer: 'characters', decision: 'edit', editedValue: editedLayer,
    });
    expect(record.status).toBe('accepted');
    // Host 精确收到用户值：提案 payload 即用户提交的整层候选。
    const payload = confirmation.get('demo', record.id).payload as { value?: unknown };
    expect(payload.value).toEqual(editedLayer);
    for (const layer of ['worldview', 'outline', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });
    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.blockedLayers).toEqual([]);
    const mira = (await characters.list('demo')).find((c) => c.id === 'mira');
    expect(mira?.personality).toBe('大胆');
    // 其他已接受层仍保持分析器原候选（编辑只影响本层）。
    for (const other of adjudication.acceptedLayers(sessionId).filter((a) => a.layer !== 'characters')) {
      expect(other.candidates).toEqual(output().layers[other.layer].candidates);
    }
  });

  it('rejects edit without editedValue (no silent fallback to the original)', async () => {
    const { start, adjudication } = await fixture();
    const sessionId = await start('demo');
    await expect(adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit' }))
      .rejects.toThrow(/editedValue/);
  });

  it('rejects edit with an empty candidate value (空候选阻止裁决)', async () => {
    const { start, adjudication } = await fixture();
    const sessionId = await start('demo');
    const emptyLayer = { candidates: [], confidence: 'high' as const, warnings: [], evidenceIds: [] };
    await expect(adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit', editedValue: emptyLayer }))
      .rejects.toThrow(/无候选/);
  });

  it('rejects accept on an empty-candidate layer (空候选阻止裁决)', async () => {
    const { start, adjudication } = await fixture();
    const sessionId = await start('demo');
    // Fixture relationship layer has zero candidates.
    await expect(adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'accept' }))
      .rejects.toThrow(/无候选/);
  });

  it('enforces the B3 forced-empty contract on edited proposals (§14.7.3)', async () => {
    const { start, adjudication } = await fixture();
    const sessionId = await start('demo');
    const edited = structuredClone(output().layers.characters);
    edited.candidates[0].relationships = ['mira-laozhou-search'];
    await expect(adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit', editedValue: edited }))
      .rejects.toThrow(/relationships\/knowledgeIds\/arc\.keyBeats/);
  });

  it('regenerate rejects the pending prior, forwards feedback, and keeps the other five layers unchanged', async () => {
    const { start, adjudication, confirmation, analyzer } = await fixture(changedCharactersBackend());
    const sessionId = await start('demo');
    const original = await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'accept' });
    const before = structuredClone(analyzer.getResult(sessionId)!.layers);

    const successor = await adjudication.adjudicate({
      projectId: 'demo', onboardingSessionId: sessionId, sourceHash,
      layer: 'characters', decision: 'regenerate', feedback: '角色性格与动机不符',
    }, settings);
    expect(successor.status).toBe('pending');
    // 旧提案先 reject（regenerate 前为 accepted 记录不 reject，但后继 lineage 仍指向它）。
    const payload = confirmation.get('demo', successor.id).payload as { replacesId?: string; mode?: string; feedback?: string; value?: unknown };
    expect(payload.replacesId).toBe(original.id);
    expect(payload.mode).toBe('regenerated');
    expect(payload.feedback).toBe('角色性格与动机不符');
    // 新值来自重生成（personality 果敢），不是旧候选。
    const after = analyzer.getResult(sessionId)!.layers;
    expect(after.characters.candidates[0].personality).toBe('果敢');
    for (const other of ['worldview', 'outline', 'relationship', 'state', 'canon'] as const) {
      expect(after[other]).toEqual(before[other]);
    }
    // 重生成后的 pending 后继阻止 apply。
    for (const layer of ['worldview', 'outline', 'state', 'canon'] as const) {
      await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });
    const result = await adjudication.finalApply({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash });
    expect(result.pendingLayers).toContain('characters');
    expect(result.appliedLayers).toEqual([]);
  });

  it('edit after regenerate rejects the pending prior and carries replacesId lineage', async () => {
    const { start, adjudication, confirmation } = await fixture(changedCharactersBackend());
    const sessionId = await start('demo');
    await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'accept' });
    const regenerated = await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'regenerate', feedback: '补充动机' }, settings);
    expect(regenerated.status).toBe('pending');

    const edited = {
      candidates: [{ ...output().layers.characters.candidates[0], motivation: '用户补充的动机' }],
      confidence: 'high', warnings: [], evidenceIds: ['e1'],
    };
    const successor = await adjudication.adjudicate({ projectId: 'demo', onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit', editedValue: edited });
    // 旧 pending 提案先被 reject。
    expect(confirmation.get('demo', regenerated.id).status).toBe('rejected');
    const payload = confirmation.get('demo', successor.id).payload as { replacesId?: string; mode?: string; value?: unknown };
    expect(payload.replacesId).toBe(regenerated.id);
    expect(payload.mode).toBe('edited');
    expect(payload.value).toEqual(edited);
    expect(successor.status).toBe('accepted');
  });
});
