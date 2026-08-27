import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBranchService } from './branch-service.js';
import { TextRepository } from '../core/text/index.js';

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
});
