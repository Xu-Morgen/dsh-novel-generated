import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildFiveLayerWriters, type FiveLayerWritebackDeps } from './five-layer-writeback.js';
import { createStateService } from './state-service.js';
import { createRelationshipService } from './relationship-service.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createCanonService } from './canon-service.js';
import { createWorldviewService } from './worldview-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import type { C2StateParserOutput } from '../llm/parse/state.js';
import type { C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import type { C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import type { C4CanonParserOutput } from '../llm/parse/canon.js';
import type { B2WorldviewParserOutput } from '../llm/parse/worldview.js';

/**
 * I79 共享五层写回器消费者夹具（架构审查 §5.2/§5.4/§9 #4；重构纪律 §16-2 行为等价）。
 *
 * `buildFiveLayerWriters` 是 writing-adjudication（I63 accept 落地）与 text-edit
 * （I61 reparseAccept）共用的唯一五层写回实现；本测试按下游消费方式直接驱动它：
 * - 正向：C2→C1→C3→C4→B2 五层各自落盘到既有 Domain Service，B2 恒经 I11 Gate
 *   propose+accept 再改写（旧条目 rewritten/supersededBy 指向新条目）。
 * - 负向：低置信 C2/C1/C3/C4 与 C4 supersede 一律 fail-closed（抛错零写）。
 * - 语义差异：`skipEmptyB2Proposal` 为 true 时空 B2 ops 跳过 Gate（I61 行为）；
 *   缺省 false 时保持 I30 saga 恒提案（I63 行为，空提案亦入账）。
 */
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup(): Promise<{ deps: FiveLayerWritebackDeps; projectId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i79-writeback-'));
  roots.push(root);
  const projectId = 'demo';
  const state = createStateService(root);
  const relationship = createRelationshipService(root);
  const knowledge = createKnowledgeService(root);
  const canon = createCanonService(root);
  const worldview = createWorldviewService(root);
  const confirmation = createConfirmationService(root);
  await state.open(projectId, INITIAL_STATE);
  await relationship.open(projectId);
  await knowledge.open(projectId);
  await knowledge.saveAll(projectId, [
    { id: 'secret-1', version: 1, fact: '铜钥匙藏在码头。', kind: 'secret', holders: [], revealPlan: { revealTo: ['mira'], revealAt: 'dawn' }, status: 'hidden' },
  ], [{ characterId: 'mira', knows: [] }]);
  await canon.open(projectId);
  await worldview.open(projectId);
  await worldview.create(projectId, {
    id: 'w-1', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'],
    triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
  });
  await confirmation.open(projectId);
  return { deps: { state, relationship, knowledge, canon, worldview, confirmation }, projectId };
}

describe('I79 共享五层写回器（five-layer-writeback）', () => {
  it('C2→C1→C3→C4→B2 依次落盘既有 Domain Service；B2 恒经 I11 Gate 再改写', async () => {
    const { deps, projectId } = await setup();
    const writers = buildFiveLayerWriters(deps, projectId, 'w-dispatch');

    const c2: C2StateParserOutput = { ops: [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] };
    const c1: C1RelationshipParserOutput = {
      ops: [{ op: 'create', relationship: { id: 'r-1', from: 'mira', to: 'lin', type: 'friendship', affinity: 30, trust: 50, status: 'active', milestones: [], knownTo: [] }, confidence: 'high' }],
    };
    const c3: C3KnowledgeParserOutput = { ops: [{ op: 'advance', targetId: 'secret-1', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high' }] };
    const c4: C4CanonParserOutput = {
      ops: [{ op: 'append', event: { id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: '米拉在码头找到铜钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }],
    };
    const b2: B2WorldviewParserOutput = {
      ops: [{ op: 'supersede', targetId: 'w-1', replacement: { id: 'w-2', kind: 'geography', title: '新北港', content: '北港已经扩建。', keywords: ['新北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }, confidence: 'high' }],
    };

    await writers.c2(c2);
    await writers.c1(c1);
    await writers.c3(c3);
    await writers.c4(c4);
    await writers.b2(b2);

    expect(deps.state.current(projectId).storyTime).toBe('dawn');
    const relationships = await deps.relationship.read(projectId);
    expect(relationships.some((r) => r.id === 'r-1' && r.trust === 50)).toBe(true);
    const document = await deps.knowledge.read(projectId);
    expect(document.entries[0].status).toBe('partially-revealed');
    expect(document.entries[0].holders).toEqual(['mira']);
    expect(document.states[0].knows).toEqual(['secret-1']);
    expect(deps.canon.query(projectId).map((entry) => entry.id)).toEqual(['evt-1']);

    const gate = deps.confirmation.get(projectId, 'w-dispatch-b2');
    expect(gate.kind).toBe('b2-worldview-parser-supersedes');
    expect(gate.status).toBe('accepted');
    const world = await deps.worldview.list(projectId);
    expect(world.find((entry) => entry.id === 'w-1')).toMatchObject({ status: 'rewritten', supersededBy: 'w-2' });
    expect(world.find((entry) => entry.id === 'w-2')).toMatchObject({ status: 'active', supersededBy: null });
  });

  it('低置信 C2/C1/C3/C4 与 C4 supersede fail-closed：抛错且各层零写', async () => {
    const { deps, projectId } = await setup();
    const writers = buildFiveLayerWriters(deps, projectId, 'w-failclosed');

    await expect(writers.c2({ ops: [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'low' }] }))
      .rejects.toThrow(/Low-confidence C2 operations require ConfirmationGate/);
    await expect(writers.c1({
      ops: [{ op: 'create', relationship: { id: 'r-1', from: 'mira', to: 'lin', type: 'friendship', affinity: 30, trust: 50, status: 'active', milestones: [], knownTo: [] }, confidence: 'low' }],
    })).rejects.toThrow(/Low-confidence C1 operations require ConfirmationGate/);
    await expect(writers.c3({ ops: [{ op: 'advance', targetId: 'secret-1', addHolders: ['mira'], status: 'revealed', confidence: 'low' }] }))
      .rejects.toThrow(/Low-confidence C3 operations require ConfirmationGate/);
    await expect(writers.c4({
      ops: [{ op: 'append', event: { id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: 's', detail: 'd', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: [] }, confidence: 'low' }],
    })).rejects.toThrow(/Low-confidence or supersede C4 operations require ConfirmationGate/);
    // 高置信 supersede 也必须被拒（C4 只允许 append）。
    await expect(writers.c4({
      ops: [{ op: 'supersede', targetId: 'evt-1', correction: { id: 'evt-2', storyTime: 'dawn', summary: '修正', detail: '修正细节', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: [] }, confidence: 'high' }],
    })).rejects.toThrow(/supersede/);

    // 零写：无 Gate 记录、无状态/正史变更。
    expect(deps.state.current(projectId).storyTime).toBe('');
    expect(deps.canon.query(projectId)).toHaveLength(0);
    expect(() => deps.confirmation.get(projectId, 'w-failclosed-b2')).toThrow(/Unknown confirmation/);
  });

  it('skipEmptyB2Proposal=true 时空 B2 ops 跳过 Gate（I61 语义）；缺省 false 保持恒提案（I63 语义）', async () => {
    const { deps, projectId } = await setup();
    const empty: B2WorldviewParserOutput = { ops: [] };

    const skipping = buildFiveLayerWriters(deps, projectId, 'w-empty-skip', { skipEmptyB2Proposal: true });
    await skipping.b2(empty);
    expect(() => deps.confirmation.get(projectId, 'w-empty-skip-b2')).toThrow(/Unknown confirmation/);

    const always = buildFiveLayerWriters(deps, projectId, 'w-empty-propose');
    await always.b2(empty);
    const gate = deps.confirmation.get(projectId, 'w-empty-propose-b2');
    expect(gate.status).toBe('accepted');
    expect(gate.payload).toEqual({ ops: [] });
  });
});
