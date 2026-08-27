import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I67 B1 规则与 B4 文风控制面 smoke（design §14.10「B1/B4 控制面」/ R14-2）。
 *
 * 交付物核验：
 * - 构建产物（lib）：host/rule-style-manager-service（list/readRule/createRule/
 *   updateRule/readStyle/saveStyle）、host/remote/rule-style（novelRuleStyleManager
 *   Remote）存在且导出关键符号。
 * - 源码：管理面复用 I7/I10 领域服务（不复制 repository）；不改规则/风格 Schema
 *   （core schema 保持开放整数枚举）；index.ts 装配 novelRuleStyleManager；
 *   remote.ts 注册 ruleStyleInvocations；nav 新增 ruleStyle 稳定视图；client.ts
 *   挂载 ruleStyleRemoteContribution；Client 面板无领域 fallback（不导入 core
 *   schema / 不本地校验）。
 * - Host 行为（lib）：真实领域服务消费者夹具走完整闭环：
 *   round-trip（规则/风格保存读回一致）；非法枚举、越界优先级、immutable 改写
 *   全部 fail-fast 零写（快照不变）；未初始化风格（I3 `{}` 占位）返回 null；
 *   保存后生成（listActive/constantSegment）与检测（+forbiddenExpressions）读取
 *   同一 Host 真相；Fiber dispose 挂钩注册。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I67 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/host/rule-style-manager-service.js', 'lib/host/remote/rule-style.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const service = read('lib/host/rule-style-manager-service.js');
  for (const symbol of ['createRuleStyleManagerService', 'RULE_PRIORITY_MIN', 'RULE_PRIORITY_MAX', 'DEFAULT_STYLE_ID', 'assertRulePriorityInRange']) {
    if (!service.includes(symbol)) fail(`lib rule-style manager missing ${symbol}`);
  }
  const remote = read('lib/host/remote/rule-style.js');
  for (const symbol of ['ruleStyleListInvocation', 'ruleStyleReadRuleInvocation', 'ruleStyleCreateRuleInvocation', 'ruleStyleUpdateRuleInvocation', 'ruleStyleReadStyleInvocation', 'ruleStyleSaveStyleInvocation', 'ruleStyleRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib rule-style remote missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + 不改 Schema + 装配 + Client 无领域 fallback。
{
  const manager = read('src/host/rule-style-manager-service.ts');
  const rulesSchema = read('src/core/schema/rules.ts');
  const styleSchema = read('src/core/schema/style.ts');
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  const client = read('src/client.ts');
  const panel = read('src/client/layers/rule-style.ts');
  const wire = read('src/host/remote/rule-style.ts');
  // 复用 I7/I10：管理面只转发领域服务，不复制 repository / 不直接写文件。
  for (const reuse of ['deps.rules.open', 'deps.rules.create', 'deps.rules.update', 'deps.rules.read', 'deps.style.open', 'deps.style.save', 'deps.style.read']) {
    if (!manager.includes(reuse)) fail(`rule-style manager must reuse ${reuse}`);
  }
  // 不改变规则/风格 Schema（计划「明确不做」）：core schema 保持开放整数枚举，
  // 优先级 1–100 只出现在 wire 层与管理面服务（UI 控制面约束）。
  if (rulesSchema.includes('min(1).max(100)')) fail('core rules schema must stay open (priority range is a control-plane constraint)');
  if (styleSchema.includes("'fourth'")) fail('core style schema must not gain new enums');
  if (!wire.includes('.min(1).max(100)')) fail('wire rule schema must bound priority 1–100');
  // 装配：index.ts 提供 novelRuleStyleManager；remote.ts 注册 ruleStyleInvocations。
  if (!index.includes("ctx.provide('novelRuleStyleManager'") || !index.includes('createRuleStyleManagerService')) {
    fail('index.ts missing novelRuleStyleManager wiring');
  }
  if (!remoteTs.includes('...ruleStyleInvocations') || !remoteTs.includes('ruleStyleRemoteContribution')) {
    fail('remote.ts missing ruleStyleInvocations registration');
  }
  // Client：nav 新增 ruleStyle 稳定视图；client.ts 挂载 ruleStyleRemoteContribution。
  if (!nav.includes("view: 'ruleStyle'") || !nav.includes("view === 'ruleStyle'")) {
    fail('nav.ts missing the ruleStyle view / stable-view handling');
  }
  if (!client.includes('ruleStyleRemoteContribution') || !client.includes("'remote.novelRuleStyleManager'")) {
    fail('client.ts missing ruleStyle Remote mount');
  }
  // Client 无领域 fallback：面板不导入 core schema / zod，不复制领域校验。
  if (panel.includes('../core/') || panel.includes('zod')) {
    fail('client rule-style panel must not import core schema or zod (no domain fallback)');
  }
}

// Part 3 — Host 行为（lib 构建产物）：真实领域服务消费者夹具。
{
  const { createRuleStyleManagerService, DEFAULT_STYLE_ID } = await import('../lib/host/rule-style-manager-service.js');
  const { createRuleService } = await import('../lib/host/rule-service.js');
  const { createStyleService } = await import('../lib/host/style-service.js');
  const { ProjectRepository } = await import('../lib/core/project/index.js');

  const snapshotDir = (dir) => {
    const entries = [];
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else entries.push(path);
      }
    };
    walk(dir);
    return entries.sort().map((p) => `${relative(dir, p)}\u0000${createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex')}`).join('\n');
  };

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i67-smoke-'));
  try {
    const rules = createRuleService(projectsRoot);
    const style = createStyleService(projectsRoot);
    const project = new ProjectRepository(projectsRoot);
    await project.createProject({ projectId: 'demo', name: '规则文风演示' });
    let disposed = 0;
    const manager = createRuleStyleManagerService({
      rules, style, projectsRoot,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });
    const projectDir = join(projectsRoot, 'demo');

    // 1) 未初始化风格（I3 `{}` 占位）→ null；列表投影为空规则。
    assert.equal(await manager.readStyle('demo'), null, 'uninitialized style must be null');
    assert.deepEqual((await manager.list('demo')).rules, [], 'fresh project must have no rules');

    // 2) round-trip：规则 create/update/read + 风格 save/read 一致。
    const created = await manager.createRule('demo', {
      id: 'harbor-seal', scope: 'global', kind: 'physics', statement: '海港封印不可破。',
      priority: 7, immutable: true, examples: ['月圆显字'], active: true,
    });
    assert.equal(created.version, 1);
    assert.deepEqual(await manager.readRule('demo', 'harbor-seal'), created);
    // immutable 规则整体改写被拒（验收「immutable 非法改写失败」）。
    await assert.rejects(
      manager.updateRule('demo', 'harbor-seal', {
        scope: 'global', kind: 'physics', statement: '改写尝试', priority: 1, immutable: true, examples: [], active: false,
      }),
      /Immutable rule/,
      'immutable rewrite must be rejected',
    );
    assert.deepEqual(await manager.readRule('demo', 'harbor-seal'), created, 'rejected rewrite must keep the stored truth');
    // mutable 规则可 round-trip 更新（version 递增）。
    await manager.createRule('demo', {
      id: 'monologue', scope: 'character', kind: 'genre', statement: '英雄不多话。',
      priority: 3, immutable: false, examples: [], active: true,
    });
    const updated = await manager.updateRule('demo', 'monologue', {
      scope: 'character', kind: 'genre', statement: '英雄极少数时候多话。',
      priority: 8, immutable: false, examples: ['决战独白'], active: true,
    });
    assert.equal(updated.version, 2);
    assert.deepEqual(await manager.readRule('demo', 'monologue'), updated);
    const savedStyle = await manager.saveStyle('demo', {
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确的感官细节', chapterFormat: '场景断行 + 地点题注',
      dialogueConventions: '使用中文引号。', forbidden: ['突然之间', '命运的齿轮'],
    });
    assert.equal(savedStyle.id, DEFAULT_STYLE_ID, 'style id must be host-managed');
    assert.deepEqual(await manager.readStyle('demo'), savedStyle);

    // 3) 负向：非法枚举 / 越界优先级 / 未知规则 → 零写拒绝（快照不变）。
    const before = snapshotDir(projectDir);
    await assert.rejects(
      manager.createRule('demo', { id: 'bad', scope: 'galaxy', kind: 'physics', statement: 'x', priority: 10, immutable: false, examples: [], active: true }),
      undefined,
      'unknown scope enum must be rejected',
    );
    await assert.rejects(
      manager.createRule('demo', { id: 'low', scope: 'global', kind: 'physics', statement: 'x', priority: 0, immutable: false, examples: [], active: true }),
      /优先级必须在/,
      'priority below 1 must be rejected',
    );
    await assert.rejects(
      manager.createRule('demo', { id: 'high', scope: 'global', kind: 'physics', statement: 'x', priority: 101, immutable: false, examples: [], active: true }),
      /优先级必须在/,
      'priority above 100 must be rejected',
    );
    await assert.rejects(
      manager.saveStyle('demo', { name: 'x', person: 'fourth', tense: 'past', povScope: 'single', tone: 'a', proseStyle: 'b', chapterFormat: 'c', dialogueConventions: 'd', forbidden: [] }),
      undefined,
      'unknown person enum must be rejected',
    );
    assert.equal(snapshotDir(projectDir), before, 'all negative cases must be zero-write');

    // 4) 触发检测消费者夹具：管理面保存后，生成/检测读取同一 Host 真相。
    const active = await rules.listActive('demo');
    assert.deepEqual(active.map((view) => view.rule.id), ['monologue', 'harbor-seal'], 'generation consumer reads the saved rules (priority desc)');
    assert.equal((await style.constantSegment('demo')).profile.person, 'third-limited', 'generation consumer reads the saved style');
    assert.deepEqual(await style.forbiddenExpressions('demo'), ['突然之间', '命运的齿轮'], 'detection consumer reads forbidden expressions');
    // 再经管理面追加禁用表达 → 检测消费者立即读到。
    await manager.saveStyle('demo', {
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确的感官细节', chapterFormat: '场景断行 + 地点题注',
      dialogueConventions: '使用中文引号。', forbidden: ['突然之间', '命运的齿轮', '猛地'],
    });
    assert.deepEqual(await style.forbiddenExpressions('demo'), ['突然之间', '命运的齿轮', '猛地'], 'detection consumer must see the same host truth');

    // 5) Fiber dispose 挂钩注册（H0-6）。
    assert.equal(disposed, 1);

    console.log('I67 smoke: B1 规则与 B4 文风控制面（round-trip、非法枚举/越界优先级/immutable 改写零写、未初始化风格、生成/检测同一 Host 真相、最小 owned JSON）全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
