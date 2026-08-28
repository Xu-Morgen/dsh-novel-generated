import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I95 大文件拆分 smoke（review v2.0 §4 / 计划 §18 I95）。
 *
 * 交付物核验：
 * - 目标文件行数护栏：chapters.ts / ops/chapters.ts / onboarding.ts /
 *   test-harness.ts 拆分后均显著低于原行数（护栏上限）；巨型测试文件按面板
 *   拆分后单文件 ≤ 400 行，原三文件删除；
 * - 切片落位：layers 四片（scene-editor/candidate/branch/chapters-shared）、
 *   ops 三片（chapters-editor/chapters-branch/chapters-candidate）、onboarding
 *   两片（types/panels）、test-harness 四片（remote-builders/dom-helpers/
 *   onboarding-fixtures/types）全部存在；
 * - 复制源归零：sceneEditorPanel/candidatePanel/branchPanel/onboardingReview/
 *   mount 各单份定义（每文件至多一次）；
 * - 行为等价：全部 Client 测试文件（含拆分后 22 个新文件）全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I95 smoke: ${msg}`); };
const lines = (p) => read(p).split('\n').length;

// Part 1 — 行数护栏。
const guards = [
  ['src/client/layers/chapters.ts', 250],
  ['src/client/layers/scene-editor.ts', 220],
  ['src/client/layers/candidate.ts', 250],
  ['src/client/layers/branch.ts', 200],
  ['src/client/layers/chapters-shared.ts', 60],
  ['src/client/ops/chapters.ts', 120],
  ['src/client/ops/chapters-editor.ts', 260],
  ['src/client/ops/chapters-branch.ts', 160],
  ['src/client/ops/chapters-candidate.ts', 180],
  ['src/client/onboarding.ts', 220],
  ['src/client/onboarding-types.ts', 160],
  ['src/client/onboarding-panels.ts', 420],
  ['src/client/test-harness.ts', 400],
];
for (const [file, limit] of guards) {
  if (!existsSync(resolve(repoRoot, file))) fail(`${file} 不存在`);
  const count = lines(file);
  if (count > limit) fail(`${file} 行数护栏失败：${count} 行（应 ≤ ${limit}）`);
}

// Part 2 — 巨型测试文件按面板拆分：原文件删除、单文件护栏、describe 总数。
for (const file of ['src/client-panels.test.ts', 'src/client-shell.test.ts', 'src/client-onboarding.test.ts']) {
  if (existsSync(resolve(repoRoot, file))) fail(`${file} 应按面板拆分删除`);
}
const testFiles = readdirSync(resolve(repoRoot, 'src'))
  .filter((file) => /^client-(panels|shell|onboarding)-.*\.test\.ts$/.test(file));
if (testFiles.length !== 22) fail(`按面板拆分应产出 22 个测试文件，实际 ${testFiles.length}`);
let describes = 0;
for (const file of testFiles) {
  const path = `src/${file}`;
  if (lines(path) > 400) fail(`${path} 超过单文件护栏（400 行）`);
  describes += (read(path).match(/^describe\(/gm) ?? []).length;
}
if (describes !== 22) fail(`拆分后 describe 总数应为 22（原三文件），实际 ${describes}`);

// Part 3 — 切片落位 + 复制源归零。
const slices = [
  'src/client/layers/scene-editor.ts', 'src/client/layers/candidate.ts', 'src/client/layers/branch.ts', 'src/client/layers/chapters-shared.ts',
  'src/client/ops/chapters-editor.ts', 'src/client/ops/chapters-branch.ts', 'src/client/ops/chapters-candidate.ts',
  'src/client/onboarding-types.ts', 'src/client/onboarding-panels.ts',
  'src/client/test-harness/remote-builders.ts', 'src/client/test-harness/dom-helpers.ts', 'src/client/test-harness/onboarding-fixtures.ts', 'src/client/test-harness/types.ts',
];
for (const file of slices) {
  if (!existsSync(resolve(repoRoot, file))) fail(`切片缺失：${file}`);
}
for (const fn of ['function sceneEditorPanel', 'function candidatePanel', 'function branchPanel', 'function onboardingReview', 'function mount(']) {
  const files = slices.filter((file) => read(file).includes(fn));
  const also = ['src/client/test-harness.ts', 'src/client/layers/chapters.ts'].filter((file) => read(file).includes(fn));
  if (files.length + also.length !== 1) fail(`复制源未归零：${fn} 出现 ${files.length + also.length} 次`);
}
const chaptersIndex = read('src/client/layers/chapters.ts');
for (const symbol of ['ChaptersEditOps', 'chaptersPanel', 'freshChapters', 'ChapterListItemShape']) {
  if (!chaptersIndex.includes(symbol)) fail(`layers/chapters.ts 未保留组合根符号 ${symbol}`);
}

// Part 4 — 行为等价：全部 Client 测试全绿。
const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', ...testFiles.map((file) => `src/${file}`), 'src/client-chapters.test.ts', 'src/client-contract.test.ts', 'src/client-layers.test.ts', 'src/client-project.test.ts', 'src/client-shape-contract.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`Client 测试未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2500)}`);

console.log(`I95 smoke: 行数护栏全过；巨型测试按面板拆为 ${testFiles.length} 文件（describe ${describes}）；复制源归零；Client 测试全绿`);
