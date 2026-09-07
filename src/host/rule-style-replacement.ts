import { createHash } from 'node:crypto';
import { ruleStyleSnapshotSchema, type RuleStyleSnapshot, type RuleStyleImportCandidate } from '../core/schema/rule-style-import-initialization.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelStyleService } from './style-service.js';

type Owners = { rules: NovelRuleService; style: NovelStyleService };
/** Stable canonical B1/B4 fingerprint; rule file order has no business meaning. */
export function ruleStyleSnapshotFingerprint(snapshot: RuleStyleSnapshot): string {
  const value = ruleStyleSnapshotSchema.parse(snapshot);
  value.rules.sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/** Always read validated canonical owners, never infer emptiness from a read failure. */
export async function readRuleStyleSnapshot(owners: Owners, projectId: string): Promise<RuleStyleSnapshot> {
  await Promise.all([owners.rules.open(projectId), owners.style.open(projectId)]);
  const rules = await owners.rules.list(projectId);
  const style = await owners.style.isInitialized(projectId) ? await owners.style.read(projectId) : undefined;
  return ruleStyleSnapshotSchema.parse({ rules, ...(style === undefined ? {} : { style }) });
}
/** I201 whole replacement recovers either layer's completed write and compensates failures. */
export async function applyRuleStyleReplacement(owners: Owners, projectId: string, baseline: RuleStyleSnapshot, candidate: RuleStyleImportCandidate): Promise<void> {
  const next: RuleStyleSnapshot = ruleStyleSnapshotSchema.parse({
    rules: candidate.rules.map(rule => ({ ...rule, version: (baseline.rules.find(old => old.id === rule.id)?.version ?? 0) + 1 })),
    style: { ...candidate.style, version: (baseline.style?.version ?? 0) + 1 },
  });
  const current = await readRuleStyleSnapshot(owners, projectId);
  const equalRules = (a: RuleStyleSnapshot, b: RuleStyleSnapshot) => ruleStyleSnapshotFingerprint({ rules: a.rules }) === ruleStyleSnapshotFingerprint({ rules: b.rules });
  const equalStyle = (a: RuleStyleSnapshot, b: RuleStyleSnapshot) => JSON.stringify(a.style) === JSON.stringify(b.style);
  if ((!equalRules(current, baseline) && !equalRules(current, next)) || (!equalStyle(current, baseline) && !equalStyle(current, next))) throw new Error('Rule/style replacement baseline is stale');
  let rulesWritten = equalRules(current, next);
  let styleWritten = equalStyle(current, next);
  try {
    if (!rulesWritten) { await owners.rules.replaceAll(projectId, baseline.rules, next.rules); rulesWritten = true; }
    if (!styleWritten) { await owners.style.replace(projectId, baseline.style, next.style); styleWritten = true; }
  } catch (cause) {
    // CAS compensation refuses to overwrite edits made after the attempted write.
    if (styleWritten) await owners.style.replace(projectId, next.style, baseline.style);
    if (rulesWritten) await owners.rules.replaceAll(projectId, next.rules, baseline.rules);
    throw cause;
  }
}
