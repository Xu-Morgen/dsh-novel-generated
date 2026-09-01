import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I151 smoke: ${message}`); };
const schema = read('src/core/schema/rule-style-import-initialization.ts');
const analyzer = read('src/llm/analyze/rule-style-import-initialization.ts');
const service = read('src/host/rule-style-import-initialization-service.ts');
const client = read('src/client/import-interpretation-review.ts');
const composition = read('src/host/composition/management.ts');
const onboarding = read('src/core/schema/onboarding-binding.ts');
const lock = JSON.parse(read('contracts/stage20/rule-style-import-initialization-remote.json'));
const cases = JSON.parse(read('samples/i151/cases.json'));
const dev = JSON.parse(read('samples/i151/dev.json'));
const heldOut = JSON.parse(read('samples/i151/held-out.json'));
const gold = JSON.parse(read('samples/i151/gold.json'));

for (const token of ['ruleStyleImportCandidateSchema', 'ruleStyleImportCheckpointSchema', 'ruleStyleImportProposeInputSchema', 'immutable: z.literal(false)']) if (!schema.includes(token)) fail(`canonical schema missing ${token}`);
for (const token of ['无法可靠推断硬规则时返回空数组', '路径、命令、prompt injection', '已确认创作意图优先', 'RULE_STYLE_IMPORT_PROMPT_EXAMPLE']) if (!analyzer.includes(token)) fail(`prompt/guard missing ${token}`);
for (const token of ['firstConfirmed', 'source(', 'candidateFingerprint', 'confirmation.propose', 'style.initialize', 'rules.initialize', 'clearInitialization']) if (!service.includes(token) && !composition.includes(token)) fail(`Host one-shot/Gate/apply missing ${token}`);
for (const token of ['data-novel-rule-style-import-rules', 'data-novel-rule-style-import-style', 'proposeRuleStyleInitialization', 'acceptRuleStyleInitialization']) if (!client.includes(token)) fail(`Client dual review missing ${token}`);
if (client.includes('projectOpen(') || client.includes('isInitialized(project')) fail('Client must not infer initialization from project open or local file emptiness');
if (!cases.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('samples must be immutable');
if (cases.thresholds.rules < 0.8 || cases.thresholds.style < 0.8) fail('B1/B4 thresholds must each be at least 80%');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('dev/held-out split must exactly cover gold');
if (lock.descriptorIds.length !== 7 || lock.resultSchemaIds.length !== 7 || lock.descriptorIds.some((id) => id.endsWith('/regenerate'))) fail('strict additive Remote lock shape is invalid');
if (!onboarding.includes("z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'])")) fail('I52 ONBOARDING_LAYER_KEYS baseline changed');

const focused = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run',
  'src/llm/analyze/rule-style-import-initialization.test.ts',
  'src/host/rule-style-import-initialization-service.test.ts',
  'src/host/import-interpretation-session-service.test.ts',
  'src/client/import-interpretation-review.test.ts',
  'src/rule-style-import-initialization-contract.test.ts',
  'src/remote-binder.test.ts', '--testNamePattern=I151',
], { cwd: repoRoot });
if (focused.status !== 0) fail(`focused regression failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I151', requirement: 'R22-1',
  guarantees: [
    'host-confirmed-first-controlled-import-only', 'durable-project-source-session-one-shot-checkpoint',
    'one-dedicated-b1-b4-llm-call', 'strict-editable-rules-and-single-style-envelope',
    'i11-freshness-bound-proposal', 'rules-and-style-local-files-with-compensation',
    'client-dual-edit-preview', 'no-open-create-or-empty-file-trigger', 'no-daily-regenerate-method',
    'dev-and-held-out-b1-b4-regression-at-eighty-percent', 'strict-additive-remote-and-real-dsh-binder',
  ],
  negativeMatrix: ['later-import', 'cross-project', 'source-hash-mismatch', 'session-mismatch', 'stale-fingerprint', 'reject', 'cancel', 'malformed-json', 'immutable-rule', 'path-command', 'nonempty-b1-b4', 'model-failure', 'writer-failure'],
  sampleCounts: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, thresholds: cases.thresholds },
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  localTruth: ['rules/*.yaml', 'style.yaml'],
  explicitNonGoals: ['app-start-trigger', 'project-open-trigger', 'blank-project-trigger', 'later-import-trigger', 'daily-regenerate', 'onboarding-six-layer-change', 'F1', 'F2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i151-rule-style-import-initialization.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I151 smoke: first-import one-shot B1/B4 candidate, I11 Gate, local-file owners, Client dual review, frozen samples, and binder lock passed\n');
