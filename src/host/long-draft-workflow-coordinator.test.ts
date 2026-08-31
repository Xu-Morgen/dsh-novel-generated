import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach, vi } from 'vitest';
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
    confirmation,
    projectsRoot: root,
    llm,
  });
  return { root, project, characters, worldview, outline: outlineService, relationship, state, canon, text, confirmation, llm, coordinator, streamCalls: () => streamCalls, setResponse: (value: unknown) => { response = value; } };
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
      confirmation: context.confirmation,
      projectsRoot: context.root,
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

  it('I120 proposes through I11, applies only after the author action, and is idempotent after reopen', async () => {
    const context = await setup();
    const candidate = await context.coordinator.propose('empty', input, settings);
    const proposal = await context.coordinator.proposeApply('empty', candidate);
    expect(proposal).toMatchObject({ projectId: 'empty', proposalId: candidate.candidateId, status: 'pending' });
    await expect(context.outline.readiness('empty')).resolves.toBe('uninitialized');
    expect(context.confirmation.pending('empty').map((record) => record.id)).toEqual([candidate.candidateId]);

    await expect(context.coordinator.accept('empty', proposal.proposalId, 'b'.repeat(64))).rejects.toThrow(/sourceHash changed|stale/i);
    await expect(context.outline.readiness('empty')).resolves.toBe('uninitialized');
    const applied = await context.coordinator.accept('empty', proposal.proposalId);
    expect(applied.status).toBe('applied');
    await expect(context.outline.readiness('empty')).resolves.toBe('ready');
    await expect(context.text.listChapters('empty')).resolves.toEqual([]);
    await expect(context.coordinator.accept('empty', proposal.proposalId)).resolves.toMatchObject({ status: 'already-applied' });

    const reopened = createLongDraftWorkflowCoordinator({
      project: context.project,
      characters: context.characters,
      worldview: context.worldview,
      outline: context.outline,
      relationship: context.relationship,
      state: context.state,
      canon: context.canon,
      text: context.text,
      confirmation: context.confirmation,
      projectsRoot: context.root,
      llm: context.llm,
    });
    await expect(reopened.recover('empty')).resolves.toMatchObject({ items: [{ proposalId: proposal.proposalId, status: 'applied', candidate: { candidateId: candidate.candidateId } }] });
    await expect(reopened.accept('empty', proposal.proposalId)).resolves.toMatchObject({ status: 'already-applied' });
  });

  it('blocks non-empty projects before creating a Gate proposal and rejects without narrative writes', async () => {
    const context = await setup();
    const candidate = await context.coordinator.propose('empty', input, settings);
    await context.project.openProject('empty');
    await context.characters.create('empty', {
      id: 'mira', version: 1, name: '米拉', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await expect(context.coordinator.proposeApply('empty', candidate)).rejects.toThrow(/empty project/);
    expect(context.confirmation.list('empty')).toEqual([]);
    await expect(context.outline.readiness('empty')).resolves.toBe('uninitialized');

    const clean = await setup();
    const cleanCandidate = await clean.coordinator.propose('empty', input, settings);
    const cleanProposal = await clean.coordinator.proposeApply('empty', cleanCandidate);
    const rejected = await clean.coordinator.reject('empty', cleanProposal.proposalId);
    expect(rejected).toMatchObject({ status: 'rejected', checkpoint: { status: 'rejected' } });
    await expect(clean.outline.readiness('empty')).resolves.toBe('uninitialized');
    await expect(clean.coordinator.recover('empty')).resolves.toMatchObject({ items: [{ status: 'rejected' }] });
  });

  it('records a failed checkpoint and leaves B5 uninitialized when the atomic outline write fails', async () => {
    const context = await setup();
    const candidate = await context.coordinator.propose('empty', input, settings);
    const proposal = await context.coordinator.proposeApply('empty', candidate);
    const save = vi.spyOn(context.outline, 'save').mockRejectedValueOnce(new Error('injected outline disk failure'));
    await expect(context.coordinator.accept('empty', proposal.proposalId)).rejects.toThrow(/disk failure/);
    save.mockRestore();
    await expect(context.outline.readiness('empty')).resolves.toBe('uninitialized');
    await expect(context.coordinator.recover('empty')).resolves.toMatchObject({ items: [{ proposalId: proposal.proposalId, status: 'failed', error: 'injected outline disk failure' }] });
  });
});
