import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const fail = (message) => { throw new Error(`I134 smoke: ${message}`); };

const cases = readJson('samples/i134/cases.json');
const dev = readJson('samples/i134/dev.json');
const heldOut = readJson('samples/i134/held-out.json');
const gold = readJson('samples/i134/gold.json');
const schema = read('src/core/schema/outline-detail-generation.ts');
const parser = read('src/llm/analyze/outline-detail-generation.ts');
const service = read('src/host/outline-detail-generation-service.ts');
const remote = read('src/host/remote/outline-detail-generation.ts');
const adapter = read('src/host/outline-detail-generation-adapter.ts');
const panel = read('src/client/layers/outline-detail-generation.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/outline-detail-generation-service.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

if (cases.immutable !== true || gold.immutable !== true || cases.cases.length !== 12 || dev.caseIds.length !== 8 || heldOut.caseIds.length !== 4) fail('sample manifest is not the frozen 8 dev + 4 held-out set');
if (cases.threshold < 0.8 || gold.caseIds.length !== 12) fail('sample threshold/gold coverage drifted');
for (const token of ['outlineDetailGenerationParserInputSchema', 'outlineDetailGenerationParserOutputSchema', 'generatedDetailBeatCount', 'preserve']) if (!schema.includes(token)) fail(`strict schema missing ${token}`);
for (const token of ['collectCandidate', 'Regeneration must return exactly one', '不得输出 id']) if (!parser.includes(token)) fail(`parser contract missing ${token}`);
for (const token of ['freshScope', 'applyCandidate', 'outline.save', 'ConfirmationService', 'candidateFingerprint']) if (!service.includes(token)) fail(`Host candidate/Gate owner missing ${token}`);
for (const token of ['outlineDetailGenerationInvocations', 'generate', 'regenerate', 'propose', 'accept', 'reject', 'cancel']) if (!remote.includes(token)) fail(`Remote contract missing ${token}`);
if (!adapter.includes('defineRemote') || !panel.includes('data-novel-outline-detail-accept') || !binder.includes('novelOutlineDetailGeneration')) fail('Host adapter, author panel, or binder fixture missing');
if (!consumer.includes('saveCalls') || !consumer.includes('restartFixture')) fail('Host zero-write/restart acceptance fixtures missing');
if (lock.descriptorIds.length !== 171 || lock.resultSchemaIds.length !== 77) fail('Stage 18 lock counts drifted');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelOutlineDetailGeneration/cancel') fail('I134 descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelOutlineDetailGeneration/cancel') fail('I134 result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/outline-detail-generation.test.ts',
  'src/host/outline-detail-generation-service.test.ts',
  'src/client-i134-outline-detail-generation.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I134', requirement: 'R18-12b', samples: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, threshold: cases.threshold },
  guarantees: ['strict-json-detail-fields-with-host-minted-identity', 'default-fill-missing-and-explicit-existing-regeneration', 'bounded-candidate-session-with-per-card-edit-regenerate-skip', 'single-i11-gate-apply-preserves-outside-scope', 'stale-parse-failure-reject-cancel-and-restart-idempotence', 'real-client-binder-and-contract-lock-pass'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'parser samples, Host candidate/Gate owner, author panel, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['body-generation', 'automatic-baseline-creation', 'whole-outline-replace', 'background-batch-generation'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i134-scoped-detail-outline.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I134 smoke: frozen samples, strict parser, scoped candidate review, I11 Gate, binder, and lock passed\n');
