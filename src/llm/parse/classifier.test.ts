import { describe, expect, it } from 'vitest';
import { mergeClassifierCandidates, parseClassifierOutput } from '../../core/schema/classifier.js';
import { classifySettings } from './classifier.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const candidate = (id: string, sourceId: string, quote = '证据') => ({ entry: { id, sourceLayer: 'B2' as const, sourceId, title: '北境', content: '北境由旧王统治。', tags: ['history'], immutable: true as const, version: 1 }, sourceIds: [sourceId], sourceEvidence: [{ sourceId, quote }] });

describe('I41 classifier', () => {
  it('strictly parses and merges duplicate candidates with provenance', () => {
    const merged = mergeClassifierCandidates([candidate('north-a', 'north'), candidate('north-b', 'north-2', '第二证据')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sourceIds).toEqual(['north', 'north-2']);
    expect(merged[0]?.sourceEvidence).toHaveLength(2);
    expect(() => parseClassifierOutput(JSON.stringify({ candidates: [{ ...candidate('x', 'north'), extra: true }] }))).toThrow();
  });

  it('routes through Host LLM and fails closed when unavailable', async () => {
    const backend = { async *stream() { yield JSON.stringify({ candidates: [candidate('north', 'north')] }); } };
    await expect(classifySettings(backend, { sources: [{ sourceLayer: 'B2', sourceId: 'north', title: '北境', content: '北境由旧王统治。', tags: ['history'] }] }, settings)).resolves.toMatchObject({ candidates: [{ entry: { sourceId: 'north' } }] });
    await expect(classifySettings(undefined, { sources: [{ sourceLayer: 'B2', sourceId: 'north', title: '北境', content: '北境由旧王统治。', tags: ['history'] }] }, settings)).rejects.toThrow(/unavailable/);
  });
});
