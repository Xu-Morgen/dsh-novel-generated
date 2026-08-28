import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I94 TextRepository 拆分与镜像 outbox 语义 smoke（review v2.0 §8#7 / 计划
 * §18 I94）。
 *
 * 交付物核验：
 * - 四职拆分落位：src/core/text/ 下 codec.ts（codec/迁移）、repository.ts
 *   （仓储 + 编辑分支策略）、write-queue.ts（写入队列 + 镜像 outbox）、index.ts
 *   （兼容导出）（grep 断言各文件存在且 index 重导出全部符号）；
 * - 镜像 outbox 语义：write-queue 的 commitChapter 中镜像失败进 pending 且
 *   不抛错（grep 断言），repository 暴露 pendingMirrors/flushPendingMirrors；
 * - 复制源归零：codec 纯函数在 repository/write-queue 中不再被重新实现；
 * - 行为等价：C5 读写/编辑/分支相关测试 + I94 负向用例全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I94 smoke: ${msg}`); };

const textDir = resolve(repoRoot, 'src/core/text');
const files = readdirSync(textDir).filter((f) => f.endsWith('.ts'));
for (const expected of ['codec.ts', 'repository.ts', 'write-queue.ts', 'index.ts']) {
  if (!files.includes(expected)) fail(`src/core/text/${expected} 不存在（拆分未落位）`);
}

const index = read('src/core/text/index.ts');
for (const symbol of ['renderChapterMarkdown', 'branchIdFor', 'migrateLegacyChapter', 'parseChapterDocument', 'TextRepository', 'ChapterWriteQueue', 'TextRange']) {
  if (!index.includes(symbol)) fail(`index.ts 未兼容重导出 ${symbol}`);
}

const codec = read('src/core/text/codec.ts');
const repository = read('src/core/text/repository.ts');
const queue = read('src/core/text/write-queue.ts');
if (codec.includes('node:fs')) fail('codec.ts 不应有文件系统副作用');
for (const copySource of ['function renderChapterMarkdown', 'function branchIdFor', 'function migrateLegacyChapter', 'function parseChapterDocument']) {
  if (repository.includes(copySource) || queue.includes(copySource)) {
    fail(`复制源 ${copySource} 仍存在于 ${repository.includes(copySource) ? 'repository.ts' : 'write-queue.ts'}`);
  }
}
if (!/镜像失败不谎报/.test(queue) || !/this\.pending\.push\(/.test(queue)) fail('write-queue 缺少镜像 outbox 记录（失败不抛错）');
if (!/pendingMirrors\(\)/.test(repository) || !/flushPendingMirrors\(\)/.test(repository)) fail('TextRepository 未显式暴露 outbox');

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/c5-read.test.ts', 'src/c5-edit.test.ts', 'src/text-edit-service.test.ts', 'src/host/branch-service.test.ts', 'src/host/edit-service.test.ts', 'src/host/text-service.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`C5/编辑相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I94 smoke: text 四职拆分（codec/repository/write-queue/index 兼容导出）+ 镜像 outbox 不谎报 + 复制源归零 + C5 行为等价单测全绿');
