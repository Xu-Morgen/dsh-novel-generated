import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I112 R18-11b smoke：正文变化分类、严格证据、未来卡窗口与零写消费者。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I112 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const impactIds = [
  'novel-creation-tool/novelTextChangeImpact/prepare',
  'novel-creation-tool/novelTextChangeImpact/read',
  'novel-creation-tool/novelTextChangeImpact/cancel',
];
if (lock.descriptorIds.length !== 135 || lock.resultSchemaIds.length !== 41) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-3)) !== JSON.stringify(impactIds) || JSON.stringify(lock.resultSchemaIds.slice(-3)) !== JSON.stringify(impactIds)) {
  fail('text-change-impact is not the final additive suffix');
}
for (const id of impactIds) {
  if (lock.descriptors[id]?.result?.mode !== 'strict' || lock.resultSchemas[id] === undefined) fail(`missing strict contract ${id}`);
}

const corpus = JSON.parse(read('samples/i112/cases.json'));
if (corpus.immutable !== true || corpus.cases.length < 12 || corpus.heldOutCaseIds.length < 4 || corpus.threshold < 0.8) fail('frozen sample corpus does not meet I112 threshold/held-out requirements');

const schema = read('src/core/schema/text-change-impact.ts');
for (const token of ['textChangeImpactReportSchema', 'textChangeEvidenceSchema', 'TEXT_CHANGE_IMPACT_MAX_FUTURE_CARDS', 'pureFormatting']) {
  if (!schema.includes(token)) fail(`strict schema missing ${token}`);
}
const delta = read('src/core/text-change-impact/index.ts');
for (const token of ['textChangeHash', 'buildTextChangeDelta', 'assertTextChangeEvidence', 'replace(/\\s/gu']) {
  if (!delta.includes(token)) fail(`deterministic delta/evidence owner missing ${token}`);
}
const analyzer = read('src/host/text-change-impact-service.ts');
for (const token of ['baseline.authoringBase.content', 'futureCardsAfterTarget', 'pureFormatting', 'classifyTextChangeImpact', 'textChangeImpactReportSchema.parse']) {
  if (!analyzer.includes(token)) fail(`Host analyzer missing ${token}`);
}
for (const forbidden of ['replaceRange(', 'save(']) {
  if (analyzer.includes(forbidden)) fail(`analyzer must remain zero-write but contains ${forbidden}`);
}
const parser = read('src/llm/analyze/text-change-impact.ts');
for (const token of ['parseTextChangeImpactOutput', 'assertTextChangeImpactOutput', 'sourceHash', 'futureCards']) {
  if (!parser.includes(token)) fail(`classifier/parser contract missing ${token}`);
}
const remote = read('src/host/remote/text-change-impact.ts');
for (const token of ['textChangeImpactPrepareInvocation', 'textChangeImpactReadInvocation', 'textChangeImpactCancelInvocation', 'strictCodec']) {
  if (!remote.includes(token)) fail(`strict impact Remote missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/text-change-impact.test.ts',
  'src/host/text-change-impact-service.test.ts',
  'src/host/outline-generation-baseline-service.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I112 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I112',
  requirement: 'R18-11b',
  remoteNamespace: 'novelTextChangeImpact',
  reportShape: ['impactId', 'projectId', 'baselineId', 'chapterId', 'sceneId', 'baselineSourceHash', 'finalSourceHash', 'delta', 'classification', 'confidence', 'evidence', 'eligibleFutureDetailBeatIds', 'affectedDetailBeatIds', 'rationale', 'analyzedAt'],
  classifications: ['wording-only', 'story-fact', 'plot-direction'],
  guarantees: [
    'frozen-12-case-corpus-with-4-held-out-cases-and-80-percent-threshold',
    'deterministic-whitespace-delta-and-exact-UTF16-evidence',
    'only-planned-cards-after-current-binding-enter-bounded-window',
    'pure-formatting-skips-semantic-LLM-classification',
    'illegal-model-output-evidence-and-unknown-card-fail-closed',
    'stale-B5-binding-source-hash-and-cancel-zero-write',
    'real-baseline-C5-B5-consumer-fixture',
    'real-DSH-client-binder-strict-Remote-fixture',
  ],
  explicitNonGoals: ['replacement-generation', 'B5-or-C6-write', 'ConfirmationGate', 'five-layer-parser-output-as-impact'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, additiveSuffix: impactIds },
  focusedSuites: 'frozen parser samples, Host baseline consumer, real binder, and contract lock suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i112-text-change-impact.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I112 smoke: frozen impact samples, deterministic evidence, future-card bounds, zero-write Host analyzer and real binder passed\n');
