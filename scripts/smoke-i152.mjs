import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I152 smoke: ${message}`); };
const service = read('src/host/llm-config-service.ts');
const composition = read('src/host/composition/base.ts');
const test = read('src/host/llm-config-service.test.ts');
const pkg = JSON.parse(read('package.json'));

for (const token of ['credentialRef', "Pick<CredentialProvider, 'describe' | 'set'>", 'credentialService.describe', 'credentialService.set']) {
  if (!service.includes(token)) fail(`credentials seam wiring missing ${token}`);
}
for (const forbidden of ['credentialsFile', "join(dshHome, '.credentials.yaml')", 'readYamlObject(credentials']) {
  if (service.includes(forbidden)) fail(`credential file ownership leaked into service: ${forbidden}`);
}
if (!composition.includes('createLlmConfigService(credentials, undefined, config.settingsRoot)')) fail('composition does not inject ctx.credentials');
for (const token of ['LocalCredentialProvider', 'parseCredentialsDocument', "source: 'file'", "source: 'env'", 'settings/A2 writes']) {
  if (!test.includes(token)) fail(`real provider/negative fixture missing ${token}`);
}
if (pkg.dependencies?.['@deepseek-ai/dsh-credentials'] !== '0.1.1-rc.2') fail('dsh-credentials production dependency is not pinned to rc.2');
if (pkg.devDependencies?.['@deepseek-ai/dsh-credentials-local'] !== '0.1.1-rc.2') fail('dsh-credentials-local test dependency is not pinned to rc.2');

// 直接交给当前 Node 执行包入口，避免 `.bin/vitest` 在 Windows 是 cmd shim、
// 在 POSIX 是 shell shim 的平台差异。
const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/host/llm-config-service.test.ts',
  'src/host/dsh-rc2-compat.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused credentials/host regression failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I152', requirement: 'R23-1',
  guarantees: [
    'ctx-credentials-is-canonical-owner', 'describe-never-returns-secret',
    'set-precedes-settings-and-a2-writes', 'rc2-versioned-refs-document',
    'other-refs-and-records-preserved', 'missing-or-readonly-provider-fails-closed',
    'novel-custom-route-and-public-remote-unchanged',
  ],
  consumerFixture: 'real rc.2 LocalCredentialProvider -> NovelLlmConfigService -> settings/A2 round-trip',
  explicitNonGoals: ['dsh-upgrade', 'model-route-change', 'remote-shape-change', 'prompt-or-sample-change', 'user-credential-file-migration', 'F1', 'F2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i152-credentials-seam.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I152 smoke: ctx.credentials owner, rc.2 versioned refs, fail-closed writes, and host compatibility passed\n');
