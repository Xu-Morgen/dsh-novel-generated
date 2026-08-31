import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createCharacterService } from './character-service.js';
import { createCanonService } from './canon-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createReferenceAuditService } from './reference-audit-service.js';
import { createReferenceCorrectionService } from './reference-correction-service.js';
import { createRelationshipService } from './relationship-service.js';

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i118-reference-correction-'));
  roots.push(root);
  const projectId = 'demo';
  const characters = createCharacterService(root);
  const relationship = createRelationshipService(root);
  const knowledge = createKnowledgeService(root);
  const canon = createCanonService(root);
  for (const [id, kind] of [['mira', 'protagonist'], ['lin', 'supporting']] as const) {
    await characters.open(projectId);
    await characters.create(projectId, {
      id, version: 1, name: id, aliases: [], kind, personality: '', background: '', motivation: '', goals: [], flaws: [],
      abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
  }
  await relationship.open(projectId);
  await relationship.saveAll(projectId, [{ id: 'r-mira-lin', version: 1, from: 'mira', to: 'lin', type: 'friendship', affinity: 70, trust: 80, status: 'close', milestones: [], knownTo: ['mira'] }]);
  await knowledge.open(projectId);
  await knowledge.saveAll(projectId, [{ id: 'secret-key', version: 1, fact: '钥匙在码头。', kind: 'secret', holders: [], revealPlan: { revealTo: ['lin'], revealAt: 'dawn' }, status: 'hidden' }], [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: [] }]);
  await canon.open(projectId);

  const confirmation = createConfirmationService(root);
  const audit = createReferenceAuditService(root);
  const sourceJournal = await audit.journalFor(projectId);
  await sourceJournal.ensurePending({
    projectId, operationId: 'source-audit',
    source: { kind: 'candidate-accept', candidateId: 'source-candidate', status: 'accepted' },
    targets: [{ owner: 'c1', entityId: 'r-mira-lin', field: 'relationship', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }],
  });
  await sourceJournal.markApplied(projectId, 'source-audit');

  let output: unknown = { confidence: 'high', operations: [{ owner: 'c1', entityId: 'r-mira-lin', field: 'status', action: 'set', value: 'strained' }], rationale: '作者明确要求关系变为紧张。' };
  const llm = {
    async *stream() {
      yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      yield { type: 'finish' as const, reason: { kind: 'stop' } };
    },
  };
  const service = createReferenceCorrectionService({ llm, characters, relationship, knowledge, canon, confirmation, audit });
  return { root, projectId, characters, relationship, knowledge, canon, confirmation, audit, service, setOutput: (value: unknown) => { output = value; } };
}

const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

describe('I118 ReferenceCorrectionService', () => {
  it('模型只产候选，未确认零写；accept 经过 I11 + coordinator，审计可追溯且幂等', async () => {
    const { projectId, relationship, knowledge, audit, service } = await setup();
    const before = await relationship.read(projectId);
    const beforeKnowledge = await knowledge.read(projectId);
    const proposed = await service.propose(projectId, { recordIds: ['source-audit'], instruction: '把关系改为紧张。' }, settings);
    expect(proposed.status).toBe('pending');
    expect(proposed.candidate.preview[0]).toMatchObject({ owner: 'c1', field: 'status', before: 'close', after: 'strained' });
    expect(await relationship.read(projectId)).toEqual(before);
    expect(await service.pending(projectId)).toHaveLength(1);
    expect((await audit.list(projectId)).records).toHaveLength(1);

    await expect(service.accept(projectId, proposed.proposalId)).resolves.toMatchObject({ status: 'applied', changedOwners: ['c1'] });
    expect((await relationship.read(projectId))[0]).toMatchObject({ version: 2, status: 'strained' });
    expect(await knowledge.read(projectId)).toEqual(beforeKnowledge);
    const records = (await audit.list(projectId)).records;
    expect(records).toHaveLength(2);
    expect(records.find((record) => record.operationId === proposed.proposalId)?.source).toEqual({ kind: 'reference-correction', proposalId: proposed.proposalId, status: 'accepted' });
    await expect(service.accept(projectId, proposed.proposalId)).resolves.toMatchObject({ status: 'already-applied', changedOwners: [] });
    expect((await audit.list(projectId)).records).toHaveLength(2);
  });

  it('reject、模型失败、未知目标与 stale base 都不写叙事层', async () => {
    const context = await setup();
    const { projectId, relationship, service, setOutput } = context;
    const before = await relationship.read(projectId);
    setOutput({ confidence: 'high', operations: [{ owner: 'c1', entityId: 'r-mira-lin', field: 'status', action: 'set', value: 'distant' }], rationale: '另一个候选。' });
    const rejected = await service.propose(projectId, { recordIds: ['source-audit'], instruction: '把关系改为疏远。' }, settings);
    await expect(service.reject(projectId, rejected.proposalId)).resolves.toMatchObject({ status: 'rejected' });
    expect(await relationship.read(projectId)).toEqual(before);
    expect(await service.pending(projectId)).toHaveLength(0);

    setOutput({ confidence: 'high', operations: [{ owner: 'c1', entityId: 'unknown-rel', field: 'status', action: 'set', value: 'broken' }], rationale: '非法目标。' });
    await expect(service.propose(projectId, { recordIds: ['source-audit'], instruction: '修正不存在的关系。' }, settings)).rejects.toThrow(/unmarked/);
    expect(await service.pending(projectId)).toHaveLength(0);

    setOutput({ confidence: 'high', operations: [{ owner: 'c1', entityId: 'r-mira-lin', field: 'status', action: 'set', value: 'new-status' }], rationale: 'stale 候选。' });
    const stale = await service.propose(projectId, { recordIds: ['source-audit'], instruction: '改变关系状态。' }, settings);
    await relationship.saveAll(projectId, [{ ...before[0], version: 2, status: 'outside-change' }]);
    await expect(service.accept(projectId, stale.proposalId)).rejects.toThrow(/stale c1|version must advance/i);
    expect((await relationship.read(projectId))[0].status).toBe('outside-change');
  });

  it('LLM 不可用/取消时在 Gate 之前失败', async () => {
    const { projectId, service, characters, relationship, knowledge, canon, confirmation, audit } = await setup();
    const unavailable = createReferenceCorrectionService({
      llm: undefined,
      characters, relationship, knowledge, canon, confirmation, audit,
    });
    await expect(unavailable.propose(projectId, { recordIds: ['source-audit'], instruction: '失败测试。' }, settings)).rejects.toThrow(/unavailable|LLM/i);
    expect(await service.pending(projectId)).toHaveLength(0);

    const controller = new AbortController();
    controller.abort();
    await expect(service.propose(projectId, { recordIds: ['source-audit'], instruction: '取消测试。' }, settings, controller.signal)).rejects.toThrow(/cancelled/i);
    expect(await service.pending(projectId)).toHaveLength(0);
  });
});
