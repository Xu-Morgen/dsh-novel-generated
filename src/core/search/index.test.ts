import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CanonEventView } from '../canon/index.js';
import type { CharacterCore } from '../schema/characters.js';
import type { KnowledgeDocument } from '../schema/knowledge.js';
import type { Outline } from '../schema/outline.js';
import type { Chapter } from '../schema/text.js';
import type { WorldEntry } from '../schema/worldview.js';
import {
  SEARCH_INDEX_DIRECTORY,
  SEARCH_PREVIEW_LENGTH,
  SearchIndexRepository,
  buildSearchEntries,
  indexCounts,
  referenceEntries,
  searchEntries,
  type SearchIndexSources,
} from './index.js';

/**
 * I71 可重建全局搜索投影 —— 确定性模块回归（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 验收覆盖：
 * - 六层（正文/角色/世界观/大纲/正史/知情）关键词检索命中且排序确定；
 * - 实体精确引用（mentions 交叉引用）稳定；
 * - POV/secret 负测：`knows` 过滤后未授权 POV 看不到 C3 条目，作者全知面可检索；
 * - 删除索引可重建：drop → load undefined → build → 检索结果与首建一致；
 * - 结果 preview 有界、不含完整条目。
 */

const chapters: Chapter[] = [
  {
    id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft',
    scenes: [
      { id: 'scene-1', index: 0, content: '米拉推开旧灯塔的门。门后是半张烧焦的海图。', summary: '进入灯塔', beats: ['beat-1'], canonEvents: [], notes: '', branches: [] },
      { id: 'scene-2', index: 1, content: '守夜人递给米拉一枚铜钥匙，指向北港的方向。', summary: '守夜人', beats: ['beat-1'], canonEvents: [], notes: '', branches: [] },
    ],
  },
];

const characters: CharacterCore[] = [
  {
    id: 'mira', version: 1, name: '米拉', aliases: ['灯塔少女'], kind: 'protagonist',
    personality: '坚韧', background: '北港渔家女，独自守塔。', motivation: '找回失踪的父亲',
    goals: ['解开海图谜团'], flaws: ['固执'], abilities: ['夜视'], speechStyle: '简短',
    staticTraits: ['守诺'], arc: { startingPoint: '封闭', desiredEnd: '释然', keyBeats: ['beat-1'] },
    relationships: [], knowledgeIds: [],
  },
];

const worldview: WorldEntry[] = [
  {
    id: 'north-harbor', version: 1, kind: 'geography', title: '北港', content: '北港位于内海西岸，以灯塔与海图闻名。',
    keywords: ['北港', '内海'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
  },
  {
    id: 'old-lighthouse', version: 1, kind: 'geography', title: '旧灯塔', content: '废弃灯塔，守夜人长居于此。',
    keywords: ['旧灯塔'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'rewritten', supersededBy: 'lighthouse-new',
  },
];

const outline: Outline = {
  id: 'outline-demo', version: 1, structure: 'three-act', logline: '渔家女米拉追寻失踪父亲的海图之谜。',
  themes: ['成长', '记忆'],
  acts: [{
    id: 'act-1', index: 0, title: '开端', goal: '建立旧灯塔场景',
    beats: [{
      id: 'beat-1', title: '午夜灯塔', description: '米拉夜访旧灯塔。', charactersInvolved: ['mira'],
      conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira', wordTarget: 500, points: ['海图指向北港'], status: 'planned' }],
    }],
  }],
  foreshadowing: [{ id: 'fore-1', hint: '铜钥匙', payoff: '铜钥匙开启北港密室。', status: 'planted', knownBy: ['mira'] }],
  endings: [{ id: 'ending-1', title: '释然结局', conditions: ['父亲下落查明'], description: '米拉放下执念。' }],
};

const canon: CanonEventView[] = [
  {
    id: 'event-1', seq: 0, storyTime: '第一夜', kind: 'event', summary: '米拉进入旧灯塔', detail: '发现烧焦海图',
    participants: ['mira'], location: '旧灯塔', consequences: [], affectedLayers: ['c5'], immutable: true, supersededBy: null,
  },
];

const knowledge: KnowledgeDocument = {
  entries: [
    { id: 'know-1', version: 1, fact: '北港海底沉睡着旧城。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第三幕' }, status: 'hidden' },
    { id: 'know-2', version: 1, fact: '守夜人其实是米拉的父亲。', kind: 'secret', holders: [], revealPlan: { revealTo: ['mira'], revealAt: '第二幕' }, status: 'hidden' },
  ],
  states: [
    { characterId: 'mira', knows: ['know-1'] },
  ],
};

function sources(): SearchIndexSources {
  return {
    text: chapters,
    characters,
    worldview,
    outline,
    canon,
    knowledge: {
      entries: [...knowledge.entries],
      states: [...knowledge.states],
    },
  };
}

const tempRoots: string[] = [];
async function tempProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i71-search-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('I71 core search projection', () => {
  it('indexes all six layers deterministically and reports per-layer counts', () => {
    const entries = buildSearchEntries(sources());
    const counts = indexCounts(entries);
    expect(counts.text).toBe(2);
    expect(counts.characters).toBe(1);
    expect(counts.worldview).toBe(1); // rewritten 条目不入当前真相检索
    expect(counts.outline).toBe(6); // 梗概 + 幕 + 节 + 场景卡 + 伏笔 + 结局
    expect(counts.canon).toBe(1);
    expect(counts.knowledge).toBe(2);
    // 确定性：同输入同输出（逐字节相同）。
    expect(buildSearchEntries(sources())).toEqual(entries);
  });

  it('keyword search hits text, characters, worldview, outline, canon and knowledge', () => {
    const entries = buildSearchEntries(sources());
    const textHits = searchEntries(entries, '海图');
    expect(textHits.total).toBeGreaterThanOrEqual(1);
    expect(textHits.hits.some((hit) => hit.layer === 'text' && hit.id === 'scene-1')).toBe(true);
    expect(textHits.hits.some((hit) => hit.layer === 'outline' && hit.id === 'detail:detail-1')).toBe(true);
    expect(textHits.hits.every((hit) => hit.preview.length <= SEARCH_PREVIEW_LENGTH + 1)).toBe(true);
    expect(searchEntries(entries, '守夜人').hits.some((hit) => hit.layer === 'knowledge')).toBe(true);
    expect(searchEntries(entries, '北港').hits.some((hit) => hit.layer === 'worldview')).toBe(true);
    expect(searchEntries(entries, '旧城').hits.some((hit) => hit.layer === 'knowledge' && hit.id === 'know-1')).toBe(true);
    expect(searchEntries(entries, '烧焦海图').hits.some((hit) => hit.layer === 'canon')).toBe(true);
    expect(searchEntries(entries, '不存在词')).toEqual({ total: 0, hits: [] });
  });

  it('ranks title matches above content matches deterministically', () => {
    const entries = buildSearchEntries(sources());
    const hits = searchEntries(entries, '旧灯塔').hits;
    const top = hits[0];
    expect(top.matched).toBe('title');
    expect(top.score).toBeGreaterThanOrEqual(3);
    expect(top.id).toBe('scene-1'); // 同分时层序 + id 稳定
    // 确定性：同输入同输出。
    expect(searchEntries(entries, '旧灯塔').hits).toEqual(hits);
    // 内容命中（score 1）排在同分标题命中之后。
    const scores = hits.map((hit) => hit.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it('exact entity references resolve across layers and stay stable', () => {
    const entries = buildSearchEntries(sources());
    const byName = referenceEntries(entries, '米拉').hits;
    expect(byName.some((hit) => hit.layer === 'characters' && hit.id === 'mira')).toBe(true);
    expect(byName.some((hit) => hit.layer === 'text' && hit.id === 'scene-1')).toBe(true);
    expect(byName.some((hit) => hit.layer === 'canon')).toBe(true);
    const byId = referenceEntries(entries, 'mira').hits;
    expect(byId.some((hit) => hit.layer === 'characters')).toBe(true);
    expect(byId.some((hit) => hit.layer === 'outline' && hit.id === 'beat:beat-1')).toBe(true);
    // 别名也参与交叉引用。
    expect(referenceEntries(entries, '灯塔少女').hits.some((hit) => hit.layer === 'characters')).toBe(true);
    // 稳定：同键同结果。
    expect(referenceEntries(entries, '米拉')).toEqual(referenceEntries(entries, '米拉'));
  });

  it('POV/secret negative: knows filter hides unauthorized C3 knowledge, author view sees all', () => {
    const entries = buildSearchEntries(sources());
    const knows = new Set(['know-1']);
    const filtered = searchEntries(entries, '守夜人其实是', { knows });
    expect(filtered.hits.some((hit) => hit.layer === 'knowledge' && hit.id === 'know-2')).toBe(false);
    const authorView = searchEntries(entries, '守夜人其实是');
    expect(authorView.hits.some((hit) => hit.layer === 'knowledge' && hit.id === 'know-2')).toBe(true);
    // 授权 POV 仍可见 know-1（且引用同理过滤）。
    const visible = searchEntries(entries, '旧城', { knows });
    expect(visible.hits.some((hit) => hit.layer === 'knowledge' && hit.id === 'know-1')).toBe(true);
    const refs = referenceEntries(entries, 'know-2', { knows });
    expect(refs.hits.some((hit) => hit.layer === 'knowledge')).toBe(false);
  });

  it('reports the true total beyond the default hit cap (大规模可观测)', () => {
    const many = new Array(80).fill(undefined).map((_, index) => ({
      layer: 'text' as const, id: `scene-${index}`, title: `场景 ${index}`,
      searchText: `米拉在北港码头整理海图。${index}`, preview: 'x', nav: { kind: 'text' as const, chapterId: 'chapter-1', sceneId: `scene-${index}` }, mentions: [],
    }));
    const result = searchEntries(many, '北港码头');
    expect(result.total).toBe(80);
    expect(result.hits.length).toBe(50);
  });

  it('index can be dropped and rebuilt with identical search results', async () => {
    const root = await tempProject();
    const repository = new SearchIndexRepository(root);
    expect(await repository.load()).toBeUndefined();
    const first = await repository.build(sources(), 'demo');
    expect(first.entries.length).toBeGreaterThan(0);
    const firstHits = searchEntries(first.entries, '海图');

    const dropped = await repository.drop();
    expect(dropped).toBe(true);
    expect(await repository.load()).toBeUndefined();
    // 删除只影响派生文件，不影响 source-of-truth（目录仍在）。
    const rebuilt = await repository.build(sources(), 'demo');
    expect(searchEntries(rebuilt.entries, '海图')).toEqual(firstHits);
    // 再删一次（无索引时返回 false 幂等）。
    expect(await repository.drop()).toBe(true);
    expect(await repository.drop()).toBe(false);
    // 派生目录名固定（导出 LAYER_PATHS 白名单外，不进入可移植档案）。
    expect(SEARCH_INDEX_DIRECTORY).toBe('.search');
  });

  it('rejects invalid index versions on load', async () => {
    const root = await tempProject();
    const repository = new SearchIndexRepository(root);
    await repository.build(sources(), 'demo');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(root, SEARCH_INDEX_DIRECTORY, 'index.json'), '{"version":999,"projectId":"demo","builtAt":"x","entries":[]}\n', 'utf8');
    await expect(repository.load()).rejects.toThrow(/rebuild it/);
  });
});
