import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  buildRelationshipStyleDetectorPrompt,
  detectRelationshipAndStyleSoftConstraints,
  parseRelationshipStyleDetectorOutput,
  relationshipStyleDetectionInputSchema,
} from './relationship-style.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const expectedViolationSchema = z.object({
  kind: z.enum(['relationship-drift', 'style-deviation']),
  severity: z.literal('soft'),
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)).min(1),
}).strict();
const sampleCaseSchema = relationshipStyleDetectionInputSchema.extend({
  id: z.string().trim().min(1),
  expected: z.array(expectedViolationSchema),
});
const sampleCorpusSchema = z.object({
  iteration: z.literal('I24'),
  immutable: z.literal(true),
  threshold: z.number(),
  canonicalCaseIds: z.array(z.string()),
  heldOutCaseIds: z.array(z.string()),
  cases: z.array(sampleCaseSchema).min(10),
}).passthrough();

async function loadCorpus() {
  const text = await readFile(resolve(process.cwd(), 'samples/i24/cases.json'), 'utf8');
  return sampleCorpusSchema.parse(JSON.parse(text));
}

function backendReturning(response: unknown, seen?: string[]) {
  return {
    async *stream(request: { prompt: string }) {
      seen?.push(request.prompt);
      yield JSON.stringify(response);
    },
  };
}

function detectionInput() {
  return {
    prose: '米拉毫无保留地把密钥交给林舟。',
    relationships: [{
      id: 'mira-lin', version: 1, from: 'mira', to: 'lin', type: 'rivalry' as const,
      affinity: -60, trust: 5, status: '公开敌对', milestones: [], knownTo: ['mira', 'lin'],
    }],
    style: {
      id: 'style-main', version: 1, name: '港湾阴谋', person: 'third-limited' as const,
      tense: 'past' as const, povScope: 'single' as const, tone: '克制紧张', proseStyle: '冷峻简洁',
      chapterFormat: '场景标题', dialogueConventions: '使用中文引号', forbidden: [],
    },
  };
}

describe('I24 relationship/style semantic soft-constraint detector', () => {
  it('limits the prompt to C1/B4 views and expressly excludes hard-check domains', () => {
    const prompt = buildRelationshipStyleDetectorPrompt(detectionInput());
    expect(prompt).toContain('"id":"mira-lin"');
    expect(prompt).toContain('"id":"style-main"');
    expect(prompt).not.toContain('"knownTo"');
    expect(prompt).not.toContain('"version"');
    expect(prompt).toContain('给定关系状态发生显著关系漂移，或偏离叙事风格档案');
    expect(prompt).toContain('不得检查规则、正史、POV 知情、大纲、实体引用或任何硬约束');
    expect(prompt).toContain('不得输出 hard');
    expect(prompt).not.toMatch(/\b[BC][1-6]\b/);
  });

  it('returns soft findings and delegates the warning decision to I20', async () => {
    const seen: string[] = [];
    const result = await detectRelationshipAndStyleSoftConstraints(backendReturning({
      violations: [{ kind: 'relationship-drift', severity: 'soft', message: '信任关系偏离。', references: ['mira-lin'] }],
    }, seen), detectionInput(), settings);
    expect(result.adjudication.status).toBe('warn');
    expect(result.violations[0]).toMatchObject({ kind: 'relationship-drift', severity: 'soft' });
    expect(seen).toHaveLength(1);
  });

  it('fails closed for malformed JSON, hard findings, unknown fields, undisclosed references, and unavailable LLM', async () => {
    expect(() => parseRelationshipStyleDetectorOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseRelationshipStyleDetectorOutput('{"violations":[{"kind":"style-deviation","severity":"hard","message":"x","references":["style-main"]}]}')).toThrow();
    expect(() => parseRelationshipStyleDetectorOutput('{"violations":[],"extra":true}')).toThrow();
    await expect(detectRelationshipAndStyleSoftConstraints(
      backendReturning({ violations: [{ kind: 'relationship-drift', severity: 'soft', message: '凭空关系。', references: ['missing'] }] }),
      detectionInput(), settings,
    )).rejects.toThrow(/undisclosed/);
    await expect(detectRelationshipAndStyleSoftConstraints(
      backendReturning({ violations: [{ kind: 'style-deviation', severity: 'soft', message: '凭空风格。', references: ['mira-lin'] }] }),
      detectionInput(), settings,
    )).rejects.toThrow(/undisclosed/);
    await expect(detectRelationshipAndStyleSoftConstraints(undefined, detectionInput(), settings)).rejects.toThrow(/unavailable/);
  });

  it('regresses the frozen 10-case corpus including its held-out subset at threshold', async () => {
    const corpus = await loadCorpus();
    const results: Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }> = [];
    for (const sample of corpus.cases) {
      const result = await detectRelationshipAndStyleSoftConstraints(
        backendReturning({ violations: sample.expected }),
        { prose: sample.prose, relationships: sample.relationships, style: sample.style },
        settings,
      );
      const matched = JSON.stringify(result.violations) === JSON.stringify(sample.expected)
        && result.adjudication.status === (sample.expected.length > 0 ? 'warn' : 'pass');
      results.push({
        id: sample.id,
        matched,
        canonical: corpus.canonicalCaseIds.includes(sample.id),
        heldOut: corpus.heldOutCaseIds.includes(sample.id),
      });
    }
    const accuracy = results.filter((result) => result.matched).length / results.length;
    const canonical = results.filter((result) => result.canonical);
    const heldOut = results.filter((result) => result.heldOut);
    expect(results).toHaveLength(10);
    expect(accuracy).toBeGreaterThanOrEqual(corpus.threshold);
    expect(canonical).toHaveLength(3);
    expect(canonical.every((result) => result.matched)).toBe(true);
    expect(heldOut).toHaveLength(3);
    expect(heldOut.every((result) => result.matched)).toBe(true);
    expect(new Set(corpus.canonicalCaseIds).size).toBe(corpus.canonicalCaseIds.length);
    expect(new Set(corpus.heldOutCaseIds).size).toBe(corpus.heldOutCaseIds.length);
    expect(corpus.heldOutCaseIds.every((id) => !corpus.canonicalCaseIds.includes(id))).toBe(true);
  });
});
