import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I164 smoke: ${message}`); };

const service = read('src/host/llm-config-service.ts');
const consumer = read('scripts/i164-llm-reasoning-capability-consumer.mjs');
const pkg = JSON.parse(read('package.json'));

for (const token of [
  'NOVEL_CUSTOM_REASONING_EFFORTS',
  "off: null",
  "low: 'low'",
  "high: 'high'",
  "max: 'max'",
  'reasoningEfforts: { ...NOVEL_CUSTOM_REASONING_EFFORTS }',
]) if (!service.includes(token)) fail(`provider capability declaration missing: ${token}`);

for (const token of [
  "from '@deepseek-ai/dsh-llm-pi-ai'",
  'PiAiConfig(rawSection)',
  'UNSUPPORTED_REASONING_EFFORT',
  "['off', 'low', 'high', 'max']",
  'resolveCallConfig',
  'for (const reasoningEfforts of',
]) if (!consumer.includes(token)) fail(`real rc.2 consumer invariant missing: ${token}`);

if (pkg.devDependencies?.['@deepseek-ai/dsh-llm-pi-ai'] !== '0.1.1-rc.2') {
  fail('real llm-pi-ai consumer dependency is not pinned to the project DSH family baseline');
}

const unchangedAssets = {
  'contracts/stage18/remote-descriptors.json': 'cd960a7bcc00e7b53f5f2a0fdf3610feaa1293d6b02bf729b2d9d7068265a1d7',
  'src/core/schema/llm-config.ts': '086641bb21fbfbc63baf77a03faf4b32aade28157258d30d84ad6a6d29477dc5',
  'src/core/settings-index/index.ts': '267d9ff35fd1ad3ea9525f85b7cee1b7e0244d906fb478b5569c11bfbd9f2750',
  'src/llm/port/index.ts': 'dfe31a8f4b9b3913c41504dc74e2e9121219b1be47ac24e2cc90553fad395c99',
  'src/client/settings.ts': '5484abc595451d22eab3a7b45cba460ef81f4c8ff49b94a6c1c2bb9e3737d059',
};
for (const [path, expected] of Object.entries(unchangedAssets)) {
  if (digest(path) !== expected) fail(`protected public/A2/Client contract changed: ${path}`);
}

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/host/llm-config-service.test.ts',
  'src/host/dsh-rc2-compat.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`reasoning capability/host regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const realConsumer = spawnCaptured('node', [resolve(repoRoot, 'scripts/i164-llm-reasoning-capability-consumer.mjs')], {
  cwd: repoRoot,
  env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' },
});
if (realConsumer.status !== 0) fail(`real rc.2 consumer failed (exit ${realConsumer.status}):\n${realConsumer.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I164',
  requirement: 'R33-1',
  rootCause: {
    featureIntroduction: '0073524 added A2/port reasoning without provider model capability metadata',
    compatibilityTrigger: 'I85 pinned DSH 0.1.1-rc.2 with provider-I/O preflight capability validation',
    notCausedBy: ['I152 credentials owner migration', 'I153-I163 product changes'],
  },
  guarantees: [
    'saved-hand-declared-model-offers-off-low-high-max',
    'legacy-id-only-route-reproduces-unsupported-reasoning-effort',
    'real-rc2-llm-pi-ai-accepts-low-high-max-before-provider-io',
    'invalid-reasoning-capability-fails-closed',
    'other-provider-and-a2-sampling-remain-intact',
  ],
  consumerFixture: 'scripts/i164-llm-reasoning-capability-consumer.mjs: NovelLlmConfigService settings YAML -> real rc.2 PiAi Config/apply -> LlmRuntime model/call resolution',
  unchangedAssets,
  explicitNonGoals: ['real-billable-request', 'dsh-upgrade', 'remote-or-client-change', 'a2-schema-change', 'prompt-or-sample-change', 'F1', 'F2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i164-novel-custom-reasoning-capability.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I164 smoke: root-cause lock, rc.2 capability consumer, negative validation, and protected contracts passed\n');
