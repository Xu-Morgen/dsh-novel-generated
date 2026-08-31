import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I113 R18-11c smoke：候选调和计划、逐卡纯 diff、四态决策与零写边界。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I113 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const reconciliationIds = [
  'novel-creation-tool/novelOutlineReconciliation/prepare',
  'novel-creation-tool/novelOutlineReconciliation/regenerateOne',
  'novel-creation-tool/novelOutlineReconciliation/read',
  'novel-creation-tool/novelOutlineReconciliation/cancel',
];
if (lock.descriptorIds.length !== 139 || lock.resultSchemaIds.length !== 45) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-4)) !== JSON.stringify(reconciliationIds) || JSON.stringify(lock.resultSchemaIds.slice(-4)) !== JSON.stringify(reconciliationIds)) fail('outline reconciliation is not the final additive suffix');
for (const id of reconciliationIds) if (lock.descriptors[id]?.result?.mode !== 'strict' || lock.resultSchemas[id] === undefined) fail(`missing strict contract ${id}`);

const corpus = JSON.parse(read('samples/i113/cases.json'));
if (corpus.immutable !== true || corpus.cases.length < 12 || corpus.heldOutCaseIds.length < 4 || corpus.threshold < 0.8) fail('frozen reconciliation corpus does not meet threshold/held-out requirements');
const schema = read('src/core/schema/outline-reconciliation.ts');
for (const token of ['outlineReconciliationPlanSchema', 'outlineReconciliationItemSchema', 'allowedChoices', 'manualValue', 'planned']) if (!schema.includes(token)) fail(`plan schema missing ${token}`);
const planner = read('src/host/outline-reconciliation-planner-service.ts');
for (const token of ['outlineReconciliationPrepareInputSchema', 'Stale outline reconciliation B5', 'buildOutlineReconciliationDiff', 'regenerateOne', 'onDispose']) if (!planner.includes(token)) fail(`Host planner missing ${token}`);
for (const forbidden of ['outline.save(', 'text.replaceRange(']) if (planner.includes(forbidden)) fail(`planner must be zero-write but contains ${forbidden}`);
const parser = read('src/llm/analyze/outline-reconciliation.ts');
for (const token of ['assertOutlineReconciliationOutput', 'OUTLINE_RECONCILIATION_PROMPT_EXAMPLE', 'title', 'wordTarget', 'points']) if (!parser.includes(token)) fail(`reconciliation parser missing ${token}`);

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/outline-reconciliation.test.ts',
  'src/host/outline-reconciliation-planner-service.test.ts',
  'src/host/text-change-impact-service.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I113 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I113',
  requirement: 'R18-11c',
  remoteNamespace: 'novelOutlineReconciliation',
  planShape: ['planId', 'projectId', 'reportId', 'baselineId', 'baselineSourceHash', 'finalSourceHash', 'b5ContentFingerprint', 'bindingFingerprint', 'reportClassification', 'items', 'revision', 'status', 'createdAt', 'updatedAt'],
  itemChoices: ['keep', 'ai', 'manual', 'pending'],
  aiEditableFields: ['title', 'summary', 'pov', 'wordTarget', 'points'],
  guarantees: [
    'frozen-12-case-corpus-with-4-held-out-cases-and-80-percent-threshold',
    'I112-report-and-live-C5-B5-binding-freshness-validation',
    'future-planned-card-only-window-with-stable-position-order',
    'identity-status-act-beat-and-array-order-preserved',
    'canonical-five-field-B5-pure-diff',
    'keep-ai-manual-pending-mixed-plan-expression',
    'regenerate-one-replaces-only-one-plan-item',
    'stale-unknown-duplicate-illegal-output-and-cancel-fail-closed',
    'real-I112-report-to-planner-to-outline-dry-run-consumer',
    'real-DSH-client-binder-strict-Remote-fixture',
  ],
  explicitNonGoals: ['B5-apply', 'C6-write', 'ConfirmationGate', 'background-reconciliation', 'new-delete-or-reorder-card'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, additiveSuffix: reconciliationIds },
  focusedSuites: 'frozen parser samples, real I112-to-planner consumer, binder and contract lock suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i113-outline-reconciliation-plan.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I113 smoke: frozen reconciliation samples, strict four-state plan, one-card regeneration, stale/zero-write guards and real binder passed\n');
