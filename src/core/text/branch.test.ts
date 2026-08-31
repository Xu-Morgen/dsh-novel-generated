import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TextRepository, branchIdFor, migrateLegacyChapter, parseChapterDocument, textContentHash } from './index.js';
import { diffTextLines } from './diff.js';
import { legacyChapterSchema } from '../schema/text.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i70-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const scene = (id: string, content: string) => ({
  id, content, summary: `${id} summary`, beats: [`beat-${id}`], canonEvents: [], notes: '',
});

/** 造一个带一章一场景的作品目录（canonical 形状）。 */
async function seededRepository(root: string): Promise<TextRepository> {
  const repository = new TextRepository(root);
  await repository.open();
  await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
  await repository.appendScene('chapter-1', scene('scene-1', '原版正文。'));
  return repository;
}

describe('I70 C5 版本/分支模型（design §14.10 / R14-5）', () => {
  it('commitSceneVersion 把旧正文保留为分支、新正文成为唯一 chosen', async () => {
    const root = await temporaryRoot();
    const repository = await seededRepository(root);
    const changed = await repository.commitSceneVersion('chapter-1', 'scene-1', '重写后的正文。', '重写候选');
    expect(changed.content).toBe('重写后的正文。');
    expect(changed.branches).toHaveLength(2);
    const [previous, current] = changed.branches;
    expect(previous.content).toBe('原版正文。');
    expect(previous.chosen).toBe(false);
    expect(previous.label).toBe('原版本');
    expect(current.content).toBe('重写后的正文。');
    expect(current.chosen).toBe(true);
    expect(current.label).toBe('重写候选');
    expect(changed.branches.filter((branch) => branch.chosen)).toHaveLength(1);
    // 持久化 + 重开一致。
    const reopened = new TextRepository(root);
    await reopened.open();
    expect((await reopened.readChapter('chapter-1')).scenes[0].branches).toEqual(changed.branches);
  });

  it('commitSceneVersion 幂等：同内容不新增重复分支，只更新标签', async () => {
    const root = await temporaryRoot();
    const repository = await seededRepository(root);
    await repository.commitSceneVersion('chapter-1', 'scene-1', '新正文', '候选甲');
    const once = (await repository.readChapter('chapter-1')).scenes[0].branches;
    const again = await repository.commitSceneVersion('chapter-1', 'scene-1', '新正文', '候选乙');
    expect(again.branches).toHaveLength(once.length);
    expect(again.branches.filter((branch) => branch.chosen)).toHaveLength(1);
    expect(again.branches.find((branch) => branch.chosen)?.label).toBe('候选乙');
  });

  it('首次版本化且内容未变时只生成一个命名版本分支', async () => {
    const repository = await seededRepository(await temporaryRoot());
    const changed = await repository.commitSceneVersion('chapter-1', 'scene-1', '原版正文。', '初稿');
    expect(changed.branches).toHaveLength(1);
    expect(changed.branches[0]).toMatchObject({ content: '原版正文。', chosen: true, label: '初稿' });
  });

  it('chooseSceneBranch 可逆切换：切回旧分支逐字还原，且只写 C5', async () => {
    const root = await temporaryRoot();
    const repository = await seededRepository(root);
    await repository.commitSceneVersion('chapter-1', 'scene-1', '版本二', '重写候选');
    const branches = (await repository.readChapter('chapter-1')).scenes[0].branches;
    const previousId = branches.find((branch) => !branch.chosen)!.id;

    const switched = await repository.chooseSceneBranch('chapter-1', 'scene-1', previousId);
    expect(switched.content).toBe('原版正文。');
    expect(switched.branches.find((branch) => branch.chosen)?.id).toBe(previousId);

    // 幂等：再次选用同一分支零写（内容不变）。
    const idempotent = await repository.chooseSceneBranch('chapter-1', 'scene-1', previousId);
    expect(idempotent.content).toBe('原版正文。');

    // 可逆：切回版本二后内容逐字还原。
    const back = await repository.chooseSceneBranch('chapter-1', 'scene-1', branches.find((branch) => branch.chosen)!.id);
    expect(back.content).toBe('版本二');
    expect(back.branches.filter((branch) => branch.chosen)).toHaveLength(1);
  });

  it('I131 chooseSceneBranchFresh：sourceHash 在写队列内核对，过期 token 零写拒绝', async () => {
    const repository = await seededRepository(await temporaryRoot());
    await repository.commitSceneVersion('chapter-1', 'scene-1', '新正文', '新版本');
    const before = await repository.readChapter('chapter-1');
    const chosen = before.scenes[0].branches.find((branch) => branch.chosen)!;
    const previous = before.scenes[0].branches.find((branch) => !branch.chosen)!;
    const switched = await repository.chooseSceneBranchFresh('chapter-1', 'scene-1', previous.id, textContentHash(before.scenes[0].content));
    expect(switched.content).toBe(previous.content);
    await expect(repository.chooseSceneBranchFresh('chapter-1', 'scene-1', chosen.id, textContentHash(before.scenes[0].content))).rejects.toThrow(/Stale branch source/);
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe(previous.content);
  });

  it('replaceRange 只同步 chosen 分支 content，不隐式造分支', async () => {
    const repository = await seededRepository(await temporaryRoot());
    await repository.commitSceneVersion('chapter-1', 'scene-1', '版本二', '重写候选');
    const edited = await repository.replaceRange('chapter-1', 'scene-1', { start: 0, end: 2 }, '改');
    expect(edited.content).toBe('改二');
    const branches = (await repository.readChapter('chapter-1')).scenes[0].branches;
    expect(branches).toHaveLength(2);
    expect(branches.find((branch) => branch.chosen)?.content).toBe('改二');
    expect(branches.find((branch) => !branch.chosen)?.content).toBe('原版正文。');
  });

  it('listSceneBranches/readSceneBranch：元数据与单分支全文；未知分支抛错', async () => {
    const repository = await seededRepository(await temporaryRoot());
    await repository.commitSceneVersion('chapter-1', 'scene-1', '版本二', '重写候选');
    const list = await repository.listSceneBranches('chapter-1', 'scene-1');
    expect(list).toHaveLength(2);
    const previous = list.find((branch) => !branch.chosen)!;
    const read = await repository.readSceneBranch('chapter-1', 'scene-1', previous.id);
    expect(read.content).toBe('原版正文。');
    await expect(repository.readSceneBranch('chapter-1', 'scene-1', 'v-missing')).rejects.toThrow(/Unknown branch/);
  });

  it('坏文档（两个 chosen 分支）fail closed：读取即拒绝', async () => {
    const root = await temporaryRoot();
    const repository = await seededRepository(root);
    await repository.commitSceneVersion('chapter-1', 'scene-1', '版本二', '重写候选');
    const path = join(root, 'text', 'chapter-1.json');
    const document = JSON.parse(await readFile(path, 'utf8'));
    document.scenes[0].branches.forEach((branch: { chosen: boolean }) => { branch.chosen = true; });
    await writeFile(path, JSON.stringify(document), 'utf8');
    await expect(repository.readChapter('chapter-1')).rejects.toThrow(/Invalid chapter document/);
  });

  it('commitSceneVersion/chooseSceneBranch 未知场景/未知分支零写失败', async () => {
    const repository = await seededRepository(await temporaryRoot());
    await expect(repository.commitSceneVersion('chapter-1', 'missing', 'x', 'l')).rejects.toThrow(/Unknown scene/);
    await expect(repository.chooseSceneBranch('chapter-1', 'scene-1', 'v-none')).rejects.toThrow(/Unknown branch/);
    const chapter = await repository.readChapter('chapter-1');
    expect(chapter.scenes[0].branches).toEqual([]);
    expect(chapter.scenes[0].content).toBe('原版正文。');
  });

  it('parseChapterDocument：legacy 文档（无 branches）内存迁移，正文不丢', async () => {
    const legacy = {
      id: 'chapter-1', index: 1, title: '旧章', pov: 'lin', status: 'draft',
      scenes: [{ id: 'scene-1', index: 0, content: '旧正文', summary: '旧摘要', beats: ['b'], canonEvents: [], notes: '' }],
    };
    const parsed = parseChapterDocument(JSON.stringify(legacy));
    expect(parsed.scenes[0].content).toBe('旧正文');
    expect(parsed.scenes[0].branches).toEqual([]);
    // legacy schema 本身可解析（迁移输入形状）。
    expect(legacyChapterSchema.parse(legacy).scenes[0].content).toBe('旧正文');
    // 坏文档（两种形状都不是）fail closed。
    expect(() => parseChapterDocument('{"id": 42}')).toThrow(/Invalid chapter document/);
  });

  it('open() 把 legacy 文档回写为 canonical（branches: []），坏迁移 fail closed 零写', async () => {
    const root = await temporaryRoot();
    await new TextRepository(root).open();
    await new TextRepository(root).createChapter({ id: 'chapter-1', index: 1, title: '旧章', pov: 'lin', status: 'draft' });
    await new TextRepository(root).appendScene('chapter-1', { id: 'scene-1', content: '旧正文', summary: '旧摘要', beats: [], canonEvents: [], notes: '' });
    // 直接覆写为 legacy 形状（模拟 I70 前的旧单版本文档）。
    const path = join(root, 'text', 'chapter-1.json');
    const legacy = {
      id: 'chapter-1', index: 1, title: '旧章', pov: 'lin', status: 'draft',
      scenes: [{ id: 'scene-1', index: 0, content: '旧正文', summary: '旧摘要', beats: [], canonEvents: [], notes: '' }],
    };
    await writeFile(path, JSON.stringify(legacy, null, 2), 'utf8');

    const reopened = new TextRepository(root);
    await reopened.open();
    const chapter = await reopened.readChapter('chapter-1');
    expect(chapter.scenes[0].content).toBe('旧正文');
    expect(chapter.scenes[0].branches).toEqual([]);
    // 迁移已持久化：磁盘文档现在带 branches 字段。
    const onDisk = JSON.parse(await readFile(path, 'utf8'));
    expect(onDisk.scenes[0].branches).toEqual([]);
    // 幂等：再次 open 不再改变（仍是 canonical）。
    const again = new TextRepository(root);
    await again.open();
    expect((await again.readChapter('chapter-1')).scenes[0].branches).toEqual([]);
  });

  it('open() 对既非 canonical 也非 legacy 的文档 fail closed（坏迁移零猜测零写）', async () => {
    const root = await temporaryRoot();
    await new TextRepository(root).open();
    await new TextRepository(root).createChapter({ id: 'chapter-1', index: 1, title: '章', pov: 'lin', status: 'draft' });
    await new TextRepository(root).appendScene('chapter-1', { id: 'scene-1', content: 'x', summary: 's', beats: [], canonEvents: [], notes: '' });
    const path = join(root, 'text', 'chapter-1.json');
    // 半迁移冲突：一个场景带 branches、另一个没有 → canonical 与 legacy 都解析失败。
    const corrupt = JSON.parse(await readFile(path, 'utf8'));
    corrupt.scenes[0].branches = [];
    corrupt.scenes.push({ id: 'scene-2', index: 1, content: 'y', summary: 's2', beats: [], canonEvents: [], notes: '' });
    await writeFile(path, JSON.stringify(corrupt, null, 2), 'utf8');
    await expect(new TextRepository(root).open()).rejects.toThrow(/Invalid chapter document/);
    // 零写：磁盘文件未被改写。
    expect(JSON.parse(await readFile(path, 'utf8')).scenes).toHaveLength(2);
  });

  it('branchIdFor 确定性：同内容同 id、不同内容不同 id', () => {
    expect(branchIdFor('a')).toBe(branchIdFor('a'));
    expect(branchIdFor('a')).not.toBe(branchIdFor('b'));
    expect(branchIdFor('a')).toMatch(/^v-[a-f0-9]{12}$/);
  });

  it('migrateLegacyChapter 保持章节元数据与场景顺序', () => {
    const migrated = migrateLegacyChapter({
      id: 'chapter-1', index: 2, title: '旧章', pov: 'lin', status: 'draft',
      scenes: [
        { id: 's1', index: 0, content: '一', summary: '', beats: [], canonEvents: [], notes: '' },
        { id: 's2', index: 1, content: '二', summary: '', beats: [], canonEvents: [], notes: '' },
      ],
    });
    expect(migrated.scenes.map((item) => item.content)).toEqual(['一', '二']);
    expect(migrated.scenes.every((item) => item.branches.length === 0)).toBe(true);
  });
});

describe('I70 分支行 diff（core/text/diff）', () => {
  it('相同文本全部 same', () => {
    expect(diffTextLines('a\nb', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  it('新增/删除/替换行确定性输出 del → add', () => {
    const lines = diffTextLines('a\nb\nc', 'a\nx\nc');
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('空文本与末尾追加', () => {
    expect(diffTextLines('', '')).toEqual([]);
    expect(diffTextLines('a', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'b' },
    ]);
    expect(diffTextLines('a\nb', 'a')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
    ]);
  });

  it('Windows CRLF 输入按行归一', () => {
    const lines = diffTextLines('a\r\nb', 'a\r\nc');
    expect(lines.map((line) => line.text)).toEqual(['a', 'b', 'c']);
    expect(lines.filter((line) => line.kind === 'del').map((line) => line.text)).toEqual(['b']);
    expect(lines.filter((line) => line.kind === 'add').map((line) => line.text)).toEqual(['c']);
  });
});
