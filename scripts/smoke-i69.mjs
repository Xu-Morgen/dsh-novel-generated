import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I69 导入导出与备份 UI smoke（design §14.10「导入、导出与备份」/ R14-4）。
 *
 * 交付物核验：
 * - 构建产物（lib）：host/import-export-service（exportArchive/exportText/restore/
 *   importPreview，N-7 fail closed + 快照回滚）、host/remote/import-export
 *   （novelImportExport Remote）存在且导出关键符号。
 * - 源码：index.ts 提供 novelImportExport（bindRemote + createImportExportService）；
 *   remote.ts 注册 importExportInvocations；nav 新增 importExport 稳定视图；client.ts
 *   挂载 importExportRemoteContribution；Client 面板无领域 fallback（不导入 core
 *   schema / zod）。
 * - Host 行为（lib）：full/shareable round-trip（export → 空壳 restore → 再导出
 *   语义等价）、txt/md 导出经 I37 导入预览 round-trip、N-7 非空作品 fail closed
 *   零写、坏档案/失败无半导入、路径/secret 不进入 wire 载荷。
 * - 可移植性既有回归：I39 冲突走 Gate 的 core 路径仍可用。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I69 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/host/import-export-service.js', 'lib/host/remote/import-export.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const service = read('lib/host/import-export-service.js');
  for (const symbol of ['createImportExportService', 'exportArchive', 'exportText', 'restore', 'importPreview']) {
    if (!service.includes(symbol)) fail(`lib import-export service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/import-export.js');
  for (const symbol of ['importExportArchiveInvocation', 'importExportTextInvocation', 'importExportRestoreInvocation', 'importExportPreviewInvocation', 'importExportRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib import-export remote missing ${symbol}`);
  }
}

// Part 2 — 源码：装配 + Client 无领域 fallback + 不复制 owner。
{
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  const panel = read('src/client/layers/import-export.ts');
  const shared = read('src/client/shared.ts');
  if (!index.includes("ctx.provide('novelImportExport'") || !index.includes('createImportExportService')) {
    fail('index.ts missing novelImportExport wiring');
  }
  if (!remoteTs.includes('...importExportInvocations') || !remoteTs.includes('importExportRemoteContribution')) {
    fail('remote.ts missing importExportInvocations registration');
  }
  if (!nav.includes("view: 'importExport'") || !nav.includes("view === 'importExport'")) {
    fail('nav.ts missing the importExport view / stable-view handling');
  }
  // I83 起 Remote 挂载经 mount.ts 参数化工厂；I90 起 per-Remote 声明式规格在 mount-registry.ts。
  const mountRegistry = read('src/client/mount-registry.ts');
  const mount = read('src/client/mount.ts');
  if (!mount.includes('export function mountRemote') || !mountRegistry.includes('importExportRemoteContribution') || !mountRegistry.includes("'remote.novelImportExport'")) {
    fail('client mount wiring missing importExport Remote mount');
  }
  if (!shared.includes('ImportExportNamespace')) fail('shared.ts missing ImportExportNamespace');
  // Client 无领域 fallback：面板不导入 core schema / zod，不复制领域校验。
  if (panel.includes('../core/') || panel.includes('zod')) {
    fail('client import/export panel must not import core schema or zod (no domain fallback)');
  }
}

// Part 3 — Host 行为（lib 构建产物）：真实服务消费者夹具。
{
  const { createImportExportService } = await import('../lib/host/import-export-service.js');
  const { ProjectRepository } = await import('../lib/core/project/index.js');
  const { exportProject, importProject, parseArchive, proposePortableImport, serializeArchive, semanticallyEqual } = await import('../lib/core/export/index.js');
  const { ConfirmationGate } = await import('../lib/core/confirm/index.js');

  const hashOf = (p) => createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex');

  const sourceRoot = mkdtempSync(join(tmpdir(), 'novel-i69-source-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'novel-i69-target-'));
  try {
    // 源作品：B5 + C5 + B1/B3 落地内容。
    await new ProjectRepository(sourceRoot).createProject({ projectId: 'demo', name: '可移植演示' });
    const dir = join(sourceRoot, 'demo');
    mkdirSync(join(dir, 'text'), { recursive: true });
    mkdirSync(join(dir, 'rules'), { recursive: true });
    writeFileSync(join(dir, 'outline.yaml'), 'id: outline\nversion: 1\nstructure: three-act\nlogline: 演示\nacts: []\n');
    writeFileSync(join(dir, 'text', 'chapter.json'), JSON.stringify({ id: 'chapter', version: 1, title: '一', scenes: [{ id: 's', index: 0, content: '开头\n结尾' }] }));
    writeFileSync(join(dir, 'rules', 'rule.yaml'), 'version: 1\nitems: []\n');

    const source = createImportExportService(sourceRoot);
    const full = await source.exportArchive('demo', 'full-project');
    assert.equal(full.fileCount, 3, 'full archive covers 3 layer files');
    assert.ok(full.content.includes('text/chapter.json'), 'full archive includes C5 text');
    const share = await source.exportArchive('demo', 'shareable-template');
    assert.ok(!share.content.includes('text/chapter.json'), 'shareable excludes C5 text');

    // 1) full round-trip：空壳恢复 → 再导出语义等价。
    await new ProjectRepository(targetRoot).createProject({ projectId: 'demo', name: '可移植演示' });
    const target = createImportExportService(targetRoot);
    const restored = await target.restore('demo', full.content);
    assert.equal(restored.status, 'imported', 'restore into empty shell imports');
    const reexported = await target.exportArchive('demo', 'full-project');
    assert.ok(semanticallyEqual(parseArchive(full.content), parseArchive(reexported.content)), 'full-project round-trip semantically equal');

    // 2) shareable round-trip：排除正文后仍语义等价。
    const shareTarget = mkdtempSync(join(tmpdir(), 'novel-i69-share-'));
    try {
      await new ProjectRepository(shareTarget).createProject({ projectId: 'demo', name: '可移植演示' });
      const shareService = createImportExportService(shareTarget);
      const restoredShare = await shareService.restore('demo', share.content);
      assert.equal(restoredShare.status, 'imported', 'shareable restore imports');
      const reShare = await shareService.exportArchive('demo', 'shareable-template');
      assert.ok(semanticallyEqual(parseArchive(share.content), parseArchive(reShare.content)), 'shareable round-trip semantically equal');
    } finally {
      rmSync(shareTarget, { recursive: true, force: true });
    }

    // 3) txt/md round-trip：导出文本重新进入 I37 导入预览（归一化幂等）。
    const txt = await source.exportText('demo', 'txt');
    const md = await source.exportText('demo', 'md');
    assert.ok(Object.keys(txt.files).every((name) => name.endsWith('.txt')), 'txt export only txt files');
    assert.ok(Object.keys(md.files).every((name) => name.endsWith('.md')), 'md export only md files');
    const one = txt.files[Object.keys(txt.files)[0]];
    const preview = await source.importPreview('demo', { fileName: 'chapter.txt', format: 'txt', text: one });
    assert.equal(preview.text, one.trim(), 'txt round-trip through I37 pipeline');
    assert.ok(preview.chunks.length > 0, 'import preview chunks produced');

    // 4) N-7 fail closed：非空作品恢复阻断且零写。
    const beforeBlocked = readFileSync(join(targetRoot, 'demo', 'outline.yaml'), 'utf8');
    const blocked = await target.restore('demo', full.content);
    assert.equal(blocked.status, 'blocked', 'non-empty restore blocks');
    assert.equal(blocked.reason, 'non-empty-project', 'blocked reason is N-7');
    assert.ok(blocked.layers.includes('text'), 'blocked layers list text');
    assert.equal(readFileSync(join(targetRoot, 'demo', 'outline.yaml'), 'utf8'), beforeBlocked, 'blocked restore is zero-write');

    // 5) 坏档案无半导入（校验先行）。
    const bad = full.content.replace('"version": 1', '"version": 9');
    const fresh = mkdtempSync(join(tmpdir(), 'novel-i69-fresh-'));
    try {
      await new ProjectRepository(fresh).createProject({ projectId: 'demo', name: '可移植演示' });
      const freshService = createImportExportService(fresh);
      const before = hashOf(join(fresh, 'demo', 'project.yaml'));
      await freshService.restore('demo', bad).then(() => fail('bad archive must be rejected'), () => undefined);
      assert.equal(hashOf(join(fresh, 'demo', 'project.yaml')), before, 'rejected archive writes nothing');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }

    // 6) 路径/secret 不进入 wire 载荷（负向扫描）。
    for (const payload of [full.content, share.content, JSON.stringify(await source.exportText('demo', 'md')), JSON.stringify(preview)]) {
      for (const forbidden of ['projectsRoot', 'credentialRef', 'apiKey', 'password', 'C:\\\\', '/home/']) {
        assert.ok(!payload.includes(forbidden), `wire payload must not contain ${forbidden}`);
      }
    }

    // 7) 可移植性既有回归：I39 冲突走 Gate 的 core 路径仍可用。
    const gateRoot = mkdtempSync(join(tmpdir(), 'novel-i69-gate-'));
    try {
      const gate = await ConfirmationGate.open(gateRoot);
      mkdirSync(join(gateRoot, 'text'), { recursive: true });
      writeFileSync(join(gateRoot, 'text', 'chapter.json'), 'conflict');
      const archive = await exportProject(dir);
      const proposal = await proposePortableImport(gate, 'i69-portable', archive, ['text/chapter.json']);
      const pending = await importProject(archive, gateRoot, { gate, proposalId: proposal.id });
      assert.equal(pending.status, 'pending', 'I39 conflict walks the Gate');
      await gate.accept(proposal.id);
      const imported = await importProject(archive, gateRoot, { gate, proposalId: proposal.id });
      assert.equal(imported.status, 'imported', 'I39 accepted import still works');
      void serializeArchive(archive);
    } finally {
      rmSync(gateRoot, { recursive: true, force: true });
    }

    console.log('I69 smoke: full/shareable/txt/md round-trip、N-7 非空 fail closed 零写、坏档案无半导入、路径/secret 不进 wire、I39 Gate 回归全部通过');
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
}
