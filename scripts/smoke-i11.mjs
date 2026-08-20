import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ConfirmationGate } from '../lib/core/confirm/index.js';

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i11-'));
try {
  const gate = await ConfirmationGate.open(root);
  const proposal = { id: 'scene-reparse', kind: 'future-reparse', payload: { sceneId: 'scene-1' } };
  await gate.propose(proposal);
  if (gate.pending().length !== 1) throw new Error('Unresolved proposal was not retained as pending');

  const [first, repeated] = await Promise.all([gate.accept(proposal.id), gate.accept(proposal.id)]);
  if (first.status !== 'accepted' || repeated.status !== 'accepted' || gate.list().length !== 1) {
    throw new Error('Acceptance did not persist exactly one idempotent decision');
  }

  const moduleUrl = pathToFileURL(join(process.cwd(), 'lib/core/confirm/index.js')).href;
  const script = [
    `import { ConfirmationGate } from ${JSON.stringify(moduleUrl)};`,
    'const gate = await ConfirmationGate.open(process.env.CONFIRMATION_PROJECT);',
    'if (gate.get("scene-reparse").status !== "accepted") process.exit(1);',
  ].join(' ');
  await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, CONFIRMATION_PROJECT: root },
  });
  console.log('I11 smoke: persistent proposal, exactly-once decision, idempotent replay, and fresh-process recovery passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
