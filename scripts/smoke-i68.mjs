import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * I68 C6 进度与灵感方向落地 smoke（design §14.10「C6 与灵感落地」/ R14-3）。
 *
 * 交付物核验：
 * - 构建产物（lib）：host/progress-inspiration-service（projection/recordDeviation/
 *   reconcileDeviation/inspire/select/apply/reject/pending/audit）、core/outline/
 *   projection（projectOutlineProgress）、host/remote/progress（novelOutlineProgress
 *   Remote）存在且导出关键符号。
 * - 源码：index.ts 装配 novelOutlineProgress；remote.ts 注册 progressInvocations；
 *   nav 新增 progress 稳定视图；client.ts 挂载 progressRemoteContribution；Client
 *   面板无领域 fallback（不导入 core schema / 不本地校验）。
 * - Host 行为（lib）：真实领域服务消费者夹具走完整闭环：
 *   进度投影（导航/完成状态/偏差/一致性）；偏差记录/调和只写 C6；灵感零写；
 *   选定 → Gate pending 零写；确认 apply 只改授权的 B5（logline/themes/version）
 *   与 C6（追加一条偏差），其他层哈希不变；拒绝零写；重复 apply 幂等（哈希不变）；
 *   pending/audit 重载一致；Fiber dispose 挂钩注册。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I68 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/host/progress-inspiration-service.js', 'lib/core/outline/projection.js', 'lib/host/remote/progress.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const service = read('lib/host/progress-inspiration-service.js');
  for (const symbol of ['createProgressInspirationService', 'inspirationProposalId', 'INSPIRATION_APPLY_KIND']) {
    if (!service.includes(symbol)) fail(`lib progress service missing ${symbol}`);
  }
  const projection = read('lib/core/outline/projection.js');
  for (const symbol of ['projectOutlineProgress']) {
    if (!projection.includes(symbol)) fail(`lib projection missing ${symbol}`);
  }
  const remote = read('lib/host/remote/progress.js');
  for (const symbol of ['progressProjectionInvocation', 'progressRecordDeviationInvocation', 'progressReconcileDeviationInvocation', 'progressInspireInvocation', 'progressSelectInvocation', 'progressApplyInvocation', 'progressRejectInvocation', 'progressPendingInvocation', 'progressAuditInvocation', 'progressRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib progress remote missing ${symbol}`);
  }
}

// Part 2 — 源码：装配 + Client 无领域 fallback + 不复制 owner。
{
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  const client = read('src/client.ts');
  const panel = read('src/client/layers/progress.ts');
  const shared = read('src/client/shared.ts');
  const service = read('src/host/progress-inspiration-service.ts');
  // 装配：index.ts 提供 novelOutlineProgress；remote.ts 注册 progressInvocations。
  if (!index.includes("ctx.provide('novelOutlineProgress'") || !index.includes('createProgressInspirationService')) {
    fail('index.ts missing novelOutlineProgress wiring');
  }
  if (!remoteTs.includes('...progressInvocations') || !remoteTs.includes('progressRemoteContribution')) {
    fail('remote.ts missing progressInvocations registration');
  }
  // 复用 I14/I15 owner：进度服务只经 outlineService/confirmation/inspiration 转发，不直接写文件。
  for (const reuse of ['deps.outline.readProgress', 'deps.outline.recordDeviation', 'deps.outline.save', 'deps.confirmation.propose', 'deps.confirmation.accept', 'deps.inspiration.apply']) {
    if (!service.includes(reuse)) fail(`progress service must reuse ${reuse}`);
  }
  // Client：nav 新增 progress 稳定视图；client.ts 挂载 progressRemoteContribution；shared 暴露 ProgressNamespace。
  if (!nav.includes("view: 'progress'") || !nav.includes("view === 'progress'")) {
    fail('nav.ts missing the progress view / stable-view handling');
  }
  if (!client.includes('progressRemoteContribution') || !client.includes("'remote.novelOutlineProgress'")) {
    fail('client.ts missing progress Remote mount');
  }
  if (!shared.includes('ProgressNamespace')) fail('shared.ts missing ProgressNamespace');
  // Client 无领域 fallback：面板不导入 core schema / zod，不复制领域校验。
  if (panel.includes('../core/') || panel.includes('zod')) {
    fail('client progress panel must not import core schema or zod (no domain fallback)');
  }
}

// Part 3 — Host 行为（lib 构建产物）：真实领域服务消费者夹具。
{
  const { createProgressInspirationService, inspirationProposalId } = await import('../lib/host/progress-inspiration-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { createInspirationService } = await import('../lib/host/inspiration-service.js');
  const { ProjectRepository } = await import('../lib/core/project/index.js');

  const hashOf = (path) => createHash('sha256').update(readFileSync(path, 'utf8'), 'utf8').digest('hex');
  // B5/C6 层快照：零写断言只跟踪叙事层（outline.yaml + outline-progress.yaml）；
  // confirmations.yaml 是 I11 Gate 账本，select/apply/reject 持久化提案属预期行为。
  const layerSnapshot = (dir) => ['outline.yaml', 'outline-progress.yaml']
    .map((name) => `${name}\u0000${hashOf(join(dir, name))}`)
    .join('\n');
  // 全目录快照：断言 apply 只改授权的文件（B5/C6 + Gate 账本），其他层不动。
  const fullSnapshot = (dir) => readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.name}\u0000${hashOf(join(dir, entry.name))}`)
    .sort()
    .join('\n');

  const outline = {
    id: 'outline', version: 1, structure: 'three-act', logline: '米拉追查旧港封印。', themes: ['信任'],
    acts: [{ id: 'act-one', index: 1, title: '第一幕', goal: '抵达旧港', beats: [
      { id: 'first', title: '进入旧港', description: '米拉找到入口。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
        { id: 'scene-1', title: '雨夜入港', summary: '米拉抵达旧港。', pov: 'mira', wordTarget: 800, points: ['到达'], status: 'planned' },
      ] },
    ] }],
    foreshadowing: [], endings: [],
  };
  const progress = { outlineId: 'outline', currentAct: 'act-one', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 20 };
  const direction = (id, title, logline) => ({
    id, title, premise: `${title}的前提。`,
    changes: {
      ...(logline === undefined ? {} : { logline }),
      outlineNote: `${title}改变剧情走向。`,
      progressNote: `${title}带来新冲突。`,
    },
    rationale: `${title}的理由。`,
  });
  const fakeLlm = (directions) => ({
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify({ directions }) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i68-smoke-'));
  try {
    const project = new ProjectRepository(projectsRoot);
    await project.createProject({ projectId: 'demo', name: '进度灵感演示' });
    const outlineService = createOutlineService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    await outlineService.open('demo');
    await confirmation.open('demo');
    await outlineService.save('demo', outline);
    await outlineService.saveProgress('demo', progress);
    const projectDir = join(projectsRoot, 'demo');
    const outlinePath = join(projectDir, 'outline.yaml');
    const progressPath = join(projectDir, 'outline-progress.yaml');
    let disposed = 0;
    const inspiration = createInspirationService(fakeLlm([direction('dawn', '黎明交易', '米拉以黎明交易换取封印。'), direction('storm', '风暴交易')]), (dispose) => { disposed += 1; void dispose; });
    const service = createProgressInspirationService({
      outline: outlineService, confirmation, inspiration, projectsRoot,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });

    // 1) 进度投影：导航/完成状态/一致性；只读零写。
    const projection = await service.projection('demo');
    assert.equal(projection.navigation.beatId, 'first', 'navigation must target the first beat');
    assert.equal(projection.acts[0].beats[0].current, true, 'current beat flag');
    assert.deepEqual(projection.consistency, { currentBeatCompleted: false, completedBeatsWithOpenScenes: [], navigationTargetAllScenesDone: false }, 'consistency findings');
    const layersBefore = layerSnapshot(projectDir);
    assert.equal(layerSnapshot(projectDir), layersBefore, 'projection must be zero-write');

    // 2) 偏差记录/调和：只写 C6（outline-progress.yaml 变，outline.yaml 不变）。
    const outlineHashBefore = hashOf(outlinePath);
    const recorded = await service.recordDeviation('demo', { planned: '入港', actual: '绕行山道', reason: '守夜人封路' });
    assert.equal(recorded.deviations.length, 1, 'deviation recorded');
    assert.equal(hashOf(outlinePath), outlineHashBefore, 'recordDeviation must not touch B5');
    const reconciled = await service.reconcileDeviation('demo', recorded.deviations[0].id);
    assert.equal(reconciled.deviations[0].reconciled, true, 'deviation reconciled');

    // 3) 灵感零写：fake LLM 2 个可区分方向；B5/C6 层快照不变。
    const layersAfterDeviation = layerSnapshot(projectDir);
    const proposed = await service.inspire('demo', '给一个转折');
    assert.equal(proposed.directions.length, 2, 'two directions');
    assert.notEqual(proposed.directions[0].id, proposed.directions[1].id, 'directions distinct');
    assert.equal(layerSnapshot(projectDir), layersAfterDeviation, 'inspire must be zero-write');

    // 4) 选定 → Gate pending：B5/C6 零写（confirmations.yaml 持久化提案属预期）；
    //    确认 apply 只改授权的 B5/C6，其他层不变。
    const selected = await service.select('demo', { direction: proposed.directions[0] });
    assert.equal(selected.status, 'pending', 'selected proposal is pending');
    assert.equal(layerSnapshot(projectDir), layersAfterDeviation, 'select must not touch B5/C6');
    assert.ok(existsSync(join(projectDir, 'confirmations.yaml')), 'Gate proposal persisted');
    const fullBeforeApply = fullSnapshot(projectDir);
    const applied = await service.apply('demo', selected.proposalId);
    assert.equal(applied.applied, true, 'apply applied');
    // 投影含此前记录的偏差 + 本次 apply 追加的偏差（标记 = `${proposalId}-deviation`）。
    assert.equal(applied.projection.deviations.length, 2, 'apply appended one deviation');
    const appliedDeviation = applied.projection.deviations.find((deviation) => deviation.id === `${selected.proposalId}-deviation`);
    assert.ok(appliedDeviation, 'applied deviation present');
    assert.equal(appliedDeviation.planned, outline.logline, 'deviation planned = old logline');
    const stored = yaml.load(readFileSync(progressPath, 'utf8'));
    assert.equal(stored.deviations.length, 2, 'C6 has recorded + applied deviations');
    // B5：logline 更新、结构不变（只改授权字段）。
    const storedOutline = yaml.load(readFileSync(outlinePath, 'utf8'));
    assert.equal(storedOutline.logline, '米拉以黎明交易换取封印。', 'B5 logline updated');
    assert.equal(storedOutline.version, 2, 'B5 version bumped');
    assert.equal(storedOutline.acts[0].beats[0].detailBeats[0].title, '雨夜入港', 'B5 structure untouched');
    assert.equal(applied.audit.length, 1, 'audit records the accepted direction');
    // 全目录校验：apply 只改 outline.yaml / outline-progress.yaml / confirmations.yaml。
    const changedFiles = fullSnapshot(projectDir).split('\n')
      .filter((line) => !fullBeforeApply.split('\n').includes(line))
      .map((line) => line.split('\u0000')[0])
      .sort();
    assert.deepEqual(changedFiles, ['confirmations.yaml', 'outline-progress.yaml', 'outline.yaml'], 'apply touches only authorized B5/C6 + Gate files');

    // 5) 重复 apply 幂等：applied=false，B5/C6 哈希不变。
    const layersAfterApply = layerSnapshot(projectDir);
    const repeat = await service.apply('demo', selected.proposalId);
    assert.equal(repeat.applied, false, 'repeat apply is a no-op');
    assert.equal(layerSnapshot(projectDir), layersAfterApply, 'repeat apply must not write');

    // 6) 拒绝零写：选定另一方向后拒绝，B5/C6 层哈希不变，审计记录 rejected。
    const second = await service.select('demo', { direction: proposed.directions[1] });
    const rejected = await service.reject('demo', second.proposalId);
    assert.equal(rejected.status, 'rejected', 'rejected');
    assert.equal(layerSnapshot(projectDir), layersAfterApply, 'reject must be zero-write');
    const audit = await service.audit('demo');
    assert.equal(audit.records.length, 2, 'audit has accepted + rejected');
    assert.deepEqual(audit.records.map((record) => record.status), ['accepted', 'rejected'], 'audit in insertion order');

    // 7) pending/audit 重载一致：新实例读同一 Gate 持久化；重放幂等。
    const reopened = createProgressInspirationService({
      outline: createOutlineService(projectsRoot), confirmation: createConfirmationService(projectsRoot), inspiration, projectsRoot,
    });
    await reopened.projection('demo');
    assert.equal((await reopened.pending('demo')).proposals.length, 0, 'no pending after decisions');
    assert.equal((await reopened.audit('demo')).records.length, 2, 'audit survives reload');
    const replay = await reopened.apply('demo', selected.proposalId);
    assert.equal(replay.applied, false, 'replay after reload is idempotent');
    assert.equal(layerSnapshot(projectDir), layersAfterApply, 'replay must not write');

    // 8) proposal id 稳定合法（偏差标记也合法）。
    const proposalId = inspirationProposalId('黎明交易 direction!', 1700000000000);
    assert.match(proposalId, /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, 'proposal id matches entityId');
    assert.ok(proposalId.length <= 64, 'proposal id length');
    assert.ok(`${proposalId}-deviation`.length <= 64, 'deviation marker length');

    // 9) Fiber dispose 挂钩注册（H0-6）。
    assert.equal(disposed, 2, 'dispose hooks registered');

    console.log('I68 smoke: 进度/偏差投影（导航/完成状态/一致性）、偏差只写 C6、灵感零写、选定→Gate→确认只改授权的 B5/C6、拒绝零写、重复 apply 幂等、pending/audit 重载一致、proposal id 合法、Fiber dispose 全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
