/**
 * I78 「可入 client 图的 core 纯模块白名单」单一来源（design §14.12；架构审查
 * §8#5 / R16-5）。允许进入 Client bundle 的 `src/core/**` 模块显式列于此，并受
 * 构建扫描约束（`scripts/scan-client-core-whitelist.mjs` 以 esbuild metafile 实测
 * client 图）：白名单外 core 引用失败、白名单条目未被图使用也失败。
 *
 * 白名单语义：只允许纯 schema/纯函数叶子模块（无 node 内置模块、无领域运行时
 * 副作用）入图 —— 它们只承载 wire/形状契约，Client 不拥有领域真相；core 其余
 * 模块（repository、node:fs 依赖、Host 编排）一律禁止入图。
 */
export const CLIENT_CORE_WHITELIST: readonly string[] = [
  'src/core/knowledge/actions.ts',
  'src/core/queue/schema.ts',
  'src/core/review/issue.ts',
  'src/core/schema/base.ts',
  'src/core/schema/canon.ts',
  'src/core/schema/characters.ts',
  'src/core/schema/confirm.ts',
  'src/core/schema/inspiration.ts',
  'src/core/schema/knowledge.ts',
  'src/core/schema/llm-config.ts',
  'src/core/schema/onboarding.ts',
  'src/core/schema/outline-progress.ts',
  'src/core/schema/outline.ts',
  'src/core/schema/project-lifecycle.ts',
  'src/core/schema/relationship.ts',
  'src/core/schema/rules.ts',
  'src/core/schema/state.ts',
  'src/core/schema/style.ts',
  'src/core/schema/text.ts',
  'src/core/schema/upload.ts',
  'src/core/schema/workbench-settings.ts',
  'src/core/schema/worldview.ts',
  'src/core/text/projection.ts',
  'src/core/timeline/schema.ts',
  'src/core/validate/index.ts',
] as const;

/**
 * 校验实际进入 client 图的 core 输入集与白名单一致，返回违规列表（空 = 通过）。
 * 双向断言：白名单外 core 模块入图失败；白名单条目未被使用（过期条目）也失败，
 * 保证白名单是「实测图」的诚实写照而非摆设。
 */
export function assertCoreWhitelisted(
  coreInputs: readonly string[],
  whitelist: readonly string[] = CLIENT_CORE_WHITELIST,
): string[] {
  const violations: string[] = [];
  const used = new Set(coreInputs);
  const allowed = new Set(whitelist);
  for (const input of used) {
    if (!allowed.has(input)) violations.push(`白名单外 core 模块进入 client 图: ${input}`);
  }
  for (const entry of allowed) {
    if (!used.has(entry)) violations.push(`白名单条目未被 client 图使用: ${entry}`);
  }
  return violations;
}
