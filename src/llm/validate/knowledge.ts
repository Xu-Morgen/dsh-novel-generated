import { z } from 'zod';
import { filterKnowledge } from '../../core/knowledge/filter.js';
import { knowledgeEntrySchema, knowledgeStateSchema } from '../../core/schema/knowledge.js';
import {
  adjudicateViolations,
  type ConsistencyAdjudication,
  type ConsistencyViolationView,
} from '../../core/validate/index.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';
import { parseJsonObject } from '../parse/shared.js';
import { violationSchema } from './shared.js';

/** C3 source needed to derive one POV's permitted and protected knowledge views. */
export const knowledgeLeakDetectionInputSchema = z.object({
  prose: z.string().trim().min(1),
  pov: z.string().trim().min(1),
  entries: z.array(knowledgeEntrySchema),
  states: z.array(knowledgeStateSchema),
}).strict();
export type KnowledgeLeakDetectionInput = z.infer<typeof knowledgeLeakDetectionInputSchema>;

const knowledgeLeakViolationSchema = violationSchema(z.literal('knowledge-leak'), 'hard');

/** Exact I22 model envelope; soft and non-C3 findings fail closed. */
export const knowledgeLeakDetectorOutputSchema = z.object({
  violations: z.array(knowledgeLeakViolationSchema),
}).strict();
export type KnowledgeLeakDetectorOutput = z.infer<typeof knowledgeLeakDetectorOutputSchema>;

/** Result of one C3 POV-leak hard-constraint pass (design §9.1 / R4-3). */
export interface KnowledgeLeakDetectionResult {
  readonly violations: readonly ConsistencyViolationView[];
  readonly adjudication: ConsistencyAdjudication;
}

/** Parse an I22 JSON-only response at the fail-closed model boundary. */
export function parseKnowledgeLeakDetectorOutput(text: unknown): KnowledgeLeakDetectorOutput {
  return parseJsonObject(text, knowledgeLeakDetectorOutputSchema, 'Knowledge-leak detector output');
}

/**
 * Invoke the injected Host LLM to find facts leaked to the current POV.
 * I18's `filterKnowledge` is the only source of the allowed POV view; the
 * complementary C3 facts are supplied only as protected comparison targets.
 * This preserves C1/C3 separation and lets findings name an auditable C3 id
 * (design §5.10, §8, §9.1).
 */
export async function detectKnowledgeLeakHardConstraints(
  backend: LlmBackend | undefined,
  input: unknown,
  settings: unknown,
  signal?: AbortSignal,
): Promise<KnowledgeLeakDetectionResult> {
  const source = knowledgeLeakDetectionInputSchema.parse(input);
  const prompt = buildKnowledgeLeakDetectorPrompt(source);
  const candidate = await collectCandidate(backend, { prompt, settings: resolveGenerationSettings(settings), signal });
  const output = parseKnowledgeLeakDetectorOutput(candidate.text);
  assertKnowledgeLeakReferences(output, source);
  const violations = Object.freeze(output.violations.map((violation) => Object.freeze({
    ...violation,
    references: Object.freeze([...violation.references]),
  })));
  return Object.freeze({ violations, adjudication: adjudicateViolations(violations) });
}

/** Build the minimum C3 prompt view: I18-filtered facts plus protected facts. */
export function buildKnowledgeLeakDetectorPrompt(input: KnowledgeLeakDetectionInput): string {
  const { known, protectedEntries } = projectKnowledgeForLeakDetection(input);
  return [
    '你是小说 POV 知情泄漏硬约束检测器。检查正文是否让当前 POV 知晓未向其揭示的受保护事实。',
    '不得检查规则、正史、关系、风格、大纲或任何软约束。',
    '仅输出一个 JSON 对象，不要 Markdown 或解释。对象必须完全符合：',
    '{"violations":[{"kind":"knowledge-leak","severity":"hard","message":"非空说明","references":["未公开 KnowledgeEntry id"]}]}',
    '没有知情泄漏时输出 {"violations":[]}。不得引用已知事实或未列出的 id。',
    `当前 POV：${input.pov}`,
    `POV 已知事实（仅由 KnowledgeFilter 过滤得到）：${JSON.stringify(known)}`,
    `受保护的未知事实（仅用于泄漏比对）：${JSON.stringify(protectedEntries)}`,
    `正文：${input.prose}`,
  ].join('\n');
}

/** Derive projections without exposing C3 holder/state implementation fields to the model. */
function projectKnowledgeForLeakDetection(input: KnowledgeLeakDetectionInput): {
  known: readonly { id: string; kind: string; status: string; fact: string }[];
  protectedEntries: readonly { id: string; kind: string; status: string; fact: string }[];
} {
  const filtered = filterKnowledge(input.pov, input.entries, input.states);
  const knownIds = new Set(filtered.entries.map((entry) => entry.id));
  const project = (entry: z.infer<typeof knowledgeEntrySchema>) => ({
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    fact: entry.fact,
  });
  return {
    known: filtered.entries.map(project),
    protectedEntries: input.entries.filter((entry) => !knownIds.has(entry.id)).map(project),
  };
}

/** Reject references that do not identify a C3 fact unavailable to this POV. */
function assertKnowledgeLeakReferences(output: KnowledgeLeakDetectorOutput, source: KnowledgeLeakDetectionInput): void {
  const filtered = filterKnowledge(source.pov, source.entries, source.states);
  const knownIds = new Set(filtered.entries.map((entry) => entry.id));
  const protectedIds = new Set(source.entries.filter((entry) => !knownIds.has(entry.id)).map((entry) => entry.id));
  for (const violation of output.violations) {
    if (violation.references.some((reference) => !protectedIds.has(reference))) {
      throw new Error('Knowledge-leak detector cited an unknown or POV-visible knowledge reference');
    }
  }
}
