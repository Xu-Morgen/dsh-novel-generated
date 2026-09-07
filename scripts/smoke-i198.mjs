import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// The real Main handler consumer covers successful first imports; the Client
// consumer covers startup rejection and recovery without changing Host policy.
await mkdir('artifacts/i198', { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'src/client/import-interpretation-review.test.ts',
  'src/desktop/main/project-handlers.test.ts',
  '--reporter=json', '--outputFile=artifacts/i198/tests.json'], { stdio: 'inherit' });
await writeFile('artifacts/i198/validation.json', JSON.stringify({
  iteration: 'I198', passed: result.status === 0,
  evidence: 'artifacts/i198/tests.json',
  scope: ['startup rejection', 'same-session retry', 'duplicate begin guard', 'first-import Main consumer'],
}, null, 2));
if (result.status !== 0) process.exit(result.status ?? 1);
