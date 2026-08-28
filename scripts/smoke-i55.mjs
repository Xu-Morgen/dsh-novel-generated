import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I55 作品上下文栏与项目切换 smoke（design §14.8 / R12-2）。
 *
 * 交付物核验（构建产物 + 样式源码的确定性标记）：
 * - 作品上下文栏：当前作品名持续可见 + 返回作品列表（切换）入口。
 * - 脏表单离开裁决：非模态确认条（离开并放弃 / 取消）。
 * - 切换：browse 保留当前作品，open 成功才 resetEditors，失败停在列表并可取消返回原作品。
 * - Host `projectOpen` 复核：Client 每次 open/切换仍经 `novelWorkspace.projectOpen`
 *   重新验证（不建立进程级全局 current project，见设计 §14.7.1）。
 *
 * 注意：两作品往返零串写 / 失败 open 保持原作品 / 脏表单裁决的行为级断言在
 * `src/client.test.ts`（fake-runtime harness）完成；本 smoke 只做 bundle 正/负向扫描。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const fail = (msg) => { throw new Error(`I55 smoke: ${msg}`); };

// Part 1 — 构建产物：作品上下文栏 + 返回/切换 + 脏表单裁决 + 可恢复失败。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    // 作品上下文栏：持续可见的作品名 + 返回作品列表入口。
    'data-novel-project-context', 'data-novel-project-context-name', 'data-novel-back-to-projects',
    // 脏表单离开裁决确认条。
    'data-novel-leave-confirm', 'data-novel-leave-discard', 'data-novel-leave-cancel',
    // 切换：browse 保留当前作品 + 可取消返回 + 可恢复失败。
    'data-novel-project-browsing', 'data-novel-browse-cancel', 'data-novel-project-error',
    // 打开/切换仍经 Host projectOpen 复核（禁止进程级全局 current project）。
    '.projectOpen(',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I55 marker: ${required}`);
  }
  // 旧「open 失败 brick 成整屏错误」路径必须退休（I55 改为可恢复 projectFailed）。
  if (bundle.includes("fail('作品打开失败')")) {
    fail('bundle still bricks the whole workbench on open failure (I55 requires recoverable projectFailed)');
  }
}

// Part 2 — 样式源码：上下文栏 / 确认条 / 分栏结构样式存在。
{
  // I83：styles 按键分区（架构审查 §4.2）——扫描组合器 + 全部分区文件。
  const styles = ['src/client/styles.ts', 'src/client/styles/base.ts', 'src/client/styles/navigation.ts',
    'src/client/styles/forms.ts', 'src/client/styles/chapters.ts', 'src/client/styles/layers.ts',
    'src/client/styles/onboarding.ts', 'src/client/styles/panels.ts', 'src/client/styles/responsive.ts',
    'src/client/styles/tokens.ts'].map((p) => readFileSync(resolve(repoRoot, p), 'utf8')).join('\n');
  for (const required of [
    '.nv-workbench__project-context', '.nv-workbench__project-context-name',
    '.nv-workbench__project-context-back', '.nv-workbench__leave-confirm',
    '.nv-workbench__body-row', '.nv-workbench__project-error',
  ]) {
    if (!styles.includes(required)) fail(`styles missing I55 class: ${required}`);
  }
}

console.log('I55 smoke: 作品上下文栏 + 返回/切换 + 脏表单裁决 + 可恢复失败（bundle 正/负向扫描）通过');
