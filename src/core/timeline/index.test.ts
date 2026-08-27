import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OutlineInput } from '../schema/outline.js';
import { TimelineRepository, anchorNodeId, buildTimelineFromOutline, effectiveRelationshipIds, filterRelationshipsByTimeline, timelineSchema, type Timeline } from './index.js';

/** 一个三幕两节带细纲卡的 outline 夹具。 */
function outline(): OutlineInput {
  return {
    id: 'demo',
    version: 1,
    structure: 'three-act',
    logline: '追查灯塔守夜人失踪之谜。',
    themes: ['追查'],
    acts: [
      {
        id: 'act-1', index: 0, title: '第一幕', goal: '接受委托',
        beats: [
          {
            id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'],
            conflictType: 'external', prerequisites: [], optional: false,
            detailBeats: [
              { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' },
              { id: 'detail-2', title: '钟楼对峙', summary: '与守夜人对峙', pov: 'mira', wordTarget: 30, points: ['对峙'], status: 'planned' },
            ],
          },
          { id: 'beat-2', title: '无卡节', description: '只有节没有细纲卡', charactersInvolved: ['lin'], conflictType: 'internal', prerequisites: [], optional: false, detailBeats: [] },
        ],
      },
      {
        id: 'act-2', index: 1, title: '第二幕', goal: '深入真相',
        beats: [
          {
            id: 'beat-3', title: '真相大白', description: '真相揭开。', charactersInvolved: ['mira', 'lin'],
            conflictType: 'world', prerequisites: [], optional: false,
            detailBeats: [
              { id: 'detail-3', title: '终局', summary: '真相揭开', pov: 'lin', wordTarget: 40, points: ['真相'], status: 'planned' },
            ],
          },
        ],
      },
    ],
    foreshadowing: [], endings: [],
  };
}

describe('core/timeline 剧情时间线（方案 A）', () => {
  it('从 B5 大纲确定性生成有序骨架：细纲卡逐卡成节点，无卡节自成一节点，order 全局递增', () => {
    const timeline = buildTimelineFromOutline(outline());
    expect(timeline.nodes).toHaveLength(4);
    expect(timeline.nodes.map((node) => node.order)).toEqual([0, 1, 2, 3]);
    expect(timeline.nodes.map((node) => node.label)).toEqual([
      '第一幕 · 午夜旧灯塔 · 发现海图',
      '第一幕 · 午夜旧灯塔 · 钟楼对峙',
      '第一幕 · 无卡节',
      '第二幕 · 真相大白 · 终局',
    ]);
    // 细纲卡节点绑定 beat + detailBeat；无卡节只绑定 beat。
    expect(timeline.nodes[0]).toMatchObject({ beatId: 'beat-1', detailBeatId: 'detail-1', reveals: [], relationships: [] });
    expect(timeline.nodes[2].beatId).toBe('beat-2');
    expect(timeline.nodes[2].detailBeatId).toBeUndefined();
    expect(timeline.nodes[3]).toMatchObject({ beatId: 'beat-3', detailBeatId: 'detail-3' });
    // 初始 currentNodeId 为 null：未手动选择，写作上下文按写作位置自动锚定。
    expect(timeline.currentNodeId).toBeNull();
    // 生成的骨架能通过文档 schema 校验（消费者夹具：可落盘可读回）。
    expect(timelineSchema.parse({ ...timeline, version: 1 }).nodes).toHaveLength(4);
  });

  it('空大纲（无 acts）生成空骨架，currentNodeId 为 null', () => {
    const empty = buildTimelineFromOutline({ ...outline(), acts: [] });
    expect(empty.nodes).toEqual([]);
    expect(empty.currentNodeId).toBeNull();
  });

  it('effectiveRelationshipIds：仅返回 ≤ 当前节点 order 的关系并集；未列出关系始终保留（由调用方合并）', () => {
    const base = buildTimelineFromOutline(outline());
    const nodes = base.nodes.map((node, index) => ({
      ...node,
      relationships: index === 0 ? ['rel-first'] : index === 2 ? ['rel-third'] : [],
    }));
    const timeline: Timeline = { ...base, version: 1, nodes };

    // 当前在节点 0 → 只有 rel-first。
    expect(effectiveRelationshipIds(timeline, nodes[0].id)).toEqual(new Set(['rel-first']));
    // 当前在节点 2 → rel-first + rel-third（order 0 与 2 的并集，跳过 order 1）。
    expect(effectiveRelationshipIds(timeline, nodes[2].id)).toEqual(new Set(['rel-first', 'rel-third']));
    // currentNodeId 为 null（未手动选择）→ 返回 null，写作上下文不过滤。
    expect(effectiveRelationshipIds(timeline, null)).toBeNull();
    // 未知节点 id → null（fail-safe：不过滤，不丢关系）。
    expect(effectiveRelationshipIds(timeline, 'node-missing')).toBeNull();
  });

  it('anchorNodeId：手动 currentNodeId 优先，其次按写作位置（detailBeatId → beatId）自动锚定', () => {
    const built = buildTimelineFromOutline(outline());
    const timeline: Timeline = { ...built, version: 1 };

    // 未手动选择：按当前细纲卡 detailBeatId 锚定。
    expect(anchorNodeId(timeline, { beatId: 'beat-1', detailBeatId: 'detail-2' })).toBe(timeline.nodes[1].id);
    // 无 detailBeatId 时按 beatId 锚定到该 beat 的第一个节点。
    expect(anchorNodeId(timeline, { beatId: 'beat-2' })).toBe(timeline.nodes[2].id);
    // 都未命中 → null（不过滤）。
    expect(anchorNodeId(timeline, { beatId: 'beat-unknown' })).toBeNull();
    // 手动选择覆盖自动：即使写作位置在别处，也按手动节点。
    const manual: Timeline = { ...timeline, currentNodeId: timeline.nodes[3].id };
    expect(anchorNodeId(manual, { beatId: 'beat-1', detailBeatId: 'detail-1' })).toBe(timeline.nodes[3].id);
    // 手动节点 id 无效 → 回退自动锚定。
    const stale: Timeline = { ...timeline, currentNodeId: 'node-missing' };
    expect(anchorNodeId(stale, { beatId: 'beat-3' })).toBe(timeline.nodes[3].id);
  });

  it('filterRelationshipsByTimeline：已安排关系按时间过滤，未安排关系始终保留，时间线缺失不过滤', () => {
    const built = buildTimelineFromOutline(outline());
    const nodes = built.nodes.map((node, index) => ({
      ...node,
      relationships: index === 0 ? ['rel-first'] : index === 2 ? ['rel-third'] : [],
    }));
    const timeline: Timeline = { ...built, version: 1, nodes };
    const all = [
      { id: 'rel-first' },
      { id: 'rel-third' },
      { id: 'rel-unarranged' },
    ];

    // 当前在节点 0：rel-first 建立；rel-third 尚未建立（被过滤）；未安排关系保留。
    expect(filterRelationshipsByTimeline(timeline, all, nodes[0].id).map((item) => item.id)).toEqual(['rel-first', 'rel-unarranged']);
    // 当前在节点 2：rel-first + rel-third 都建立。
    expect(filterRelationshipsByTimeline(timeline, all, nodes[2].id).map((item) => item.id)).toEqual(['rel-first', 'rel-third', 'rel-unarranged']);
    // 未锚定（null）→ 不过滤。
    expect(filterRelationshipsByTimeline(timeline, all, null)).toBe(all);
    // 时间线缺失 → 不过滤。
    expect(filterRelationshipsByTimeline(null, all, 'node-0')).toBe(all);
  });

  it('repository：save → read round-trip 校验；缺失文件返回 null；损坏文档 fail loudly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'novel-timeline-'));
    try {
      const repository = new TimelineRepository(dir);
      await repository.open();
      expect(await repository.read()).toBeNull();

      const built = buildTimelineFromOutline(outline());
      const saved = await repository.save({ ...built, version: 1 });
      expect(saved.nodes).toHaveLength(4);
      const reread = await repository.read();
      expect(reread).toEqual(saved);
      expect(reread!.nodes[0].label).toBe('第一幕 · 午夜旧灯塔 · 发现海图');

      // 损坏文档：非法节点（order 重复/字段缺失）→ 校验失败。
      await writeFile(join(dir, 'timeline.yaml'), 'id: demo\nversion: 1\nnodes:\n  - { id: n1, order: 0 }\n', 'utf8');
      await expect(repository.read()).rejects.toThrow(/Invalid timeline document/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
