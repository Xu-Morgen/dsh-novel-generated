import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanonLedger } from '../lib/core/canon/index.js';

const EVENT_COUNT = 10_000;
const QUERY_COUNT = 1_000;
// Latency budgets (loose guards against O(n^2) or full-file-rewrite regressions).
const APPEND_BUDGET_MS = 30_000;
const QUERY_BUDGET_MS = 10_000;

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i5-'));
try {
  const ledger = await CanonLedger.open(root);

  const appendStart = performance.now();
  for (let index = 0; index < EVENT_COUNT; index += 1) {
    await ledger.append({
      id: `evt-${index}`,
      storyTime: `day ${index % 100}`,
      kind: index % 2 === 0 ? 'event' : 'dialogue',
      summary: `Event number ${index} happened`,
      detail: `Detail record for event ${index}, keyword marker ${index % 50}.`,
      participants: [`char-${index % 20}`],
      location: `place-${index % 10}`,
      consequences: [],
      affectedLayers: ['state'],
    });
  }
  const appendMs = performance.now() - appendStart;

  const queryStart = performance.now();
  let hits = 0;
  for (let index = 0; index < QUERY_COUNT; index += 1) {
    hits += ledger.query({ participant: `char-${index % 20}` }).length;
  }
  const queryMs = performance.now() - queryStart;

  if (ledger.count() !== EVENT_COUNT) throw new Error(`Expected ${EVENT_COUNT} events, got ${ledger.count()}`);
  if (ledger.get(EVENT_COUNT - 1).seq !== EVENT_COUNT - 1) throw new Error('Last seq is not monotonic');
  // Each of the 20 participants appears in EVENT_COUNT/20 events.
  const expectedHits = QUERY_COUNT * (EVENT_COUNT / 20);
  if (hits !== expectedHits) throw new Error(`Participant query sweep returned ${hits} hits, expected ${expectedHits}`);

  const correction = await ledger.supersede('evt-0', {
    id: 'evt-0-fix', storyTime: 'day 0', summary: 'Corrected first event',
    detail: 'Correction record.', participants: ['char-0'], location: 'place-0',
    consequences: [], affectedLayers: ['state'],
  });
  if (correction.supersedes !== 'evt-0') throw new Error('supersede did not point at target');
  if (ledger.query({ superseded: 'active' }).length !== EVENT_COUNT) throw new Error('Active filter excluded the wrong count');

  const raw = await readFile(join(root, 'canon.jsonl'), 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length !== EVENT_COUNT + 1) throw new Error(`Expected ${EVENT_COUNT + 1} jsonl lines, got ${lines.length}`);

  if (appendMs > APPEND_BUDGET_MS) throw new Error(`Append latency ${appendMs.toFixed(1)}ms exceeds budget ${APPEND_BUDGET_MS}ms`);
  if (queryMs > QUERY_BUDGET_MS) throw new Error(`Query latency ${queryMs.toFixed(1)}ms exceeds budget ${QUERY_BUDGET_MS}ms`);

  console.log(`I5 smoke: ${EVENT_COUNT} appends in ${appendMs.toFixed(1)}ms (${(appendMs / EVENT_COUNT).toFixed(3)}ms/append)`);
  console.log(`I5 smoke: ${QUERY_COUNT} participant queries in ${queryMs.toFixed(1)}ms (${(queryMs / QUERY_COUNT).toFixed(3)}ms/query)`);
  console.log('I5 smoke: append-only jsonl, monotonic seq, query, and supersede passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
