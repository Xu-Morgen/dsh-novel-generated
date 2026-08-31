import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filterKnowledge } from '../core/knowledge/filter.js';
import { hashText, isCandidateStale, assertCandidateFresh, parseWritingCandidate } from '../core/candidate/index.js';
import { TextRepository } from '../core/text/index.js';
import { createStateService } from './state-service.js';
import { createCanonService } from './canon-service.js';
import { createWritingCandidateService, type NovelWritingCandidateService, type WritingCandidateRequest } from './candidate-service.js';
import { GenerationError } from '../llm/port/index.js';
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import type { DetailBeat } from '../core/schema/outline.js';

const roots: string[] = [];
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const ORIGINAL = '源正文内容';
const SCENE_ID = 'scene-1';
const CHAPTER_ID = 'chapter-1';

const stateFixture = {
  id: 'state-1', version: 1, seq: 0, storyTime: 'night',
  scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' },
  characters: [],
};
const navigation = { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross harbor.', deviationIds: [] };
const card: DetailBeat = { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: ['notice key'], status: 'writing' };

function sources(): StoryGenerationSources {
  return {
    context: {
      macros: { user: 'Author', pov: 'mira' },
      sources: {
        rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }],
        style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] },
        characters: [], worldview: [],
        relationships: { relationships: [], characterIds: [] },
        state: stateFixture,
      },
    },
    navigation,
    knowledge: filterKnowledge('mira', [], [{ characterId: 'mira', knows: [] }]),
    canon: [],
    history: { recentScenes: [], historicalSummaries: [] },
  };
}

/** fake backend 消费者夹具：记录每次 prompt；默认返回一段正文（可覆盖）。 */
function fakeLlm(seen: string[], text?: string): unknown {
  return {
    async *stream(request: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      if (text === undefined) throw new Error('backend exploded');
      yield { type: 'text-delta', text };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

/** 项目目录全文件快照（相对路径 + 内容哈希）：任何层写入都会改变快照。 */
async function snapshot(root: string): Promise<string> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk(root);
  const parts: string[] = [];
  for (const file of files.sort()) {
    const content = await readFile(file, 'utf8');
    parts.push(`${relative(root, file)}\u0000${createHash('sha256').update(content, 'utf8').digest('hex')}`);
  }
  return parts.join('\n');
}

/** 建立 C5（rewrite 目标场景）+ C2 + C4 的项目（projectsRoot 下 demo 作品），返回项目目录。 */
async function openProject(projectsRoot: string, llm: unknown = fakeLlm([], '米拉推开了门。')): Promise<{ text: TextRepository; service: NovelWritingCandidateService }> {
  const root = join(projectsRoot, 'demo');
  const text = new TextRepository(root);
  await text.open();
  await text.createChapter({ id: CHAPTER_ID, index: 1, title: '第一章', pov: 'mira', status: 'draft' });
  await text.appendScene(CHAPTER_ID, { id: SCENE_ID, content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });
  const state = createStateService(projectsRoot);
  await state.open('demo', stateFixture);
  const canon = createCanonService(projectsRoot);
  await canon.open('demo');
  await canon.append('demo', { id: 'event-1', storyTime: 'night', kind: 'event', summary: 'Mira arrives.', location: 'harbor', detail: 'Mira steps ashore.', participants: ['mira'], consequences: [], affectedLayers: ['c2'] });
  const service = createWritingCandidateService({ llm, projectsRoot });
  await service.open('demo');
  return { text, service };
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I62 unified writing candidate command contract', () => {
  it('produces valid candidates for all four intents without writing any layer', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i62-'));
    roots.push(projectsRoot);
    const root = join(projectsRoot, 'demo');
    const seen: string[] = [];
    const service = createWritingCandidateService({ llm: fakeLlm(seen, '米拉推开了门。'), projectsRoot });
    await service.open('demo');
    const text = new TextRepository(root);
    await text.open();
    await text.createChapter({ id: CHAPTER_ID, index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await text.appendScene(CHAPTER_ID, { id: SCENE_ID, content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });

    const before = await snapshot(root);
    const requests: WritingCandidateRequest[] = [
      { id: 'cand-generate', intent: 'generate', target: { projectId: 'demo' }, sources: sources(), settings },
      { id: 'cand-continue', intent: 'continue', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: 'scene-next' }, sources: sources(), card, navigation, settings },
      { id: 'cand-scene-card', intent: 'scene-card', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: 'scene-next' }, card, navigation, settings },
      { id: 'cand-rewrite', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText(ORIGINAL) }, prompt: '把这一段改得更有悬念。', settings },
    ];
    const results = [];
    for (const request of requests) results.push(await service.propose(request));

    for (const { candidate } of results) {
      expect(parseWritingCandidate(candidate)).toEqual(candidate);
      expect(candidate.text).toBe('米拉推开了门。');
      expect(candidate.chunkCount).toBeGreaterThan(0);
      expect(candidate.id).toMatch(/^cand-/);
    }
    // intent adapter 复用既有 prompt builder（I44/I43），不复制文案。
    expect(seen[0]).toContain('The seal holds.'); // I19 上下文已进入 generate prompt
    expect(seen[1]).toContain('你是长篇小说续写 agent');
    expect(seen[2]).toContain('你是长篇小说章节写作器');
    expect(seen[3]).toBe('把这一段改得更有悬念。');
    expect(await snapshot(root)).toBe(before);
  });

  it('I123 三种 polishMode 共用 rewrite pipeline，并由 preset 区分生成意图', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i123-'));
    roots.push(projectsRoot);
    const seen: string[] = [];
    const { service } = await openProject(projectsRoot, fakeLlm(seen, '润色后的正文。'));
    for (const [index, mode] of (['language', 'condense', 'expand'] as const).entries()) {
      const result = await service.propose({
        id: `cand-polish-${mode}`,
        intent: 'rewrite',
        target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText(ORIGINAL) },
        prompt: '保持故事事实不变。', polishMode: mode, settings,
      });
      expect(result.candidate.text).toBe('润色后的正文。');
      expect(seen[index]).toContain(`[polishMode:${mode}]`);
    }
    expect(new Set(seen.map((prompt) => prompt.split('\n')[2])).size).toBe(3);
  });

  it('rejects misbound rewrite targets with zero writes', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i62-'));
    roots.push(projectsRoot);
    const root = join(projectsRoot, 'demo');
    const { service } = await openProject(projectsRoot);
    const before = await snapshot(root);
    const base = { intent: 'rewrite' as const, prompt: '改写。', settings };
    await expect(service.propose({ ...base, id: 'bad-hash', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText('旧正文') } })).rejects.toThrow(/脏文本保护/);
    await expect(service.propose({ ...base, id: 'bad-scene', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: 'ghost', sourceHash: hashText('x') } })).rejects.toThrow(/Unknown scene/);
    await expect(service.propose({ ...base, id: 'bad-chapter', target: { projectId: 'demo', chapterId: 'ghost', sceneId: SCENE_ID, sourceHash: hashText('x') } })).rejects.toThrow(/Unknown chapter/);
    await expect(service.propose({ ...base, id: 'no-source-hash', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID } })).rejects.toThrow(/requires sourceHash/);
    await expect(service.propose({ ...base, id: 'bad-project', target: { projectId: '../escape', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText(ORIGINAL) } })).rejects.toThrow(/Invalid/);
    expect(await snapshot(root)).toBe(before);
  });

  it('propagates model failure without writing', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i62-'));
    roots.push(projectsRoot);
    const root = join(projectsRoot, 'demo');
    const { service } = await openProject(projectsRoot, fakeLlm([], undefined));
    const before = await snapshot(root);
    await expect(service.propose({ id: 'fail', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText(ORIGINAL) }, prompt: '改写。', settings }))
      .rejects.toBeInstanceOf(GenerationError);
    expect(await snapshot(root)).toBe(before);
  });

  it('propagates cancellation without writing', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'novel-i62-')), 'demo');
    roots.push(root);
    const controller = new AbortController();
    const aborting = {
      async *stream(): AsyncGenerator<{ type: string; text?: string; reason?: { kind: string } }> {
        yield { type: 'text-delta', text: '前半' };
        controller.abort();
        yield { type: 'text-delta', text: '后半' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    };
    const service = createWritingCandidateService({ llm: aborting, projectsRoot: root });
    await service.open('demo');
    await expect(service.propose({ id: 'cancel', intent: 'generate', target: { projectId: 'demo' }, sources: sources(), settings, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'cancelled' });
  });

  it('rejects empty generated text without writing', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'novel-i62-')), 'demo');
    roots.push(root);
    const service = createWritingCandidateService({ llm: fakeLlm([], ''), projectsRoot: root });
    await service.open('demo');
    const before = await snapshot(root);
    await expect(service.propose({ id: 'empty', intent: 'generate', target: { projectId: 'demo' }, sources: sources(), settings }))
      .rejects.toThrow(/non-empty/);
    expect(await snapshot(root)).toBe(before);
  });

  it('declares the candidate stale once the bound source scene changes (consumer fixture)', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i62-'));
    roots.push(projectsRoot);
    const root = join(projectsRoot, 'demo');
    const { text, service } = await openProject(projectsRoot);
    const { candidate } = await service.propose({ id: 'cand-stale', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER_ID, sceneId: SCENE_ID, sourceHash: hashText(ORIGINAL) }, prompt: '改写。', settings });
    expect(isCandidateStale(candidate, ORIGINAL)).toBe(false);
    expect(() => assertCandidateFresh(candidate, ORIGINAL)).not.toThrow();
    // 消费者（I63）落地前正文被修改 → 候选过期，拒绝落地。
    await text.replaceRange(CHAPTER_ID, SCENE_ID, { start: 0, end: 2 }, '改写');
    expect(isCandidateStale(candidate, '改写正文内容')).toBe(true);
    expect(() => assertCandidateFresh(candidate, '改写正文内容')).toThrow(/stale/);
  });
});
