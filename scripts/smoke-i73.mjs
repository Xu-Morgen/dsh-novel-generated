import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I73 剧情时间线数据层与服务 smoke（design §5.13 / §14.11，R15）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/timeline（schema + repository + 骨架生成 + 过滤）、
 *   host/timeline-service（read/ensureFromOutline/setCurrentNode/save）、
 *   host/remote/timeline（novelTimeline Remote）存在且导出关键符号。
 * - 源码：schema 与 node:fs 分离（Client bundle 可入图）；writing-context 关系
 *   注入按当前时间线节点过滤；onboarding finalApply 落地 B5 后自建。
 * - Host 行为（lib）：fake backend 消费者夹具走完整时间线闭环：从 B5 大纲生成
 *   骨架 → 安排关系 → 按当前节点过滤 → 手动设当前节点 → 保存 round-trip；
 *   大纲未就绪 fail-closed；未安排关系始终保留。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I73 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/timeline/schema.js', 'lib/core/timeline/index.js', 'lib/host/timeline-service.js', 'lib/host/remote/timeline.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const schema = read('lib/core/timeline/schema.js');
  for (const symbol of ['timelineSchema', 'buildTimelineFromOutline', 'effectiveRelationshipIds', 'anchorNodeId', 'filterRelationshipsByTimeline']) {
    if (!schema.includes(symbol)) fail(`lib timeline schema missing ${symbol}`);
  }
  const repo = read('lib/core/timeline/index.js');
  for (const symbol of ['TimelineRepository', 'read', 'save']) {
    if (!repo.includes(symbol)) fail(`lib timeline repository missing ${symbol}`);
  }
  const service = read('lib/host/timeline-service.js');
  for (const symbol of ['createTimelineService', 'ensureFromOutline', 'setCurrentNode']) {
    if (!service.includes(symbol)) fail(`lib timeline service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/timeline.js');
  for (const symbol of ['timelineReadInvocation', 'timelineEnsureInvocation', 'timelineSetCurrentInvocation', 'timelineSaveInvocation', 'timelineRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib timeline remote missing ${symbol}`);
  }
}

// Part 2 — 源码：schema/fs 分离、装配、上下文过滤、onboarding 自建。
{
  const context = read('src/host/writing-context.ts');
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  const remoteTs = read('src/remote.ts');
  const schema = read('src/core/timeline/schema.ts');
  if (!context.includes('anchorNodeId') || !context.includes('filterRelationshipsByTimeline')) {
    fail('writing-context must filter relationships by the current timeline node');
  }
  if (!index.includes('createTimelineService') || !index.includes("ctx.provide('novelTimeline'")) {
    fail('index.ts missing novelTimeline wiring');
  }
  if (!remoteTs.includes('...timelineInvocations') || !remoteTs.includes('timelineRemoteContribution')) {
    fail('remote.ts missing timelineInvocations registration');
  }
  if (/(?:from|import)\s+['"]node:(?:fs|path)/.test(schema)) {
    fail('core/timeline/schema must stay free of node:fs/path so the Client bundle can include it');
  }
}

// Part 3 — Host 行为（lib 构建产物）：fake backend 消费者夹具。
{
  const { createTimelineService } = await import('../lib/host/timeline-service.js');
  const { TimelineRepository } = await import('../lib/core/timeline/index.js');
  const { buildTimelineFromOutline, filterRelationshipsByTimeline, anchorNodeId } = await import('../lib/core/timeline/schema.js');

  const outline = {
    id: 'demo', version: 1, structure: 'three-act', logline: '追查。', themes: [],
    acts: [{
      id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [
        {
          id: 'beat-1', title: '午夜旧灯塔', description: '发现线索。', charactersInvolved: ['mira'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [
            { id: 'detail-1', title: '发现海图', summary: '发现海图', pov: 'mira', wordTarget: 20, points: ['海图'], status: 'writing' },
            { id: 'detail-2', title: '钟楼对峙', summary: '对峙', pov: 'mira', wordTarget: 30, points: ['对峙'], status: 'planned' },
          ],
        },
        { id: 'beat-2', title: '无卡节', description: '只有节', charactersInvolved: ['lin'], conflictType: 'internal', prerequisites: [], optional: false, detailBeats: [] },
      ],
    }],
    foreshadowing: [], endings: [],
  };

  // 1) 骨架确定性生成：细纲卡逐卡成节点，无卡节自成一节点，order 全局递增。
  const skeleton = buildTimelineFromOutline(outline);
  assert.equal(skeleton.nodes.length, 3);
  assert.deepEqual(skeleton.nodes.map((n) => n.order), [0, 1, 2]);
  assert.equal(skeleton.nodes[0].detailBeatId, 'detail-1');
  assert.equal(skeleton.nodes[2].detailBeatId, undefined);
  assert.equal(skeleton.currentNodeId, null);

  // 2) 关系过滤：已安排关系按时间过滤，未安排关系始终保留；未锚定/时间线缺失不过滤。
  const arranged = {
    ...skeleton, version: 1,
    nodes: skeleton.nodes.map((n, i) => ({ ...n, relationships: i === 0 ? ['rel-first'] : i === 2 ? ['rel-third'] : [] })),
  };
  const all = [{ id: 'rel-first' }, { id: 'rel-third' }, { id: 'rel-unarranged' }];
  assert.deepEqual(filterRelationshipsByTimeline(arranged, all, 'node-0').map((r) => r.id), ['rel-first', 'rel-unarranged']);
  assert.deepEqual(filterRelationshipsByTimeline(arranged, all, 'node-2').map((r) => r.id), ['rel-first', 'rel-third', 'rel-unarranged']);
  assert.equal(filterRelationshipsByTimeline(arranged, all, null), all);
  assert.equal(filterRelationshipsByTimeline(null, all, 'node-0'), all);

  // 3) 手动锚定优先；未知节点回退自动。
  assert.equal(anchorNodeId({ ...arranged, currentNodeId: 'node-2' }, { detailBeatId: 'detail-1' }), 'node-2');
  assert.equal(anchorNodeId(arranged, { detailBeatId: 'detail-2' }), 'node-1');

  // 4) 服务层：ensureFromOutline 自建并持久化、重复 ensure 不覆盖、setCurrentNode 校验。
  const dir = mkdtempSync(join(tmpdir(), 'novel-i73-smoke-'));
  try {
    const outlineService = { readiness: async () => 'ready', read: async () => outline };
    const service = createTimelineService(outlineService, dir);
    const ensured = await service.ensureFromOutline('demo');
    assert.equal(ensured.nodes.length, 3);
    const repo = new TimelineRepository(join(dir, 'demo'));
    assert.deepEqual(await repo.read(), ensured);
    const manual = await service.setCurrentNode('demo', 'node-1');
    assert.equal(manual.currentNodeId, 'node-1');
    await assert.rejects(service.setCurrentNode('demo', 'node-missing'), /未知时间线节点/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('I73 smoke: 剧情时间线数据层与服务（骨架生成/关系按当前节点过滤/手动锚定/自建持久化/未安排保留/fs 分离）通过');
}
