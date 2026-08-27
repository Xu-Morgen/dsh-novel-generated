import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { createSearchService } from './search-service.js';
import { createTextService } from './text-service.js';
import { createCharacterService } from './character-service.js';
import { createWorldviewService } from './worldview-service.js';
import { createOutlineService } from './outline-service.js';
import { createCanonService } from './canon-service.js';
import { createKnowledgeService } from './knowledge-service.js';

/**
 * I71 全局搜索 Host facade —— 真实六层服务消费者夹具（design §14.10 / R14-6）。
 *
 * 验收覆盖：
 * - build 从 live source-of-truth 重建派生索引并返回分层统计；
 * - drop 后 stats 显示 indexExists=false，search fail closed 引导重建，重建后结果一致；
 * - 跨正文/角色/世界观/大纲/正史/知情关键词检索与实体引用；
 * - POV/secret 负测：pov 指定时 knowledge 层结果受 live C3 knows 过滤；
 * - 结果是有界投影（无完整条目、无文件路径）。
 */

const tempRoots: string[] = [];
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i71-search-service-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('I71 search Host service', () => {
  it('builds, searches, references, drops and rebuilds with POV filtering', async () => {
    const root = await tempRoot();
    await new ProjectRepository(root).createProject({ projectId: 'demo', name: '搜索演示' });

    const text = createTextService(root);
    const characters = createCharacterService(root);
    const worldview = createWorldviewService(root);
    const outline = createOutlineService(root);
    const canon = createCanonService(root);
    const knowledge = createKnowledgeService(root);
    for (const service of [text, characters, worldview, outline, canon, knowledge]) {
      await service.open('demo');
    }

    await characters.create('demo', {
      id: 'mira', name: '米拉', aliases: ['灯塔少女'], kind: 'protagonist',
      personality: '坚韧', background: '北港渔家女。', motivation: '找回父亲',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await worldview.create('demo', {
      id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。',
      keywords: ['北港', '内海'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    await outline.save('demo', {
      id: 'outline-demo', structure: 'three-act', logline: '米拉追寻失踪父亲的海图之谜。', themes: ['成长'],
      acts: [{
        id: 'act-1', index: 0, title: '开端', goal: '建立旧灯塔场景',
        beats: [{
          id: 'beat-1', title: '午夜灯塔', description: '米拉夜访旧灯塔。', charactersInvolved: ['mira'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira', wordTarget: 500, points: ['海图指向北港'], status: 'planned' }],
        }],
      }],
      foreshadowing: [], endings: [],
    });
    await canon.append('demo', {
      id: 'event-1', storyTime: '第一夜', kind: 'event', summary: '米拉进入旧灯塔', detail: '',
      participants: ['mira'], location: '旧灯塔', consequences: [], affectedLayers: ['c5'],
    });
    await knowledge.saveAll('demo', [
      { id: 'know-1', version: 1, fact: '北港海底沉睡着旧城。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第三幕' }, status: 'hidden' },
      { id: 'know-2', version: 1, fact: '守夜人其实是米拉的父亲。', kind: 'secret', holders: [], revealPlan: { revealTo: ['mira'], revealAt: '第二幕' }, status: 'hidden' },
    ], [
      { characterId: 'mira', knows: ['know-1'] },
    ]);
    await text.createChapter('demo', { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-1', {
      id: 'scene-1', content: '米拉推开旧灯塔的门，看见半张烧焦的海图。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '',
    });

    const service = createSearchService({ projectsRoot: root, text, characters, worldview, outline, canon, knowledge });
    await service.open('demo');

    // build：派生索引 + 分层统计。
    const built = await service.build('demo');
    expect(built.indexExists).toBe(true);
    expect(built.counts.text).toBe(1);
    expect(built.counts.characters).toBe(1);
    expect(built.counts.worldview).toBe(1);
    expect(built.counts.outline).toBe(4); // 梗概 + 幕 + 节 + 场景卡
    expect(built.counts.canon).toBe(1);
    expect(built.counts.knowledge).toBe(2);
    expect(built.totalEntries).toBe(10);

    // 关键词跨层检索。
    const seaChart = await service.search('demo', '海图');
    expect(seaChart.total).toBeGreaterThanOrEqual(1);
    expect(seaChart.hits.some((hit) => hit.layer === 'text' && hit.id === 'scene-1')).toBe(true);
    expect(seaChart.hits.some((hit) => hit.layer === 'outline' && hit.id === 'detail:detail-1')).toBe(true);
    expect(seaChart.hits.every((hit) => hit.preview.length <= 161)).toBe(true);

    // 实体引用（跨层）。
    const refs = await service.references('demo', '米拉');
    expect(refs.hits.some((hit) => hit.layer === 'characters')).toBe(true);
    expect(refs.hits.some((hit) => hit.layer === 'text')).toBe(true);
    expect(refs.hits.some((hit) => hit.layer === 'canon')).toBe(true);

    // POV/secret 负测：pov=米拉 只知道 know-1 —— know-2 不可见；作者全知面可见。
    const povSearch = await service.search('demo', '守夜人其实是');
    expect(povSearch.hits.some((hit) => hit.layer === 'knowledge' && hit.id === 'know-2')).toBe(true);
    const povScoped = await service.search('demo', '守夜人其实是', 'mira');
    expect(povScoped.pov).toBe('mira');
    expect(povScoped.hits.filter((hit) => hit.layer === 'knowledge')).toEqual([]);
    const knowsRef = await service.references('demo', 'know-2', 'mira');
    expect(knowsRef.hits.filter((hit) => hit.layer === 'knowledge')).toEqual([]);
    // 授权知情仍可见。
    expect((await service.search('demo', '旧城', 'mira')).hits.some((hit) => hit.id === 'know-1')).toBe(true);
    // 未知 POV fail closed（与 filterKnowledge 同语义）。
    await expect(service.search('demo', '海图', 'stranger')).rejects.toThrow(/Knowledge state is missing/);

    // drop → stats 无索引 → search fail closed → rebuild 结果一致。
    const dropped = await service.drop('demo');
    expect(dropped.indexExists).toBe(false);
    expect((await service.stats('demo')).indexExists).toBe(false);
    await expect(service.search('demo', '海图')).rejects.toThrow(/未构建/);
    const rebuilt = await service.build('demo');
    expect(rebuilt.totalEntries).toBe(10);
    expect(await service.search('demo', '海图')).toEqual(seaChart);

    // 空查询拒绝。
    await expect(service.search('demo', '   ')).rejects.toThrow(/不能为空/);
  });
});
