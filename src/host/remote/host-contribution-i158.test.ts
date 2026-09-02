import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';

import { apply } from '../../index.js';
import { importInterpretationRemoteContribution } from './import-interpretation.js';
import { importInterpretationAnalysisRemoteContribution } from './import-interpretation-analysis.js';
import { narrativeAdaptationRemoteContribution } from './narrative-adaptation.js';
import { narrativeRevealRemoteContribution } from './narrative-reveal.js';
import { narrativeImportPlanRemoteContribution } from './narrative-import-plan.js';
import { ruleStyleImportInitializationRemoteContribution } from './rule-style-import-initialization.js';
import { hostContribution } from './host-contribution.js';

const sourceImportContributions = [
  importInterpretationRemoteContribution,
  importInterpretationAnalysisRemoteContribution,
  narrativeAdaptationRemoteContribution,
  narrativeRevealRemoteContribution,
  narrativeImportPlanRemoteContribution,
  ruleStyleImportInitializationRemoteContribution,
] as const;

describe('I158 source import Remote Host registration', () => {
  it('registers every Client-mounted source import descriptor exactly once in the Host face', () => {
    const hostIds = hostContribution.invocations.map((descriptor) => descriptor.id);
    const hostIdSet = new Set(hostIds);
    const sourceIds = sourceImportContributions.flatMap((contribution) => contribution.descriptors.map((descriptor) => descriptor.id));

    expect(sourceIds).toHaveLength(28);
    expect(sourceIds.filter((id) => !hostIdSet.has(id))).toEqual([]);
    expect(hostIds).toHaveLength(hostIdSet.size);
    for (const id of sourceIds) expect(hostIds.filter((candidate) => candidate === id)).toHaveLength(1);
  });

  it('lets the real DSH /api interceptor claim and dispatch create, then withdraws it on Fiber dispose', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i158-gateway-'));
    const root = new Context();
    let claim: ((endpoint: string) => boolean) | undefined;
    let dispatch: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined;
    root.provide('connection', {
      rpc: {
        intercept(path: string, claimsEndpoint: (endpoint: string) => boolean, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) {
          expect(path).toBe('/api');
          claim = claimsEndpoint;
          dispatch = handler;
        },
      },
    });
    await root.plugin(TypertRegistry);
    await root.plugin(TypertGatewayService);
    const pluginFiber = await root.plugin(apply, { projectsRoot, agentTools: false });
    const endpoint = 'novelImportInterpretation/create';
    try {
      expect(claim?.(endpoint)).toBe(true);
      expect(claim?.('novelMissing/create')).toBe(false);
      const response = await dispatch?.(endpoint, {
        args: {
          input: {
            projectId: 'book',
            sourceHash: 'a'.repeat(64),
            intent: { sourceRole: 'idea', treatment: 'expand-outline' },
            paragraphDecisions: [{ paragraphId: 'paragraph-0001', decision: 'pending', summary: '待作者裁决' }],
          },
        },
      }, new AbortController().signal) as { ok: boolean; value?: { projectId: string; sourceHash: string; status: string } } | undefined;
      expect(response).toMatchObject({
        ok: true,
        value: { projectId: 'book', sourceHash: 'a'.repeat(64), status: 'draft' },
      });

      await pluginFiber.dispose();
      expect(root.typert.local.get(endpoint)).toBeUndefined();
      // rc.2 intentionally keeps claiming a withdrawn endpoint after hasSeen()
      // so callers receive a structured definition-unavailable failure instead
      // of falling through to an unrelated HTTP 404 handler.
      expect(claim?.(endpoint)).toBe(true);
      await expect(dispatch?.(endpoint, { args: {} }, new AbortController().signal)).resolves.toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('strict definition was withdrawn') },
      });
    } finally {
      await pluginFiber.dispose();
      await root.fiber.dispose();
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });
});
