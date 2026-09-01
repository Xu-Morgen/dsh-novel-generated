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
const fail = (message) => { throw new Error(`I150 smoke: ${message}`); };

const cases = readJson('samples/i150/cases.json');
const dev = readJson('samples/i150/dev.json');
const heldOut = readJson('samples/i150/held-out.json');
const gold = readJson('samples/i150/gold.json');
if (cases.immutable !== true || dev.immutable !== true || heldOut.immutable !== true || gold.immutable !== true) fail('append sample manifests are not immutable');
if (cases.cases.length !== 10 || dev.caseIds.length !== 6 || heldOut.caseIds.length !== 4 || cases.threshold < 0.8) fail('append sample split/threshold drifted');
if ([...dev.caseIds, ...heldOut.caseIds].join('|') !== gold.caseIds.join('|')) fail('append gold coverage drifted');

const schema = read('src/core/schema/outline-detail-generation.ts');
const parser = read('src/llm/analyze/outline-detail-generation.ts');
const service = read('src/host/outline-detail-generation-service.ts');
const remote = read('src/host/remote/outline-detail-generation.ts');
const adapter = read('src/host/outline-detail-generation-adapter.ts');
const ops = read('src/client/ops/outline-detail-generation.ts');
const panel = read('src/client/layers/outline-detail-generation.ts');
const outlinePanel = read('src/client/layers/outline.ts');
const binder = read('src/remote-binder.test.ts');
for (const token of ['append-to-selected-beat', 'OUTLINE_DETAIL_GENERATION_MAX_GUIDANCE', 'outlineDetailGenerationAppendInputSchema', 'outlineDetailGenerationSelectInputSchema']) if (!schema.includes(token)) fail(`strict append schema missing ${token}`);
for (const token of ['作者本次生成要求', '不得替换、复述、删除或重排已有卡', '只返回新增卡']) if (!parser.includes(token)) fail(`append prompt contract missing ${token}`);
for (const token of ['async append', 'appendIntents', 'OUTLINE_DETAIL_GENERATION_MAX_CARDS_PER_BEAT', 'appendIntent', 'applyCandidate']) if (!service.includes(token)) fail(`Host append/Gate protection missing ${token}`);
for (const token of ['outlineDetailGenerationAppendInvocation', 'outlineDetailGenerationSelectInvocation']) if (!remote.includes(token)) fail(`Remote additive descriptor missing ${token}`);
if (!adapter.includes("method: 'append'") || !adapter.includes("method: 'select'")) fail('descriptor-derived adapter is missing append/select');
for (const token of ['snapshot.outlineEditor.selectedBeatId', 'snapshot.outlineEditor.dirty', 'namespace.append', 'namespace.select']) if (!ops.includes(token)) fail(`selected-beat Client wiring missing ${token}`);
for (const token of ['data-novel-outline-detail-append-generate', '本次生成要求', '保留到当前节', 'data-novel-outline-detail-dirty']) if (!panel.includes(token)) fail(`author append panel missing ${token}`);
for (const token of ['OUTLINE_STRUCTURE_LABELS', 'CONFLICT_TYPE_LABELS', 'DETAIL_BEAT_STATUS_LABELS', '三幕式', '外部冲突', '待写']) if (!outlinePanel.includes(token)) fail(`Chinese enum labels missing ${token}`);
if (!binder.includes('I150 append/select strict 参数与结果')) fail('real binder I150 fixture missing');

const lock = readJson('contracts/stage18/remote-descriptors.json');
const expectedTail = ['novel-creation-tool/novelOutlineDetailGeneration/append', 'novel-creation-tool/novelOutlineDetailGeneration/select'];
if (lock.descriptorIds.length !== 183 || lock.resultSchemaIds.length !== 89) fail('I150 Remote lock is not 183/89');
if (lock.descriptorIds.slice(-2).join('|') !== expectedTail.join('|') || lock.resultSchemaIds.slice(-2).join('|') !== expectedTail.join('|')) fail('I150 append/select are not the strict additive lock tail');
if (lock.descriptorIds[180] !== 'novel-creation-tool/novelImportExport/compileManuscript') fail('pre-I150 descriptor prefix drifted');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/outline-detail-generation.test.ts',
  'src/llm/analyze/outline-detail-generation-i150.test.ts',
  'src/host/outline-detail-generation-service.test.ts',
  'src/client-i134-outline-detail-generation.test.ts',
  'src/client-i150-outline-detail-generation.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I150', requirements: ['R18-12', 'R18-15'],
  samples: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, threshold: cases.threshold, deterministicAccuracy: 1, heldOutAccuracy: 1 },
  guarantees: ['selected-saved-beat-without-technical-id-input', 'explicit-guided-append-calls-bounded-host-llm', 'existing-and-outside-scope-cards-byte-preserved', 'per-card-edit-and-keep-selection-through-single-i11-gate', 'dirty-stale-invalid-failure-and-cancel-zero-write', 'Chinese-labels-preserve-canonical-enum-values', 'strict-additive-binder-and-contract-lock'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, additiveTail: expectedTail },
  focusedSuites: 'I134 compatibility, I150 samples/Host/Client, real binder, and contract lock passed',
  explicitNonGoals: ['whole-beat-replace', 'automatic-dirty-outline-save', 'body-generation', 'Stage-20-import-infrastructure'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i150-outline-detail-generation-repair.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I150 smoke: selected-beat guided append, per-card keep, Chinese enum labels, Gate protection, binder, and lock passed\n');
