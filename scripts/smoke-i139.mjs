import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I139 smoke: ${message}`); };

const nav = read('src/client/nav.ts');
const workflow = read('src/client/workflow.ts');
const panel = read('src/client/layers/workflow.ts');
const presenter = read('src/client/presenter.ts');
const store = read('src/client/store/index.ts');
const controllers = read('src/client/controllers.ts');
const shellTests = read('src/client/workflow.test.ts');
const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ["id: 'workflow'", "id: 'story'", "id: 'advanced'", "label: '设置'", "DEFAULT_VIEW: WorkbenchViewId = 'workflow'"]) {
  if (!nav.includes(token)) fail(`workflow navigation missing ${token}`);
}
for (const token of ["id: 'import'", "id: 'outline'", "id: 'detail'", "id: 'baseline'", "id: 'prose'", "id: 'finalization'", "id: 'review'", "id: 'export'", 'readWorkflowResume', 'writeWorkflowResume']) {
  if (!workflow.includes(token)) fail(`workflow resume model missing ${token}`);
}
for (const token of ['data-novel-workflow-panel', 'data-novel-workflow-stage', 'data-novel-workflow-next-action', '不在普通流程里显示内部 ID']) {
  if (!panel.includes(token)) fail(`workflow panel contract missing ${token}`);
}
for (const token of ['openWorkflowStage', 'workflowStageForView', 'data-novel-workflow-back', 'writeWorkflowResume']) {
  if (!presenter.includes(token)) fail(`workflow presenter bridge missing ${token}`);
}
for (const token of ['workflowResume', 'workflowStage', 'activeView = DEFAULT_VIEW']) {
  if (!store.includes(token)) fail(`workflow store contract missing ${token}`);
}
if (!controllers.includes('readWorkflowResume(projectId)')) fail('project reopen does not read workflow resume');
for (const token of ['defines the eight README stages', 'round-trips only valid project-scoped resume records', 'opens at workflow', 'reopens the project at its saved stage']) {
  if (!shellTests.includes(token)) fail(`workflow consumer fixture missing ${token}`);
}
if (lock.descriptorIds.length !== 181 || lock.resultSchemaIds.length !== 87) fail('I139 changed the Stage 18 Remote lock');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client/workflow.test.ts',
  'src/client-shell-navigation.test.ts',
  'src/client-shell-workbench.test.ts',
  'src/client-shell-ia.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`workflow Client suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I139', requirement: 'R18-15a',
  guarantees: [
    'workflow-is-the-default-and-only-primary-author-path',
    'eight-readme-stages-project-onto-existing-panel-owners',
    'legacy-view-identities-and-capabilities-remain-reachable',
    'project-scoped-stage-and-scene-resume-is-fail-safe',
    'story-advanced-settings-navigation-groups-have-no-technical-copy-in-primary-labels',
    'workflow-panel-does-not-request-hidden-advanced-services',
    'narrow-keyboard-and-aria-compatible-shell-anchors-remain-intact',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'workflow model, shell navigation, grouped workbench, and Client resume fixtures passed',
  explicitNonGoals: ['new-host-remote', 'independent-continue-writing-home', 'removal-of-legacy-views', 'workflow-domain-truth'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i139-primary-workflow-shell.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I139 smoke: primary workflow shell, layered navigation, resume, and compatibility passed\n');
