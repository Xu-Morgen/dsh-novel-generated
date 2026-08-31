import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBranchService } from './branch-service.js';
import { TextRepository } from '../core/text/index.js';
import {
  branchAggregateSchema,
  BRANCH_AGGREGATE_MAX_BRANCHES_PER_SCENE,
} from '../core/schema/branch-aggregate.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i70-host-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I70 NovelBranchService（design §14.10 / R14-5）', () => {
  it('list 返回元数据投影（无正文全文）；save 命名存档幂等；choose 可逆切换并返回新正文', async () => {
    const root = await temporaryRoot();
    // 服务按 projectDirectory(projectsRoot, projectId) 落库：种子必须落在 <root>/<projectId>。
    const projectDir = join(root, 'demo');
    const repository = new TextRepository(projectDir);
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: '原版正文。', summary: '相遇', beats: [], canonEvents: [], notes: '' });

    const service = createBranchService(root);
    await service.open('demo');

    // 无分支 = 隐含单版本。
    expect(await service.listBranches('demo', 'chapter-1', 'scene-1')).toEqual([]);

    // save：给当前正文打命名版本（幂等，同内容不新增）。
    const saved = await service.saveBranch('demo', 'chapter-1', 'scene-1', '初稿');
    expect(saved.branches).toHaveLength(1);
    expect(saved.branches[0]).toMatchObject({ label: '初稿', chosen: true, charCount: '原版正文。'.length });
    expect(saved.branches[0].hash).toMatch(/^[a-f0-9]{64}$/);
    const savedAgain = await service.saveBranch('demo', 'chapter-1', 'scene-1', '初稿');
    expect(savedAgain.branches).toHaveLength(1);

    // 候选落地语义（I63 accept 重写 → commitSceneVersion）：新正文成为 chosen，
    // 旧正文自动保留为分支。
    await repository.commitSceneVersion('chapter-1', 'scene-1', '版本二正文。', '重写候选');
    const committed2 = await service.listBranches('demo', 'chapter-1', 'scene-1');
    expect(committed2).toHaveLength(2);
    const previous = committed2.find((branch) => !branch.chosen)!;
    const currentId = committed2.find((branch) => branch.chosen)!.id;

    // read：单分支全文；list 投影绝不含正文。
    const read = await service.readBranch('demo', 'chapter-1', 'scene-1', previous.id);
    expect(read.content).toBe('原版正文。');
    expect(JSON.stringify(committed2)).not.toContain('原版正文。');

    // choose：切回旧分支，正文逐字还原。
    const chosen = await service.chooseBranch('demo', 'chapter-1', 'scene-1', previous.id);
    expect(chosen.content).toBe('原版正文。');
    expect(chosen.branches.filter((branch) => branch.chosen)).toHaveLength(1);
    expect(chosen.branches.find((branch) => branch.chosen)?.id).toBe(previous.id);

    // diff：分支 vs 当前 chosen（内容不同时产生 del/add 行）。
    const diff = await service.diffBranches('demo', 'chapter-1', 'scene-1', previous.id, currentId);
    expect(diff.from.content).toBe('原版正文。');
    expect(diff.to.content).toBe('版本二正文。');
    expect(diff.lines.some((line) => line.kind === 'del')).toBe(true);
    expect(diff.lines.some((line) => line.kind === 'add')).toBe(true);
  });

  it('未知分支/空标签 fail closed；save 不改正文', async () => {
    const root = await temporaryRoot();
    const projectDir = join(root, 'demo');
    const repository = new TextRepository(projectDir);
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: '正文', summary: 's', beats: [], canonEvents: [], notes: '' });

    const service = createBranchService(root);
    await service.open('demo');
    await expect(service.chooseBranch('demo', 'chapter-1', 'scene-1', 'v-none')).rejects.toThrow(/Unknown branch/);
    await expect(service.saveBranch('demo', 'chapter-1', 'scene-1', '   ')).rejects.toThrow(/empty/);
    await expect(service.diffBranches('demo', 'chapter-1', 'scene-1', 'v-none')).rejects.toThrow(/Unknown branch/);
    // save 失败/未知分支零写。
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe('正文');
  });

  it('I130 aggregate：按章节/场景顺序返回隐含单版本与分支元数据，且不泄漏正文', async () => {
    const root = await temporaryRoot();
    const projectDir = join(root, 'demo');
    const repository = new TextRepository(projectDir);
    await repository.open();
    await repository.createChapter({ id: 'chapter-2', index: 2, title: '第二章', pov: 'lin', status: 'revised' });
    await repository.appendScene('chapter-2', { id: 'scene-2', content: '二章正文泄漏哨兵', summary: '收束', beats: [], canonEvents: [], notes: '' });
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-2b', content: '第二场正文泄漏哨兵', summary: '冲突', beats: [], canonEvents: [], notes: '' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: '第一场正文泄漏哨兵', summary: '开场', beats: [], canonEvents: [], notes: '' });
    await repository.commitSceneVersion('chapter-1', 'scene-1', '第一场新正文泄漏哨兵', '重写版本');

    const service = createBranchService(root);
    await service.open('demo');
    const aggregate = await service.aggregate('demo');
    expect(aggregate.chapters.map((chapter) => chapter.index)).toEqual([1, 2]);
    expect(aggregate.chapters[0].scenes.map((scene) => scene.index)).toEqual([0, 1]);
    expect(aggregate.chapters[0].scenes[1]).toMatchObject({
      id: 'scene-1', index: 1, summary: '开场', versionMode: 'branched',
    });
    expect(aggregate.chapters[0].scenes[1].branches).toHaveLength(2);
    expect(aggregate.chapters[0].scenes[1].branches.filter((branch) => branch.chosen)).toHaveLength(1);
    expect(aggregate.chapters[0].scenes[0]).toMatchObject({
      id: 'scene-2b', index: 0, versionMode: 'implicit-single', branches: [],
    });
    expect(aggregate.chapters[1].scenes[0]).toMatchObject({ versionMode: 'implicit-single', branches: [] });
    expect(JSON.stringify(aggregate)).not.toContain('正文泄漏哨兵');
    expect(JSON.stringify(aggregate)).not.toContain('content');
    expect(aggregate.chapters[0].scenes[1].branches[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(aggregate.chapters[0].scenes[1].branches[0])).toEqual(['id', 'label', 'chosen', 'charCount', 'hash']);
  });

  it('I131 chooseFresh：按聚合 chosen hash 原子切换，陈旧 token/跨项目 fail closed', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(join(root, 'demo'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: '旧正文', summary: '开场', beats: [], canonEvents: [], notes: '' });
    await repository.commitSceneVersion('chapter-1', 'scene-1', '新正文', '新版本');
    const service = createBranchService(root);
    await service.open('demo');
    const aggregateBefore = await service.aggregate('demo');
    const scene = aggregateBefore.chapters[0].scenes[0];
    const chosen = scene.branches.find((branch) => branch.chosen)!;
    const previous = scene.branches.find((branch) => !branch.chosen)!;
    const switched = await service.chooseFresh('demo', 'chapter-1', 'scene-1', previous.id, chosen.hash);
    expect(switched.content).toBe('旧正文');
    await expect(service.chooseFresh('demo', 'chapter-1', 'scene-1', chosen.id, chosen.hash)).rejects.toThrow(/Stale branch source/);
    await expect(service.chooseFresh('missing', 'chapter-1', 'scene-1', chosen.id, chosen.hash)).rejects.toThrow(/not open/);
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe('旧正文');
  });

  it('I130 aggregate 负向：未知项目、重复/多 chosen/超限版本树均 fail closed', async () => {
    const root = await temporaryRoot();
    const emptyService = createBranchService(root);
    await emptyService.open('empty');
    expect(await emptyService.aggregate('empty')).toEqual({ projectId: 'empty', chapters: [] });

    const repository = new TextRepository(join(root, 'demo'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: '正文', summary: '开场', beats: [], canonEvents: [], notes: '' });
    const service = createBranchService(root);
    await service.open('demo');
    await expect(service.aggregate('missing')).rejects.toThrow(/not open/);

    const validScene = {
      id: 'scene-1', index: 0, summary: '开场', versionMode: 'branched' as const,
      branches: [{ id: 'branch-1', label: '版本', chosen: true, charCount: 2, hash: 'a'.repeat(64) }],
    };
    expect(branchAggregateSchema.safeParse({
      projectId: 'demo', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ ...validScene, branches: [validScene.branches[0], validScene.branches[0]] }] }],
    }).success).toBe(false);
    expect(branchAggregateSchema.safeParse({
      projectId: 'demo', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ ...validScene, branches: [{ ...validScene.branches[0] }, { ...validScene.branches[0], id: 'branch-2' }] }] }],
    }).success).toBe(false);
    expect(branchAggregateSchema.safeParse({
      projectId: 'demo', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ ...validScene, branches: Array.from({ length: BRANCH_AGGREGATE_MAX_BRANCHES_PER_SCENE + 1 }, (_, index) => ({ ...validScene.branches[0], id: `branch-${index + 1}` })) }] }],
    }).success).toBe(false);
  });
});
