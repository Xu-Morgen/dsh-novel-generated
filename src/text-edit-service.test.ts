import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTextEditService } from './host/text-edit-service.js';
import { TextRepository } from './core/text/index.js';
import { createStateService } from './host/state-service.js';
import { createRelationshipService } from './host/relationship-service.js';
import { createKnowledgeService } from './host/knowledge-service.js';
import { createCanonService } from './host/canon-service.js';
import { createWorldviewService } from './host/worldview-service.js';
import { createConfirmationService } from './host/confirmation-service.js';
import { ConfirmationGate } from './core/confirm/index.js';

/**
 * I61 C5 正文编辑与可选 reparse 的 Host service 验收（design §5.12 / §14.9 / R13-2）：
 * - 用户文本 exact round-trip；范围外（未变前后缀与其他场景）哈希不变；
 * - baseHash 脏文本保护：陈旧草稿拒绝、零写；
 * - 非法范围零写；
 * - 未选 reparse（text-only edit）时 B2/C1/C2/C3/C4 不变；
 * - propose 不解析、不写层；拒绝后零写；accept 先经 I11 再走既有 parser fan-out
 *   （I25–I29 parser 函数 + 既有 Domain Service writers），最后写 C5。
 *
 * 通过真实 temp projects root + 真实 Domain Services + fake ctx.llm 建立端到端
 * 数据，断言写回结果（消费者夹具，AGENTS §2）。
 */

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i61-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

/** fake `ctx.llm`：按 prompt 关键字路由五个 parser 输出；`seen` 记录每次调用。 */
function fakeLlm(seen: string[], full = false) {
  return {
    async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      const output = prompt.includes('你是小说世界状态解析器') ? { ops: full ? [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] : [] }
        : prompt.includes('你是小说关系解析器') ? { ops: full ? [{ op: 'create', relationship: { id: 'mira-lin', from: 'mira', to: 'lin', type: 'friendship', affinity: 10, trust: 20, status: 'new allies', milestones: [], knownTo: ['mira', 'lin'] }, confidence: 'high' }] : [] }
        : prompt.includes('你是小说知情解析器') ? { ops: full ? [{ op: 'advance', targetId: 'secret-1', addHolders: ['lin'], status: 'partially-revealed', confidence: 'high' }] : [] }
        : prompt.includes('你是小说正史解析器') ? { ops: full ? [{ op: 'append', event: { id: 'evt-key', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: '米拉在码头找到铜钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] : [] }
        : prompt.includes('你是小说世界观改写解析器') ? { ops: full ? [{ op: 'supersede', targetId: 'harbor-status', replacement: { id: 'harbor-key-route', kind: 'geography', title: '钥匙航路港', content: '码头已发现通向钥匙航路的线索。', keywords: ['码头', '钥匙'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }, confidence: 'high' }] : [] }
        : (() => { throw new Error(`Unexpected prompt: ${prompt.slice(0, 60)}`); })();
      yield { type: 'text-delta', text: JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

const ORIGINAL = 'prefix TARGET suffix';
const RANGE = { start: 7, end: 13 };

interface BookSetup {
  repository: TextRepository;
  state: ReturnType<typeof createStateService>;
  relationship: ReturnType<typeof createRelationshipService>;
  knowledge: ReturnType<typeof createKnowledgeService>;
  canon: ReturnType<typeof createCanonService>;
  worldview: ReturnType<typeof createWorldviewService>;
  confirmation: ReturnType<typeof createConfirmationService>;
}

async function setup(projectsRoot: string): Promise<BookSetup> {
  const repository = new TextRepository(join(projectsRoot, 'book'));
  await repository.open();
  await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
  await repository.appendScene('chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: ['beat-1'], canonEvents: [], notes: '' });
  await repository.appendScene('chapter-1', { id: 'scene-2', content: '另一段正文', summary: '分别', beats: [], canonEvents: [], notes: '' });

  const state = createStateService(projectsRoot);
  await state.open('book', { id: 'state-1', version: 1, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] });
  const relationship = createRelationshipService(projectsRoot);
  await relationship.open('book');
  await relationship.saveAll('book', []);
  const knowledge = createKnowledgeService(projectsRoot);
  await knowledge.open('book');
  await knowledge.saveAll('book',
    [{ id: 'secret-1', version: 1, fact: '钥匙藏在码头。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'dawn' }, status: 'hidden' }],
    [{ characterId: 'mira', knows: ['secret-1'] }, { characterId: 'lin', knows: [] }],
  );
  const canon = createCanonService(projectsRoot);
  await canon.open('book');
  const worldview = createWorldviewService(projectsRoot);
  await worldview.open('book');
  await worldview.create('book', { id: 'harbor-status', kind: 'geography', title: '旧港', content: '港口没有航路线索。', keywords: ['港口'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null });
  const confirmation = createConfirmationService(projectsRoot);
  await confirmation.open('book');
  return { repository, state, relationship, knowledge, canon, worldview, confirmation };
}

function serviceFor(root: string, layers: BookSetup, seen: string[], full = false) {
  return createTextEditService({
    llm: fakeLlm(seen, full), projectsRoot: root,
    state: layers.state, relationship: layers.relationship, knowledge: layers.knowledge,
    canon: layers.canon, worldview: layers.worldview, confirmation: layers.confirmation,
    resolveSettings: async () => settings,
  });
}

function serviceForLlm(root: string, layers: BookSetup, llm: unknown) {
  return createTextEditService({
    llm, projectsRoot: root,
    state: layers.state, relationship: layers.relationship, knowledge: layers.knowledge,
    canon: layers.canon, worldview: layers.worldview, confirmation: layers.confirmation,
    resolveSettings: async () => settings,
  });
}

const baseHashOf = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

class FailOnceTextRepository extends TextRepository {
  private failNextReplace = true;

  override async replaceRange(...args: Parameters<TextRepository['replaceRange']>): ReturnType<TextRepository['replaceRange']> {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('fixture C5 landing failure');
    }
    return super.replaceRange(...args);
  }
}

describe('I61 C5 正文编辑与可选 reparse（Host service）', () => {
  it('edit：用户文本 exact round-trip，范围外（未变前后缀与其他场景）哈希不变，结构层零写', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen);
    await service.open('book');
    const beforeScene2 = baseHashOf('另一段正文');
    const result = await service.edit('book', 'chapter-1', 'scene-1', RANGE, 'replacement', baseHashOf(ORIGINAL));
    expect(result.scene.content).toBe('prefix replacement suffix');
    expect(result.evidence.before).toBe(baseHashOf(ORIGINAL));
    expect(result.evidence.after).toBe(baseHashOf('prefix replacement suffix'));
    expect(result.evidence.unchangedPrefix).toBe('prefix ');
    expect(result.evidence.unchangedSuffix).toBe(' suffix');
    // 范围外文本逐字不变：其他场景内容哈希不变；未选 reparse 时结构层零写、零 LLM。
    const chapter = await layers.repository.readChapter('chapter-1');
    expect(chapter.scenes[1].content).toBe('另一段正文');
    expect(baseHashOf(chapter.scenes[1].content)).toBe(beforeScene2);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('edit：baseHash 不匹配（脏文本保护）与非法范围一律拒绝、零写', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen);
    await service.open('book');
    await expect(service.edit('book', 'chapter-1', 'scene-1', RANGE, 'replacement', 'stale-hash')).rejects.toThrow(/脏文本保护/);
    await expect(service.edit('book', 'chapter-1', 'scene-1', { start: 20, end: 25 }, 'replacement', baseHashOf(ORIGINAL))).rejects.toThrow(/Edit range exceeds original text|Invalid text range|exceeds scene content/);
    await expect(service.edit('book', 'chapter-1', 'scene-1', { start: 13, end: 7 }, 'replacement', baseHashOf(ORIGINAL))).rejects.toThrow(/Invalid text range|Range end must not precede start/);
    const chapter = await layers.repository.readChapter('chapter-1');
    expect(chapter.scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('reparse：propose 不解析不写层；拒绝后零写（文本与结构层都不变），再 accept 失败', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');
    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    expect(proposed.status).toBe('pending');
    expect(proposed.proposalId).toMatch(/^scene-reparse-[a-f0-9]{24}$/);
    expect(seen).toEqual([]); // propose 阶段不调用任何 parser
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);
    const rejected = await service.reparseReject('book', proposed.proposalId);
    expect(rejected.status).toBe('rejected');
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);
    // 拒绝后 accept 必须失败（Gate 已 rejected），仍零写。
    await expect(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId)).rejects.toThrow(/already rejected/);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
  });

  it('reparse accept：先经 I11 确认，再走既有 parser fan-out 并写 C5', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');
    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    const accepted = await service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId);
    expect(accepted.status).toBe('written');
    expect(accepted.layers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(accepted.scene.content).toBe('prefix parsed suffix');
    expect(seen).toHaveLength(5); // 五个 parser 各一次，无生成调用
    // 既有 Domain Service 写回生效（与 I30 生命周期同一批 writer 语义）。
    expect(layers.state.current('book').storyTime).toBe('dawn');
    expect((await layers.relationship.read('book')).map((entry) => entry.id)).toEqual(['mira-lin']);
    expect((await layers.knowledge.read('book')).entries[0]).toMatchObject({ status: 'partially-revealed', holders: ['mira', 'lin'] });
    expect(layers.canon.query('book').map((event) => event.id)).toEqual(['evt-key']);
    expect((await layers.worldview.read('book', 'harbor-status')).status).toBe('rewritten');
    expect((await layers.worldview.read('book', 'harbor-key-route')).status).toBe('active');
    // Gate 记录最终为 accepted（审计可追溯）。
    const record = (await ConfirmationGate.open(join(root, 'book'))).get(proposed.proposalId);
    expect(record.status).toBe('accepted');
  });

  it('reparse accept：未知提案 id 一律零写（不解析、不写层、不写文本）', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');
    await expect(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', 'scene-reparse-000000000000000000000000')).rejects.toThrow(/Unknown confirmation/);
    expect(seen).toEqual([]);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
  });

  it('reparse accept：accept 时 baseHash 不匹配（propose→accept 窗口内正文被改）拒绝且零写', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');
    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    expect(proposed.status).toBe('pending');
    // 模拟 propose 之后正文被其他写入者改动（并发编辑）。
    await layers.repository.replaceRange('chapter-1', 'scene-1', { start: 7, end: 13 }, 'OTHER');
    await expect(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId, baseHashOf(ORIGINAL))).rejects.toThrow(/脏文本保护/);
    expect(seen).toEqual([]); // 未解析
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe('prefix OTHER suffix');
    expect(layers.state.current('book').storyTime).toBe('night');
  });

  it('I111 reparse preview：Gate pending 时冻结五层 hash-only projection，accept 重放同一 plan 且只解析一次', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');

    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    const preview = await service.reparsePreview('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    expect(preview).toMatchObject({
      proposalId: proposed.proposalId,
      range: RANGE,
      replacement: 'parsed',
      sourceHash: baseHashOf(ORIGINAL),
      targetHash: baseHashOf('prefix parsed suffix'),
      postScan: { status: 'pending', sourceMatched: false, mismatchedLayers: [] },
    });
    expect(preview.changes.map((change) => change.layer)).toEqual(expect.arrayContaining(['c2', 'c1', 'c3', 'c4', 'b2']));
    expect(preview.changes.every((change) => change.beforeHash !== undefined || change.afterHash !== undefined)).toBe(true);
    expect(JSON.stringify(preview)).not.toMatch(/parserOutputs|service|repository/);
    expect(seen).toHaveLength(5);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);

    const repeated = await service.reparsePreview('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(ORIGINAL));
    expect(repeated).toEqual(preview);
    expect(seen).toHaveLength(5);

    const accepted = await service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId, baseHashOf(ORIGINAL));
    expect(accepted.scene.content).toBe('prefix parsed suffix');
    expect(accepted.layers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(seen).toHaveLength(5); // accept replayed the frozen parser outputs; it did not call LLM again.
    expect(layers.state.current('book').storyTime).toBe('dawn');
    expect(layers.canon.query('book').map((event) => event.id)).toEqual(['evt-key']);
    expect((await layers.worldview.read('book', 'harbor-status')).status).toBe('rewritten');
    expect((await layers.worldview.read('book', 'harbor-key-route')).status).toBe('active');
    expect(await service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId, baseHashOf('prefix parsed suffix'))).toBe(accepted);
  });

  it('I111 reparse preview negative：非法 range、脏 baseHash、Gate rejected 与 parser failure 均 zero-write', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = serviceFor(root, layers, seen, true);
    await service.open('book');

    await expect(service.reparsePropose('book', 'chapter-1', 'scene-1', { start: 0, end: ORIGINAL.length + 1 }, 'x', baseHashOf(ORIGINAL)))
      .rejects.toThrow(/Invalid UTF-16 text range/);
    await expect(service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'x', 'stale-hash'))
      .rejects.toThrow(/脏文本保护/);
    expect(layers.confirmation.pending('book')).toEqual([]);
    expect(seen).toEqual([]);

    const rejected = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'rejected', baseHashOf(ORIGINAL));
    await service.reparseReject('book', rejected.proposalId);
    await expect(service.reparsePreview('book', 'chapter-1', 'scene-1', RANGE, 'rejected', baseHashOf(ORIGINAL)))
      .rejects.toThrow(/rejected/);
    await expect(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'rejected', rejected.proposalId, baseHashOf(ORIGINAL)))
      .rejects.toThrow(/already rejected/);
    expect(seen).toEqual([]);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);

    const failingSeen: string[] = [];
    const failingLlm = {
      async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) {
        failingSeen.push(request.messages[0].content[0].text);
        throw new Error('fixture parser failure');
      },
    };
    const failingService = serviceForLlm(root, layers, failingLlm);
    await failingService.open('book');
    const failedProposal = await failingService.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'failed', baseHashOf(ORIGINAL));
    await expect(failingService.reparsePreview('book', 'chapter-1', 'scene-1', RANGE, 'failed', baseHashOf(ORIGINAL)))
      .rejects.toThrow(/fixture parser failure/);
    expect(failingSeen.length).toBeGreaterThan(0);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(layers.state.current('book').storyTime).toBe('night');
    expect(layers.canon.query('book')).toEqual([]);
    expect(layers.confirmation.get('book', failedProposal.proposalId).status).toBe('pending');
  });

  it('I111 C5 landing failure：结构层已提交时不伪报成功，重试复用同一 plan 且只补写 C5', async () => {
    const root = await temporaryRoot();
    const layers = await setup(root);
    const seen: string[] = [];
    const service = createTextEditService({
      llm: fakeLlm(seen, true), projectsRoot: root,
      state: layers.state, relationship: layers.relationship, knowledge: layers.knowledge,
      canon: layers.canon, worldview: layers.worldview, confirmation: layers.confirmation,
      resolveSettings: async () => settings,
      repositoryFactory: (directory) => new FailOnceTextRepository(directory),
    });
    await service.open('book');
    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'retry', baseHashOf(ORIGINAL));
    await service.reparsePreview('book', 'chapter-1', 'scene-1', RANGE, 'retry', baseHashOf(ORIGINAL));

    await expect(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'retry', proposed.proposalId, baseHashOf(ORIGINAL)))
      .rejects.toThrow(/C5 reparse landing failed/);
    expect(layers.confirmation.get('book', proposed.proposalId).status).toBe('accepted');
    expect(layers.state.current('book').storyTime).toBe('dawn');
    expect(layers.canon.query('book').map((event) => event.id)).toEqual(['evt-key']);
    expect((await layers.repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);

    const retried = await service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'retry', proposed.proposalId, baseHashOf(ORIGINAL));
    expect(retried.scene.content).toBe('prefix retry suffix');
    expect(seen).toHaveLength(5);
  });
});
