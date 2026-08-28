import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I60 C5 章节/场景读取与导航 smoke（design §5.12 / §14.9 / R13-1）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：正文视图的三栏锚点（章节树 `data-novel-chapter-tree` /
 *   章节项 `data-novel-chapter-item`、场景列表 `data-novel-chapter-scenes` /
 *   场景项 `data-novel-scene-item`、正文 `data-novel-scene-body`、空态
 *   `data-novel-chapters-empty`、错误态 `data-novel-chapters-error` / 重试
 *   `data-novel-chapters-retry`）与 C5 徽标；负向：Client bundle 无 node:fs/node:path、
 *   无作品数据目录路径泄漏。
 * - 源码（src/client/nav.ts + layers/chapters.ts + styles.ts + client.ts）：正文视图
 *   注册、面板渲染与三栏样式存在；Host Remote 描述符（chapterList/chapterRead/sceneRead）
 *   挂载在 workspace 挂载面。
 * - Host 行为（lib）：多章顺序（按 index 而非文件名）、空章、未知引用、跨项目拒绝、
 *   重开一致、只返回最小 owned JSON、docs/ 派生镜像语义不变。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I60 smoke: ${msg}`); };

/**
 * esbuild 默认 ascii charset 会把 CJK 输出为 `\uXXXX`（大写十六进制），因此
 * 对 bundle 的 CJK 断言同时检查原始与转义两种形态。
 */
const escapeForBundle = (text) => Array.from(text).map((ch) => {
  const code = ch.codePointAt(0);
  return code > 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
}).join('');
const containsText = (bundle, text) => bundle.includes(text) || bundle.includes(escapeForBundle(text));

// Part 1 — 构建产物：正文视图三栏锚点 + C5 徽标；负向：无 fs/path、无路径泄漏。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    'data-novel-chapters-panel', 'data-novel-chapter-tree', 'data-novel-chapter-item',
    'data-novel-chapter-scenes', 'data-novel-scene-item', 'data-novel-scene-body',
    'data-novel-chapters-empty', 'data-novel-chapters-error', 'data-novel-chapters-retry',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I60 anchor: ${required}`);
  }
  if (!containsText(bundle, '正文') || !containsText(bundle, '场景')) fail('bundle missing 正文/场景 copy');
  // 负向：Client bundle 不得携带 Node fs/path 表面（I2 H0-10；R13-1「Client bundle 无 fs」）。
  for (const forbidden of ['node:fs', 'node:path', 'from "node:', "from 'node:"]) {
    if (bundle.includes(forbidden)) fail(`client bundle leaks Node module surface: ${forbidden}`);
  }
  // 负向：Client bundle 不得泄漏作品数据目录路径（I2 H0-10；R13-1「不暴露文件路径」）。
  // `~/.dsh/novel-settings/workbench-settings.yaml` 是 I59 既有的用户可读设置提示，
  // 不是作品数据路径，不在此扫描范围。
  for (const leaked of ['novel-projects', 'projectsRoot', 'text/']) {
    if (bundle.includes(leaked)) fail(`client bundle leaks project directory hint: ${leaked}`);
  }
}

// Part 2 — 源码：正文视图注册 / 面板 / 样式 / Host 描述符。
{
  const nav = read('src/client/nav.ts');
  const chapters = read('src/client/layers/chapters.ts');
  // I83：styles 按键分区（架构审查 §4.2）——扫描组合器 + 全部分区文件。
  const styles = ['src/client/styles.ts', 'src/client/styles/base.ts', 'src/client/styles/navigation.ts',
    'src/client/styles/forms.ts', 'src/client/styles/chapters.ts', 'src/client/styles/layers.ts',
    'src/client/styles/onboarding.ts', 'src/client/styles/panels.ts', 'src/client/styles/responsive.ts',
    'src/client/styles/tokens.ts'].map((p) => read(p)).join('\n');
  const client = read('src/client.ts');
  const panels = read('src/client/panels/index.ts');
  const hostRemote = read('src/host/remote/text.ts');
  if (!nav.includes("view: 'chapters'")) fail('nav model missing chapters view');
  if (!nav.includes("badge: 'C5'")) fail('nav model missing C5 badge');
  for (const fn of ['chaptersPanel', 'freshChapters', 'proseParagraphs']) {
    if (!chapters.includes(`function ${fn}`)) fail(`chapters layer missing ${fn}`);
  }
  for (const cls of ['.nv-chapters', '.nv-chapters__pane', '.nv-chapters__prose', '.nv-chapters__empty']) {
    if (!styles.includes(cls)) fail(`styles missing ${cls}`);
  }
  // I83：正文视图分发迁至面板注册表（PANEL_REGISTRY chapters 条目）。
  if (!panels.includes('chapters:') || !panels.includes('chaptersPanel(')) fail('panels registry missing chapters view dispatch');
  // I82：正文 ops 迁至 ops/chapters.ts（makeOps 按层拆分），结构断言按新布局维护。
  const chaptersOps = read('src/client/ops/chapters.ts');
  if (!chaptersOps.includes("chaptersRead('ready'")) fail('ops/chapters.ts missing chapters read ops');
  for (const method of ['chapterList', 'chapterRead', 'sceneRead']) {
    if (!hostRemote.includes(method)) fail(`host remote text.ts missing ${method}`);
    if (!read('src/host/workspace-service.ts').includes(method)) fail(`workspace adapter missing ${method}`);
  }
}

// Part 3 — Host 行为（lib 构建产物）：验收矩阵。
{
  const { TextRepository } = await import('../lib/core/text/index.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createWorkspaceEditorService } = await import('../lib/remote.js');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i60-smoke-'));
  try {
    const dummy = { list: async () => [], read: async () => ({}), create: async () => ({}), update: async () => ({}) };
    const makeService = () => createWorkspaceEditorService(dummy, dummy, dummy, dummy, dummy, dummy, dummy, dummy, dummy, createTextService(projectsRoot), dummy);
    const repositoryOf = async (projectId) => {
      const repository = new TextRepository(join(projectsRoot, projectId));
      await repository.open();
      return repository;
    };
    const scene = (id, content, summary = `${id} summary`) => ({ id, content, summary, beats: [`beat-${id}`], canonEvents: [], notes: '' });

    // 多章顺序：index 乱序落盘，chapterList 仍按 index 升序；最小 JSON 无正文。
    const repository = await repositoryOf('book');
    await repository.createChapter({ id: 'chapter-c', index: 3, title: '终章', pov: 'lin', status: 'draft' });
    await repository.createChapter({ id: 'chapter-a', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.createChapter({ id: 'chapter-b', index: 2, title: '第二章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-a', scene('scene-1', '第一章正文'));
    await repository.appendScene('chapter-a', scene('scene-2', '第二章场景正文'));
    // 空章：chapter-c 无场景。
    const service = makeService();
    const list = await service.chapterList('book');
    assert.deepEqual(list.map((item) => [item.id, item.index, item.sceneCount]), [
      ['chapter-a', 1, 2], ['chapter-b', 2, 0], ['chapter-c', 3, 0],
    ]);
    assert.ok(!JSON.stringify(list).includes('第一章正文'), 'chapterList must not carry content');

    // 最小 owned JSON：chapterRead 只含摘要；sceneRead 才带正文。
    const readResult = await service.chapterRead('book', 'chapter-a');
    assert.deepEqual(readResult.scenes, [
      { id: 'scene-1', index: 0, summary: 'scene-1 summary' },
      { id: 'scene-2', index: 1, summary: 'scene-2 summary' },
    ]);
    assert.ok(!JSON.stringify(readResult).includes('第一章正文'), 'chapterRead must not carry content');
    const sceneRead = await service.sceneRead('book', 'chapter-a', 'scene-2');
    assert.equal(sceneRead.chapter.title, '第一章');
    assert.equal(sceneRead.scene.content, '第二章场景正文');

    // 空章读取：场景列表为空。
    const emptyRead = await service.chapterRead('book', 'chapter-c');
    assert.deepEqual(emptyRead.scenes, []);

    // 未知引用：未知章节/场景显式失败。
    await assert.rejects(service.chapterRead('book', 'chapter-ghost'), /Unknown chapter: chapter-ghost/);
    await assert.rejects(service.sceneRead('book', 'chapter-a', 'scene-ghost'), /Unknown scene: scene-ghost/);
    await assert.rejects(service.chapterRead('book', '../escape'), /Invalid project ID/);

    // 跨项目拒绝：项目 B 读项目 A 的章节/场景必然失败，互不串读。
    await service.chapterList('book-b'); // open book-b（空）
    await assert.rejects(service.chapterRead('book-b', 'chapter-a'), /Unknown chapter: chapter-a/);
    await assert.rejects(service.sceneRead('book-b', 'chapter-a', 'scene-1'), /Unknown chapter/);

    // 重开一致：全新 service 实例读取与首次一致。
    const reopened = makeService();
    assert.deepEqual(await reopened.chapterList('book'), list);
    assert.deepEqual(await reopened.sceneRead('book', 'chapter-a', 'scene-1'), await service.sceneRead('book', 'chapter-a', 'scene-1'));

    // docs/ 派生镜像语义不变：写入仍同步渲染 docs/<id>.md，只读 Remote 不影响镜像。
    const mirrorPath = join(projectsRoot, 'book', 'docs', 'chapter-a.md');
    assert.ok(existsSync(mirrorPath), 'docs mirror must exist after chapter writes');
    const mirror = readFileSync(mirrorPath, 'utf8');
    assert.ok(mirror.includes('# 第一章'), 'docs mirror keeps chapter heading semantics');
    await service.chapterList('book');
    await service.chapterRead('book', 'chapter-a');
    await service.sceneRead('book', 'chapter-a', 'scene-1');
    assert.equal(readFileSync(mirrorPath, 'utf8'), mirror, 'reads must not rewrite the docs mirror');

    console.log('I60 smoke: C5 只读 Remote（bundle/源码/Host）+ 多章顺序 + 空章 + 未知引用 + 跨项目拒绝 + 重开一致 + 最小 owned JSON + docs 镜像不变 通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
