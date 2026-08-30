import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnCaptured } from './spawn-captured.mjs';

/** I105 SceneOutlineBinding + explicit candidate target closure (R18-1b). */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I105 smoke: ${message}`); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const frozenSchemaHashes = {
  'src/core/schema/text.ts': '4955dec44cc45c9341c93d7bb58561bcc9773f9704cc8c348699b54afe1455f5',
  'src/core/schema/outline.ts': 'bd2adb2c6d83c25a4d856fdfda8390019ba15c45af373d29655fc9c29c308242',
};
for (const [path, expected] of Object.entries(frozenSchemaHashes)) {
  const actual = sha256(read(path).replaceAll('\r\n', '\n'));
  if (actual !== expected) fail(`I105 禁止修改 frozen C5/B5 schema: ${path} (${actual})`);
}

const schema = read('src/core/schema/scene-outline-binding.ts');
for (const owner of [
  'sceneOutlineBindingDocumentSchema', 'sceneOutlineManualBindingSchema', 'sceneOutlineBindingReadResultSchema',
  'sceneOutlineBindingSaveSchema', 'sceneOutlineBindingRebindSchema', 'sceneOutlineBindingUnbindSchema',
  'sceneOutlineBindingImpactInputSchema', 'sceneOutlineBindingImpactResultSchema',
]) {
  if (!schema.includes(`export const ${owner}`)) fail(`缺少 binding schema owner: ${owner}`);
}
if (!schema.includes('version: z.literal(1)') || !schema.includes('bindings: z.array(sceneOutlineManualBindingSchema)')) fail('binding document 不是 versioned manual-only schema');
if (schema.includes("source: z.enum(['manual', 'default'])") === false) fail('缺少 manual/default effective semantics');

const repository = read('src/host/scene-outline-binding-repository.ts');
for (const token of ["const BINDING_FILE = 'scene-outline-bindings.yaml'", 'sceneOutlineBindingDocumentSchema.parse', 'Stale binding fingerprint', 'await rename(temporaryPath, this.filePath)', 'coordinatorFor(this.filePath)']) {
  if (!repository.includes(token)) fail(`binding repository owner 缺少: ${token}`);
}
const bindingService = read('src/host/scene-outline-binding-service.ts');
for (const token of ['text.listChapters(projectId)', 'outline.beatCards(projectId)', 'Unknown bound scene', 'Unknown bound detail beat', 'captureCandidateTarget', 'resolveQueueTargets']) {
  if (!bindingService.includes(token)) fail(`binding C5+B5 preflight/resolver 缺少: ${token}`);
}
for (const fingerprint of ['textFingerprint', 'outlineFingerprint', 'bindingFingerprint']) {
  if (!bindingService.includes(fingerprint)) fail(`缺少 internal freshness fingerprint: ${fingerprint}`);
}

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const expectedMethods = [
  'novel-creation-tool/novelSceneOutlineBinding/read',
  'novel-creation-tool/novelSceneOutlineBinding/save',
  'novel-creation-tool/novelSceneOutlineBinding/rebind',
  'novel-creation-tool/novelSceneOutlineBinding/unbind',
  'novel-creation-tool/novelSceneOutlineBinding/impact',
  'novel-creation-tool/novelWriting/proposeAt',
  'novel-creation-tool/novelQueue/startAt',
];
const publicBindingMethods = lock.descriptorIds.filter((id) => id.includes('/novelSceneOutlineBinding/'));
if (JSON.stringify(publicBindingMethods) !== JSON.stringify(expectedMethods.slice(0, 5))) fail(`binding public methods 非 exact additive surface: ${publicBindingMethods.join(', ')}`);
if (lock.descriptorIds.some((id) => /novelSceneOutlineBinding\/(?:delete|remove|apply)/.test(id))) fail('I105 禁止公开 binding delete/apply Remote');
if (lock.descriptorIds.length !== 122 || lock.resultSchemaIds.length !== 28) fail(`contract counts 不符: ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-7)) !== JSON.stringify(expectedMethods)) fail('I105 descriptor IDs 必须只在 115 baseline 后追加');
const expectedResultIds = [expectedMethods[0], expectedMethods[4], expectedMethods[5], expectedMethods[6]];
if (JSON.stringify(lock.resultSchemaIds.slice(-4)) !== JSON.stringify(expectedResultIds)) fail('I105 unique result IDs 必须只在 24 baseline 后追加');
const oldDescriptorBodies = Object.fromEntries(lock.descriptorIds.slice(0, 115).map((id) => [id, lock.descriptors[id]]));
const oldResultBodies = Object.fromEntries(lock.resultSchemaIds.slice(0, 24).map((id) => [id, lock.resultSchemas[id]]));
const preI105DescriptorHash = sha256(JSON.stringify(oldDescriptorBodies));
const preI105ResultHash = sha256(JSON.stringify(oldResultBodies));
if (preI105DescriptorHash !== '15d4da60e3b140b5c1ff70a3fb2043c0c31f7d19c898718b83d2847da437a14b') fail(`pre-I105 descriptor bodies drifted: ${preI105DescriptorHash}`);
if (preI105ResultHash !== 'b5cf806081ee0fe48c6aac912d3d020b7efc276a084acdac1d66fc28dd16611d') fail(`pre-I105 result bodies drifted: ${preI105ResultHash}`);

const candidate = read('src/host/writing-adjudication/candidate-production.ts');
const landing = read('src/host/writing-adjudication/landing-saga.ts');
const queueService = read('src/host/queue-service.ts');
const statisticsBuild = read('src/core/statistics/build.ts');
const statisticsService = read('src/host/statistics-service.ts');
const clientCandidate = read('src/client/ops/chapters-candidate.ts');
const clientQueue = read('src/client/ops/queue.ts');
const agentTools = read('src/agents/agent-tools.ts');
if (!candidate.includes('captureCandidateTarget') || !candidate.includes('assertCandidateTargetFresh')) fail('candidate production 未接三 owner target freshness');
const lifecycleOpen = landing.indexOf('const journal = await LifecycleJournal.open');
const lifecycleWrite = landing.indexOf('const result = await executeLifecycle');
const oneShotWriterGate = landing.indexOf('let firstLayerWriteGate');
const gatedWriterUse = landing.indexOf('writers: gatedLayerWriters');
if ((landing.match(/assertCandidateTargetFresh/g) ?? []).length < 3
  || oneShotWriterGate < lifecycleOpen || oneShotWriterGate > lifecycleWrite
  || gatedWriterUse < lifecycleWrite
  || (landing.match(/await requireFreshFirstLayerWrite\(\)/g) ?? []).length !== 5) {
  fail('candidate accept 缺少 lifecycle journal.start 后、首个真实 layer writer 前的一次性 freshness gate');
}
if (landing.includes('createChapter')) fail('candidate landing 禁止 auto createChapter');
if (!queueService.includes('resolveQueueTargets') || !queueService.includes('assertQueueTargetFresh')) fail('queue 未消费 canonical binding/freshness owner');
if (!queueService.includes('randomUUID') || !queueService.includes('nextQueueCandidateId') || queueService.includes('queueCandidateGeneration')) fail('queue candidate id 未独占 restart-unique UUID suffix');
if (!queueService.includes('refreshQueueJournal(current,')) fail('queue retry 未在最终 mutate 内基于 live journal 刷新');
if (statisticsBuild.includes('stableSceneId')) fail('statistics core 禁止独立 import/use stableSceneId mapping truth');
if (!statisticsService.includes('resolveOwnedTargets')) fail('statistics service 未消费 canonical effective mapping');
if (!clientCandidate.includes('.proposeAt(') || !clientCandidate.includes("target.propose(projectId, { intent: 'rewrite'")) fail('Client candidate 非 rewrite 主路径未使用 proposeAt explicit target');
if (!clientQueue.includes('target.startAt(') || clientQueue.includes('target.start(')) fail('Client queue 未独占 startAt explicit chapter');
if (!agentTools.includes('deps.writing.proposeAt') || !agentTools.includes('chapterId and sceneId must be provided together')) fail('agent tools explicit target wiring 缺失');
const mountRegistry = read('src/client/mount-registry.ts');
if (mountRegistry.includes('sceneOutlineBindingRemoteContribution') || mountRegistry.includes('remote.novelSceneOutlineBinding')) fail('I105 禁止新增 binding 管理 UI/mount');

const productionScanPaths = [
  'src/host/writing-adjudication/candidate-production.ts',
  'src/host/writing-adjudication/landing-saga.ts',
  'src/core/queue/task.ts',
  'src/host/queue-service.ts',
  'src/client/layers/candidate.ts',
  'src/client/ops/chapters-candidate.ts',
  'src/client/layers/queue.ts',
  'src/client/ops/queue.ts',
  'src/core/statistics/build.ts',
  'src/core/statistics/types.ts',
  'src/host/statistics-service.ts',
  'src/client/layers/statistics.ts',
  'src/client/ops/statistics.ts',
  'src/agents/agent-tools.ts',
];
const productionLiteralHits = productionScanPaths.filter((path) => read(path).includes('chapter-1'));
if (productionLiteralHits.length > 0) fail(`production chapter-1 business hardcode: ${productionLiteralHits.join(', ')}`);

const allowedChapterLiteralPaths = [
  'src/c5-edit.test.ts',
  'src/c5-read.test.ts',
  'src/client-chapters.test.ts',
  'src/client-panels-queue.test.ts',
  'src/client-panels-review.test.ts',
  'src/client-panels-search.test.ts',
  'src/client-panels-statistics.test.ts',
  'src/core/candidate/index.test.ts',
  'src/core/queue/task.test.ts',
  'src/core/review/issue.test.ts',
  'src/core/search/index.test.ts',
  'src/core/statistics/index.test.ts',
  'src/core/text/branch.test.ts',
  'src/core/text/index.test.ts',
  'src/core/text/projection.test.ts',
  'src/host/branch-service.test.ts',
  'src/host/candidate-service.test.ts',
  'src/host/continuation-service.test.ts',
  'src/host/edit-service.test.ts',
  'src/host/queue-service.test.ts',
  'src/host/remote/shared-result-contract.test.ts',
  'src/host/search-service.test.ts',
  'src/host/statistics-service.test.ts',
  'src/host/text-service.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/remote-binder.test.ts',
  'src/text-edit-service.test.ts',
];
const allowedChapterLiteralPathSet = new Set(allowedChapterLiteralPaths);
const sourceFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(absolute);
  }
};
walk(resolve(repoRoot, 'src'));
const actualLiteralPaths = sourceFiles
  .filter((path) => readFileSync(path, 'utf8').includes('chapter-1'))
  .map((path) => relative(repoRoot, path).replaceAll('\\', '/'))
  .sort();
const unallowlistedHits = actualLiteralPaths.filter((path) => !allowedChapterLiteralPathSet.has(path));
const staleAllowlist = allowedChapterLiteralPaths.filter((path) => !actualLiteralPaths.includes(path));
if (unallowlistedHits.length > 0) fail(`chapter-1 literal path 未显式批准: ${unallowlistedHits.join(', ')}`);
if (staleAllowlist.length > 0) fail(`chapter-1 allowlist 存在不再需要的路径: ${staleAllowlist.join(', ')}`);
if (allowedChapterLiteralPathSet.has('src/host/queue-service.ts')) fail('scanner negative fixture must reject a production path');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/scene-outline-binding-repository.test.ts',
  'src/host/scene-outline-binding-service.test.ts',
  'src/host/scene-outline-binding-adapter.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/core/queue/task.test.ts',
  'src/host/queue-service.test.ts',
  'src/core/statistics/index.test.ts',
  'src/host/statistics-service.test.ts',
  'src/client-panels-candidate.test.ts',
  'src/client-panels-queue.test.ts',
  'src/agents/agent-tools.test.ts',
  'src/host/remote/shared-result-contract.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, encoding: 'utf8' });
if (focused.status !== 0) fail(`focused deterministic suites failed (exit ${focused.status}):\n${focused.output.slice(0, 3000)}`);

const artifact = {
  iteration: 'I105',
  requirement: 'R18-1b',
  owner: {
    service: 'SceneOutlineBindingRepository',
    file: 'scene-outline-bindings.yaml',
    references: { C5: 'TextRepository (read-only preflight)', B5: 'OutlineRepository (read-only preflight)' },
  },
  semantics: {
    persistence: 'manual-only versioned one-to-one pairs',
    effective: 'manual-first; stableSceneId default only when neither scene nor detail beat is manually occupied',
    defaultPersisted: false,
  },
  remoteMethods: {
    novelSceneOutlineBinding: ['read', 'save', 'rebind', 'unbind', 'impact'],
    novelWriting: ['proposeAt'],
    novelQueue: ['startAt'],
    publicDelete: false,
  },
  explicitTarget: {
    writing: ['chapterId', 'sceneId'],
    queue: ['chapterId'],
    freshness: ['textFingerprint', 'outlineFingerprint', 'bindingFingerprint'],
    occupiedOrStale: 'fail-closed-before-generation-or-write',
  },
  persistenceMigrationRecovery: {
    missingBindingFile: 'empty version-1 manual document',
    corruptBindingFile: 'fail-closed',
    atomicWrite: 'temporary YAML then rename under path-global serial lane',
    queueLegacy: 'explicit pre-I105 parser; active rows recover only through exactly-one-chapter fresh target reconstruction',
    candidateRecovery: 'rehydrate only with persisted target snapshot and three-owner freshness validation',
  },
  negativeFixtures: [
    'duplicate-scene', 'duplicate-detail-beat', 'dangling-scene', 'dangling-detail-beat', 'cross-project-reference',
    'ambiguous-detail-beat', 'stale-binding-fingerprint', 'stale-text-fingerprint', 'stale-outline-fingerprint',
    'occupied-target', 'reserved-target', 'partial-explicit-target', 'missing-wire-argument', 'extra-wire-field',
    'invalid-wire-value', 'malformed-binding-result', 'malformed-proposeAt-result', 'malformed-startAt-result',
  ],
  hardcodeScan: {
    literal: 'chapter-1',
    productionPaths: productionScanPaths,
    productionHits: 0,
    outsideProductionAllowlist: allowedChapterLiteralPaths,
    statisticsIndependentStableSceneIdTruth: false,
    candidateLandingAutoCreateChapter: false,
  },
  contracts: {
    descriptorCount: lock.descriptorIds.length,
    resultSchemaCount: lock.resultSchemaIds.length,
    preI105DescriptorCount: 115,
    preI105ResultSchemaCount: 24,
    preI105DescriptorBodiesSha256: preI105DescriptorHash,
    preI105ResultBodiesSha256: preI105ResultHash,
    additiveDescriptorIds: expectedMethods,
    additiveResultSchemaIds: expectedResultIds,
  },
  crossOwnerAtomicityBoundary: {
    claim: 'no-shared-transaction',
    guarantee: 'initial/pre-execute target checks plus one shared gate after lifecycle journal.start and immediately before the first real layer writer; no shared transaction claim',
    bindingCasScope: 'scene-outline-bindings.yaml only',
    finalC5Write: 'I104 expected text fingerprint',
  },
  checks: [
    'binding-repository-reopen-and-atomic-fault', 'binding-service-one-to-one-preflight', 'binding-adapter-type-result-coupling',
    'writing-explicit-target-and-three-fingerprint-stale', 'writing-accept-immediate-first-writer-freshness-gate', 'writing-project-owned-adjudication-lane',
    'queue-target-migration-recovery', 'queue-candidate-generation-identity', 'queue-live-journal-concurrent-retry', 'queue-candidate-registration-commit-truth', 'statistics-canonical-mapping-consumer',
    'Client-candidate-proposeAt', 'Client-queue-startAt', 'agent-explicit-target', 'contract-lock-additive-only',
    'real-dsh-host-gateway', 'real-dsh-client-binder', 'production-hardcode-scan', 'no-binding-delete-or-UI',
  ],
};
const artifactPath = resolve(repoRoot, 'artifacts/i105-scene-outline-binding.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(`I105 smoke: ${lock.descriptorIds.length} descriptors / ${lock.resultSchemaIds.length} result schemas; 115/24 bodies preserved; ${productionScanPaths.length} production paths clean; focused suites passed`);
