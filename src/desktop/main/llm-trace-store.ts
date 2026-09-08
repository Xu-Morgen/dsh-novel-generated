import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { narrativeAdaptationOutputSchema } from '../../core/schema/narrative-adaptation.js';
import { narrativeRevealOutputSchema } from '../../core/schema/narrative-reveal.js';
import { onboardingAnalysisOutputSchema } from '../../core/schema/onboarding.js';

type Stage = 'adaptation' | 'foundation' | 'reveal' | 'reference-repair' | 'other';
/** Only fixed labels are retained; source prompts and provider configuration stay out of logs. */
export function llmTraceStage(prompt: string): Stage {
  if (prompt.startsWith('叙事引用受限修正 ')) return 'reference-repair';
  if (prompt.includes('POV 叙事化候选生成器')) return 'adaptation';
  if (prompt.includes('B5 anchors：')) return 'reveal';
  if (prompt.includes('六层') && prompt.includes('evidence')) return 'foundation';
  return 'other';
}

/** Schema diagnostics intentionally omit values, Zod messages and arbitrary model-owned keys. */
export function llmOutputDiagnostic(text: string, stage: Stage): object {
  const schemas = { adaptation: narrativeAdaptationOutputSchema, foundation: onboardingAnalysisOutputSchema, reveal: narrativeRevealOutputSchema };
  if (stage === 'other' || stage === 'reference-repair') return { validation: 'not-checked', ...(stage === 'reference-repair' ? { note: 'The domain service checks allowed patch paths and values, then revalidates the merged candidate.' } : {}) };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { validation: 'invalid-json' }; }
  const schema = schemas[stage];
  const result = schema.safeParse(parsed);
  if (result.success) return { validation: 'schema-valid', note: 'Schema only; source identity, references and narrative safety are checked by the domain service.' };
  const knownKeys = new Set(JSON.stringify(schema.toJSONSchema()).match(/"[A-Za-z][A-Za-z0-9]*"(?=:)/g)?.map(key => key.slice(1, -1)) ?? []);
  return { validation: 'invalid-schema', issues: result.error.issues.map(issue => ({ code: issue.code, path: issue.path.map(part => typeof part === 'number' ? part : knownKeys.has(String(part)) ? part : '[field]'), ...(issue.code === 'invalid_type' ? { expected: issue.expected } : {}) })) };
}

/** A trace accepts only sanitized deltas and fixed status/error labels. */
export interface LlmTrace {
  write(text: string, reasoning: string, done?: boolean): void;
  finish(status: string, error: string): void;
}

/** I202 / §14.36: append full safe output outside the work library, independent of the 16k UI tail. */
export class LlmTraceStore {
  private disposed = false;
  private readonly active = new Set<LlmTrace>();
  constructor(private readonly directory: string) {}

  begin(requestId: number, stage: Stage, onFailure: () => void): LlmTrace {
    const stem = join(this.directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${requestId}-${randomUUID()}`);
    let failed = this.disposed, ended = false, sequence = 0;
    const safeWrite = (operation: () => void): void => { if (failed) return; try { operation(); } catch { failed = true; onFailure(); } };
    safeWrite(() => {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(`${stem}.stream.txt`, JSON.stringify({ requestId, stage, startedAt: new Date().toISOString(), note: 'Decoded LlmBackend deltas after secret redaction; not raw HTTP/SSE.' }) + '\n', 'utf8');
      writeFileSync(`${stem}.result.txt`, '', 'utf8');
    });
    const trace: LlmTrace = {
      write: (text, reasoning, done) => {
        if (ended) return;
        safeWrite(() => {
          appendFileSync(`${stem}.stream.txt`, JSON.stringify({ sequence: ++sequence, at: new Date().toISOString(), text, reasoning, done: done === true }) + '\n', 'utf8');
          if (text) appendFileSync(`${stem}.result.txt`, text, 'utf8');
        });
      },
      finish: (status, error) => {
        if (ended) return; ended = true; this.active.delete(trace);
        safeWrite(() => {
          const result = readFileSync(`${stem}.result.txt`, 'utf8');
          appendFileSync(`${stem}.stream.txt`, JSON.stringify({ status, error, finishedAt: new Date().toISOString(), characters: result.length, ...llmOutputDiagnostic(result, stage) }) + '\n', 'utf8');
        });
      },
    };
    if (!this.disposed) this.active.add(trace);
    return trace;
  }

  dispose(): void { this.disposed = true; for (const trace of this.active) trace.finish('cancelled', '应用关闭，调用记录结束。'); this.active.clear(); }
}
