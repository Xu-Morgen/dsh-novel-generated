import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I109 R18-2a smoke：会话态五层 StructuralPreviewPlan、纯 diff 与 stale 零写消费夹具。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I109 smoke: ${message}`); };

const plan = read('src/host/writing-adjudication/structural-preview-plan.ts');
for (const token of [
  'structuralPreviewLayerBaselineSchema', 'structuralPreviewParserOutputsSchema', 'structuralPreviewChangeSchema',
  'STRUCTURAL_PREVIEW_MAX_OPERATIONS', 'STRUCTURAL_PREVIEW_MAX_CHANGES', 'STRUCTURAL_PREVIEW_MAX_BYTES',
  'prepareStructuralPreviewPlan', 'assertStructuralPreviewPlanFresh', 'consumeStructuralPreviewPlan',
  'deepFreeze', 'assertLayerBaselineIntegrity',
]) if (!plan.includes(token)) fail(`StructuralPreviewPlan contract missing ${token}`);
for (const forbidden of ['writeFile', 'appendFile', 'Remote', 'prose: string']) {
  if (plan.includes(forbidden)) fail(`session-only plan contains forbidden persistence/Remote token: ${forbidden}`);
}
const landing = read('src/host/writing-adjudication/landing-saga.ts');
for (const token of ['replayStructuralPreviewPlan', 'consumeStructuralPreviewPlan', '首个 writer']) {
  if (!landing.includes(token)) fail(`landing-saga consumer seam missing ${token}`);
}
const fixture = read('src/host/writing-adjudication/structural-preview-plan.test.ts');
for (const token of ['deterministic bounded changes', 'stale owners', 'duplicate entities', 'oversized output']) {
  if (!fixture.includes(token)) fail(`I109 consumer/negative fixture missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/writing-adjudication/structural-preview-plan.test.ts',
  'src/llm/parse/state.test.ts',
  'src/llm/parse/relationship.test.ts',
  'src/llm/parse/knowledge.test.ts',
  'src/llm/parse/canon.test.ts',
  'src/llm/parse/worldview.test.ts',
  'src/host/five-layer-writeback.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`five-layer parser/writeback fixtures failed (exit ${focused.status}):\n${focused.output.slice(0, 5000)}`);

const artifact = {
  iteration: 'I109',
  requirement: 'R18-2a',
  owner: 'Host writing-adjudication StructuralPreviewPlan session runtime',
  layers: ['c2', 'c1', 'c3', 'c4', 'b2'],
  guarantees: ['deterministic-hash-only-diff', 'strict-layer-snapshots', 'duplicate-and-size-bounds', 'all-owner-freshness-check', 'deep-frozen-session-plan', 'canonical-replay-order', 'stale-zero-write-landing-saga'],
  explicitNonGoals: ['plan-persistence', 'candidate-or-reparse-Remote', 'Client-contract', 'prompt-or-parser-schema-change', 'C5-prose-projection'],
  focusedSuites: 'StructuralPreviewPlan, five parser held-out suites, and five-layer writeback passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i109-structural-preview-plan.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log('I109 smoke: session-only five-layer StructuralPreviewPlan, bounded pure diff, freshness gate and landing-saga zero-write fixture passed');
