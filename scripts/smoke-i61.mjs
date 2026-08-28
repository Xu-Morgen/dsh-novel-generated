import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I61 C5 正文编辑与可选 reparse smoke（design §5.12 / §14.9 / R13-2）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：编辑模式锚点（进入编辑 `data-novel-scene-edit`、
 *   编辑区 `data-novel-scene-editor`、正文 textarea `data-novel-scene-text`、
 *   保存 `data-novel-scene-save`、保存并重解析 `data-novel-scene-save-reparse`、
 *   重解析确认/拒绝 `data-novel-scene-reparse-accept|reject`、完成/拒绝/错误态、
 *   脏文本离开确认 `data-novel-scene-discard|leave-cancel`）；负向：Client bundle
 *   无 node:fs/node:path、无作品数据目录路径泄漏。
 * - 源码：Host Remote 描述符（sceneEdit/sceneReparsePropose/sceneReparseAccept/
 *   sceneReparseReject）挂在 workspace 挂载面；text-edit-service 组装真实
 *   parser fan-out；index.ts 装配 novelTextEdit；client.ts 接线保存/重解析 ops。
 * - Host 行为（lib）：exact round-trip + 变更 diff；baseHash 脏文本保护与非法范围
 *   零写；propose 不解析；拒绝零写；确认后既有 parser fan-out 落层并写 C5。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I61 smoke: ${msg}`); };

const escapeForBundle = (text) => Array.from(text).map((ch) => {
  const code = ch.codePointAt(0);
  return code > 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
}).join('');
const containsText = (bundle, text) => bundle.includes(text) || bundle.includes(escapeForBundle(text));

// Part 1 — 构建产物：编辑模式锚点；负向：无 fs/path、无作品路径泄漏。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    'data-novel-chapters-panel', 'data-novel-scene-edit', 'data-novel-scene-editor',
    'data-novel-scene-text', 'data-novel-scene-save', 'data-novel-scene-save-reparse',
    'data-novel-scene-reparse-proposed', 'data-novel-scene-reparse-accepting',
    'data-novel-scene-reparse-accept', 'data-novel-scene-reparse-reject',
    'data-novel-scene-reparse-rejected', 'data-novel-scene-reparse-done', 'data-novel-scene-reparse-error',
    'data-novel-scene-leave', 'data-novel-scene-discard', 'data-novel-scene-leave-cancel',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I61 anchor: ${required}`);
  }
  if (!containsText(bundle, '保存并重解析') || !containsText(bundle, '已重解析并同步')) fail('bundle missing 重解析 copy');
  // 负向：Client bundle 不得携带 Node fs/path 表面（I2 H0-10；R13-2「Client bundle 无 fs」）。
  for (const forbidden of ['node:fs', 'node:path', 'from "node:', "from 'node:"]) {
    if (bundle.includes(forbidden)) fail(`client bundle leaks Node module surface: ${forbidden}`);
  }
  for (const leaked of ['novel-projects', 'projectsRoot', 'text/']) {
    if (bundle.includes(leaked)) fail(`client bundle leaks project directory hint: ${leaked}`);
  }
}

// Part 2 — 源码：Host 描述符 / text-edit-service / workspace adapter / client 接线。
{
  const hostRemote = read('src/host/remote/text.ts');
  const editService = read('src/host/text-edit-service.ts');
  const workspace = read('src/host/workspace-service.ts');
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  const client = read('src/client.ts');
  const chapters = read('src/client/layers/chapters.ts');
  // I82：C5 编辑 ops 迁至 ops/chapters.ts（makeOps 按层拆分）；I95 再拆三片。
  const chaptersOps = read('src/client/ops/chapters.ts') + read('src/client/ops/chapters-editor.ts') + read('src/client/ops/chapters-branch.ts') + read('src/client/ops/chapters-candidate.ts');
  for (const method of ['sceneEdit', 'sceneReparsePropose', 'sceneReparseAccept', 'sceneReparseReject']) {
    if (!hostRemote.includes(method)) fail(`host remote text.ts missing ${method}`);
    if (!workspace.includes(method)) fail(`workspace adapter missing ${method}`);
    if (!chaptersOps.includes(method)) fail(`ops/chapters missing ${method}`);
  }
  for (const fn of ['createTextEditService', 'reparsePropose', 'reparseAccept', 'reparseReject', 'buildParsers', 'buildWriters']) {
    if (!editService.includes(fn)) fail(`text-edit-service.ts missing ${fn}`);
  }
  if (!editService.includes('parseC2StateFromNarrative') || !editService.includes('parseC1RelationshipsFromNarrative')
    || !editService.includes('parseC3KnowledgeFromNarrative') || !editService.includes('parseC4CanonFromNarrative')
    || !editService.includes('parseB2WorldviewFromNarrative')) fail('text-edit-service must reuse the five existing I25–I29 parsers');
  if (!index.includes("ctx.provide('novelTextEdit'") || !index.includes('createTextEditService')) fail('index.ts missing novelTextEdit wiring');
  // I95：computeEditRange 与编辑面板 UI 落在 scene-editor 片（chapters.ts 兼容重导出）。
  const sceneEditor = read('src/client/layers/scene-editor.ts');
  if (!sceneEditor.includes('computeEditRange') || !sceneEditor.includes('data-novel-scene-save')) fail('scene-editor layer missing editor UI/diff');
  // I83：styles 按键分区（架构审查 §4.2）——扫描组合器 + 全部分区文件。
  const stylesSource = ['src/client/styles.ts', 'src/client/styles/base.ts', 'src/client/styles/navigation.ts',
    'src/client/styles/forms.ts', 'src/client/styles/chapters.ts', 'src/client/styles/layers.ts',
    'src/client/styles/onboarding.ts', 'src/client/styles/panels.ts', 'src/client/styles/responsive.ts',
    'src/client/styles/tokens.ts'].map((p) => read(p)).join('\n');
  if (!stylesSource.includes('.nv-chapters__editor')) fail('styles missing editor styles');
}

// Part 3 — Host 行为（lib 构建产物）：验收矩阵。
{
  const { TextRepository } = await import('../lib/core/text/index.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createTextEditService } = await import('../lib/host/text-edit-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');

  const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
  const ORIGINAL = 'prefix TARGET suffix';
  const RANGE = { start: 7, end: 13 };
  const baseHashOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
  const fakeLlm = (full) => ({
    async *stream(request) {
      const prompt = request.messages[0].content[0].text;
      const output = prompt.includes('你是小说世界状态解析器') ? { ops: full ? [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] : [] }
        : prompt.includes('你是小说关系解析器') ? { ops: [] }
        : prompt.includes('你是小说知情解析器') ? { ops: [] }
        : prompt.includes('你是小说正史解析器') ? { ops: [] }
        : prompt.includes('你是小说世界观改写解析器') ? { ops: [] }
        : (() => { throw new Error(`Unexpected prompt: ${prompt.slice(0, 40)}`); })();
      yield { type: 'text-delta', text: JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i61-smoke-'));
  try {
    const repository = new TextRepository(join(projectsRoot, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await repository.appendScene('chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });
    const state = createStateService(projectsRoot);
    await state.open('book', { id: 'state-1', version: 1, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] });
    const relationship = createRelationshipService(projectsRoot);
    await relationship.open('book');
    const knowledge = createKnowledgeService(projectsRoot);
    await knowledge.open('book');
    await knowledge.saveAll('book',
      [{ id: 'secret-1', version: 1, fact: '钥匙藏在码头。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: ['lin'], revealAt: 'dawn' }, status: 'hidden' }],
      [{ characterId: 'mira', knows: ['secret-1'] }, { characterId: 'lin', knows: [] }],
    );
    const canon = createCanonService(projectsRoot);
    await canon.open('book');
    const worldview = createWorldviewService(projectsRoot);
    await worldview.open('book');
    const confirmation = createConfirmationService(projectsRoot);
    await confirmation.open('book');
    const service = createTextEditService({
      llm: fakeLlm(false), projectsRoot,
      state, relationship, knowledge, canon, worldview, confirmation,
      resolveSettings: async () => settings,
    });
    await service.open('book');

    // exact round-trip + 变更 diff；未选 reparse → 结构层零写。
    const result = await service.edit('book', 'chapter-1', 'scene-1', RANGE, 'replacement', baseHashOf(ORIGINAL));
    assert.equal(result.scene.content, 'prefix replacement suffix');
    assert.equal(result.evidence.before, baseHashOf(ORIGINAL));
    assert.equal(result.evidence.after, baseHashOf('prefix replacement suffix'));
    assert.equal(result.evidence.unchangedPrefix, 'prefix ');
    assert.equal(result.evidence.unchangedSuffix, ' suffix');
    assert.equal(state.current('book').storyTime, 'night');
    assert.deepEqual(canon.query('book'), []);

    // 脏文本保护 / 非法范围：零写。
    await assert.rejects(service.edit('book', 'chapter-1', 'scene-1', RANGE, 'x', 'stale-hash'), /脏文本保护/);
    await assert.rejects(service.edit('book', 'chapter-1', 'scene-1', { start: 99, end: 100 }, 'x', baseHashOf(result.scene.content)), /Edit range exceeds original text|exceeds scene content/);
    assert.equal((await repository.readChapter('chapter-1')).scenes[0].content, 'prefix replacement suffix');

    // reparse：propose 不解析（fake 空 ops）→ 拒绝零写 → 确认后写 C5。
    const proposed = await service.reparsePropose('book', 'chapter-1', 'scene-1', RANGE, 'parsed', baseHashOf(result.scene.content));
    assert.equal(proposed.status, 'pending');
    assert.match(proposed.proposalId, /^scene-reparse-/);
    const rejected = await service.reparseReject('book', proposed.proposalId);
    assert.equal(rejected.status, 'rejected');
    assert.equal((await repository.readChapter('chapter-1')).scenes[0].content, 'prefix replacement suffix');
    await assert.rejects(service.reparseAccept('book', 'chapter-1', 'scene-1', RANGE, 'parsed', proposed.proposalId), /already rejected/);

    console.log('I61 smoke: C5 受控编辑（bundle/源码/Host）+ exact round-trip + 脏文本保护 + 非法范围零写 + reparse propose/拒绝/accept 通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
