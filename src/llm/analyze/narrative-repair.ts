import { z } from 'zod';
import { collectCandidate, type GenerationSettings, type LlmBackend } from '../port/index.js';
import type { NarrativeAdaptationOutput } from '../../core/schema/narrative-adaptation.js';
import type { NarrativeRevealOutput } from '../../core/schema/narrative-reveal.js';

export interface ReferenceIssue { readonly path: (string | number)[]; readonly code: 'unknown-character' | 'unknown-anchor' | 'unknown-evidence' | 'unknown-entry'; readonly actual: string; readonly allowed: readonly string[]; }
export interface RepairOptions { readonly onRepair?: (attempt: number) => void; }
/** Fixed failure class never retains provider output or private parser exceptions. */
export class NarrativeRepairError extends Error {
  constructor(readonly stage: 'adaptation' | 'reveal') { super(`Narrative ${stage} repair exhausted`); }
}
const patchSchema = z.object({ replacements: z.array(z.object({ path: z.array(z.union([z.string(), z.number().int().nonnegative()])).min(1).max(12), value: z.string() }).strict()).min(1).max(200) }).strict();

/** Apply only exact string slots reported by the validator; all narrative fields remain untouched. */
export function applyReferenceRepair<T>(candidate: T, issues: readonly ReferenceIssue[], raw: unknown): T {
  const patch = patchSchema.parse(raw); const result = structuredClone(candidate); const used = new Set<string>();
  for (const replacement of patch.replacements) {
    const key = JSON.stringify(replacement.path), issue = issues.find(item => JSON.stringify(item.path) === key);
    if (!issue || used.has(key) || !issue.allowed.includes(replacement.value)) throw new Error('Invalid reference repair');
    used.add(key);
    if (issue.path.some(part => part === '__proto__' || part === 'prototype' || part === 'constructor')) throw new Error('Invalid repair path');
    let parent: unknown = result;
    for (const part of issue.path.slice(0, -1)) {
      if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, part)) throw new Error('Invalid repair path');
      parent = (parent as Record<string | number, unknown>)[part];
    }
    const last = issue.path.at(-1)!;
    if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, last)) throw new Error('Invalid repair path');
    const record = parent as Record<string | number, unknown>;
    if (record[last] !== issue.actual) throw new Error('Stale reference repair');
    record[last] = replacement.value;
  }
  return result;
}

/** Strict parse + semantic validation with at most two additional, cancellable model calls. */
export async function generateWithNarrativeRepair<T>(args: {
  backend: LlmBackend | undefined; prompt: string; settings: GenerationSettings; signal?: AbortSignal;
  stage: 'adaptation' | 'reveal'; schema: z.ZodType<T>; references: (value: T) => ReferenceIssue[]; validate: (value: T) => void;
  referenceContext?: string;
} & RepairOptions): Promise<T> {
  let text = (await collectCandidate(args.backend, { prompt: args.prompt, settings: args.settings, signal: args.signal })).text;
  let value: T | undefined, issues: ReferenceIssue[] = [], diagnostic = 'invalid-json-or-schema';
  const knownKeys = new Set(JSON.stringify(z.toJSONSchema(args.schema)).match(/"[A-Za-z][A-Za-z0-9]*"(?=:)/g)?.map(key => key.slice(1, -1)) ?? []);
  const check = (): boolean => {
    if (args.signal?.aborted) throw new Error('Generation cancelled');
    try { value = args.schema.parse(JSON.parse(text)); }
    catch (cause) { value = undefined; issues = []; diagnostic = cause instanceof z.ZodError ? JSON.stringify(cause.issues.slice(0, 12).map(issue => ({ code: issue.code, path: issue.path.map(part => typeof part === 'number' || knownKeys.has(String(part)) ? part : '[field]'), ...(issue.code === 'invalid_type' ? { expected: issue.expected } : {}) }))) : 'invalid-json'; return false; }
    issues = args.references(value);
    if (issues.length) { diagnostic = 'invalid-reference'; return false; }
    try { args.validate(value); return true; } catch { diagnostic = 'semantic-invariant: verify evidence order, POV, unique ids and holders/states consistency'; return false; }
  };
  if (check()) return value!;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (args.signal?.aborted) throw new Error('Generation cancelled');
    args.onRepair?.(attempt);
    const restricted = value !== undefined && issues.length > 0;
    const prompt = restricted ? [
      `叙事引用受限修正 ${args.stage} 第 ${attempt}/2 次。只输出 replacements，禁止改写剧情或其他字段。`,
      '每项含 path（原样复制错误的数组路径）和 value（从对应 allowed 精确选择）；不要拼接或翻译 ID。',
      JSON.stringify(z.toJSONSchema(patchSchema)),
      `校验错误：${JSON.stringify(issues)}`,
      `合法引用说明：${args.referenceContext ?? ''}`,
      `原候选：${JSON.stringify(value)}`,
    ].join('\n') : `${args.prompt}\n当前阶段修正第 ${attempt}/2 次；上次校验错误：${diagnostic}。仅重生成本阶段完整 JSON，遵守所有合法引用与字段约束。`;
    const response = await collectCandidate(args.backend, { prompt, settings: args.settings, signal: args.signal });
    if (restricted) {
      try { text = JSON.stringify(applyReferenceRepair(value!, issues, JSON.parse(response.text))); }
      catch { continue; }
    } else text = response.text;
    if (check()) return value!;
  }
  throw new NarrativeRepairError(args.stage);
}

const reference = (issues: ReferenceIssue[], path: (string | number)[], actual: string, allowed: readonly string[], code: ReferenceIssue['code']) => { if (!allowed.includes(actual)) issues.push({ path, actual, allowed, code }); };
/** Canonical B3 ids and B5 beat ids are the only legal outline references. */
export function adaptationReferenceIssues(value: NarrativeAdaptationOutput, characterIds: readonly string[]): ReferenceIssue[] {
  const issues: ReferenceIssue[] = []; const preceding: string[] = [];
  value.outline.acts.forEach((act, ai) => act.beats.forEach((beat, bi) => {
    const base = ['outline', 'acts', ai, 'beats', bi];
    beat.charactersInvolved.forEach((id, i) => reference(issues, [...base, 'charactersInvolved', i], id, characterIds, 'unknown-character'));
    beat.detailBeats.forEach((detail, i) => reference(issues, [...base, 'detailBeats', i, 'pov'], detail.pov, characterIds, 'unknown-character'));
    beat.prerequisites.forEach((id, i) => reference(issues, [...base, 'prerequisites', i], id, preceding, 'unknown-anchor'));
    preceding.push(beat.id);
  }));
  value.outline.foreshadowing.forEach((entry, fi) => entry.knownBy.forEach((id, i) => reference(issues, ['outline', 'foreshadowing', fi, 'knownBy', i], id, characterIds, 'unknown-character')));
  return issues;
}
/** Reveal references must come from the frozen input, never from model-invented aliases. */
export function revealReferenceIssues(value: NarrativeRevealOutput, characterIds: readonly string[], anchorIds: readonly string[], evidenceIds: readonly string[]): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  value.entries.forEach((entry, ei) => {
    reference(issues, ['entries', ei, 'revealPlan', 'revealAt'], entry.revealPlan.revealAt, anchorIds, 'unknown-anchor');
    entry.holders.forEach((id, i) => reference(issues, ['entries', ei, 'holders', i], id, characterIds, 'unknown-character'));
    entry.revealPlan.revealTo.forEach((id, i) => reference(issues, ['entries', ei, 'revealPlan', 'revealTo', i], id, characterIds, 'unknown-character'));
    entry.evidenceParagraphIds.forEach((id, i) => reference(issues, ['entries', ei, 'evidenceParagraphIds', i], id, evidenceIds, 'unknown-evidence'));
  });
  value.states.forEach((state, si) => {
    reference(issues, ['states', si, 'characterId'], state.characterId, characterIds, 'unknown-character');
    state.knows.forEach((id, i) => reference(issues, ['states', si, 'knows', i], id, value.entries.map(e => e.id), 'unknown-entry'));
  });
  return issues;
}
