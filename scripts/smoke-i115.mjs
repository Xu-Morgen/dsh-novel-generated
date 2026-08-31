import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I115 R18-5a smoke：矩阵、严格变更集、真实 owner UoW 与补偿负测。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I115 smoke: ${message}`); };

const schema = read('src/core/schema/reference-coordination.ts');
for (const token of [
  'CROSS_LAYER_REFERENCE_MATRIX', 'referenceChangeSetSchema', 'referenceBaseSchema',
  'referenceAuthorizationSchema', 'deterministic-derived', 'author-semantic-candidate', 'forbidden-automatic',
]) if (!schema.includes(token)) fail(`reference matrix/schema missing ${token}`);

const coordinator = read('src/host/cross-layer-reference-coordinator.ts');
for (const token of [
  'createCrossLayerReferenceCoordinator', 'createReferenceChangeSet', 'isAuthorized',
  'already-applied', 'assertOwnerFreshness', 'assertC3VersionChain', 'restoreForCompensation', 'appendBatch',
]) if (!coordinator.includes(token)) fail(`coordinator missing ${token}`);
for (const forbidden of ['operational journal', 'outbox', 'LLM', 'confirmation.propose']) {
  if (coordinator.toLowerCase().includes(forbidden.toLowerCase())) fail(`I116/I118 scope leaked: ${forbidden}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/cross-layer-reference-coordinator.test.ts',
  'src/core/relationship/index.test.ts',
  'src/core/knowledge/index.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I115 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const matrixFields = [
  'c1.relationship.id', 'c1.relationship.from/to', 'c1.relationship.type', 'c1.relationship.affinity/trust/status',
  'c1.relationship.milestones', 'c1.relationship.knownTo', 'c3.knowledge.entry.holders/status',
  'c3.knowledge.entry.revealPlan.revealTo', 'c3.knowledge.state.knows', 'c3.knowledge.entry.fact/kind/revealAt',
  'c3.knowledge.entry/state deletion', 'c4.canon.append', 'c4.canon.participants/consequences',
  'c4.canon.supersede/delete/reorder', 'b5.outline.charactersInvolved', 'b5.detailBeat.pov',
  'b5.act/beat/detailBeat.id/order/status', 'timeline.node.beatId/detailBeatId',
  'timeline.node.reveals/relationships/storyTime', 'timeline.node.id/order/currentNodeId',
  'c5.scene.beats/canonEvents', 'c5.scene.content/index/branches',
];
if (matrixFields.length !== 22) fail(`matrix evidence field count ${matrixFields.length}`);

const artifact = {
  iteration: 'I115',
  requirement: 'R18-5a',
  matrix: {
    fieldCount: matrixFields.length,
    fields: matrixFields,
    dispositions: ['deterministic-derived', 'author-semantic-candidate', 'forbidden-automatic'],
  },
  guarantees: [
    'strict-authorized-candidate-or-reparse-change-set',
    'base-version-and-sha256-freshness-before-first-write',
    'project-local-character-and-cross-layer-reference-validation',
    'C1 identity-endpoint-order-protection-and-version-chain',
    'C1 affinity-trust-decrease-allowed-when-version-advances',
    'C3 add-only-holder-state-bidirectional-and-monotonic-status',
    'C4 atomic-append-only-batch-with-no-correction-or-delete',
    'same-project-lane-and-idempotent-operation-replay',
    'cross-owner-compensation-on-later-owner-failure',
    'no-post-commit-second-reference-writer',
  ],
  explicitNonGoals: ['operational-audit-journal', 'outbox', 'review-ui', 'LLM-correction-workflow', 'silent-background-scan'],
  focusedSuites: 'real C1/C3/C4 owner consumer, duplicate, authorization, stale, ID, monotonicity and compensation suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i115-reference-matrix.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I115 smoke: strict reference matrix, authorized UoW, idempotency, freshness, ID guards and compensation passed\n');
