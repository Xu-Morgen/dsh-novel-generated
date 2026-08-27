import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTimelineService } from './timeline-service.js';
import type { NovelOutlineService } from './outline-service.js';

/** 可注入的 outline 服务夹具（只实现 timeline-service 需要的面）。 */
function outlineStub(ready: boolean): NovelOutlineService {
  const document = {
    id: 'demo', version: 1, structure: 'three-act', logline: '追查。', themes: ['追查'],
    acts: [{
      id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [{
        id: 'beat-1', title: '午夜旧灯塔', description: '发现线索。', charactersInvolved: ['mira'],
        conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '发现海图', pov: 'mira', wordTarget: 20, points: ['海图'], status: 'writing' }],
      }],
    }],
    foreshadowing: [], endings: [],
  };
  return {
    readiness: async () => ready ? 'ready' : 'missing',
    read: async () => document,
  } as unknown as NovelOutlineService;
}

describe('host/timeline-service 剧情时间线服务（方案 A）', () => {
  it('read 缺失返回 null；ensureFromOutline 在大纲就绪时自建骨架并持久化，重复调用不覆盖', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'novel-timeline-service-'));
    try {
      const service = createTimelineService(outlineStub(true), dir);
      expect(await service.read('demo')).toBeNull();

      const ensured = await service.ensureFromOutline('demo');
      expect(ensured.nodes).toHaveLength(1);
      expect(ensured.nodes[0].label).toBe('第一幕 · 午夜旧灯塔 · 发现海图');
      expect(ensured.currentNodeId).toBeNull();
      // 持久化后可读回；第二次 ensure 原样返回（不覆盖手动编辑）。
      expect(await service.read('demo')).toEqual(ensured);

      // 手动安排后 ensure 仍保留（已存在 → 不重建）。
      const arranged = await service.save('demo', {
        ...ensured,
        nodes: [{ ...ensured.nodes[0], relationships: ['rel-1'], reveals: [{ entryId: 'k-1', revealTo: ['mira'] }] }],
      });
      expect((await service.ensureFromOutline('demo')).nodes[0].relationships).toEqual(['rel-1']);
      expect(arranged.nodes[0].reveals).toEqual([{ entryId: 'k-1', revealTo: ['mira'] }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ensureFromOutline 在大纲未就绪时 fail-closed（不生成空时间线）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'novel-timeline-service-'));
    try {
      const service = createTimelineService(outlineStub(false), dir);
      await expect(service.ensureFromOutline('demo')).rejects.toThrow(/时间线自建需要已就绪的 B5 大纲/);
      expect(await service.read('demo')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('setCurrentNode 校验节点存在；null 恢复自动锚定；未知节点拒绝', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'novel-timeline-service-'));
    try {
      const service = createTimelineService(outlineStub(true), dir);
      const ensured = await service.ensureFromOutline('demo');
      const nodeId = ensured.nodes[0].id;

      const manual = await service.setCurrentNode('demo', nodeId);
      expect(manual.currentNodeId).toBe(nodeId);
      await expect(service.setCurrentNode('demo', 'node-missing')).rejects.toThrow(/未知时间线节点/);
      const auto = await service.setCurrentNode('demo', null);
      expect(auto.currentNodeId).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
