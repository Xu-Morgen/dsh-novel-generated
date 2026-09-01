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
const fail = (message) => { throw new Error(`I140 smoke: ${message}`); };

/**
 * I140 test-only product harness：每一步消费既有 Host owner 的真实测试夹具，
 * fake LLM 只替代模型边界；Client 只验证 workflow/Remote 消费，不复制领域状态。
 */
const evidence = [
  {
    step: 1,
    name: '导入来源并由作者裁决',
    files: ['src/host/onboarding-analyzer-service.test.ts', 'src/host/onboarding-adjudication-service.test.ts', 'src/client-onboarding-adjudication.test.ts'],
    tokens: ['fake', 'accept + apply lands', 'treats an undecided layer as pending', 'edit submits the exact user value'],
  },
  {
    step: 2,
    name: '生成大纲候选并确认',
    files: ['src/host/long-draft-workflow-coordinator.test.ts'],
    tokens: ['begin/status/cancel/result expose lifecycle', 'I120 proposes through I11', 'idempotent after reopen', 'rejects without narrative writes'],
  },
  {
    step: 3,
    name: '按范围生成细纲',
    files: ['src/host/outline-generation-scope-service.test.ts', 'src/host/outline-generation-baseline-service.test.ts'],
    tokens: ['act, beat, bound-chapter, and all', 'fails closed before any generation/write', 'recovers after restart'],
  },
  {
    step: 4,
    name: '建立正文生成基线',
    files: ['src/host/outline-generation-baseline-service.test.ts', 'src/host/writing-context.test.ts'],
    tokens: ['freezes B5/C5/binding owners', 'marks only the affected baseline stale', '当前 baseline stale 时'],
  },
  {
    step: 5,
    name: '生成正文候选并处理重写',
    files: ['src/host/writing-adjudication-service.test.ts', 'src/host/review-repair-workflow.test.ts'],
    tokens: ['fakeLlm', 'I110 additive preview', 'C5 CAS failure', 'lets hard issues produce candidates'],
  },
  {
    step: 6,
    name: '接受为草稿、手工微调或拒绝',
    files: ['src/host/writing-adjudication-service.test.ts', 'src/client-i121-writing-workflow.test.ts'],
    tokens: ['adoptDraft', '只落地 C5 chosen 正文', 'renders the workflow state', '重复 accept 幂等'],
  },
  {
    step: 7,
    name: '分析最终正文变化',
    files: ['src/host/finalization-plan-builder.test.ts'],
    tokens: ['FinalizationPlanBuilder', 'wording-only', 'sourceHash 不匹配', 'freshness 变化'],
  },
  {
    step: 8,
    name: '一次确认并受控同步',
    files: ['src/host/finalization-coordinator.test.ts', 'src/remote-binder.test.ts'],
    tokens: ['one proposal/one acceptance', 'source freshness changes fail closed', 'proposeFinalization', 'acceptFinalization'],
  },
  {
    step: 9,
    name: '完成当前卡并定位下一目标',
    files: ['src/host/finalization-coordinator.test.ts', 'src/host/outline-reconciliation-service.test.ts'],
    tokens: ['next: { status: \'continued\' }', 'completeAuthorized', 'continues to the next baseline'],
  },
  {
    step: 10,
    name: '按有效正文与 POV 组装下一次上下文',
    files: ['src/host/writing-context.test.ts'],
    tokens: ['pov', 'chosen 分支可见', '未来场景不可见', 'fail closed'],
  },
  {
    step: 11,
    name: '全书完成与一致性发布门',
    files: ['src/host/book-completion-service.test.ts', 'src/client-panels-review.test.ts'],
    tokens: ['重开服务后结果一致', 'pending 定稿', '审校失败只失败本次读取', '发布门'],
  },
  {
    step: 12,
    name: '带目录的单一 TXT/Markdown 主稿',
    files: ['src/host/manuscript-compiler.test.ts', 'src/client-panels-import-export.test.ts'],
    tokens: ['唯一 TXT/Markdown 主稿', '旧分支不应混入', 'receipt 已过期', '正文在发布门扫描后发生变化'],
  },
];

for (const item of evidence) {
  const source = item.files.map((path) => read(path)).join('\n');
  for (const token of item.tokens) {
    if (!source.includes(token)) fail(`step ${item.step} evidence missing: ${item.files.join(', ')} / ${token}`);
  }
}

const workflow = read('src/client/workflow.ts');
const workflowPanel = read('src/client/layers/workflow.ts');
const presenter = read('src/client/presenter.ts');
const nav = read('src/client/nav.ts');
const orchestration = read('src/host/composition/orchestration.ts');
const management = read('src/host/composition/management.ts');
const remoteBinder = read('src/remote-binder.test.ts');
const importExport = read('src/client/layers/import-export.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['WORKFLOW_STAGE_IDS', 'readWorkflowResume', 'writeWorkflowResume', 'freshWorkflow']) {
  if (!workflow.includes(token)) fail(`workflow resume contract missing ${token}`);
}
for (const token of ['data-novel-workflow-panel', 'data-novel-workflow-stage-state', 'aria-labelledby', '不在普通流程里显示内部 ID']) {
  if (!workflowPanel.includes(token)) fail(`workflow product surface missing ${token}`);
}
for (const token of ['openWorkflowStage', 'workflowStageForView', 'data-novel-workflow-back', 'writeWorkflowResume']) {
  if (!presenter.includes(token)) fail(`workflow route bridge missing ${token}`);
}
for (const token of ["DEFAULT_VIEW: WorkbenchViewId = 'workflow'", "id: 'story'", "id: 'advanced'", "id: 'settings'"]) {
  if (!nav.includes(token)) fail(`workflow navigation grouping missing ${token}`);
}
if (!/^\s*workflow: \(\{ h, workflow, projectName, openWorkflowStage \}\)/m.test(read('src/client/panels/index.ts'))) {
  fail('workflow registry requests hidden advanced services');
}
for (const token of ['llm', 'novelImportExport', 'compileManuscript']) {
  if (!(orchestration + management).includes(token)) fail(`Host composition product boundary missing ${token}`);
}
for (const token of ['createOnboardingAnalyzerService(llm', 'createWritingAdjudicationService({']) {
  if (!management.includes(token)) fail(`Host fake-LLM owner wiring missing ${token}`);
}
for (const token of ['novelWriting/adoptDraft', 'novelWriting/proposeFinalization', 'novelReview/bookScan', 'novelImportExport/compileManuscript', 'rejected "input"', 'rejected "result"']) {
  if (!remoteBinder.includes(token)) fail(`real binder product boundary missing ${token}`);
}
for (const token of ['data-novel-ie-compile-txt', 'data-novel-ie-compile-md', '编译单一全文']) {
  if (!importExport.includes(token)) fail(`export consumer missing ${token}`);
}
if (lock.descriptorIds.length !== 183 || lock.resultSchemaIds.length !== 89) fail('Stage 18 + I150 Remote lock is not 183/89');
if (lock.descriptorIds.slice(-2).join('|') !== 'novel-creation-tool/novelOutlineDetailGeneration/append|novel-creation-tool/novelOutlineDetailGeneration/select') fail('I150 strict additions are not the Remote lock tail');

const clientSource = read('src/client.ts') + read('src/client/presenter.ts') + read('src/client/layers/workflow.ts');
for (const token of ['http://', 'https://', 'api.openai', 'api.anthropic', 'Authorization:']) {
  if (clientSource.toLowerCase().includes(token.toLowerCase())) fail(`Client contains a forbidden direct model/file boundary: ${token}`);
}
const lexicon = scanAuthorLexicon();
if (lexicon.violations.length > 0) {
  fail(`final author lexicon gate found violations:\n${lexicon.violations.map((item) => `${item.file}: ${item.term}`).join('\n')}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/onboarding-analyzer-service.test.ts',
  'src/host/onboarding-adjudication-service.test.ts',
  'src/host/long-draft-workflow-coordinator.test.ts',
  'src/host/outline-generation-scope-service.test.ts',
  'src/host/outline-generation-baseline-service.test.ts',
  'src/host/writing-context.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/host/review-repair-workflow.test.ts',
  'src/host/finalization-plan-builder.test.ts',
  'src/host/finalization-coordinator.test.ts',
  'src/host/book-completion-service.test.ts',
  'src/host/manuscript-compiler.test.ts',
  'src/client/workflow.test.ts',
  'src/client-i121-writing-workflow.test.ts',
  'src/client-onboarding-adjudication.test.ts',
  'src/client-panels-review.test.ts',
  'src/client-panels-import-export.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`product flow focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 12000)}`);

const artifact = {
  iteration: 'I140',
  requirement: 'R18-15b',
  flow: evidence.map(({ step, name }) => ({ step, name, status: 'passed' })),
  negativeMatrix: [
    'author-rejection-and-edited-value',
    'stale-baseline-and-source-hash',
    'single-confirmation-rejection-and-retryable-failure',
    'restart-resume-and-recomputation',
    'pov-knowledge-filter-and-future-context-boundary',
    'missing-next-target-and-incomplete-book-block-release',
    'old-branch-and-technical-metadata-excluded-from-manuscript',
    'txt-and-markdown-single-manuscript-output',
  ],
  guarantees: [
    'fixed-fake-llm-runs-through-existing-host-owner-consumers',
    'readme-twelve-step-author-flow-has-observable-test-evidence',
    'candidate-adoption-and-finalization-have-separate-write-boundaries',
    'finalization-uses-one-confirmation-and-fails-closed-on-freshness-change',
    'book-readiness-recomputes-after-restart-and-blocks-hard-issues',
    'single-txt-and-markdown-manuscripts-preserve-order-and-toc',
    'workflow-is-default-and-client-does-not-call-model-or-file-endpoints',
    'final-author-lexicon-scan-has-zero-rendered-literal-violations',
    'real-client-binder-and-stage18-contract-lock-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  lexicon: { forbiddenTermCount: lexicon.terms.length, violations: lexicon.violations.length },
  focusedSuites: 'README flow Host owners, Client consumers, fake-LLM boundaries, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['new-domain-feature', 'new-remote-method', 'mock-ui-screenshot-as-evidence', 'gold-or-threshold-change', 'automatic-publishing-upload'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i140-primary-author-workflow.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I140 smoke: README twelve-step product flow, negative matrix, final lexicon gate, binder, and lock passed\n');
