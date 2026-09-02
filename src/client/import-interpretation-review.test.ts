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
import { ONBOARDING_STYLES } from './styles/onboarding.js';

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
      'limited', 'omniscient', 'generate', 'slow', 'balanced', 'fast',
      'world-truth', 'plot-plan', 'prose', 'author-instruction', 'presentation-note',
      'pending', 'accepted', 'edited', 'rejected',
    ]);
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-low-confidence'] !== undefined)).toBe(true);
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-evidence-item'] === 'paragraph-0001')).toBe(true);
    expect(collect(tree, 'button').find((node) => node.props?.['data-novel-import-interpretation-confirm'] !== undefined)?.props?.disabled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('I154 exposes detailed hover/focus help for source roles, source fragments, decisions, and merge semantics', () => {
    const decisions: Array<[string, string]> = [];
    const tree = sourceInterpretationReview(h, reviewedState(), {
      begin: () => undefined, cancel: () => undefined, confirm: () => undefined,
      setSourceRole: () => undefined, setTreatment: () => undefined, setNarrativeIntent: () => undefined,
      setParagraphRole: () => undefined, setParagraphDecision: (paragraphId, decision) => decisions.push([paragraphId, decision]),
    });
    const helps = collect(tree, 'button').filter((node) => node.props?.['data-novel-import-help'] !== undefined);
    expect(helps.map((node) => node.props?.['data-novel-import-help'])).toEqual([
      'source-role', 'paragraph-source-type', 'paragraph-decision', 'merge-classification',
    ]);
    for (const help of helps) {
      expect(help.props?.type).toBe('button');
      expect(help.props?.['aria-label']).toMatch(/说明/);
      expect(help.props?.['aria-describedby']).toBeTruthy();
      expect(String(help.props?.title)).toContain('\n');
      expect(help.props?.onClick).toBeUndefined();
    }
    const tooltipJson = JSON.stringify(collect(tree).filter((node) => node.props?.role === 'tooltip'));
    expect(tooltipJson).toContain('创作想法');
    expect(tooltipJson).toContain('已有正文');
    expect(tooltipJson).toContain('导入服务切分出的来源片段');
    expect(tooltipJson).toContain('不会拼接相邻来源片段');
    expect(ONBOARDING_STYLES).toContain('.nv-import-help:hover .nv-import-help__tooltip');
    expect(ONBOARDING_STYLES).toContain('.nv-import-help:focus-within .nv-import-help__tooltip');

    const merge = collect(tree, 'button').find((node) => node.props?.['data-novel-import-interpretation-merge'] === 'paragraph-0001');
    (merge?.props?.onClick as () => void)();
    expect(decisions).toEqual([['paragraph-0001', 'accepted']]);
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

  it('I157 presents author semantics instead of technical ids and allows idea POV adaptation', () => {
    const intents: unknown[] = [];
    const tree = sourceInterpretationReview(h, reviewedState({ selectedSourceRole: 'idea' }), {
      begin: () => undefined, cancel: () => undefined, confirm: () => undefined,
      setSourceRole: () => undefined, setTreatment: () => undefined, setNarrativeIntent: (intent) => intents.push(intent),
      setParagraphRole: () => undefined, setParagraphDecision: () => undefined,
      availableCharacters: [{ id: 'mira-internal', name: '米拉' }],
    });
    const protagonist = collect(tree, 'select').find((node) => node.props?.['data-novel-import-interpretation-protagonist-source'] !== undefined);
    expect(protagonist?.props?.value).toBe('generate');
    expect(JSON.stringify(protagonist)).toContain('由 AI 创建并串联新主角');
    expect(JSON.stringify(protagonist)).toContain('使用已有角色：米拉');
    expect(collect(tree, 'input').some((node) => String(node.props?.['aria-label']).includes('主角 ID'))).toBe(false);
    expect(collect(tree, 'textarea').some((node) => String(node.props?.['aria-label']).includes('初始已知'))).toBe(false);
    expect(JSON.stringify(tree)).toContain('此处无需预先建立');
    expect(importIntentValidationMessage(reviewedState({ selectedSourceRole: 'idea' }))).toBeUndefined();
    expect(importIntentValidationMessage(reviewedState({ selectedSourceRole: 'synopsis' }))).toBe('故事梗概在当前阶段只能扩展为大纲。');

    (protagonist?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'existing:mira-internal' } });
    expect(intents).toEqual([{ pov: 'limited', protagonistCandidateId: undefined, protagonistId: 'mira-internal', initialKnown: [], revealPacing: 'balanced' }]);
  });

  it('仅对已有正文显示保真导入尚不可用的作者提示', () => {
    const tree = sourceInterpretationReview(h, reviewedState({ selectedSourceRole: 'existing-prose', treatment: 'expand-outline', narrativeIntent: undefined }), {
      begin: () => undefined, cancel: () => undefined, confirm: () => undefined, setSourceRole: () => undefined, setTreatment: () => undefined,
      setNarrativeIntent: () => undefined, setParagraphRole: () => undefined, setParagraphDecision: () => undefined,
    });
    expect(collect(tree).some((node) => node.props?.['data-novel-import-interpretation-existing-prose'] !== undefined)).toBe(true);
    expect(JSON.stringify(tree)).toContain('保留原正文的导入暂不可用');
    expect(JSON.stringify(tree)).not.toContain('Stage 21');
  });

  it('projects only Host-provided chunk text and ranges', () => {
    expect(paragraphsFromHostChunks([{ text: '一', startOffset: 3, endOffset: 4 }, { text: '二', startOffset: 8, endOffset: 9 }])).toEqual([
      { paragraphId: 'paragraph-0001', index: 0, text: '一', startOffset: 3, endOffset: 4 },
      { paragraphId: 'paragraph-0002', index: 1, text: '二', startOffset: 8, endOffset: 9 },
    ]);
    expect(() => paragraphsFromHostChunks([{ text: '缺范围' }])).toThrow('来源段落范围不可用');
  });

  it('I151 renders separate editable B1/B4 drafts and only offers Gate actions after first-import generation', () => {
    const candidate = {
      rules: [{ id: 'rule-one', scope: 'global' as const, kind: 'magic' as const, statement: '潮汐钟每天只能倒转一次。', priority: 80, immutable: false as const, examples: [], active: true }],
      style: { id: 'style-imported', name: '导入文风', person: 'third-limited' as const, tense: 'past' as const, povScope: 'single' as const, tone: '克制', proseStyle: '紧贴角色', chapterFormat: '按节点分章', dialogueConventions: '对白简洁', forbidden: [] },
    };
    const state = reviewedState({ confirmed: true, importSessionId: 'import-first', ruleStyleInitialization: { projectId: 'book', importSessionId: 'import-first', sourceHash: 'a'.repeat(64), status: 'succeeded', candidate, candidateFingerprint: 'b'.repeat(64), createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }, ruleStyleRulesDraft: JSON.stringify(candidate.rules), ruleStyleStyleDraft: JSON.stringify(candidate.style) });
    const tree = sourceInterpretationReview(h, state, {
      begin: () => undefined, cancel: () => undefined, confirm: () => undefined, setSourceRole: () => undefined, setTreatment: () => undefined,
      setNarrativeIntent: () => undefined, setParagraphRole: () => undefined, setParagraphDecision: () => undefined,
      setRuleStyleRulesDraft: () => undefined, setRuleStyleStyleDraft: () => undefined, proposeRuleStyleInitialization: () => undefined,
    });
    expect(collect(tree).some((node) => node.props?.['data-novel-rule-style-import-rules'] !== undefined)).toBe(true);
    expect(collect(tree).some((node) => node.props?.['data-novel-rule-style-import-style'] !== undefined)).toBe(true);
    expect(collect(tree, 'textarea').some((node) => node.props?.['data-novel-rule-style-import-rules'] !== undefined || node.props?.['data-novel-rule-style-import-style'] !== undefined)).toBe(false);
    expect(collect(tree, 'select').some((node) => node.props?.['data-novel-structured-input'] === 'rule-style-rules')).toBe(true);
    expect(collect(tree, 'button').some((node) => node.props?.['data-novel-rule-style-import-propose'] !== undefined)).toBe(true);
    expect(JSON.stringify(tree)).not.toContain('regenerate');
  });
});
