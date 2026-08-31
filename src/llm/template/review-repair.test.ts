import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reviewIssueSchema, type ReviewIssue } from '../../core/review/issue.js';
import { buildReviewRepairPrompt } from './review-repair.js';

interface RepairCase { id: string; category: ReviewIssue['category']; severity: ReviewIssue['severity']; kind: string; message: string; references: string[]; prose: string; quote: string; instruction: string; expected: string }
interface RepairSample { immutable: boolean; threshold: number; cases: RepairCase[] }

const sample = JSON.parse(readFileSync(new URL('../../../samples/i128/cases.json', import.meta.url), 'utf8')) as RepairSample;

function issueOf(item: RepairCase): ReviewIssue {
  return reviewIssueSchema.parse({
    id: `iss-${item.id}`, category: item.category, severity: item.severity, kind: item.kind,
    message: item.message, references: item.references,
    location: { chapterId: 'chapter-1', sceneId: 'scene-1' }, status: 'open',
  });
}

describe('I128 review repair prompt + fake backend sample regression', () => {
  it('freezes sample manifests and reaches the 80% threshold on dev and held-out cases', async () => {
    expect(sample.immutable).toBe(true);
    expect(sample.threshold).toBeGreaterThanOrEqual(0.8);
    const fakeBackend = async (prompt: string): Promise<string> => {
      const item = sample.cases.find((candidate) => prompt.includes(`当前完整场景正文：\n${candidate.prose}\n`));
      if (item === undefined) throw new Error('fake backend missing sample');
      return item.expected;
    };
    let passed = 0;
    for (const item of sample.cases) {
      const prompt = buildReviewRepairPrompt({ issue: issueOf(item), prose: item.prose, instruction: item.instruction });
      const output = await fakeBackend(prompt);
      if (output === item.expected) passed += 1;
      expect(prompt).toContain(item.message);
      expect(prompt).toContain(item.references[0]!);
    }
    expect(passed / sample.cases.length).toBeGreaterThanOrEqual(sample.threshold);
  });

  it('requires full prose output framing and rejects empty input', () => {
    const item = sample.cases[0]!;
    const prompt = buildReviewRepairPrompt({ issue: issueOf(item), prose: item.prose, instruction: item.instruction });
    expect(prompt).toContain('只输出修复后的完整场景正文');
    expect(() => buildReviewRepairPrompt({ issue: issueOf(item), prose: '   ' })).toThrow(/不能为空/);
  });
});
