import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceEditorService } from './remote.js';
import { createTextService } from './host/text-service.js';
import { createTextEditService } from './host/text-edit-service.js';
import { TextRepository } from './core/text/index.js';
import { createStateService } from './host/state-service.js';
import { createRelationshipService } from './host/relationship-service.js';
import { createKnowledgeService } from './host/knowledge-service.js';
import { createCanonService } from './host/canon-service.js';
import { createWorldviewService } from './host/worldview-service.js';
import { createConfirmationService } from './host/confirmation-service.js';

/**
 * I61 C5 受控编辑 Remote 的消费者夹具（AGENTS §2 地基切片必配消费者夹具）：
 * 经 `createWorkspaceEditorService`（I60 同一 workspace 挂载面）按 Client 的
 * 消费方式调用 sceneEdit / sceneReparsePropose / sceneReparseAccept /
 * sceneReparseReject，断言最小 owned JSON 投影、exact round-trip、范围外哈希
 * 不变、未确认/拒绝零写、确认后既有 parser fan-out（design §5.12 / R13-2）。
 */

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i61-remote-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const ORIGINAL = 'prefix TARGET suffix';
const RANGE = { start: 7, end: 13 };
const baseHashOf = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function fakeLlm(seen: string[], full = false) {
  return {
    async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      const output = prompt.includes('你是小说世界状态解析器') ? { ops: full ? [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] : [] }
        : prompt.includes('你是小说关系解析器') ? { ops: [] }
        : prompt.includes('你是小说知情解析器') ? { ops: [] }
        : prompt.includes('你是小说正史解析器') ? { ops: [] }
        : prompt.includes('你是小说世界观改写解析器') ? { ops: [] }
        : (() => { throw new Error(`Unexpected prompt: ${prompt.slice(0, 60)}`); })();
      yield { type: 'text-delta', text: JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

async function makeService(projectsRoot: string, seen: string[], full = false) {
  const text = createTextService(projectsRoot);
  await text.open('book');
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
  const confirmation = createConfirmationService(projectsRoot);
  await confirmation.open('book');
  const textEdit = createTextEditService({
    llm: fakeLlm(seen, full), projectsRoot,
    state, relationship, knowledge, canon, worldview, confirmation,
    resolveSettings: async () => settings,
  });
  const dummy = { list: async () => [], read: async () => ({}), create: async () => ({}), update: async () => ({}) } as never;
  return createWorkspaceEditorService(dummy, dummy, dummy, dummy, state, canon, confirmation, dummy, dummy, text, textEdit);
}

describe('I61 C5 受控编辑 Remote（workspace 消费者夹具）', () => {
  it('sceneEdit：exact round-trip + 变更 diff 证据；只写 C5，结构层与 LLM 零调用', async () => {
    const root = await temporaryRoot();
    const seen: string[] = [];
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });

    const service = await makeService(root, seen);
    const result = await service.sceneEdit('book', 'chapter-1', 'scene-1', RANGE, 'replacement', baseHashOf(ORIGINAL));
    // 最小 owned JSON：只含 scene 投影 + diff 证据，无文件路径/live 对象。
    expect(result.scene.content).toBe('prefix replacement suffix');
    expect(result.evidence.before).toBe(baseHashOf(ORIGINAL));
    expect(result.evidence.after).toBe(baseHashOf('prefix replacement suffix'));
    expect(result.evidence.unchangedPrefix).toBe('prefix ');
    expect(result.evidence.unchangedSuffix).toBe(' suffix');
    expect(seen).toEqual([]);
    // 无 reparse 时结构层不变。
    const reopened = createTextService(root);
    await reopened.open('book');
    expect((await reopened.readChapter('book', 'chapter-1')).scenes[0].content).toBe('prefix replacement suffix');
  });

  it('非法范围与脏文本（baseHash 不匹配）经 Remote 拒绝，零写', async () => {
    const root = await temporaryRoot();
    const seen: string[] = [];
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });

    const service = await makeService(root, seen);
    await expect(service.sceneEdit('book', 'chapter-1', 'scene-1', RANGE, 'x', 'stale-hash')).rejects.toThrow(/脏文本保护/);
    await expect(service.sceneEdit('book', 'chapter-1', 'scene-1', { start: 30, end: 40 }, 'x', baseHashOf(ORIGINAL))).rejects.toThrow(/Edit range exceeds original text|Invalid text range|exceeds scene content/);
    await expect(service.sceneReparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'x', 'stale-hash')).rejects.toThrow(/脏文本保护/);
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(seen).toEqual([]);
  });

  it('reparse 三方法：propose→pending（不解析）；拒绝零写且再 accept 失败；确认后走既有 fan-out 并写 C5', async () => {
    const root = await temporaryRoot();
    const seen: string[] = [];
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });

    const service = await makeService(root, seen, true);
    const baseHash = baseHashOf(ORIGINAL);
    // 拒绝路径：propose→pending（不解析、不写层）→ reject 零写 → 再 accept 失败。
    const proposed = await service.sceneReparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHash);
    expect(proposed.status).toBe('pending');
    expect(proposed.proposalId).toMatch(/^scene-reparse-/);
    expect(seen).toEqual([]);
    const rejected = await service.sceneReparseReject('book', proposed.proposalId);
    expect(rejected.status).toBe('rejected');
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    await expect(service.sceneReparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId)).rejects.toThrow(/already rejected/);
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe(ORIGINAL);
    expect(seen).toEqual([]);
    // 确认路径（不同替换 → 确定性 proposalId 不同）：accept 先经 I11 再走既有 fan-out + 写 C5。
    const proposed2 = await service.sceneReparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed-v2', baseHash);
    const accepted = await service.sceneReparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed-v2', proposed2.proposalId);
    expect(accepted.status).toBe('written');
    expect(accepted.layers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(accepted.scene.content).toBe('prefix parsed-v2 suffix');
    expect(seen).toHaveLength(5);
  });
});
