import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The smoke runner creates a capture file before spawning Vitest; keep that
// temporary file outside the mounted workspace in the Harness sandbox.
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I121 smoke: ${message}`); };

const context = read('src/host/writing-context.ts');
const pipeline = read('src/core/pipeline/index.ts');
const workflow = read('src/client/writing-workflow.ts');
const chapters = read('src/client/layers/chapters.ts');
const composition = read('src/host/composition/management.ts');
for (const token of ['orderNarrativeScenes', 'selectRecentNarrativeScenes', 'currentBaseline', 'WritingContextProvenance', 'textFingerprint']) {
  if (!context.includes(token)) fail(`context owner missing ${token}`);
}
if (context.includes('chapters.flatMap((chapter) => chapter.scenes).slice(-3)')) fail('caller/file-order history fallback remains');
if (pipeline.includes('.sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))')) fail('pipeline reorders cross-chapter history by local scene.index');
for (const token of ['freshWritingWorkflow', 'settleWritingWorkflow', 'cancelWritingWorkflow', 'navigationRevision']) {
  if (!workflow.includes(token)) fail(`workflow state contract missing ${token}`);
}
for (const token of ['data-novel-writing-workflow', 'workflow: freshWritingWorkflow', 'chaptersWorkflowForRevision']) {
  if (!chapters.includes(token) && !read('src/client/store/index.ts').includes(token)) fail(`Client workflow wiring missing ${token}`);
}
for (const token of ['textFingerprint: (projectId)', 'sceneOutlineBinding: sceneOutlineBindingService', 'outlineGenerationBaseline: outlineGenerationBaselineService']) {
  if (!composition.includes(token)) fail(`composition missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/writing-context.test.ts',
  'src/client-i121-writing-workflow.test.ts',
  'src/core/pipeline/index.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I121 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I121',
  requirement: 'R18-6c',
  guarantees: [
    'shared-context-owner-orders-chapter-index-then-scene-index',
    'bounded-history-contains-only-target-preceding-non-empty-saved-scenes',
    'chosen-c5-content-is-the-only-history-prose-input',
    'fresh-current-i108-baseline-is-required-in-production-composition',
    'stale-or-missing-baseline-fails-closed-before-generation',
    'text-fingerprint-barrier-rejects-save-during-context-assembly',
    'context-provenance-carries-bounded-source-hashes-without-old-draft-content',
    'client-workflow-state-is-revision-scoped-and-cancel-safe',
    'continue-queue-agent-share-the-injected-context-owner',
  ],
  focusedSuites: 'I121 context, pipeline-order, and Client workflow tests passed',
  explicitNonGoals: ['continue-writing-homepage', 'background-auto-accept', 'new-writing-remote-method', 'persistent-client-workflow-history'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i121-revised-context.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I121 smoke: narrative order, saved chosen history, fresh baseline gate, and revision-safe Client workflow passed\n');
