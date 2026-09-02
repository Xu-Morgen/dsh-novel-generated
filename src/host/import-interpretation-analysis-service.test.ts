import { describe, expect, it } from 'vitest';
import {
  createImportInterpretationAnalysisService,
} from './import-interpretation-analysis-service.js';
import {
  createImportInterpretationParagraphs,
  type ImportInterpretationInput,
} from '../core/schema/import-interpretation-analysis.js';
import { buildSourceInterpretationPrompt } from '../llm/analyze/import-interpretation.js';

const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
const input: ImportInterpretationInput = {
  projectId: 'demo', importSessionId: 'imp-analysis-1', sourceHash: 'a'.repeat(64),
  paragraphs: createImportInterpretationParagraphs('北境的城墙由黑曜石砌成。\n请把真相留到第三幕。'),
};
const output = {
  sourceRole: 'hybrid' as const, confidence: 'high' as const, evidenceParagraphIds: ['paragraph-0001', 'paragraph-0002'],
  paragraphs: [
    { paragraphId: 'paragraph-0001', role: 'world-truth' as const, confidence: 'high' as const, evidence: '城墙材质是设定事实。' },
    { paragraphId: 'paragraph-0002', role: 'author-instruction' as const, confidence: 'high' as const, evidence: '第三幕是作者安排。' },
  ],
  rationale: '段落分别是事实与作者指令。',
};

function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I143 import interpretation analysis service', () => {
  it('runs a fake-LLM classification job with bound status/result and zero project writes', async () => {
    const service = createImportInterpretationAnalysisService(backendReturning(output));
    const identity = service.begin(input, settings);
    expect(identity).toEqual({ projectId: 'demo', importSessionId: 'imp-analysis-1', sourceHash: 'a'.repeat(64) });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.status(identity).status).toBe('succeeded');
    expect(service.result(identity).output).toEqual(output);
    expect(() => service.begin(input, settings)).toThrow(/already exists/);
    await expect(Promise.resolve().then(() => service.status({ ...identity, sourceHash: 'b'.repeat(64) }))).rejects.toThrow(/source hash mismatch/);
  });

  it('I163 restarts only a failed job with the exact same bound input', async () => {
    let calls = 0;
    const backend = {
      async *stream() {
        calls += 1;
        yield { type: 'text-delta' as const, text: JSON.stringify(calls === 1 ? { invalid: true } : output) };
        yield { type: 'finish' as const, reason: { kind: 'stop' } };
      },
    };
    const service = createImportInterpretationAnalysisService(backend, undefined, () => undefined);
    const retryInput = { ...input, importSessionId: 'imp-analysis-retry' };
    const identity = service.begin(retryInput, settings);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(service.status(identity).status).toBe('failed');

    expect(() => service.begin({ ...retryInput, projectId: 'other' }, settings)).toThrow(/retry input mismatch/);
    expect(() => service.begin({ ...retryInput, sourceHash: 'b'.repeat(64) }, settings)).toThrow(/retry input mismatch/);
    expect(() => service.begin({ ...retryInput, paragraphs: retryInput.paragraphs.map((paragraph, index) => index === 0 ? { ...paragraph, text: '南境的城墙由黑曜石砌成。' } : paragraph) }, settings)).toThrow(/retry input mismatch/);

    expect(service.begin(retryInput, settings)).toEqual(identity);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toBe(2);
    expect(service.status(identity).status).toBe('succeeded');
    expect(service.result(identity).output).toEqual(output);
    expect(() => service.begin(retryInput, settings)).toThrow(/already exists/);
  });

  it('cancels a running job, fails closed on malformed output, and disposes all jobs', async () => {
    const slow = {
      async *stream() {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      },
    };
    const cancelled = createImportInterpretationAnalysisService(slow);
    const identity = cancelled.begin(input, settings);
    expect(() => cancelled.begin(input, settings)).toThrow(/already exists/);
    await expect(cancelled.cancel(identity)).resolves.toMatchObject({ status: 'cancelled' });
    expect(cancelled.status(identity).status).toBe('cancelled');
    expect(() => cancelled.result(identity)).toThrow(/cancelled/);
    expect(() => cancelled.begin(input, settings)).toThrow(/already exists/);

    const failed = createImportInterpretationAnalysisService(backendReturning({ invalid: true }));
    const failedIdentity = failed.begin({ ...input, importSessionId: 'imp-analysis-failed' }, settings);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(failed.status(failedIdentity).status).toBe('failed');
    expect(() => failed.result(failedIdentity)).toThrow(/expected one of|unrecognized key|expected array|schema/i);
    failed.dispose();
    expect(() => failed.status(failedIdentity)).toThrow(/disposed/);
  });

  it('does not let the classifier choose treatment/POV or model-owned ranges', () => {
    const prompt = buildSourceInterpretationPrompt(input);
    expect(prompt).toContain('不得输出 treatment、POV');
    expect(prompt).toContain('offset 始终由 Host 从 paragraphId 投影');
    expect(prompt).not.toContain('写入 C5');
  });
});
