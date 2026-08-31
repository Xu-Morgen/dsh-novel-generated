import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import { createCharacterService } from './character-service.js';
import { createCanonService } from './canon-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createLongDraftWorkflowCoordinator } from './long-draft-workflow-coordinator.js';
import { createOutlineService } from './outline-service.js';
import { createProjectService } from './project-service.js';
import { createRelationshipService } from './relationship-service.js';
import { createStateService } from './state-service.js';
import { createTextService } from './text-service.js';
import { createWorldviewService } from './worldview-service.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import type { LongDraftOutlineValue } from '../core/schema/long-draft.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function outline(): LongDraftOutlineValue {
  return { id: 'outline-main', structure: 'free', logline: '测绘师追查北港秘密。', themes: [], acts: [], foreshadowing: [], endings: [] };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i119-long-draft-'));
  roots.push(root);
  const characters = createCharacterService(root);
  const worldview = createWorldviewService(root);
  const outlineService = createOutlineService(root);
  const relationship = createRelationshipService(root);
  const state = createStateService(root);
  const canon = createCanonService(root);
  const confirmation = createConfirmationService(root);
  const knowledge = createKnowledgeService(root);
  const text = createTextService(root);
  const project = createProjectService(root, { characters, worldview, outline: outlineService, relationship, state, canon, confirmation });
  await project.createProject({ projectId: 'empty', name: '空作品' });
  let response: unknown = { confidence: 'high', sourceChunkIndices: [0], outline: outline(), rationale: '仅整理 B5。' };
  let streamCalls = 0;
  const llm = {
    async *stream() {
      streamCalls += 1;
      yield { type: 'text-delta' as const, text: JSON.stringify(response) };
      yield { type: 'finish' as const, reason: { kind: 'stop' } };
    },
  };
  const coordinator = createLongDraftWorkflowCoordinator({
    project,
    characters,
    worldview,
    outline: outlineService,
    relationship,
    state,
    canon,
    text,
    llm,
  });
  return { root, project, characters, worldview, outline: outlineService, relationship, state, canon, text, coordinator, streamCalls: () => streamCalls, setResponse: (value: unknown) => { response = value; } };
}

const input = { sourceHash: 'a'.repeat(64), text: '第一段长稿。\n\n第二段长稿。' };
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

describe('I119 LongDraftWorkflowCoordinator', () => {
  it('empty preflight precedes LLM, preserves ordered provenance, and repeated input binds the same candidate', async () => {
    const { coordinator, streamCalls } = await setup();
    await expect(coordinator.preflight('empty')).resolves.toMatchObject({ status: 'ready', blockers: [], layers: { outline: 'empty', text: 'empty' } });
    expect(streamCalls()).toBe(0);
    const first = await coordinator.propose('empty', input, settings);
    const second = await coordinator.propose('empty', input, settings);
    expect(first).toEqual(second);
    expect(first.provenance).toMatchObject({ sourceHash: input.sourceHash, chunkSize: 4000, chunkCount: 1, chunkIndices: [0] });
    expect(first.outline.id).toBe('outline-main');
    expect(streamCalls()).toBe(2);
  });

  it('non-empty project is blocked before the first LLM call and does not apply a candidate', async () => {
    const { project, characters, coordinator, streamCalls } = await setup();
    await project.openProject('empty');
    await characters.create('empty', {
      id: 'mira', version: 1, name: '米拉', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await expect(coordinator.preflight('empty')).resolves.toMatchObject({ status: 'blocked', reason: 'non-empty-project', blockers: ['characters'] });
    await expect(coordinator.propose('empty', input, settings)).rejects.toThrow(/empty project/);
    expect(streamCalls()).toBe(0);
  });

  it('oversize, illegal model output, cancellation, and unavailable LLM fail closed', async () => {
    const context = await setup();
    const { coordinator, setResponse, streamCalls } = context;
    await expect(coordinator.propose('empty', { ...input, text: 'x'.repeat(2 * 1024 * 1024 + 1) }, settings)).rejects.toThrow(/Too big|2 MiB|exceeds/i);
    setResponse({ candidates: [] });
    await expect(coordinator.propose('empty', input, settings)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(coordinator.propose('empty', input, settings, controller.signal)).rejects.toThrow(/cancelled/i);
    expect(streamCalls()).toBe(1);

    const unavailable = createLongDraftWorkflowCoordinator({
      project: context.project,
      characters: context.characters,
      worldview: context.worldview,
      outline: context.outline,
      relationship: context.relationship,
      state: context.state,
      canon: context.canon,
      text: context.text,
      llm: undefined,
    });
    await expect(unavailable.propose('empty', input, settings)).rejects.toThrow(/unavailable|LLM/i);
  });

  it('begin/status/cancel/result expose lifecycle without auto-accepting outline', async () => {
    const { coordinator } = await setup();
    const begun = coordinator.begin('empty', input, settings);
    const waitFor = async (workflowId: string, expected: 'succeeded' | 'cancelled') => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (coordinator.status(workflowId).status === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      throw new Error(`workflow did not reach ${expected}`);
    };
    await waitFor(begun.workflowId, 'succeeded');
    expect(coordinator.result(begun.workflowId).candidate.outline).toEqual(outline());

    const cancelled = coordinator.begin('empty', input, settings);
    await coordinator.cancel(cancelled.workflowId);
    await waitFor(cancelled.workflowId, 'cancelled');
    expect(() => coordinator.result(cancelled.workflowId)).toThrow(/cancelled|complete/);
  });

  it('initial state remains the canonical empty C2 bootstrap', async () => {
    const { project, coordinator } = await setup();
    await project.openProject('empty');
    expect((await coordinator.preflight('empty')).layers.state).toBe('empty');
    expect(INITIAL_STATE.characters).toHaveLength(0);
  });
});
