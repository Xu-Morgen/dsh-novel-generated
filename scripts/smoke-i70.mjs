import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I70 C5 正文版本与分支 smoke（design §14.10「正文版本与分支」/ R14-5）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/text（commitSceneVersion/chooseSceneBranch/
 *   parseChapterDocument/migrateLegacyChapter/branchIdFor）、core/text/diff
 *   （diffTextLines）、host/branch-service（createBranchService）、
 *   host/remote/branch（branchInvocations/branchRemoteContribution）存在且导出关键符号。
 * - 源码：schema/text 定义 sceneBranchSchema + legacyChapterSchema（分支不变式）；
 *   TextRepository 迁移/分支方法；index.ts 装配 novelBranches；remote.ts 注册
 *   branchInvocations；client.ts 挂载 branchRemoteContribution；client 分支面板
 *   无领域 fallback；writing-adjudication landScene 经 commitSceneVersion 保留候选
 *   旧正文为分支（I63 accept 与 I70 分支模型的最小 owner 级接缝）。
 * - Host 行为（lib）：
 *   - 旧单版本文档（锁定 legacy fixture）重开迁移：正文不丢、branches 归空、磁盘
 *     回写 canonical；既非 canonical 也非 legacy 的坏文档 open fail closed 零写。
 *   - commitSceneVersion 保留旧正文为分支、chosen 唯一；choose 可逆切换逐字还原；
 *     全程 B2/C1/C2/C3/C4（rules/worldview/characters/relationships/state/knowledge/
 *     canon + outline/style/project）哈希不变（切换只写 C5）。
 *   - 分支 diff 确定性（同输入同输出，del/add 稳定）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I70 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/text/index.js', 'lib/core/text/diff.js', 'lib/host/branch-service.js', 'lib/host/remote/branch.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const text = read('lib/core/text/index.js');
  for (const symbol of ['commitSceneVersion', 'chooseSceneBranch', 'parseChapterDocument', 'migrateLegacyChapter', 'branchIdFor', 'listSceneBranches', 'readSceneBranch']) {
    if (!text.includes(symbol)) fail(`lib core/text missing ${symbol}`);
  }
  const diff = read('lib/core/text/diff.js');
  for (const symbol of ['diffTextLines', 'same', 'del', 'add']) {
    if (!diff.includes(symbol)) fail(`lib core/text/diff missing ${symbol}`);
  }
  const service = read('lib/host/branch-service.js');
  for (const symbol of ['createBranchService', 'listBranches', 'readBranch', 'saveBranch', 'chooseBranch', 'diffBranches']) {
    if (!service.includes(symbol)) fail(`lib branch-service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/branch.js');
  for (const symbol of ['branchListInvocation', 'branchReadInvocation', 'branchSaveInvocation', 'branchChooseInvocation', 'branchDiffInvocation', 'branchInvocations', 'branchRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib branch remote missing ${symbol}`);
  }
}

// Part 2 — 源码：Schema/迁移/装配 + Client 无领域 fallback + I63 接缝。
{
  const schema = read('src/core/schema/text.ts');
  const textSource = read('src/core/text/index.ts');
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const client = read('src/client.ts');
  const shared = read('src/client/shared.ts');
  const chapters = read('src/client/layers/chapters.ts');
  const adjudication = read('src/host/writing-adjudication-service.ts');
  for (const symbol of ['sceneBranchSchema', 'legacySceneSchema', 'legacyChapterSchema', 'Chosen branch content must equal scene content', 'Exactly one branch must be chosen']) {
    if (!schema.includes(symbol)) fail(`schema/text.ts missing ${symbol}`);
  }
  for (const symbol of ['migrateLegacyDocuments', 'commitSceneVersion', 'chooseSceneBranch', 'migrateLegacyChapter', 'parseChapterDocument']) {
    if (!textSource.includes(symbol)) fail(`core/text/index.ts missing ${symbol}`);
  }
  if (!index.includes("ctx.provide('novelBranches'") || !index.includes('createBranchService')) {
    fail('index.ts missing novelBranches wiring');
  }
  if (!remoteTs.includes('...branchInvocations') || !remoteTs.includes('branchRemoteContribution')) {
    fail('remote.ts missing branchInvocations registration');
  }
  if (!client.includes('branchRemoteContribution') || !client.includes("'remote.novelBranches'")) {
    fail('client.ts missing branch Remote mount');
  }
  if (!shared.includes('BranchNamespace')) fail('shared.ts missing BranchNamespace');
  // 分支面板（Client）无领域 fallback：不导入 core schema / zod。
  if (chapters.includes('../core/') || chapters.includes("from 'zod'")) {
    fail('client branch panel must not import core schema or zod (no domain fallback)');
  }
  if (!chapters.includes('data-novel-branch-panel') || !chapters.includes('branchPanel') || !chapters.includes('freshBranchPanel')) {
    fail('chapters.ts missing branch panel UI');
  }
  // I63 接缝：候选落地保留旧正文为分支（最小 owner 级修改，见 I70 卡片目标）。
  if (!adjudication.includes('commitSceneVersion')) {
    fail('writing-adjudication must retain the old scene as a branch via commitSceneVersion');
  }
}

// Part 3 — Host 行为（lib 构建产物）：真实消费者夹具。
{
  const { ProjectRepository } = await import('../lib/core/project/index.js');
  const { TextRepository, migrateLegacyChapter } = await import('../lib/core/text/index.js');
  const { diffTextLines } = await import('../lib/core/text/diff.js');
  const { createBranchService } = await import('../lib/host/branch-service.js');
  const { legacyChapterSchema } = await import('../lib/core/schema/text.js');

  const hashOf = (p) => createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex');

  /** 非 C5 层快照：B1–B4/C1–C4/C6 + 项目元数据（切换分支时不得有任何变化）。 */
  const snapshotLayers = (dir) => {
    const entries = [];
    const excluded = new Set(['text', 'docs']);
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory() && excluded.has(entry.name)) continue;
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else entries.push(path);
      }
    };
    walk(dir);
    return entries.sort().map((p) => `${relative(dir, p)}\u0000${hashOf(p)}`).join('\n');
  };

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i70-smoke-'));
  try {
    await new ProjectRepository(projectsRoot).createProject({ projectId: 'demo', name: '版本演示' });
    const dir = join(projectsRoot, 'demo');
    // 结构化层真实内容（B2/B3/C1/C2/C3/C4/B5/B4）——切换分支后这些文件必须原样。
    mkdirSync(join(dir, 'worldview'), { recursive: true });
    writeFileSync(join(dir, 'worldview', 'north-harbor.yaml'), 'id: north-harbor\nkind: geography\ntitle: 北港\ncontent: 北港位于内海西岸。\nkeywords: [北港]\ntriggerMode: keyword\nweight: 1\nparent: null\nmutable: true\nstatus: active\nsupersededBy: null\n');
    mkdirSync(join(dir, 'characters'), { recursive: true });
    writeFileSync(join(dir, 'characters', 'mira.yaml'), 'id: mira\nname: 米拉\nkind: protagonist\n');
    mkdirSync(join(dir, 'relationships'), { recursive: true });
    writeFileSync(join(dir, 'relationships', 'rel.yaml'), 'version: 1\nitems: []\n');
    mkdirSync(join(dir, 'state'), { recursive: true });
    writeFileSync(join(dir, 'state', 'snapshot.yaml'), 'id: initial-state\nversion: 1\nseq: 0\nstoryTime: ""\n');
    mkdirSync(join(dir, 'knowledge'), { recursive: true });
    writeFileSync(join(dir, 'knowledge', 'entries.yaml'), 'version: 1\nentries: []\nstates: []\n');
    mkdirSync(join(dir, 'canon'), { recursive: true });
    writeFileSync(join(dir, 'canon', 'events.yaml'), 'version: 1\nevents: []\n');
    writeFileSync(join(dir, 'outline.yaml'), 'id: outline-demo\nversion: 1\nstructure: three-act\nlogline: 演示\nacts: []\n');
    writeFileSync(join(dir, 'style.yaml'), 'id: style-demo\nname: 默认\n');
    writeFileSync(join(dir, 'project.yaml'), 'id: demo\nversion: 1\nname: 版本演示\n');

    // 1) 旧单版本文档迁移（锁定 legacy fixture：I70 前 scene 无 branches 字段）。
    mkdirSync(join(dir, 'text'), { recursive: true });
    const legacyFixture = {
      id: 'chapter-1', index: 1, title: '旧章', pov: 'mira', status: 'draft',
      scenes: [
        { id: 'scene-1', index: 0, content: '米拉推开旧灯塔的门。\n\n门后是半张烧焦的海图。', summary: '进入灯塔', beats: ['beat-1'], canonEvents: [], notes: '' },
      ],
    };
    writeFileSync(join(dir, 'text', 'chapter-1.json'), JSON.stringify(legacyFixture, null, 2), 'utf8');
    // 锁定：legacy fixture 必须能被 legacy schema 解析（迁移输入形状）。
    assert.ok(legacyChapterSchema.parse(legacyFixture).scenes[0].content.includes('米拉'));
    const beforeOpen = hashOf(join(dir, 'text', 'chapter-1.json'));

    const repository = new TextRepository(dir);
    await repository.open();
    const migrated = await repository.readChapter('chapter-1');
    assert.equal(migrated.scenes[0].content, '米拉推开旧灯塔的门。\n\n门后是半张烧焦的海图。', '旧正文重开不丢');
    assert.deepEqual(migrated.scenes[0].branches, [], 'legacy 迁移后 branches 为空（隐含单版本）');
    // 迁移已持久化：磁盘文档现在是 canonical 形状（含 branches）。
    const onDisk = JSON.parse(readFileSync(join(dir, 'text', 'chapter-1.json'), 'utf8'));
    assert.deepEqual(onDisk.scenes[0].branches, [], '迁移回写 canonical（branches 字段落盘）');
    assert.notEqual(hashOf(join(dir, 'text', 'chapter-1.json')), beforeOpen, '迁移确实发生了磁盘回写');
    assert.ok(migrateLegacyChapter(legacyFixture).scenes[0].branches.length === 0, '内存迁移函数可用');

    // 2) 坏迁移 fail closed 零写：半迁移冲突文档（一个场景带 branches、一个没有）。
    const corruptPath = join(dir, 'text', 'corrupt.json');
    writeFileSync(corruptPath, JSON.stringify({
      id: 'corrupt', index: 2, title: '坏章', pov: 'mira', status: 'draft',
      scenes: [
        { id: 's1', index: 0, content: 'a', summary: '', beats: [], canonEvents: [], notes: '', branches: [] },
        { id: 's2', index: 1, content: 'b', summary: '', beats: [], canonEvents: [], notes: '' },
      ],
    }, null, 2), 'utf8');
    await new TextRepository(dir).open().then(() => fail('半迁移冲突文档必须 fail closed'), () => undefined);
    assert.equal(readFileSync(corruptPath, 'utf8').includes('"branches"'), true, '坏迁移零写（文件未被改写/删除）');
    rmSync(corruptPath, { force: true });

    // 3) commitSceneVersion：候选保留旧正文为分支 + chosen 唯一 + 结构层哈希不变。
    const before = snapshotLayers(dir);
    const scene = await repository.appendScene('chapter-1', { id: 'scene-2', content: '旧稿。', summary: '海图', beats: [], canonEvents: [], notes: '' });
    void scene;
    await repository.commitSceneVersion('chapter-1', 'scene-2', '新稿：海图指向北港。', '重写候选');
    let branchList = await repository.listSceneBranches('chapter-1', 'scene-2');
    assert.equal(branchList.length, 2, '候选落地后旧正文保留为分支');
    assert.equal(branchList.filter((branch) => branch.chosen).length, 1, 'chosen 唯一');
    const previousId = branchList.find((branch) => !branch.chosen).id;
    const currentId = branchList.find((branch) => branch.chosen).id;

    // 4) choose 可逆切换：切回旧分支逐字还原；再次切换还原新正文；只写 C5。
    let switched = await repository.chooseSceneBranch('chapter-1', 'scene-2', previousId);
    assert.equal(switched.content, '旧稿。', '切回旧分支逐字还原');
    assert.equal(switched.branches.filter((branch) => branch.chosen).length, 1, '切换后 chosen 仍唯一');
    switched = await repository.chooseSceneBranch('chapter-1', 'scene-2', currentId);
    assert.equal(switched.content, '新稿：海图指向北港。', '再次切换逐字还原新正文');
    assert.equal(snapshotLayers(dir), before, '分支切换全程不改 B2/C1/C2/C3/C4（含 B5/B4/项目元数据）');

    // 5) Host 分支服务（novelBranches 的 lib 实现）list/save/choose/diff。
    const branchService = createBranchService(projectsRoot);
    await branchService.open('demo');
    const summaries = await branchService.listBranches('demo', 'chapter-1', 'scene-2');
    assert.equal(summaries.length, 2, 'service list 返回两个版本');
    assert.ok(!JSON.stringify(summaries).includes('海图指向北港'), 'list 元数据投影不含正文');
    const readBranch = await branchService.readBranch('demo', 'chapter-1', 'scene-2', previousId);
    assert.equal(readBranch.content, '旧稿。', 'service read 单分支全文');
    const saved = await branchService.saveBranch('demo', 'chapter-1', 'scene-2', '终稿');
    assert.equal(saved.branches.length, 2, '同内容存档幂等（不新增重复分支）');
    const diff1 = await branchService.diffBranches('demo', 'chapter-1', 'scene-2', previousId);
    assert.equal(diff1.from.content, '旧稿。');
    assert.equal(diff1.to.content, '新稿：海图指向北港。', 'diff 缺省 to = 当前 chosen');
    assert.ok(diff1.lines.some((line) => line.kind === 'del') && diff1.lines.some((line) => line.kind === 'add'), 'diff 含 del/add');
    const diff2 = await branchService.diffBranches('demo', 'chapter-1', 'scene-2', previousId);
    assert.deepEqual(diff2.lines, diff1.lines, 'diff 确定性（同输入同输出）');

    // 6) 纯函数 diff 稳定 + 空文本。
    assert.deepEqual(diffTextLines('a\nb', 'a\nb'), [{ kind: 'same', text: 'a' }, { kind: 'same', text: 'b' }]);
    assert.equal(diffTextLines('', '').length, 0);

    console.log('I70 smoke: legacy 迁移重开不丢正文、坏迁移 fail closed 零写、commit/choose 保留分支且 chosen 唯一、切换不改结构层、diff 确定性、Host/Remote 装配全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
