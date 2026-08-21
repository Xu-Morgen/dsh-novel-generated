import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from '../../core/confirm/index.js';
import { StateEngine } from '../../core/state/index.js';
import type { WorldState } from '../../core/schema/state.js';
import {
  applyC2StateOperations,
  buildC2StateParserPrompt,
  parseC2StateFromNarrative,
  parseC2StateParserOutput,
  proposeLowConfidenceC2StateOperations,
} from './state.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const roots: string[] = [];
const initial: Omit<WorldState, 'seq'> = {
  id: 'state', version: 1, storyTime: 'day 1',
  scene: { location: '码头', timeOfDay: 'dawn', weather: 'clear', season: 'spring', atmosphere: 'quiet' },
  characters: [
    { characterId: 'lin', location: '码头', alive: true, health: 'well', mood: 'calm', inventory: ['铜钥匙'], condition: '', currentGoal: 'wait', flags: {} },
    { characterId: 'mira', location: '大厅', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '', currentGoal: 'wait', flags: {} },
    { characterId: 'guard', location: '门口', alive: true, health: 'well', mood: 'alert', inventory: [], condition: '', currentGoal: 'guard', flags: {} },
  ],
};
async function root() { const path = await mkdtemp(join(tmpdir(), 'novel-i25-')); roots.push(path); return path; }
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
function backendReturning(response: unknown) { return { async *stream() { yield JSON.stringify(response); } }; }

const sampleOperationSchema = z.object({
  op: z.literal('modify'), target: z.string(), field: z.string(), action: z.string(), value: z.json(), confidence: z.enum(['low', 'medium', 'high']),
}).strict();
const corpusSchema = z.object({
  iteration: z.literal('I25'), immutable: z.literal(true), threshold: z.number(), canonicalCaseIds: z.array(z.string()), heldOutCaseIds: z.array(z.string()),
  cases: z.array(z.object({ id: z.string(), prose: z.string(), expected: z.object({ ops: z.array(sampleOperationSchema) }).strict() })).min(10),
}).passthrough();

async function corpus() { return corpusSchema.parse(JSON.parse(await readFile(resolve(process.cwd(), 'samples/i25/cases.json'), 'utf8'))); }

describe('I25 C2 state parser', () => {
  it('limits the prompt to C2 and produces validated ops without writing state', async () => {
    const state = { ...initial, seq: 0 };
    const prompt = buildC2StateParserPrompt({ prose: '林舟来到钟楼。', state });
    expect(prompt).toContain('你是小说世界状态解析器');
    expect(prompt).toContain('不得输出关系、知情、正史、世界观、大纲、风格或正文改写');
    expect(prompt).toContain('"characterId":"lin"');
    expect(prompt).not.toMatch(/\b[BC][1-6]\b/);
    const result = await parseC2StateFromNarrative(backendReturning({ ops: [{ op: 'modify', target: 'lin', field: 'location', action: 'set', value: '钟楼', confidence: 'high' }] }), { prose: '林舟来到钟楼。', state }, settings);
    expect(result.ops).toHaveLength(1);
    expect(state.characters[0].location).toBe('码头');
  });

  it('mechanically applies valid medium/high ops in exactly one StateEngine snapshot', async () => {
    const engine = await StateEngine.open(await root(), initial);
    const result = await applyC2StateOperations(engine, { ops: [
      { op: 'modify', target: 'lin', field: 'location', action: 'set', value: '钟楼', confidence: 'high' },
      { op: 'modify', target: 'mira', field: 'inventory', action: 'add', value: '铜钥匙', confidence: 'medium' },
      { op: 'modify', target: 'scene', field: 'weather', action: 'set', value: '暴雨', confidence: 'high' },
      { op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'day 2', confidence: 'medium' },
    ] });
    expect(result.seq).toBe(1);
    expect(result.characters.find((item) => item.characterId === 'lin')?.location).toBe('钟楼');
    expect(result.characters.find((item) => item.characterId === 'mira')?.inventory).toEqual(['铜钥匙']);
    expect(result.scene.weather).toBe('暴雨');
    expect(result.storyTime).toBe('day 2');
  });

  it('fails closed for invalid JSON, target, field/action combinations, value types, and unavailable LLM', async () => {
    expect(() => parseC2StateParserOutput('not json')).toThrow(/valid JSON/);
    const state = { ...initial, seq: 0 };
    await expect(parseC2StateFromNarrative(backendReturning({ ops: [{ op: 'modify', target: 'missing', field: 'location', action: 'set', value: 'x', confidence: 'high' }] }), { prose: 'x', state }, settings)).rejects.toThrow(/Unknown C2 operation target/);
    await expect(parseC2StateFromNarrative(backendReturning({ ops: [{ op: 'modify', target: 'scene', field: 'weather', action: 'add', value: 'x', confidence: 'high' }] }), { prose: 'x', state }, settings)).rejects.toThrow(/Invalid C2 scene operation/);
    await expect(parseC2StateFromNarrative(backendReturning({ ops: [{ op: 'modify', target: 'lin', field: 'alive', action: 'set', value: 'yes', confidence: 'high' }] }), { prose: 'x', state }, settings)).rejects.toThrow(/alive value/);
    await expect(parseC2StateFromNarrative(undefined, { prose: 'x', state }, settings)).rejects.toThrow(/unavailable/);
  });

  it('routes low-confidence operations through I11 Gate and never writes before acceptance', async () => {
    const project = await root();
    const engine = await StateEngine.open(join(project, 'state'), initial);
    const gate = await ConfirmationGate.open(project);
    const output = { ops: [{ op: 'modify' as const, target: 'mira', field: 'flags' as const, action: 'set' as const, value: { key: 'recognizedSeal', value: true }, confidence: 'low' as const }] };
    await expect(applyC2StateOperations(engine, output)).rejects.toThrow(/require ConfirmationGate/);
    const record = await proposeLowConfidenceC2StateOperations(gate, 'proposal-i25-low', engine.current(), output);
    expect(record.status).toBe('pending');
    expect(engine.current().seq).toBe(0);
    expect(engine.current().characters.find((item) => item.characterId === 'mira')?.flags).toEqual({});
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    const results = [] as Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await parseC2StateFromNarrative(backendReturning(sample.expected), { prose: sample.prose, state: { ...initial, seq: 0 } }, settings);
      results.push({ id: sample.id, matched: JSON.stringify(output) === JSON.stringify(sample.expected), canonical: loaded.canonicalCaseIds.includes(sample.id), heldOut: loaded.heldOutCaseIds.includes(sample.id) });
    }
    const accuracy = results.filter((result) => result.matched).length / results.length;
    const heldOut = results.filter((result) => result.heldOut);
    expect(results).toHaveLength(11);
    expect(accuracy).toBeGreaterThanOrEqual(loaded.threshold);
    expect(results.filter((result) => result.canonical)).toHaveLength(3);
    expect(heldOut).toHaveLength(3);
    expect(heldOut.every((result) => result.matched)).toBe(true);
    expect(new Set(loaded.canonicalCaseIds).size).toBe(loaded.canonicalCaseIds.length);
    expect(loaded.heldOutCaseIds.every((id) => !loaded.canonicalCaseIds.includes(id))).toBe(true);
  });
});
