import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import { describe, expect, it } from 'vitest';
import { NOVEL_WORKSPACE_NAMESPACE, canonQueryInvocation, llmConfigRemoteContribution, onboardingAdjudicateInvocation, onboardingAnalysisStartInvocation, onboardingAnalyzerRemoteContribution, onboardingRemoteContribution, probeInvocation, workspaceContribution, workspaceRemoteContribution, workspaceViewModelInvocation, workspaceViewModel } from './remote.js';

describe('I33 Host workspace Remote', () => {
  it('registers a typed minimal view model and withdraws it with the disposer', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);
    root.provide(NOVEL_WORKSPACE_NAMESPACE, { viewModel: workspaceViewModel });
    const disposer = root.typert.register(workspaceContribution);
    expect(root.typert.local.get('novelWorkspace/viewModel')).toBe(workspaceViewModelInvocation);
    expect((root.get(NOVEL_WORKSPACE_NAMESPACE) as { viewModel: () => unknown }).viewModel()).toEqual({
      product: 'novel-creation-tool', version: '2.0.0', ready: true,
      capabilities: ['generate', 'rewrite', 'continue', 'inspire'],
    });
    disposer();
    expect(root.typert.local.get('novelWorkspace/viewModel')).toBeUndefined();
    expect(workspaceRemoteContribution.descriptors[0]).toBe(workspaceViewModelInvocation);
    expect(workspaceRemoteContribution.descriptors).toHaveLength(36);
    await root.fiber.dispose();
  });

  it('mounts the full client workspace surface, including the I50 project lifecycle remotes', () => {
    // Consumer fixture (AGENTS §2): the Client runs mount→viewModel→projectList
    // at startup and calls projectCreate/projectOpen on open/create (I50 plan
    // step 17; contract lock contracts/stage10/project-lifecycle.json). The
    // mounted contribution must cover that whole surface, or the browser throws
    // `target.projectList is not a function` at $mount time.
    expect(workspaceRemoteContribution.descriptors.map((item) => `${item.namespace}/${item.method}`)).toEqual([
      'novelWorkspace/viewModel',
      'novelWorkspace/characterList', 'novelWorkspace/characterRead', 'novelWorkspace/characterCreate', 'novelWorkspace/characterUpdate',
      'novelWorkspace/worldviewList', 'novelWorkspace/worldviewRead', 'novelWorkspace/worldviewCreate', 'novelWorkspace/worldviewRewrite',
      'novelWorkspace/outlineRead', 'novelWorkspace/outlineSave', 'novelWorkspace/outlineBeatCards',
      'novelWorkspace/relationshipRead', 'novelWorkspace/relationshipSave',
      'novelWorkspace/stateCurrent', 'novelWorkspace/stateSnapshots', 'novelWorkspace/stateRollback', 'novelWorkspace/stateDiff',
      'novelWorkspace/canonQuery', 'novelWorkspace/canonCorrectionPropose', 'novelWorkspace/canonCorrectionAccept',
      'novelWorkspace/chapterList', 'novelWorkspace/chapterRead', 'novelWorkspace/sceneRead',
      'novelWorkspace/sceneEdit', 'novelWorkspace/sceneReparsePropose', 'novelWorkspace/sceneReparseAccept', 'novelWorkspace/sceneReparseReject', 'novelWorkspace/sceneReparsePreview',
      'novelWorkspace/uploadStart', 'novelWorkspace/uploadChunk', 'novelWorkspace/uploadFinalize', 'novelWorkspace/uploadCancel',
      'novelWorkspace/projectList', 'novelWorkspace/projectCreate', 'novelWorkspace/projectOpen',
    ]);
  });

  it('exposes only strict codecs so the DSH client gateway accepts the mount', () => {
    // The DSH client gateway (`dsh-api-gateway`) rejects `src-json` codecs at
    // $mount time. Every descriptor that reaches the Client must carry `strict`
    // codecs for its result and every parameter (H0-9 public Remote contract).
    for (const descriptor of [...workspaceRemoteContribution.descriptors, ...llmConfigRemoteContribution.descriptors, probeInvocation]) {
      expect(descriptor.result.mode).toBe('strict');
      for (const parameter of descriptor.parameters) {
        expect(parameter.codec.mode).toBe('strict');
      }
    }
  });

  it('uses precise typed result schemas and passthrough Host-validated input objects', () => {
    // Results carry precise domain/view schemas (never the `#json` passthrough).
    // I97（review v2.0 §8#2）：editor 写入口的 `input`/`patch` wire 请求合同精确化——
    // 携带真实请求 schema（不再落到通用 #json），领域服务侧复验保留（防御纵深）；
    // 可选 `filter` 仍为 passthrough。I51 `uploadStart` 与 I50 `projectCreate`
    // 是既有的小类型边界（fileName/size/sha256；strict CreateProjectInput）。
    for (const descriptor of workspaceRemoteContribution.descriptors) {
      expect((descriptor.result as { typeSymbol: string }).typeSymbol).not.toBe('novel-creation-tool#json');
    }
    for (const descriptor of workspaceRemoteContribution.descriptors) {
      if (descriptor.method === 'uploadStart' || descriptor.method === 'projectCreate') continue;
      for (const parameter of descriptor.parameters) {
        if (['input', 'patch'].includes(parameter.wire)) {
          expect((parameter.codec as { typeSymbol: string }).typeSymbol).not.toBe('novel-creation-tool#json');
        }
        if (parameter.wire === 'filter') {
          expect((parameter.codec as { typeSymbol: string }).typeSymbol).toBe('novel-creation-tool#json');
        }
      }
    }
  });

  it('mounts every client contribution under a unique Remote package name', async () => {
    // The DSH client Typert registry (`RemoteStore.register`) rejects a second
    // mount whose `package` is already registered. The three contributions
    // client.ts mounts used to share `novel-creation-tool`, so the analyzer and
    // onboarding mounts failed silently and `remote.novelOnboardingAnalyzer`
    // never existed ("分析服务不可用").
    const mounted = [workspaceRemoteContribution, onboardingAnalyzerRemoteContribution, onboardingRemoteContribution, llmConfigRemoteContribution];
    expect(new Set(mounted.map((item) => item.package)).size).toBe(mounted.length);
    const root = new Context();
    await root.plugin(TypertRegistry);
    const disposers = mounted.map((item) => root.typert.remotes.register(item));
    expect(root.typert.remotes.list().map((item) => item.id)).toContain('novel-creation-tool/novelOnboardingAnalyzer/start');
    for (const dispose of disposers) dispose();
    await root.fiber.dispose();
  });

  it('marks optional wire parameters so the gateway accepts the client call shapes', () => {
    // dsh-api-gateway `assertExactArguments` accepts an absent JSON wire field
    // only when the descriptor marks it `acceptsUndefined` (or src-json). The
    // Client drops `undefined` positional values, so an optional parameter that
    // is not marked makes the Host reject the call — e.g.
    // `missing "settings"` on novelOnboardingAnalyzer/start.
    const missing = (descriptor: InvocationDescriptor, args: Record<string, unknown>): string[] => {
      const acceptsMissing = new Set(descriptor.parameters
        .filter((parameter) => parameter.source === 'json' && (parameter.acceptsUndefined === true || parameter.codec.mode === 'src-json'))
        .map((parameter) => parameter.wire));
      return descriptor.parameters.map((parameter) => parameter.wire).filter((key) => !Object.hasOwn(args, key) && !acceptsMissing.has(key));
    };
    expect(missing(onboardingAnalysisStartInvocation, { input: { projectId: 'p', sourceHash: 'a'.repeat(64), text: 't' } })).toEqual([]);
    expect(missing(onboardingAdjudicateInvocation, { input: { projectId: 'p', onboardingSessionId: 's', sourceHash: 'a'.repeat(64), layer: 'characters', decision: 'accept' } })).toEqual([]);
    expect(missing(canonQueryInvocation, { projectId: 'p' })).toEqual([]);
  });
});
