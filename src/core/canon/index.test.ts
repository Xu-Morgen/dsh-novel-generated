import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CanonLedger } from './index.js';
import type { CanonEventInput } from '../schema/canon.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i5-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const base: CanonEventInput = {
  id: 'evt-1', storyTime: 'day 1', kind: 'event', summary: 'Lin reached the gate',
  detail: 'At dawn Lin walked to the outer gate.', participants: ['lin'], location: 'gate',
  consequences: [], affectedLayers: ['state'],
};

describe('I5 CanonLedger', () => {
  it('appends with a monotonic seq and restores the ledger after reopening', async () => {
    const root = await temporaryRoot();
    const ledger = await CanonLedger.open(root);
    const first = await ledger.append(base);
    const second = await ledger.append({ ...base, id: 'evt-2', storyTime: 'day 2' });
    expect(first.seq).toBe(0);
    expect(second.seq).toBe(1);

    const reopened = await CanonLedger.open(root);
    expect(reopened.count()).toBe(2);
    expect(reopened.get(0).summary).toBe('Lin reached the gate');
    expect(reopened.get(1).seq).toBe(1);
  });

  it('queries deterministically by participant, location, storyTime, keyword, and kind', async () => {
    const ledger = await CanonLedger.open(await temporaryRoot());
    await ledger.append(base);
    await ledger.append({
      id: 'evt-2', storyTime: 'day 2', kind: 'revelation', summary: 'Lin learned the secret',
      detail: 'The gate hides a buried key.', participants: ['lin'], location: 'square',
      consequences: [], affectedLayers: ['knowledge'],
    });
    await ledger.append({
      id: 'evt-3', storyTime: 'day 2', kind: 'dialogue', summary: 'Mara met Lin',
      detail: 'Mara warned Lin about the storm.', participants: ['mara', 'lin'], location: 'square',
      consequences: [], affectedLayers: ['state'],
    });

    expect(ledger.query({ participant: 'mara' }).map((e) => e.id)).toEqual(['evt-3']);
    expect(ledger.query({ location: 'square' }).map((e) => e.id)).toEqual(['evt-2', 'evt-3']);
    expect(ledger.query({ storyTime: 'day 2' }).map((e) => e.id)).toEqual(['evt-2', 'evt-3']);
    expect(ledger.query({ keyword: 'secret' }).map((e) => e.id)).toEqual(['evt-2']);
    expect(ledger.query({ keyword: 'STORM' }).map((e) => e.id)).toEqual(['evt-3']);
    expect(ledger.query({ kind: 'revelation' }).map((e) => e.id)).toEqual(['evt-2']);
    expect(ledger.query({}).map((e) => e.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
  });

  it('supersedes by appending a correction while retaining and marking the old line', async () => {
    const root = await temporaryRoot();
    const ledger = await CanonLedger.open(root);
    await ledger.append(base);
    const correction = await ledger.supersede('evt-1', {
      id: 'evt-1-fix', storyTime: 'day 1', summary: 'Lin reached the inner gate',
      detail: 'Correction: it was the inner gate, not the outer.', participants: ['lin'],
      location: 'gate', consequences: [], affectedLayers: ['state'],
    });
    expect(correction.kind).toBe('correction');
    expect(correction.supersedes).toBe('evt-1');

    const all = ledger.query({});
    expect(all.find((e) => e.id === 'evt-1')?.supersededBy).toBe('evt-1-fix');
    expect(ledger.query({ superseded: 'active' }).map((e) => e.id)).toEqual(['evt-1-fix']);
    expect(ledger.query({ superseded: 'superseded' }).map((e) => e.id)).toEqual(['evt-1']);

    const raw = await readFile(join(root, 'canon.jsonl'), 'utf8');
    expect(raw).toContain('"summary":"Lin reached the gate"');
  });

  it('rejects duplicate ids and direct correction appends', async () => {
    const ledger = await CanonLedger.open(await temporaryRoot());
    await ledger.append(base);
    await expect(ledger.append({ ...base, id: 'evt-1' })).rejects.toThrow(/Duplicate canon event id/);
    await expect(ledger.append({ ...base, id: 'evt-2', kind: 'correction' })).rejects.toThrow(/Use supersede/);
  });

  it('rejects superseding an unknown or already-superseded event', async () => {
    const ledger = await CanonLedger.open(await temporaryRoot());
    await ledger.append(base);
    const fix = { id: 'fix', storyTime: 'day 1', summary: 'fix', detail: '', participants: ['lin'], location: 'gate', consequences: [], affectedLayers: ['state'] };
    await ledger.supersede('evt-1', { ...fix, id: 'fix-1' });
    await expect(ledger.supersede('missing', fix)).rejects.toThrow(/Unknown canon event/);
    await expect(ledger.supersede('evt-1', { ...fix, id: 'fix-2' })).rejects.toThrow(/already superseded/);
  });

  it('rejects a hand-rewritten file whose seq breaks monotonicity or schema', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'canon.jsonl'), [
      JSON.stringify({ ...base, seq: 0, immutable: true }),
      JSON.stringify({ ...base, id: 'evt-2', seq: 0, immutable: true }),
      '',
    ].join('\n'), 'utf8');
    await expect(CanonLedger.open(root)).rejects.toThrow(/seq out of order/);
  });

  it('rejects a tampered line with immutable false or a supersedes dangling reference', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'canon.jsonl'), JSON.stringify({ ...base, seq: 0, immutable: false }) + '\n', 'utf8');
    await expect(CanonLedger.open(root)).rejects.toThrow(/Invalid canon line/);

    const root2 = await temporaryRoot();
    await writeFile(join(root2, 'canon.jsonl'), JSON.stringify({ ...base, seq: 0, immutable: true, kind: 'correction', supersedes: 'ghost' }) + '\n', 'utf8');
    await expect(CanonLedger.open(root2)).rejects.toThrow(/references unknown event/);
  });

  it.each([[-1, 99, 1.5]])('rejects invalid seq lookup %s', async (seq) => {
    const ledger = await CanonLedger.open(await temporaryRoot());
    await ledger.append(base);
    expect(() => ledger.get(seq)).toThrow(/Unknown canon seq/);
  });
});
