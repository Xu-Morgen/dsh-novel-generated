import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Run the unchanged frozen sample consumers without the retired DSH lock-count
// assertions in historical I145/I157 smoke scripts (desktop baseline §0.1).
await mkdir('artifacts/desktop/ui/i200', { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'src/llm/analyze/narrative-adaptation.test.ts',
  'src/llm/analyze/narrative-adaptation-i157.test.ts',
  'src/llm/analyze/narrative-adaptation-nested.test.ts',
  'src/host/narrative-adaptation-service.test.ts',
  'src/desktop/main/narrative-output-error.test.ts',
  '--reporter=json', '--outputFile=artifacts/desktop/ui/i200/samples.json'], { stdio: 'inherit' });
await writeFile('artifacts/desktop/ui/i200/sample-validation.json', JSON.stringify({
  iteration: 'I200', passed: result.status === 0,
  mode: 'deterministic fake-backend regression, not live provider quality measurement',
  unchangedCorpora: ['samples/i145', 'samples/i157'], newCorpus: 'samples/i200/cases.json',
  evidence: 'samples.json',
}, null, 2));
if (result.status !== 0) process.exit(result.status ?? 1);
