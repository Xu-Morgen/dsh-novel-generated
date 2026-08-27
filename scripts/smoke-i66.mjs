import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I66 C3 知情与揭示管理面 smoke（design §14.10「C3 知情与揭示」/ R14-1）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/knowledge/actions（确定性揭示/holder 变更动作）、
 *   host/knowledge-manager-service（list/read/propose/accept/reject/pending）、
 *   host/remote/knowledge（novelKnowledgeManager Remote）存在且导出关键符号。
 * - 源码：manager 复用 KnowledgeRepository（唯一 C3 写 owner）+ I11 ConfirmationGate
 *   + assertKnowledgeOnlyAdvances（知情只增不退）；不调用 forPov/filterKnowledge
 *   （管理面是全知投影，不把单角色过滤视图混入，也不绕过 POV 边界）；index.ts
 *   装配 novelKnowledgeManager；remote.ts 注册 knowledgeInvocations；nav 新增
 *   knowledge 稳定视图；client.ts 挂载 knowledgeRemoteContribution。
 * - Host 行为（lib）：真实领域服务消费者夹具走完整闭环：
 *   list/read 事实/角色双视图（最小 owned JSON）；propose → Gate pending（C3 零写）；
 *   accept 受控写回（holders/knows 镜像，revealTo 清理，status 只增）；reject 零写；
 *   逆向 status 提案 fail-fast 拒绝；幂等 accept 不重复写；重载一致（新实例可见
 *   同一投影与 pending）；POV 边界（非 holder 经 forPov 仍不可见）；Fiber dispose
 *   挂钩注册。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I66 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/knowledge/actions.js', 'lib/host/knowledge-manager-service.js', 'lib/host/remote/knowledge.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const actions = read('lib/core/knowledge/actions.js');
  for (const symbol of ['knowledgeChangeInputSchema', 'validateKnowledgeChange', 'nextKnowledgeDocument', 'isKnowledgeChangeSatisfied', 'knowledgeProposalId', 'knowledgePovHint']) {
    if (!actions.includes(symbol)) fail(`lib knowledge actions missing ${symbol}`);
  }
  const service = read('lib/host/knowledge-manager-service.js');
  for (const symbol of ['createKnowledgeManagerService', 'knowledge-change', 'nextKnowledgeDocument', 'saveAll', 'pending', 'povHint']) {
    if (!service.includes(symbol)) fail(`lib knowledge manager missing ${symbol}`);
  }
  const remote = read('lib/host/remote/knowledge.js');
  for (const symbol of ['knowledgeListInvocation', 'knowledgeReadInvocation', 'knowledgeProposeInvocation', 'knowledgeAcceptInvocation', 'knowledgeRejectInvocation', 'knowledgePendingInvocation', 'knowledgeRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib knowledge remote missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + POV 边界 + 装配。
{
  const service = read('src/host/knowledge-manager-service.ts');
  const actions = read('src/core/knowledge/actions.ts');
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  const client = read('src/client.ts');
  // 复用 I18/I11：只经 KnowledgeRepository（saveAll）+ ConfirmationGate + 既有不变量。
  for (const reuse of ['knowledge.saveAll', 'confirmation.propose', 'confirmation.accept', 'confirmation.reject', 'validateKnowledgeChange', 'nextKnowledgeDocument', 'isKnowledgeChangeSatisfied']) {
    if (!service.includes(reuse)) fail(`knowledge manager must reuse ${reuse}`);
  }
  // POV 边界：管理面绝不调用 forPov/filterKnowledge（不把单角色过滤视图混入管理投影）。
  for (const leaked of ['forPov', 'filterKnowledge']) {
    if (service.includes(leaked)) fail(`knowledge manager must not call ${leaked} (POV boundary)`);
  }
  // 核心动作复用 schema 单调 rank（与 assertKnowledgeOnlyAdvances 同一来源）。
  if (!actions.includes('knowledgeStatusRank')) fail('knowledge actions must reuse the shared monotonic status rank');
  // 装配：index.ts 提供 novelKnowledgeManager；remote.ts 注册 knowledgeInvocations。
  if (!index.includes("ctx.provide('novelKnowledgeManager'") || !index.includes('createKnowledgeManagerService')) {
    fail('index.ts missing novelKnowledgeManager wiring');
  }
  if (!remoteTs.includes('...knowledgeInvocations') || !remoteTs.includes('knowledgeRemoteContribution')) {
    fail('remote.ts missing knowledgeInvocations registration');
  }
  // Client：nav 新增知情稳定视图；client.ts 挂载 knowledgeRemoteContribution。
  if (!nav.includes("view: 'knowledge'") || !nav.includes("view === 'knowledge'")) {
    fail('nav.ts missing the knowledge view / stable-view handling');
  }
  if (!client.includes('knowledgeRemoteContribution') || !client.includes("'remote.novelKnowledgeManager'")) {
    fail('client.ts missing knowledge Remote mount');
  }
}

// Part 3 — Host 行为（lib 构建产物）：真实领域服务消费者夹具。
{
  const { createKnowledgeManagerService } = await import('../lib/host/knowledge-manager-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createCharacterService } = await import('../lib/host/character-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { filterKnowledge } = await import('../lib/core/knowledge/filter.js');

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
  /** 除 Gate 账本（confirmations.yaml，I11 owner）外的项目快照：C3 零写断言用它。 */
  const snapshotWithoutConfirmations = (dir) => snapshotDir(dir)
    .split('\n')
    .filter((line) => !line.includes('confirmations.yaml'))
    .join('\n');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i66-smoke-'));
  try {
    const characters = createCharacterService(projectsRoot);
    const knowledge = createKnowledgeService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    let disposed = 0;
    const manager = createKnowledgeManagerService({
      knowledge, characters, confirmation,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });

    const { createProjectService } = await import('../lib/host/project-service.js');
    const project = createProjectService(projectsRoot, {
      characters,
      worldview: await import('../lib/host/worldview-service.js').then((m) => m.createWorldviewService(projectsRoot)),
      outline: await import('../lib/host/outline-service.js').then((m) => m.createOutlineService(projectsRoot)),
      relationship: await import('../lib/host/relationship-service.js').then((m) => m.createRelationshipService(projectsRoot)),
      state: await import('../lib/host/state-service.js').then((m) => m.createStateService(projectsRoot)),
      canon: await import('../lib/host/canon-service.js').then((m) => m.createCanonService(projectsRoot)),
      confirmation,
    });
    await project.createProject({ projectId: 'demo', name: '知情演示' });
    await project.openProject('demo');
    // C3 / B3 / Gate 仓库由插件生命周期在 projectOpen 打开；smoke 内显式打开（与 I65 seed 一致）。
    await knowledge.open('demo');
    await confirmation.open('demo');
    await characters.open('demo');
    await characters.create('demo', {
      id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await characters.create('demo', {
      id: 'lin', name: '林', aliases: [], kind: 'extra', personality: '沉默', background: '守夜人', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await characters.create('demo', {
      id: 'kai', name: '凯', aliases: [], kind: 'extra', personality: '直率', background: '渔夫', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await knowledge.saveAll('demo', [
      { id: 'k-1', fact: '灯塔守夜人失踪真相', kind: 'secret', holders: [], revealPlan: { revealTo: ['lin'], revealAt: '第三幕' }, status: 'hidden', version: 1 },
      { id: 'k-2', fact: '铜钥匙能开旧箱', kind: 'plotpoint', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第二幕' }, status: 'partially-revealed', version: 1 },
    ], [
      { characterId: 'mira', knows: ['k-2'] },
      { characterId: 'lin', knows: [] },
      { characterId: 'kai', knows: [] },
    ]);

    const projectDir = join(projectsRoot, 'demo');
    const before = snapshotDir(projectDir);

    // 1) list/read → 事实/角色双视图投影（最小 owned JSON + POV 边界提示）。
    const projection = await manager.list('demo');
    assert.equal(projection.projectId, 'demo');
    assert.deepEqual(projection.entries.map((entry) => entry.id), ['k-1', 'k-2']);
    assert.equal(projection.entries[0].povHint.includes('POV 边界'), true, 'entry must carry POV boundary hint');
    // list 的角色视图按字符文件 id 确定性排序（kai < lin < mira）。
    assert.deepEqual(projection.characters.map((character) => [character.characterId, character.name, character.knows]),
      [['kai', '凯', []], ['lin', '林', []], ['mira', '米拉', ['k-2']]]);
    assert.deepEqual(projection.summary, { total: 2, hidden: 1, partiallyRevealed: 1, revealed: 0, withPlan: 1 });
    // 最小 owned JSON：可无损序列化，无文件路径 / live object。
    assert.deepEqual(JSON.parse(JSON.stringify(projection)), projection, 'projection must be plain owned JSON');
    const detail = await manager.read('demo', 'k-1');
    assert.deepEqual(detail.planned, [{ characterId: 'lin', name: '林' }]);
    assert.deepEqual(detail.holders, []);
    assert.equal(snapshotDir(projectDir), before, 'list/read must be zero-write');

    // 2) propose 揭示 → Gate pending（C3 零写；未确认零写）。规划揭示对象 lin 一并揭示，
    //    以覆盖「已完成的揭示对象从 revealTo 移出」。
    const proposed = await manager.propose('demo', { kind: 'reveal', entryId: 'k-1', holders: ['mira', 'lin'], status: 'revealed', revealAt: '第二幕' });
    assert.equal(proposed.status, 'pending');
    assert.match(proposed.proposalId, /^kprop-/);
    assert.equal(proposed.preview.holders.includes('mira'), true);
    assert.equal(proposed.preview.status, 'revealed');
    assert.equal(snapshotWithoutConfirmations(projectDir), before, 'propose must not write C3 (only the Gate record)');
    // pending 可见（重载一致：Gate 持久化）。
    const pendingList = await manager.pending('demo');
    assert.equal(pendingList.length, 1);
    assert.equal(pendingList[0].kind, 'reveal');

    // 3) accept → 受控写回：holders/knows 镜像、revealTo 清理、status 只增。
    const applied = await manager.accept('demo', proposed.proposalId);
    assert.equal(applied.applied, true);
    const afterApply = await manager.list('demo');
    assert.deepEqual([...afterApply.entries[0].holders].sort(), ['lin', 'mira']);
    assert.equal(afterApply.entries[0].status, 'revealed');
    assert.deepEqual(afterApply.entries[0].revealPlan.revealTo, []);
    assert.equal(afterApply.entries[0].revealPlan.revealAt, '第二幕');
    // 角色视图同步：米拉/林 knows 含 k-1。
    assert.deepEqual([...afterApply.characters.find((character) => character.characterId === 'mira').knows].sort(), ['k-1', 'k-2']);
    assert.deepEqual(afterApply.characters.find((character) => character.characterId === 'lin').knows, ['k-1']);
    // POV 边界：holder（米拉）经 POV 过滤可见；非 holder（凯）不可见（POV 不泄露）。
    const miraView = await knowledge.forPov('demo', 'mira');
    assert.ok(miraView.entries.some((entry) => entry.id === 'k-1'), 'revealed holder must see the fact through the POV filter');
    const kaiView = await knowledge.forPov('demo', 'kai');
    assert.ok(!kaiView.entries.some((entry) => entry.id === 'k-1'), 'non-holder POV must not see the fact');

    // 4) 幂等 accept：同提案重复确认 → applied=false 且 C3 不变。
    const beforeNoop = snapshotDir(projectDir);
    const again = await manager.accept('demo', proposed.proposalId);
    assert.equal(again.applied, false, 'repeat accept must be a no-op');
    assert.equal(snapshotDir(projectDir), beforeNoop, 'no-op accept must not change any file');

    // 5) reject：holder-add 提案拒绝 → C3 零写。
    const addProposal = await manager.propose('demo', { kind: 'holder-add', entryId: 'k-2', holders: ['lin'] });
    assert.equal((await manager.pending('demo')).length, 1);
    const rejected = await manager.reject('demo', addProposal.proposalId);
    assert.equal(rejected.status, 'rejected');
    assert.equal((await manager.pending('demo')).length, 0);
    const afterReject = await manager.list('demo');
    assert.deepEqual(afterReject.entries[1].holders, ['mira'], 'reject must not change C3 holders');

    // 6) 逆向 status 提案 fail-fast 拒绝（已揭示 → 部分揭示）。
    await assert.rejects(
      manager.propose('demo', { kind: 'reveal', entryId: 'k-1', holders: ['kai'], status: 'partially-revealed' }),
      /cannot regress/,
      'regressive status proposal must be rejected zero-write',
    );
    await assert.rejects(
      manager.propose('demo', { kind: 'holder-add', entryId: 'k-1', holders: ['ghost'] }),
      /Unknown character/,
      'phantom holder target must be rejected',
    );
    await assert.rejects(
      manager.propose('demo', { kind: 'holder-add', entryId: 'k-1', holders: ['mira'] }),
      /already knows/,
      'already-knowing holder must be rejected',
    );

    // 7) 重载一致：全新服务实例（同一 projectsRoot）看到同一投影与 pending。
    const second = createKnowledgeManagerService({
      knowledge: createKnowledgeService(projectsRoot),
      characters: createCharacterService(projectsRoot),
      confirmation: createConfirmationService(projectsRoot),
    });
    const reloaded = await second.list('demo');
    assert.deepEqual(reloaded.entries, (await manager.list('demo')).entries, 'reloaded projection must match the current truth');
    assert.deepEqual(reloaded.characters, (await manager.list('demo')).characters, 'reloaded character view must match');
    // 新实例 propose + 由新实例 accept（Gate 持久化 + 领域身份幂等）。
    const secondProposal = await second.propose('demo', { kind: 'holder-add', entryId: 'k-2', holders: ['lin'] });
    const appliedSecond = await second.accept('demo', secondProposal.proposalId);
    assert.equal(appliedSecond.applied, true);
    assert.deepEqual([...(await second.list('demo')).entries[1].holders].sort(), ['lin', 'mira']);

    // 8) Fiber dispose 挂钩注册（无在飞任务；生命周期契约 H0-6）。
    assert.equal(disposed, 1);

    console.log('I66 smoke: C3 知情与揭示管理面（事实/角色双视图、Gate propose→accept/reject、逆向状态失败、POV 边界不泄露、重载一致、幂等 accept、最小 owned JSON）全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
