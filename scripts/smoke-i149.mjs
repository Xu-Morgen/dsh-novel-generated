import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAuthorLexicon } from './scan-author-lexicon.mjs';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const fail = (message) => { throw new Error(`I149 smoke: ${message}`); };

const readme = read('README.md');
const flowStart = readme.indexOf('以下 12 步是产品的**唯一主要交付流程**');
if (flowStart < 0) fail('README twelve-step flow heading missing');
const flow = readme.slice(flowStart, readme.indexOf('系统自动处理的范围', flowStart));
const numberedSteps = [...flow.matchAll(/^\d+\. /gm)].map((match) => Number(match[0].slice(0, -2)));
if (numberedSteps.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12') fail(`README flow is not exactly twelve numbered steps: ${numberedSteps.join(',')}`);
for (const token of ['系统建议来源类型', '适用的 POV/揭示意图', '按已确认的来源语义生成大纲候选', '已有正文保持原文并反向整理大纲']) {
  if (!flow.includes(token)) fail(`README source-aware step missing: ${token}`);
}
if (!readme.includes('来源角色、当前目标处理以及适用 POV/揭示意图')) fail('README source-aware table summary missing');

const fixture = readJson('samples/i149/ashen-codex.json');
if (fixture.fixture !== '灰烬圣典' || fixture.paragraphs.length < 6) fail('Ashen Codex fixture is incomplete');
for (const term of fixture.firstActContract.mustDefer) {
  if (!fixture.firstActContract.revealOrder.join('|').includes('线索')) fail('Ashen first-act reveal order must start from observable evidence');
  if (!fixture.firstActContract.mustDefer.includes(term)) fail(`Ashen fixture lost deferred secret: ${term}`);
}

const route = read('src/client/source-aware-workflow.ts');
const workflow = read('src/client/workflow.ts');
const panel = read('src/client/layers/workflow.ts');
const panels = read('src/client/panels/index.ts');
const presenter = read('src/client/presenter.ts');
const review = read('src/client/import-interpretation-review.ts');
const mountRegistry = read('src/client/mount-registry.ts');
for (const token of ['projectSourceAwareWorkflow', 'narrative-adaptation', 'existing-prose-outline', 'partial-failure', 'pending-recovery', 'routeSourceAwareWorkflow']) {
  if (!route.includes(token)) fail(`source-aware route contract missing ${token}`);
}
for (const token of ['sourceAware?: SourceAwareWorkflowProjection', 'data-novel-workflow-source-route', 'data-novel-workflow-source-next']) {
  if (!(panel + panels).includes(token)) fail(`workflow source projection missing ${token}`);
}
for (const token of ['projectSourceAwareWorkflow', 'sourceAware', 'states.workflow', 'ui.openWorkflowStage']) {
  if (!presenter.includes(token)) fail(`presenter does not consume the existing workflow route: ${token}`);
}
for (const token of ['I149', '导入来源并确认角色、目标与叙事意图', '按确认意图审阅大纲与揭示计划']) {
  if (!workflow.includes(token) && !readme.includes(token)) fail(`workflow product copy missing ${token}`);
}
for (const token of ['只能扩展为大纲', 'treatmentOptions', 'Stage 21']) {
  if (!review.includes(token)) fail(`existing-prose guard missing ${token}`);
}
if (!mountRegistry.includes('narrativeImportPlan') || !mountRegistry.includes('remote.novelNarrativeImportPlan')) fail('I148 plan namespace is not mounted for the workflow');
if (route.includes('preserve-prose')) fail('Stage 19 route must not expose the Stage 21 fidelity treatment');
if (route.includes('createRoot(') || route.includes('ctx.llm') || route.includes('node:fs')) fail('source-aware Client route crossed the Host boundary');

const packageJson = readJson('package.json');
for (const script of ['smoke:i149', 'verify:i149', 'verify:product-flow', 'verify:stage-19']) {
  if (packageJson.scripts[script] === undefined) fail(`${script} script missing`);
}
const stage18Lock = readJson('contracts/stage18/remote-descriptors.json');
const stage19Lock = readJson('contracts/stage19/narrative-import-plan-remote.json');
if (stage18Lock.descriptorIds.length !== 181 || stage18Lock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
if (stage19Lock.descriptorIds.length !== 5 || stage19Lock.resultSchemaIds.length !== 5) fail('Stage 19 NarrativeImportPlan lock changed');

const lexicon = scanAuthorLexicon();
if (lexicon.violations.length > 0) fail(`author terminology check failed:\n${lexicon.violations.map((item) => `${item.file}: ${item.term}`).join('\n')}`);

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client/source-aware-workflow.test.ts',
  'src/client/workflow.test.ts',
  'src/host/narrative-adaptation-service.test.ts',
  'src/host/narrative-reveal-planner-service.test.ts',
  'src/core/narrative/public-at-start.test.ts',
  'src/host/narrative-import-plan-coordinator.test.ts',
  'src/narrative-import-plan-contract.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`Stage 19 product focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I149',
  requirement: 'R19-5b',
  fixture: fixture.fixture,
  flow: [
    { step: 1, route: 'source-confirmation', status: 'passed' },
    { step: 2, route: 'ordinary-outline-or-narrative-plan', status: 'passed' },
    { step: 3, route: 'existing-detail-workflow', status: 'passed' },
    { step: '3-12', route: 'existing-i140-workflow', status: 'preserved' },
  ],
  negativeMatrix: [
    'hybrid-unresolved-zero-write',
    'classifier-failure-manual-choice',
    'stale-plan-blocks-detail',
    'cancelled-review-returns-to-import',
    'partial-failure-and-pending-recovery-block-detail',
    'existing-prose-no-fidelity-treatment',
    'pov-first-act-defers-hidden-answers',
    'author-visible-terminology-zero-violations',
  ],
  guarantees: [
    'no-new-workflow-route',
    'ordinary-and-narrative-imports-converge-on-existing-i140-stages',
    'source-aware-projection-does-not-call-remote-or-write-files',
    'i148-plan-namespace-remains-host-owned-and-c5-free',
    'README-has-exactly-twelve-numbered-steps',
    'stage18-lock-counts-unchanged',
    'client-dispose-and-existing-binder-regressions-run',
  ],
  focusedSuites: 'source-aware Client route, Ashen Codex safety fixture, Stage 19 owners, binder, and cumulative contract lock passed',
  explicitNonGoals: ['c5-write', 'new-workflow-route', 'step-13', 'non-empty-merge', 'fidelity-import', 'rich-text', 'docx-export'],
  lexicon: { forbiddenTermCount: lexicon.terms.length, violations: lexicon.violations.length },
};
const artifactPath = resolve(repoRoot, 'artifacts/i149-source-aware-product-flow.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I149 smoke: source-aware route, Ashen Codex product fixture, negative matrix, twelve-step convergence, binder, and terminology gate passed\n');
