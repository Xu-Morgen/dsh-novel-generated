import { asLlmBackend, type GenerationSettings, type LlmBackend } from '../llm/port/index.js';
import {
  importInterpretationAnalysisIdentitySchema,
  importInterpretationAnalysisResultSchema,
  importInterpretationAnalysisStatusResultSchema,
  importInterpretationInputSchema,
  type ImportInterpretationAnalysisBeginResult,
  type ImportInterpretationAnalysisResult,
  type ImportInterpretationAnalysisStatusResult,
  type ImportInterpretationInput,
  type ImportInterpretationAnalysisStatus,
} from '../core/schema/import-interpretation-analysis.js';
import { classifySourceInterpretation } from '../llm/analyze/import-interpretation.js';

interface Job {
  readonly input: ImportInterpretationInput;
  readonly controller: AbortController;
  status: ImportInterpretationAnalysisStatus;
  output?: ImportInterpretationAnalysisResult['output'];
  error?: unknown;
}

function identityOf(input: ImportInterpretationInput): ImportInterpretationAnalysisBeginResult {
  return importInterpretationAnalysisIdentitySchema.parse({
    projectId: input.projectId,
    importSessionId: input.importSessionId,
    sourceHash: input.sourceHash,
  });
}

function sameBoundInput(current: ImportInterpretationInput, retry: ImportInterpretationInput): boolean {
  return current.projectId === retry.projectId
    && current.importSessionId === retry.importSessionId
    && current.sourceHash === retry.sourceHash
    && current.paragraphs.length === retry.paragraphs.length
    && current.paragraphs.every((paragraph, index) => {
      const candidate = retry.paragraphs[index];
      return candidate !== undefined
        && paragraph.paragraphId === candidate.paragraphId
        && paragraph.index === candidate.index
        && paragraph.text === candidate.text
        && paragraph.startOffset === candidate.startOffset
        && paragraph.endOffset === candidate.endOffset;
    });
}

/**
 * I143 Host-only source interpretation job owner (design §14.15.2 / R19-2).
 * It classifies stable Host paragraph ids into operational evidence and never
 * writes a layer, chooses treatment/POV, or accepts model-owned offsets.
 */
export interface NovelImportInterpretationAnalysisService {
  /**
   * Starts one analysis per import session. A terminal failed job may restart
   * only when the complete Host-bound input is identical; all other duplicate
   * session ids fail closed (design §14.30).
   */
  begin(input: ImportInterpretationInput, settings: GenerationSettings): ImportInterpretationAnalysisBeginResult;
  status(input: Pick<ImportInterpretationInput, 'projectId' | 'importSessionId' | 'sourceHash'>): ImportInterpretationAnalysisStatusResult;
  cancel(input: Pick<ImportInterpretationInput, 'projectId' | 'importSessionId' | 'sourceHash'>): Promise<ImportInterpretationAnalysisStatusResult>;
  result(input: Pick<ImportInterpretationInput, 'projectId' | 'importSessionId' | 'sourceHash'>): ImportInterpretationAnalysisResult;
  /** I151 internal Host-bound normalized source projection for the same import job. */
  source(input: Pick<ImportInterpretationInput, 'projectId' | 'importSessionId' | 'sourceHash'>): string;
  dispose(): void;
}

export function createImportInterpretationAnalysisService(
  llm: unknown,
  onDispose?: (dispose: () => void) => void,
  onBackgroundError: (error: unknown, importSessionId: string) => void = (error, importSessionId) => {
    console.error(`Import interpretation analysis ${importSessionId} failed`, error);
  },
): NovelImportInterpretationAnalysisService {
  const backend: LlmBackend | undefined = asLlmBackend(llm);
  const jobs = new Map<string, Job>();
  let disposed = false;

  const ensureActive = (): void => {
    if (disposed) throw new Error('Import interpretation analysis service is disposed');
  };
  const jobFor = (identity: Pick<ImportInterpretationInput, 'projectId' | 'importSessionId' | 'sourceHash'>): Job => {
    const current = jobs.get(identity.importSessionId);
    if (current === undefined) throw new Error(`Unknown import interpretation analysis: ${identity.importSessionId}`);
    if (current.input.projectId !== identity.projectId) throw new Error('Import interpretation analysis belongs to another project');
    if (current.input.sourceHash !== identity.sourceHash) throw new Error('Import interpretation analysis source hash mismatch');
    return current;
  };
  const statusResult = (current: Job): ImportInterpretationAnalysisStatusResult => importInterpretationAnalysisStatusResultSchema.parse({
    ...identityOf(current.input), status: current.status,
  });

  const run = async (current: Job, settings: GenerationSettings): Promise<void> => {
    current.status = 'running';
    try {
      current.output = await classifySourceInterpretation(backend, current.input, settings, current.controller.signal);
      current.status = 'succeeded';
    } catch (error) {
      current.error = error;
      current.status = current.controller.signal.aborted ? 'cancelled' : 'failed';
      if (!current.controller.signal.aborted) onBackgroundError(error, current.input.importSessionId);
    }
  };

  const service: NovelImportInterpretationAnalysisService = {
    begin(rawInput, settings) {
      ensureActive();
      const input = importInterpretationInputSchema.parse(rawInput);
      const previous = jobs.get(input.importSessionId);
      if (previous !== undefined) {
        if (previous.status !== 'failed') throw new Error(`Import interpretation analysis already exists: ${input.importSessionId}`);
        // I163 keeps the same operational checkpoint while preventing a retry
        // from changing the Host-bound source projection behind that session.
        if (!sameBoundInput(previous.input, input)) throw new Error(`Import interpretation analysis retry input mismatch: ${input.importSessionId}`);
      }
      const current: Job = { input, controller: new AbortController(), status: 'queued' };
      jobs.set(input.importSessionId, current);
      void run(current, settings);
      return identityOf(input);
    },
    status(rawInput) {
      ensureActive();
      const identity = importInterpretationAnalysisIdentitySchema.parse(rawInput);
      return statusResult(jobFor(identity));
    },
    async cancel(rawInput) {
      ensureActive();
      const identity = importInterpretationAnalysisIdentitySchema.parse(rawInput);
      const current = jobFor(identity);
      if (current.status === 'queued' || current.status === 'running') {
        current.controller.abort();
        current.status = 'cancelled';
      }
      return statusResult(current);
    },
    result(rawInput) {
      ensureActive();
      const identity = importInterpretationAnalysisIdentitySchema.parse(rawInput);
      const current = jobFor(identity);
      if (current.status === 'succeeded' && current.output !== undefined) {
        return importInterpretationAnalysisResultSchema.parse({ ...identity, output: current.output });
      }
      if (current.status === 'failed') throw current.error instanceof Error ? current.error : new Error('Import interpretation analysis failed');
      if (current.status === 'cancelled') throw new Error('Import interpretation analysis cancelled');
      throw new Error(`Import interpretation analysis is not complete: ${current.status}`);
    },
    source(rawInput) {
      ensureActive();
      const identity = importInterpretationAnalysisIdentitySchema.parse(rawInput);
      return jobFor(identity).input.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const current of jobs.values()) current.controller.abort();
      jobs.clear();
    },
  };
  onDispose?.(() => service.dispose());
  return Object.freeze(service);
}
