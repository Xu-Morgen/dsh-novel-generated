import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I79 拆分 writing-adjudication-service 与共享五层写回器 smoke（架构审查 §4.1 / §5.2 /
 * §5.4 / §9 #4；重构纪律 §16-2 行为等价）。
 *
 * 交付物核验：
 * - 复制源唯一：五层写回器（C2 applyC2StateOperationsToDraft / C1
 *   materializeC1RelationshipOperations / C3 materializeC3KnowledgeOperations /
 *   B2 confirmation-first 改写 + worldview.rewrite）在 src/host 内只存在于
 *   `five-layer-writeback.ts` 一份实现；两个消费方（writing-adjudication 落地段、
 *   text-edit-service）只引用不复制。
 * - 三段拆分与 17 依赖编排面收敛：组合根 `writing-adjudication-service.ts` 只做
 *   编排（候选生产 / 校验投影 / 落地 saga 三段模块），不再直接持有解析器 fan-out、
 *   I30 lifecycle、写回实现等实现符号；行数护栏（组合根与各段均显著小于原 588 行）。
 * - 行为等价（lib 构建产物）：共享写回器经真实 Domain Service 驱动 C2/B2 落盘，
 *   B2 恒经 I11 Gate 后再改写（低置信 fail-closed 与空 ops 语义差异随单元测试
 *   five-layer-writeback.test.ts 覆盖，stage 回归 smoke:i61/i63 覆盖两个消费方闭环）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I79 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const countIn = (p, pattern) => codeLines(p).filter((line) => line.includes(pattern)).length;

const hostDir = resolve(repoRoot, 'src/host');
const allHostTs = [];
const walkSrc = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) allHostTs.push(path);
  }
};
walkSrc(hostDir);

// Part 1 — 五层写回器单份实现（复制源唯一）。
{
  // 每个写回器独有的实现体在 src/host 全量生产代码里只出现一次，且都落在
  // five-layer-writeback.ts（复制源唯一；text-edit-service 与 landing-saga 只引用）。
  const uniqueBodies = [
    ['applyC2StateOperationsToDraft(draft as StateDraft', 'C2 写回器体'],
    ['materializeC1RelationshipOperations(await ', 'C1 写回器体'],
    ['materializeC3KnowledgeOperations(await ', 'C3 写回器体'],
    ['await deps.worldview.rewrite(projectId, operation.targetId', 'B2 写回器体'],
  ];
  for (const [body, label] of uniqueBodies) {
    const hits = allHostTs.flatMap((p) => codeLines(p).filter((line) => line.includes(body)).map(() => p));
    if (hits.length !== 1) fail(`${label}（${body}）必须只有一份实现，实际 ${hits.length} 处：${hits.join(', ')}`);
    if (hits[0] !== resolve(repoRoot, 'src/host/five-layer-writeback.ts')) {
      fail(`${label}必须定义在 five-layer-writeback.ts，实际在 ${hits[0]}`);
    }
  }
  // 消费方只引用共享工厂：写回实现体不得残留在两个消费方文件里。
  for (const consumer of ['src/host/writing-adjudication-service.ts', 'src/host/text-edit-service.ts', 'src/host/writing-adjudication/landing-saga.ts']) {
    for (const [body, label] of uniqueBodies) {
      if (codeLines(consumer).some((line) => line.includes(body))) fail(`${consumer} 残留 ${label}（应只引用 buildFiveLayerWriters）`);
    }
  }
  // 共享工厂定义唯一。
  const factoryHits = allHostTs.flatMap((p) => codeLines(p).filter((line) => line.includes('export function buildFiveLayerWriters')).map(() => p));
  if (factoryHits.length !== 1 || factoryHits[0] !== resolve(repoRoot, 'src/host/five-layer-writeback.ts')) {
    fail(`buildFiveLayerWriters 必须唯一定义于 five-layer-writeback.ts：${factoryHits.join(', ')}`);
  }
  console.log('I79 Part 1: 五层写回器单份实现（复制源唯一，消费方零残留）OK');
}

// Part 2 — 三段拆分与 17 依赖编排面收敛（行数护栏 + 实现符号归位）。
{
  const service = read('src/host/writing-adjudication-service.ts');
  const lines = {
    root: service.split('\n').length,
    production: read('src/host/writing-adjudication/candidate-production.ts').split('\n').length,
    projection: read('src/host/writing-adjudication/validation-projection.ts').split('\n').length,
    saga: read('src/host/writing-adjudication/landing-saga.ts').split('\n').length,
  };
  // 原文件 588 行；拆分后组合根与每一段都应显著小于原体积（护栏：均 < 320 行）。
  for (const [name, count] of Object.entries(lines)) {
    if (count >= 320) fail(`${name} 行数 ${count} 超护栏 320（原 588 行单文件未有效拆分）`);
  }
  // 组合根只做编排：解析器 fan-out、I30 lifecycle、写回实现等符号全部归位到段模块。
  for (const symbol of ['parseC2StateFromNarrative', 'parseC4CanonFromNarrative', 'executeLifecycle', 'buildFiveLayerWriters', 'applyC2StateOperationsToDraft']) {
    if (codeLines('src/host/writing-adjudication-service.ts').some((line) => line.includes(symbol))) {
      fail(`组合根残留实现符号 ${symbol}（编排面未收敛）`);
    }
  }
  // 段模块职责归属正向断言：落地段持 I30 生命周期与解析 fan-out；生产段持候选服务；
  // 校验段持 I20 判定；共享写回器由落地段与 text-edit 两个消费方引用。
  for (const symbol of ['executeLifecycle', 'parseC2StateFromNarrative', 'parseC1RelationshipsFromNarrative', 'parseC3KnowledgeFromNarrative', 'parseC4CanonFromNarrative', 'parseB2WorldviewFromNarrative']) {
    if (!codeLines('src/host/writing-adjudication/landing-saga.ts').some((line) => line.includes(symbol))) fail(`landing-saga 缺失 ${symbol}`);
  }
  if (!codeLines('src/host/writing-adjudication/candidate-production.ts').some((line) => line.includes('createWritingCandidateService'))) fail('candidate-production 缺失候选服务引用');
  if (!codeLines('src/host/writing-adjudication/validation-projection.ts').some((line) => line.includes('adjudicateViolations'))) fail('validation-projection 缺失 I20 判定引用');
  for (const consumer of ['src/host/writing-adjudication/landing-saga.ts', 'src/host/text-edit-service.ts']) {
    if (!codeLines(consumer).some((line) => line.includes('buildFiveLayerWriters'))) fail(`${consumer} 未引用共享写回器`);
  }
  console.log(`I79 Part 2: 三段拆分成立（行数护栏 root=${lines.root}/production=${lines.production}/projection=${lines.projection}/saga=${lines.saga} < 320），组合根编排面收敛 OK`);
}

// Part 3 — 行为等价（lib 构建产物）：共享写回器经真实 Domain Service 驱动 C2/B2 落盘。
{
  for (const file of ['lib/host/five-layer-writeback.js', 'lib/host/writing-adjudication-service.js', 'lib/host/writing-adjudication/landing-saga.js', 'lib/host/writing-adjudication/candidate-production.js', 'lib/host/writing-adjudication/validation-projection.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const { buildFiveLayerWriters } = await import('../lib/host/five-layer-writeback.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { INITIAL_STATE } = await import('../lib/core/schema/project-lifecycle.js');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i79-smoke-'));
  try {
    const projectId = 'demo';
    const state = createStateService(projectsRoot);
    const relationship = createRelationshipService(projectsRoot);
    const knowledge = createKnowledgeService(projectsRoot);
    const canon = createCanonService(projectsRoot);
    const worldview = createWorldviewService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    await state.open(projectId, INITIAL_STATE);
    await relationship.open(projectId);
    await knowledge.open(projectId);
    await canon.open(projectId);
    await worldview.open(projectId);
    await worldview.create(projectId, {
      id: 'w-1', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'],
      triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    await confirmation.open(projectId);

    const writers = buildFiveLayerWriters({ state, relationship, knowledge, canon, worldview, confirmation }, projectId, 'smoke-w');
    await writers.c2({ ops: [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] });
    assert.equal(state.current(projectId).storyTime, 'dawn', 'C2 写回必须经 state.transaction 落盘');
    await writers.b2({
      ops: [{ op: 'supersede', targetId: 'w-1', replacement: { id: 'w-2', kind: 'geography', title: '新北港', content: '北港已经扩建。', keywords: ['新北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }, confidence: 'high' }],
    });
    const gate = confirmation.get(projectId, 'smoke-w-b2');
    assert.equal(gate.status, 'accepted', 'B2 写回必须经 I11 Gate 接受');
    const world = await worldview.list(projectId);
    assert.equal(world.find((e) => e.id === 'w-1').status, 'rewritten', 'B2 旧条目必须 rewritten');
    assert.equal(world.find((e) => e.id === 'w-1').supersededBy, 'w-2');
    assert.equal(world.find((e) => e.id === 'w-2').status, 'active', 'B2 新条目必须 active');

    console.log('I79 Part 3: 共享写回器 lib 行为等价（C2 落盘 + B2 Gate 后改写）OK');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}

console.log('I79 smoke: 五层写回器单份实现 + 三段拆分/编排面收敛 + lib 行为等价通过');
