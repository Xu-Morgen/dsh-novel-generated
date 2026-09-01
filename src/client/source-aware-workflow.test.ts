import { describe, expect, it } from 'vitest';
import { freshImportInterpretationReview, importIntentValidationMessage } from './import-interpretation-review.js';
import { workflowPanel } from './layers/workflow.js';
import { projectSourceAwareWorkflow, routeSourceAwareWorkflow } from './source-aware-workflow.js';
import type { ImportInterpretationReviewState } from './import-interpretation-review.js';
import type { El } from './shared.js';

const sourceHash = 'a'.repeat(64);
const intent = { pov: 'limited' as const, protagonistCandidateId: 'investigator', initialKnown: [], revealPacing: 'balanced' as const };

function review(
  sourceRole: ImportInterpretationReviewState['selectedSourceRole'],
  treatment: ImportInterpretationReviewState['treatment'],
  options: { confirmed?: boolean; pending?: boolean; analysisStatus?: ImportInterpretationReviewState['analysisStatus'] } = {},
): ImportInterpretationReviewState {
  const base = freshImportInterpretationReview('ashen-codex', sourceHash, '幕后素材', [{ paragraphId: 'paragraph-0001', index: 0, text: '调查者发现港口记录缺页。', startOffset: 0, endOffset: 14 }]);
  return {
    ...base,
    analysisStatus: options.analysisStatus ?? 'succeeded',
    selectedSourceRole: sourceRole,
    treatment,
    ...(treatment === 'adapt-pov' ? { narrativeIntent: intent } : {}),
    paragraphs: base.paragraphs.map((paragraph) => ({ ...paragraph, decision: options.pending === true ? 'pending' as const : 'accepted' as const })),
    confirmed: options.confirmed ?? true,
  };
}

describe('I149 source-aware workflow route', () => {
  it('renders the source route inside the existing workflow panel and keeps the stage callback narrow', () => {
    const calls: string[] = [];
    const h = ((tag: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ tag, props, children })) as El;
    const sourceAware = projectSourceAwareWorkflow({ review: review('background-material', 'adapt-pov'), planStatus: 'applied' });
    const panel = workflowPanel(h, { state: { projectId: 'ashen-codex', stage: 'outline' }, projectName: '灰烬圣典', openStage: (stage) => calls.push(stage), sourceAware }) as { children: unknown[] };
    const source = panel.children.find((child) => (child as { props?: Record<string, unknown> } | null)?.props?.['data-novel-workflow-source-route'] === 'narrative-adaptation') as { props: Record<string, unknown>; children: unknown[] } | undefined;
    expect(source?.props['data-novel-workflow-source-status']).toBe('applied');
    const action = source?.children.find((child) => (child as { props?: Record<string, unknown> } | null)?.props?.['data-novel-workflow-source-next'] === 'detail') as { props: { onClick: () => void } } | undefined;
    action?.props.onClick();
    expect(calls).toEqual(['detail']);
  });

  it('routes the Ashen Codex backstage path through the existing outline flow only after its plan is applied', () => {
    const pending = projectSourceAwareWorkflow({ review: review('background-material', 'adapt-pov') });
    expect(pending.route).toBe('narrative-adaptation');
    expect(pending.targetStage).toBe('outline');
    expect(pending.nextStage).toBe('outline');
    expect(pending.canProceedToDetail).toBe(false);
    expect(pending.requiresNarrativePlan).toBe(true);

    const applied = projectSourceAwareWorkflow({ review: review('background-material', 'adapt-pov'), planStatus: 'applied' });
    expect(applied.nextStage).toBe('detail');
    expect(applied.canProceedToDetail).toBe(true);
    expect(applied.fidelityImportAvailable).toBe(false);
  });

  it('keeps ordinary synopsis and manually recovered classifier choices on the existing route', () => {
    expect(projectSourceAwareWorkflow({ review: review('synopsis', 'expand-outline') }).route).toBe('ordinary-outline');
    expect(projectSourceAwareWorkflow({ review: review('synopsis', 'expand-outline', { analysisStatus: 'failed' }) }).nextStage).toBe('detail');
  });

  it('keeps unresolved hybrid segments and every plan recovery state from advancing or writing', () => {
    const unresolved = projectSourceAwareWorkflow({ review: review('hybrid', 'adapt-pov', { pending: true }) });
    expect(unresolved.route).toBe('awaiting-source-confirmation');
    expect(unresolved.unresolvedParagraphIds).toEqual(['paragraph-0001']);
    expect(unresolved.nextStage).toBe('import');

    for (const planStatus of ['pending', 'stale', 'partial-failure', 'pending-recovery', 'rejected'] as const) {
      const stages: string[] = [];
      const blocked = routeSourceAwareWorkflow({ review: review('hybrid', 'adapt-pov'), planStatus }, (stage) => stages.push(stage));
      expect(blocked.canProceedToDetail).toBe(false);
      expect(blocked.nextStage).toBe('outline');
      expect(stages).toEqual(['outline']);
    }
  });

  it('recognizes existing prose but exposes only outline expansion, never a fidelity path', () => {
    const existing = review('existing-prose', 'expand-outline');
    const projection = projectSourceAwareWorkflow({ review: existing });
    expect(projection.route).toBe('existing-prose-outline');
    expect(projection.nextStage).toBe('detail');
    expect(projection.fidelityImportAvailable).toBe(false);

    const invalid = review('existing-prose', 'adapt-pov');
    expect(importIntentValidationMessage(invalid)).toMatch(/只能扩展为大纲/);
    expect(projectSourceAwareWorkflow({ review: invalid }).route).toBe('blocked');
  });

  it('cancels back to source review and does not route an unconfirmed source', () => {
    const stages: string[] = [];
    const projection = routeSourceAwareWorkflow({ review: review('background-material', 'adapt-pov', { confirmed: false, analysisStatus: 'cancelled' }) }, (stage) => stages.push(stage));
    expect(projection.nextStage).toBe('import');
    expect(stages).toEqual(['import']);
  });
});
