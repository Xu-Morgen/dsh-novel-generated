import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { parseArchive, semanticallyEqual, serializeArchive, type PortableArchive } from '../core/export/index.js';
import { createImportExportService, type NovelImportExportService } from './import-export-service.js';
import { createLinkIndexService } from './link-index-service.js';
import { createTextService } from './text-service.js';

/**
 * I69 导入导出与备份 Host owner 测试（design §14.10「导入、导出与备份」/ R14-4）。
 *
 * 覆盖：full/shareable round-trip、txt/md 导出→导入预览 round-trip、N-7 非空作品
 * fail closed、校验失败/写盘失败无半导入（快照回滚）、导入预览零写与确定性。
 */
const roots: string[] = [];
async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `novel-i69-${label}-`));
  roots.push(root);
  return root;
}

async function createSourceProject(root: string): Promise<string> {
  const project = new ProjectRepository(root);
  await project.createProject({ projectId: 'source', name: '源作品' });
  const dir = join(root, 'source');
  await mkdir(join(dir, 'text'), { recursive: true });
  await mkdir(join(dir, 'rules'), { recursive: true });
  await mkdir(join(dir, 'characters'), { recursive: true });
  await mkdir(join(dir, 'canon'), { recursive: true });
  await writeFile(join(dir, 'outline.yaml'), 'id: outline\nversion: 2\nstructure: three-act\nlogline: 测试立意\nacts: []\n');
  await writeFile(join(dir, 'outline-progress.yaml'), 'outlineId: outline\ncurrentAct: ""\ncurrentBeat: ""\ncompletedBeats: []\ndeviations: []\ntensionLevel: 0\n');
  await writeFile(join(dir, 'relationships.yaml'), 'version: 1\npairs: []\n');
  await writeFile(join(dir, 'knowledge.yaml'), 'version: 1\nentries: []\n');
  await writeFile(join(dir, 'text', 'chapter.json'), JSON.stringify({
    id: 'chapter', index: 1, title: '第一章', pov: 'mira', status: 'draft',
    scenes: [{ id: 'scene', index: 0, content: '开头\n结尾', summary: '开场', beats: [], canonEvents: [], notes: '', branches: [] }],
  }));
  await writeFile(join(dir, 'rules', 'rule.yaml'), 'version: 1\nitems: [{ id: "r1", priority: 10, content: "禁用 AI 词汇" }]\n');
  await writeFile(join(dir, 'characters', 'mira.yaml'), 'version: 1\nentries: [{ id: "mira", name: "米拉" }]\n');
  return dir;
}

async function hashTree(root: string): Promise<string> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(root, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) parts.push(`${entry.name}/${await hashTree(join(root, entry.name))}`);
    else parts.push(`${entry.name}:${await readFile(join(root, entry.name), 'utf8')}`);
  }
  return parts.join('|');
}

describe('I69 import/export service', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('full-project 导出 → 空壳恢复 → 再导出语义等价（round-trip，忽略 exportedAt/checksum）', async () => {
    const sourceRoot = await tempRoot('source-full');
    const targetRoot = await tempRoot('target-full');
    await createSourceProject(sourceRoot);
    const service = createImportExportService(sourceRoot);
    const source = await service.exportArchive('source', 'full-project');
    expect(source.mode).toBe('full-project');
    expect(source.fileCount).toBeGreaterThan(0);
    expect(source.content).toContain('"format": "novel-creation-tool.portable"');

    // 恢复目标必须是空壳作品（createProject 刚建好）；同名目标保证档案内
    // project.name 元数据一致（restore 不写 project.yaml，作品身份归目标所有）。
    const target = new ProjectRepository(targetRoot);
    await target.createProject({ projectId: 'source', name: '源作品' });
    await mkdir(join(targetRoot, 'source', '.links'), { recursive: true });
    await writeFile(join(targetRoot, 'source', '.links', 'index.json'), 'stale link index');
    await mkdir(join(targetRoot, 'source', '.search'), { recursive: true });
    await writeFile(join(targetRoot, 'source', '.search', 'index.json'), 'stale search index');
    const restoreService = createImportExportService(targetRoot);
    const restored = await restoreService.restore('source', source.content);
    expect(restored.status).toBe('imported');
    if (restored.status === 'imported') expect(restored.written).toContain('outline.yaml');
    await expect(readFile(join(targetRoot, 'source', '.links', 'index.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(targetRoot, 'source', '.search', 'index.json'), 'utf8')).rejects.toThrow();

    const reexported = await restoreService.exportArchive('source', 'full-project');
    const original = parseArchive(source.content);
    const round = parseArchive(reexported.content);
    expect(semanticallyEqual(original, round)).toBe(true);
  });

  it('round-trip 后不恢复链接内部数据，但可从纯正文重建索引', async () => {
    const sourceRoot = await tempRoot('source-links');
    const targetRoot = await tempRoot('target-links');
    await createSourceProject(sourceRoot);
    const sourceService = createImportExportService(sourceRoot);
    const archive = (await sourceService.exportArchive('source', 'full-project')).content;

    await new ProjectRepository(targetRoot).createProject({ projectId: 'source', name: '源作品' });
    const restoreService = createImportExportService(targetRoot);
    await expect(restoreService.restore('source', archive)).resolves.toMatchObject({ status: 'imported' });
    await expect(readFile(join(targetRoot, 'source', '.links', 'index.json'), 'utf8')).rejects.toThrow();

    const text = createTextService(targetRoot);
    await text.open('source');
    const links = createLinkIndexService({ projectsRoot: targetRoot, text });
    const rebuilt = await links.build('source', [{
      id: 'restored-link', chapterId: 'chapter', sceneId: 'scene', quote: '开头',
    }]);
    expect(rebuilt.issues).toEqual([]);
    expect(rebuilt.index.records[0]).toMatchObject({ status: 'ready', link: { anchor: { quote: '开头' } } });
    await expect(readFile(join(targetRoot, 'source', '.links', 'index.json'), 'utf8')).resolves.toContain('restored-link');
  });

  it('shareable-template 排除 C5 正文文本，round-trip 语义等价', async () => {
    const sourceRoot = await tempRoot('source-share');
    const targetRoot = await tempRoot('target-share');
    await createSourceProject(sourceRoot);
    const service = createImportExportService(sourceRoot);
    const source = await service.exportArchive('source', 'shareable-template');
    const archive = parseArchive(source.content);
    expect(Object.keys(archive.files).some((path) => path.startsWith('text/'))).toBe(false);
    expect(Object.keys(archive.files).some((path) => path.startsWith('characters/'))).toBe(true);

    const target = new ProjectRepository(targetRoot);
    await target.createProject({ projectId: 'source', name: '源作品' });
    const restoreService = createImportExportService(targetRoot);
    const restored = await restoreService.restore('source', source.content);
    expect(restored.status).toBe('imported');
    const reexported = await restoreService.exportArchive('source', 'shareable-template');
    expect(semanticallyEqual(archive, parseArchive(reexported.content))).toBe(true);
  });

  it('txt/md 纯文本导出经 I37 导入预览 round-trip（归一化幂等）', async () => {
    const root = await tempRoot('text');
    await createSourceProject(root);
    const service = createImportExportService(root);
    const txt = await service.exportText('source', 'txt');
    expect(txt.format).toBe('txt');
    const txtNames = Object.keys(txt.files);
    expect(txtNames.length).toBeGreaterThan(0);
    expect(txtNames.every((name) => name.endsWith('.txt'))).toBe(true);

    const md = await service.exportText('source', 'md');
    expect(Object.keys(md.files).every((name) => name.endsWith('.md'))).toBe(true);

    // 导出文本重新进入 I37 管线：归一化幂等 → 文本 round-trip。
    const one = txt.files[txtNames[0]];
    const preview = await service.importPreview('source', { fileName: txtNames[0], format: 'txt', text: one });
    expect(preview.text).toBe(one.trim());
    expect(preview.chunks.length).toBeGreaterThan(0);
    expect(preview.chunks.map((chunk) => chunk.text).join('\n\n')).toBe(preview.text);
  });

  it('N-7：已有内容的非空作品恢复 fail closed，列出冲突层且零写', async () => {
    const root = await tempRoot('n7');
    const sourceRoot = await tempRoot('n7-source');
    await new ProjectRepository(root).createProject({ projectId: 'source', name: '非空作品' });
    await createSourceProject(sourceRoot);
    const archive = (await createImportExportService(sourceRoot).exportArchive('source', 'full-project')).content;
    const service = createImportExportService(root);
    // 空壳作品直接恢复，产生内容，随后再恢复必须阻断。
    const first = await service.restore('source', archive);
    expect(first.status).toBe('imported');
    const before = await hashTree(join(root, 'source'));
    const blocked = await service.restore('source', archive);
    expect(blocked.status).toBe('blocked');
    if (blocked.status === 'blocked') {
      expect(blocked.reason).toBe('non-empty-project');
      expect(blocked.layers.length).toBeGreaterThan(0);
      expect(blocked.layers).toContain('text');
    }
    expect(await hashTree(join(root, 'source'))).toBe(before);
  });

  it('校验失败无半导入：坏 JSON/checksum/非法版本在写盘前失败', async () => {
    const root = await tempRoot('invalid');
    const project = new ProjectRepository(root);
    await project.createProject({ projectId: 'source', name: '作品' });
    const service = createImportExportService(root);
    const before = await hashTree(join(root, 'source'));
    await expect(service.restore('source', '{not-json')).rejects.toThrow();
    const tampered = (await createImportExportService(join(root)).exportArchive('source', 'full-project')).content.replace('"version": 1', '"version": 2');
    await expect(service.restore('source', tampered)).rejects.toThrow();
    expect(await hashTree(join(root, 'source'))).toBe(before);
  });

  it('写盘失败快照回滚：不残留半导入文件', async () => {
    const root = await tempRoot('rollback');
    const sourceRoot = await tempRoot('rollback-source');
    await new ProjectRepository(root).createProject({ projectId: 'source', name: '作品' });
    // 破坏空壳：把 text 目录换成同名空文件（N-7 判定为空，写盘时 mkdir 失败触发回滚）。
    await rm(join(root, 'source', 'text'), { recursive: true, force: true });
    await writeFile(join(root, 'source', 'text'), '');
    await createSourceProject(sourceRoot);
    const archive = (await createImportExportService(sourceRoot).exportArchive('source', 'full-project')).content;
    const service = createImportExportService(root);
    await expect(service.restore('source', archive)).rejects.toThrow();
    // 回滚后只保留原文件，无任何残留层文件。
    expect(await readFile(join(root, 'source', 'text'), 'utf8')).toBe('');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(join(root, 'source', 'characters'))).toEqual([]);
  });

  it('importPreview 零写、确定性、非法输入拒绝', async () => {
    const root = await tempRoot('preview');
    await createSourceProject(root);
    const service = createImportExportService(root);
    const before = await hashTree(join(root, 'source'));
    const first = await service.importPreview('source', { fileName: 'a.md', format: 'md', text: '第一段\n\n第二段\n' });
    const second = await service.importPreview('source', { fileName: 'a.md', format: 'md', text: '第一段\n\n第二段\n' });
    expect(first.text).toBe(second.text);
    expect(first.chunks).toEqual(second.chunks);
    expect(await hashTree(join(root, 'source'))).toBe(before);
    await expect(service.importPreview('source', { fileName: 'b.docx', format: 'docx', text: 'docx 文本' })).resolves.toMatchObject({ format: 'docx' });
    await expect(service.importPreview('source', { fileName: 'bad.exe', format: 'txt', text: '' })).rejects.toThrow();
    await expect(service.importPreview('source', { fileName: 'bad.md', format: 'txt', text: '   \n  ' })).rejects.toThrow();
  });

  it('wire 载荷不含路径与 secret（负向扫描）', async () => {
    const root = await tempRoot('hygiene');
    await createSourceProject(root);
    const service = createImportExportService(root);
    const archive = await service.exportArchive('source', 'full-project');
    const serialized = JSON.stringify(archive);
    for (const forbidden of ['projectsRoot', 'C:\\\\', '/home/', 'credentialRef', 'apiKey', 'password']) {
      expect(serialized).not.toContain(forbidden);
    }
    const preview = await service.importPreview('source', { fileName: 'a.txt', format: 'txt', text: '正文' });
    expect(JSON.stringify(preview)).not.toContain('projectsRoot');
    const portable: PortableArchive = parseArchive(archive.content);
    expect(portable).toBeDefined();
    expect(serializeArchive(portable)).toBeTruthy();
  });
});
