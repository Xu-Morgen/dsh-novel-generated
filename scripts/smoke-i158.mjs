import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I158 smoke: ${message}`); };

const hostFace = read('src/host/remote/host-contribution.ts');
for (const token of [
  'importInterpretationInvocations',
  'importInterpretationAnalysisInvocations',
  'narrativeAdaptationInvocations',
  'narrativeRevealInvocations',
  'narrativeImportPlanInvocations',
  'ruleStyleImportInitializationInvocations',
]) {
  if (!hostFace.includes(`...${token}`)) fail(`Host face registration missing ${token}`);
}

const contractDigests = {
  'contracts/stage18/remote-descriptors.json': 'cd960a7bcc00e7b53f5f2a0fdf3610feaa1293d6b02bf729b2d9d7068265a1d7',
  'contracts/stage19/import-interpretation-remote.json': '9f8427f805563aaca71d514c21e7e3b057e2d5df234cafb493cfacb85afa36b5',
  'contracts/stage19/import-interpretation-analysis-remote.json': 'b2f6c6104ffc2d870aa5a93efee99a47e359fde2766aba01c91e1c39cdb74b2a',
  'contracts/stage19/narrative-adaptation-remote.json': '212868ace02dbd80dfdca03ffbd1a27227c8481230471c6b3560e79475852e4b',
  'contracts/stage19/narrative-reveal-remote.json': 'c2d62db6e82a9353c1b9719cb77b07cd6fb03255dde69805fd375f7af8a302ed',
  'contracts/stage19/narrative-import-plan-remote.json': '2f5bafa88871321e585ee417edc403f043f87938458fc530fad0672a40a45757',
  'contracts/stage20/rule-style-import-initialization-remote.json': '5228ffd7b8a68d275991edf607e4d1466e502504588f63839c8b6d7ad442ab09',
};
for (const [path, expected] of Object.entries(contractDigests)) {
  if (digest(path) !== expected) fail(`existing contract changed: ${path}`);
}

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/host/remote/host-contribution-i158.test.ts',
  'src/index.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`Host registration/Gateway regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I158',
  requirement: 'R29-1',
  sourceImportDescriptorCount: 28,
  guarantees: [
    'all-six-source-import-client-contributions-registered-in-single-host-face',
    'real-dsh-api-interceptor-claims-novelImportInterpretation-create',
    'real-gateway-dispatch-creates-draft-session',
    'unknown-endpoint-not-claimed',
    'fiber-dispose-withdraws-local-descriptors',
    'withdrawn-endpoint-returns-structured-error-not-bare-404',
    'zero-duplicate-host-descriptor-ids',
  ],
  unchangedContractDigests: contractDigests,
  unchangedBoundaries: ['public-invocations', 'schemas-and-results', 'domain-services', 'client-ui', 'llm-and-samples', 'confirmation-gate', 'docx-chunks', 'dsh-pin'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i158-source-remote-host-registration.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I158 smoke: source import Host face completeness, real /api claim/dispatch, dispose, and unchanged contracts passed\n');
