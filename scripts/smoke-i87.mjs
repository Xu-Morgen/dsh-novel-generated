import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNovelAgentService } from '../lib/agents/agent-tools.js';

/**
 * I87 Agent 上下文单一 owner smoke（review v2.0 §3.2 / 计划 §18 I87）。
 *
 * Part 0 — 静态负向扫描（验收①）：
 * - `createNextSceneContextBuilder(` 在生产源码（非测试文件）中只出现一次
 *   （index.ts 组合根：同一实例同时注入写作裁决服务与 agent）；
 * - agent-tools.ts 不再 import/调用 builder（`NovelAgentDeps.context` 为注入的
 *   `NextSceneContextProvider`）；
 * - index.ts agent wiring 显式传 `context: nextSceneContext`。
 * Part 1 — 运行时委派契约（lib 产物）：`createNovelAgentService` 的 `context()`
 *   委托给注入的 provider 实例（不再自建第二套装配）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I87 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const countIn = (p, fragment) => codeLines(p).filter((line) => line.includes(fragment)).length;

// Part 0 — 静态负向扫描。
{
  const agentTools = codeLines('src/agents/agent-tools.ts');
  // I89 后组合根拆为 index.ts + host/composition/ 三段（builder 调用落在 management.ts）。
  const index = [...codeLines('src/index.ts'), ...codeLines('src/host/composition/base.ts'), ...codeLines('src/host/composition/management.ts'), ...codeLines('src/host/composition/orchestration.ts')];
  // 生产源码（src，排除 *.test.ts）中 builder 调用唯一（组合根 management.ts）。
  const builderCalls = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        for (const [i, line] of codeLines(path).entries()) {
          if (line.includes('createNextSceneContextBuilder(')) builderCalls.push(`${path}:${i + 1}`);
        }
      }
    }
  };
  walk('src');
  const production = builderCalls.filter((at) => !at.includes('host/writing-context.ts'));
  if (production.length !== 1) fail(`createNextSceneContextBuilder 生产调用必须唯一（组合根），实际 ${production.length} 处：${production.join(', ')}`);
  if (!production[0].startsWith('src/host/composition/management.ts:')) fail(`唯一 builder 调用必须在组合根 management.ts，实际 ${production[0]}`);
  if (agentTools.some((line) => line.includes('createNextSceneContextBuilder('))) fail('agent-tools.ts 仍自建第二套 context builder');
  if (!agentTools.some((line) => line.includes('readonly context: NextSceneContextProvider'))) fail('NovelAgentDeps 缺少注入的 context: NextSceneContextProvider');
  if (!index.some((line) => line.includes('context: nextSceneContext'))) fail('组合根 agent wiring 未复用生产 nextSceneContext 实例');
}

// Part 1 — 运行时委派契约（lib 产物）。
{
  const marker = 'provider-called';
  let calls = 0;
  const agent = createNovelAgentService({
    project: { openProject: async () => ({ project: { id: 'p1' }, layers: {} }), listProjects: async () => [] },
    style: { open: async () => undefined }, rules: { open: async () => undefined },
    knowledge: { open: async () => undefined }, text: { open: async () => undefined },
    writing: { open: async () => undefined },
    inspiration: {}, confirmation: {},
    context: {
      async context(projectId) {
        calls += 1;
        return { marker, projectId };
      },
    },
    resolveSettings: async () => ({ modelRef: 'dsh/default', credentialRef: 'dsh/managed' }),
    workbenchSettings: { load: async () => ({ wordTarget: 500, askWhenThin: true }) },
  });
  const result = await agent.context('p1');
  if (result.marker !== marker || result.projectId !== 'p1') fail('agent.context 未委托给注入的 provider 实例');
  if (calls !== 1) fail(`注入 provider 应恰好被调用 1 次，实际 ${calls}`);
  console.log('I87 smoke: 静态单一 owner（builder 生产调用唯一 / agent 不再自建）+ 运行时委派契约 通过');
}
