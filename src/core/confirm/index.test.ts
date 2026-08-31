import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from './index.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  // Keep the fresh-process fixture off a WSL-mounted Windows temp path; the
  // child tsx loader must be able to reopen the same file-backed Gate store.
  const root = await mkdtemp(join('/tmp', 'novel-i11-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const proposal = { id: 'canon-fix-1', kind: 'canon-correction', payload: { targetId: 'evt-1', reason: 'wrong location' } };

async function pendingFromFreshProcess(projectDirectory: string): Promise<unknown> {
  const moduleUrl = new URL('./index.ts', import.meta.url).href;
  const script = [
    `const { ConfirmationGate } = await import(${JSON.stringify(moduleUrl)});`,
    'const gate = await ConfirmationGate.open(process.env.CONFIRMATION_PROJECT);',
    `const { writeFile } = await import('node:fs/promises'); await writeFile(process.env.CONFIRMATION_RESULT, JSON.stringify(gate.pending()), 'utf8');`,
  ].join(' ');
  const scriptPath = join(projectDirectory, 'fresh-pending.mjs');
  const resultPath = join(projectDirectory, 'fresh-result.json');
  await writeFile(scriptPath, script, 'utf8');
  await execFileAsync(process.execPath, ['--import', 'tsx', scriptPath], {
    // The repository may run from a WSL-mounted Windows workspace; force the
    // child tsx loader's IPC/temp path to a writable native temp directory.
    env: { ...process.env, CONFIRMATION_PROJECT: projectDirectory, CONFIRMATION_RESULT: resultPath, TMPDIR: '/tmp', TMP: '/tmp', TEMP: '/tmp', VITEST: undefined, VITEST_POOL_ID: undefined, VITEST_WORKER_ID: undefined, NODE_OPTIONS: undefined },
  });
  return JSON.parse(await readFile(resultPath, 'utf8'));
}

describe('I11 ConfirmationGate', () => {
  it('keeps proposals pending and persists exactly one idempotent acceptance decision', async () => {
    const gate = await ConfirmationGate.open(await temporaryRoot());
    await gate.propose(proposal);

    expect(gate.pending()).toHaveLength(1);
    const [accepted, repeated] = await Promise.all([gate.accept(proposal.id), gate.accept(proposal.id)]);

    expect(accepted.status).toBe('accepted');
    expect(repeated).toEqual(accepted);
    expect(gate.list()).toEqual([{ ...proposal, version: 1, status: 'accepted' }]);
    expect(gate.pending()).toEqual([]);
  });

  it('discards rejected proposals and rejects a conflicting later resolution', async () => {
    const gate = await ConfirmationGate.open(await temporaryRoot());
    await gate.propose(proposal);

    const rejected = await gate.reject(proposal.id);
    expect((await gate.reject(proposal.id)).status).toBe('rejected');
    expect(rejected.status).toBe('rejected');
    await expect(gate.accept(proposal.id)).rejects.toThrow(/already rejected/);
  });

  it('restores pending proposals in a fresh process after restart', async () => {
    const root = await temporaryRoot();
    const gate = await ConfirmationGate.open(root);
    await gate.propose(proposal);

    expect(await pendingFromFreshProcess(root)).toEqual([{ ...proposal, version: 1, status: 'pending' }]);
  });

  it('serializes concurrent proposals from separately opened gates for one project', async () => {
    const root = await temporaryRoot();
    const [first, second] = await Promise.all([ConfirmationGate.open(root), ConfirmationGate.open(root)]);

    await Promise.all([
      first.propose(proposal),
      second.propose({ id: 'canon-fix-2', kind: 'canon-correction', payload: { targetId: 'evt-2' } }),
    ]);

    const reopened = await ConfirmationGate.open(root);
    expect(reopened.list().map((record) => record.id)).toEqual(['canon-fix-1', 'canon-fix-2']);
  });

  it('rejects duplicate proposal replay, malformed JSON payloads, and unknown ids', async () => {
    const gate = await ConfirmationGate.open(await temporaryRoot());
    await gate.propose(proposal);

    await expect(gate.propose(proposal)).rejects.toThrow(/Duplicate confirmation proposal/);
    await expect(gate.propose({ id: 'bad', kind: 'invalid', payload: undefined } as unknown as typeof proposal)).rejects.toThrow();
    await expect(gate.accept('missing')).rejects.toThrow(/Unknown confirmation/);
    expect(() => gate.get('../bad')).toThrow();
  });

  it('permits auto-confirm only through the explicit test-only option', async () => {
    const gate = await ConfirmationGate.open(await temporaryRoot(), { autoConfirmForTests: true });
    const accepted = await gate.propose(proposal);

    expect(accepted.status).toBe('accepted');
    expect((await gate.accept(proposal.id)).status).toBe('accepted');
  });

  it('fails closed on a malformed or replayed persisted document', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'confirmations.yaml'), [
      'confirmations:',
      '  - id: duplicate',
      '    kind: test',
      '    payload: null',
      '    version: 1',
      '    status: pending',
      '  - id: duplicate',
      '    kind: test',
      '    payload: null',
      '    version: 1',
      '    status: pending',
      '',
    ].join('\n'), 'utf8');
    await expect(ConfirmationGate.open(root)).rejects.toThrow(/Invalid confirmation document/);
  });
});
