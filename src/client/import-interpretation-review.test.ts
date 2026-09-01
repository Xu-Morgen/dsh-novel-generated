import { describe, expect, it } from 'vitest';
import {
  canConfirmImportIntent,
  freshImportInterpretationReview,
  importIntentValidationMessage,
  paragraphsFromHostChunks,
  sourceInterpretationReview,
  type ImportInterpretationReviewState,
} from './import-interpretation-review.js';
import type { SourceInterpretationOutput } from '../core/schema/import-interpretation-analysis.js';

type Node = { tag: string; props: Record<string, unknown> | null; children: unknown[] };
const h = (tag: string, props: Record<string, unknown> | null | undefined, ...children: unknown[]): Node => ({ tag, props: props ?? null, children });
function collect(node: unknown, tag?: string): Node[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => collect(child, tag));
  const current = node as Node;
  const own = tag === undefined || current.tag === tag ? [current] : [];
  return own.concat((current.children ?? []).flatMap((child) => collect(child, tag)));
}

const output: SourceInterpretationOutput = {
  sourceRole: 'hybrid',
  confidence: 'low',
  evidenceParagraphIds: ['paragraph-0001'],
  paragraphs: [{ paragraphId: 'paragraph-0001', role: 'world-truth', confidence: 'medium', evidence: '设定事实' }],
  rationale: '段落同时包含设定和计划。',
};

function reviewedState(overrides: Partial<ImportInterpretationReviewState> = {}): ImportInterpretationReviewState {
  const base = freshImportInterpretationReview('book', 'a'.repeat(64), '幕后资料', [{ paragraphId: 'paragraph-0001', index: 0, text: '幕后资料', startOffset: 0, endOffset: 4 }]);
  return {
    ...base,
    analysisStatus: 'succeeded',
    analysis: output,
    paragraphs: [{ ...base.paragraphs[0], suggestedRole: 'world-truth', confidence: 'medium', evidence: '设定事实', decision: 'accepted' }],
    selectedSourceRole: 'background-material',
    treatment: 'adapt-pov',
    narrativeIntent: { pov: 'limited', protagonistCandidateId: 'lucien', initialKnown: [], revealPacing: 'balanced' },
    ...overrides,
  };
}

describe('I144 来源语义审阅投影', () => {
  it('keeps the suggestion separate and exposes all five roles and two treatments', () => {
    const state = reviewedState();
    const calls: string[] = [];
    const tree = sourceInterpretationReview(h, state, {
      begin: () => calls.push('begin'), cancel: () => calls.push('cancel'), confirm: () => calls.push('confirm'),
      setSourceRole: () => calls.push('role'), setTreatment: () => calls.push('treatment'), setNarrativeIntent: () => calls.push('intent'),
      setParagraphRole: () => calls.push('paragraph-role'), setParagraphDecision: () => calls.push('paragraph-decision'),
    });
    expect(collect(tree, 'option').filter((node) => node.props?.value !== '').map((node) => node.props?.value)).toEqual([
      'idea', 'synopsis', 'background-material', 'existing-prose', 'hybrid', 'expand-outline', 'adapt-pov',
      'limited', 'omniscient', 'slow', 'balanced', 'fast',
      'world-truth', 'plot-plan', 'prose', 'author-instruction', 'presentation-note',
      'pending', 'accepted', 'edited', 'rejected',
    ]);
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-low-confidence'] !== undefined)).toBe(true);
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-evidence-item'] === 'paragraph-0001')).toBe(true);
    expect(collect(tree, 'button').find((node) => node.props?.['data-novel-import-interpretation-confirm'] !== undefined)?.props?.disabled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('blocks unresolved hybrid paragraphs and requires a limited POV protagonist', () => {
    const unresolved = reviewedState({ paragraphs: [{ ...reviewedState().paragraphs[0], decision: 'pending' }] });
    expect(importIntentValidationMessage(unresolved)).toBe('请先处理所有来源段落。');
    expect(canConfirmImportIntent(unresolved)).toBe(false);
    const noProtagonist = reviewedState({ narrativeIntent: { pov: 'limited', initialKnown: [], revealPacing: 'balanced' } });
    expect(importIntentValidationMessage(noProtagonist)).toBe('限知视角需要指定主角或待创建主角。');
    expect(canConfirmImportIntent(noProtagonist)).toBe(false);
    const both = reviewedState({ narrativeIntent: { pov: 'limited', protagonistId: 'existing', protagonistCandidateId: 'candidate', initialKnown: [], revealPacing: 'balanced' } });
    expect(importIntentValidationMessage(both)).toBe('主角只能选择已有角色或待创建候选之一。');
  });

  it('only shows the Stage 21 fidelity notice for existing prose', () => {
    const tree = sourceInterpretationReview(h, reviewedState({ selectedSourceRole: 'existing-prose', treatment: 'expand-outline', narrativeIntent: undefined }), {
      begin: () => undefined, cancel: () => undefined, confirm: () => undefined, setSourceRole: () => undefined, setTreatment: () => undefined,
      setNarrativeIntent: () => undefined, setParagraphRole: () => undefined, setParagraphDecision: () => undefined,
    });
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-existing-prose'] !== undefined)).toBe(true);
    expect(JSON.stringify(tree)).toContain('Stage 21');
  });

  it('projects only Host-provided chunk text and ranges', () => {
    expect(paragraphsFromHostChunks([{ text: '一', startOffset: 3, endOffset: 4 }, { text: '二', startOffset: 8, endOffset: 9 }])).toEqual([
      { paragraphId: 'paragraph-0001', index: 0, text: '一', startOffset: 3, endOffset: 4 },
      { paragraphId: 'paragraph-0002', index: 1, text: '二', startOffset: 8, endOffset: 9 },
    ]);
    expect(() => paragraphsFromHostChunks([{ text: '缺范围' }])).toThrow('来源段落范围不可用');
  });
});
