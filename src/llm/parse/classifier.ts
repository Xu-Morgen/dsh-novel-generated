import { classifierInputSchema, classifierOutputSchema, mergeClassifierCandidates, parseClassifierOutput, type ClassifierInput, type ClassifierOutput } from '../../core/schema/classifier.js';
import { collectCandidate, resolveGenerationSettings, type LlmBackend } from '../port/index.js';

/** Host-only I41 classification pass. It proposes strict entries and never writes. */
export async function classifySettings(backend: LlmBackend | undefined, input: unknown, settings: unknown, signal?: AbortSignal): Promise<ClassifierOutput> {
  const source = classifierInputSchema.parse(input);
  const candidate = await collectCandidate(backend, { prompt: buildClassifierPrompt(source), settings: resolveGenerationSettings(settings), signal });
  const output = parseClassifierOutput(candidate.text);
  for (const item of output.candidates) if (!item.sourceIds.includes(item.entry.sourceId)) throw new Error(`Candidate sourceIds must include entry sourceId: ${item.entry.id}`);
  return { candidates: mergeClassifierCandidates(output.candidates).map((item) => classifierOutputSchema.shape.candidates.element.parse(item)) };
}

export function buildClassifierPrompt(input: ClassifierInput): string {
  return ['你是设定分类器。只提取可确认、单一定位、反复引用且不随剧情改变的设定。', '只输出 JSON，不得解释，不得写入文件。候选必须 immutable:true，并保留来源证据。', '输出格式：{"candidates":[{"entry":{"id":"stable-id","sourceLayer":"B1|B2","sourceId":"source-id","title":"...","content":"...","tags":["..."],"immutable":true,"version":1},"sourceIds":["source-id"],"sourceEvidence":[{"sourceId":"source-id","quote":"原文证据"}]}]}', `来源：${JSON.stringify(input.sources)}`].join('\n');
}
