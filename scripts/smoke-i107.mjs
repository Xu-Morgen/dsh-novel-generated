import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnCaptured } from './spawn-captured.mjs';

/** I107 章节区四种互斥操作模式（R18-9）Client 消费者夹具与静态边界。 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I107 smoke: ${message}`); };

const layer = read('src/client/layers/chapters.ts');
for (const mode of ['writing', 'candidate', 'versions', 'materials']) {
  if (!layer.includes(`id: '${mode}'`)) fail(`章节模式缺少 ${mode}`);
}
for (const token of ['readonly mode: ChaptersMode', 'navigationRevision', 'role: \'tablist\'', 'role: \'tabpanel\'', 'data-novel-chapter-mode-panel']) {
  if (!layer.includes(token)) fail(`章节模式状态/可访问性锚点缺少: ${token}`);
}
if ((layer.match(/data-novel-chapter-mode-panel/g) ?? []).length !== 1) fail('模式容器不是单一 tabpanel 锚点');

const store = read('src/client/store/index.ts');
for (const token of ['freshCandidatePanel()', 'freshBranchPanel()', 'navigationRevision: d.chapters.navigationRevision + 1', 'chaptersCandidateForRevision', 'chaptersMode']) {
  if (!store.includes(token)) fail(`store 缺少模式隔离/导航世代实现: ${token}`);
}

const editor = read('src/client/ops/chapters-editor.ts');
if (editor.includes('internal.branchesLoad(')) fail('场景装载仍自动请求版本列表，隐藏 versions 面板不能保证零请求');
const composition = read('src/client/ops/chapters.ts');
for (const token of ['const setMode', "mode === 'versions'", "mode === 'materials'", 'chaptersMode']) {
  if (!composition.includes(token)) fail(`模式激活接线缺少: ${token}`);
}

const candidate = read('src/client/ops/chapters-candidate.ts');
if (!candidate.includes('candidatePatchForRevision') || !candidate.includes('navigationRevision')) fail('候选异步结果缺少导航世代保护');
const styles = read('src/client/styles/chapters.ts');
if (!styles.includes('.nv-chapters__modes') || !styles.includes('.nv-chapters__mode-panel')) fail('章节模式样式缺少 tab/tabpanel 语义');

const fixture = read('src/client-chapters.test.ts');
if (!fixture.includes('I107 章节区四种模式互斥')) fail('缺少 Client harness 模式消费者夹具');
const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/client-chapters.test.ts'], {
  cwd: repoRoot,
  env: { ...process.env, TMPDIR: '/tmp' },
});
if (focused.status !== 0) fail(`章节 Client 消费者夹具失败 (exit ${focused.status}):\n${focused.output.slice(0, 5000)}`);

const artifact = {
  iteration: 'I107',
  requirement: 'R18-9',
  modes: ['writing', 'candidate', 'versions', 'materials'],
  canonicalOwner: 'ChaptersLayerState.mode',
  clientAnchors: ['data-novel-chapter-modes', 'data-novel-chapter-mode', 'data-novel-chapter-mode-panel', 'data-novel-chapter-mode-badge'],
  guarantees: ['single-visible-panel', 'hidden-panel-zero-remote-read', 'navigation-revision-drops-stale-candidate', 'draft-preserved-across-mode-switch', 'arrow-home-end-keyboard-navigation'],
  focusedSuites: 'src/client-chapters.test.ts passed',
  explicitNonGoals: ['new-WorkbenchViewId', 'Host-contract-change', 'new-panel-content', 'candidate-or-branch-contract-change'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i107-chapter-modes.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log('I107 smoke: four mutually exclusive chapter modes, lazy reads, stale-candidate guard and Client harness fixture passed');
