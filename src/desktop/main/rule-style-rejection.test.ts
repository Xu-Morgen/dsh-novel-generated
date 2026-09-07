import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopProjectHandlers } from './project-handlers.js';
import { createImportInterpretationController, sourceInterpretationReview, type ImportInterpretationReviewState } from '../../client/import-interpretation-review.js';
import type { WorkbenchActions } from '../../client/store/types.js';
import { unwrap } from '../../client/shared.js';
import { IpcHandlerRejection, ruleStyleHandlerRejection } from '../../app/ipc-handler-rejection.js';

const method = 'novel-creation-tool/novelRuleStyleImportInitialization/begin';
const identity = { projectId: 'book', importSessionId: 'session', sourceHash: 'a'.repeat(64) };

describe('I199 real initialization rejection boundary', () => {
  it.each([false, true])('shows first-import refusal through Main, registry and Client (config failure=%s)', async (configFailure) => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i199-'));
    const dispose: (() => void)[] = [];
    let state: ImportInterpretationReviewState | undefined;
    let failConfig = false;
    const output = { sourceRole: 'idea', confidence: 'high', evidenceParagraphIds: ['paragraph-0001'], paragraphs: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', confidence: 'high', evidence: 'seed' }], rationale: 'seed' };
    const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, {
      onDispose: fn => { dispose.push(fn); },
      llm: { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(output) }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } },
      resolveGenerationSettings: async () => { if (failConfig) throw new Error('test-only-secret'); return { modelRef: 'test/model', credentialRef: 'test/key' }; },
    });
    const invoke = (service: string, action: string, ...args: unknown[]) => {
      const id = `novel-creation-tool/${service}/${action}`;
      return desktopIpcRegistry.invoke(id, args, handlers.get(id));
    };
    const controller = createImportInterpretationController({
      analysis: () => Object.fromEntries(['begin', 'status', 'result'].map(action => [action, (...args: unknown[]) => invoke('novelImportInterpretationAnalysis', action, ...args)])) as never,
      session: () => Object.fromEntries(['create', 'confirm'].map(action => [action, (...args: unknown[]) => invoke('novelImportInterpretation', action, ...args)])) as never,
      initialization: () => ({ begin: (...args: unknown[]) => invoke('novelRuleStyleImportInitialization', 'begin', ...args) }) as never,
      currentProjectId: () => 'book', isActive: () => true, beginOp: () => true, endOp: () => {}, onConfirmed: () => {},
      dispatch: apply => apply({ importInterpretationReview: (value: ImportInterpretationReviewState | undefined) => { state = value; } } as WorkbenchActions),
    });
    try {
      await unwrap(invoke('novelWorkspace', 'projectCreate', { projectId: 'book', name: 'Book' }));
      await unwrap(invoke('novelWorkspace', 'projectOpen', 'book'));
      const intent = { sourceRole: 'idea', treatment: 'expand-outline' };
      const paragraphDecisions = [{ paragraphId: 'paragraph-0001', role: 'plot-plan', decision: 'accepted', summary: 'seed' }];
      const first = await unwrap(invoke('novelImportInterpretation', 'create', { projectId: 'book', sourceHash: identity.sourceHash, intent, paragraphDecisions })) as { importSessionId: string };
      await unwrap(invoke('novelImportInterpretation', 'confirm', { ...identity, importSessionId: first.importSessionId, intent, paragraphDecisions }));
      controller.begin({ sourceHash: identity.sourceHash, text: 'seed', paragraphs: [{ paragraphId: 'paragraph-0001', index: 0, text: 'seed', startOffset: 0, endOffset: 4 }] });
      await expect.poll(() => state?.analysisStatus).toBe('succeeded');
      failConfig = configFailure;
      controller.setSourceRole('idea'); controller.setTreatment('expand-outline'); controller.setParagraphDecision('paragraph-0001', 'accepted');
      controller.confirm();
      await expect.poll(() => state?.ruleStyleStartFailure?.retryable).toBe(false);
      expect(state?.technicalError).toContain('only allowed for the first controlled import');
      expect(state?.technicalError).toContain('code=handler-failed');
      const tree = sourceInterpretationReview((tag, props, ...children) => ({ tag, props, children }), state!, controller);
      expect(JSON.stringify(tree)).toContain('此作品此前已确认过导入');
      expect(JSON.stringify(tree)).not.toContain('等待模型返回首个内容片段');
      expect(JSON.stringify(tree)).not.toContain('test-only-secret');
    } finally { controller.dispose(); dispose.reverse().forEach(fn => fn()); await rm(root, { recursive: true, force: true }); }
  });

  it('never exposes arbitrary messages, fake rejection objects, or mutated Error data', async () => {
    const secret = 'test-only-sensitive-value';
    const augmented = new Error(`Rule/style initialization is only allowed for the first controlled import ${secret}`);
    const forged = Object.assign(Object.create(IpcHandlerRejection.prototype), { message: secret });
    for (const cause of [new Error(secret), ruleStyleHandlerRejection(augmented), forged]) {
      const result = await desktopIpcRegistry.invoke(method, [identity, undefined], () => { throw cause; });
      expect(result).toMatchObject({ ok: false, error: { message: 'IPC method handler failed' } });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    const known = new IpcHandlerRejection('first-import-required');
    known.message = secret;
    const result = await desktopIpcRegistry.invoke(method, [identity, undefined], () => { throw known; });
    expect(result).toMatchObject({ ok: false, error: { message: 'Rule/style initialization is only allowed for the first controlled import' } });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
