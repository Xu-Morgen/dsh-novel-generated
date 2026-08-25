import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';
import { NOVEL_WORKSPACE_NAMESPACE, probeInvocation, workspaceContribution, workspaceRemoteContribution, workspaceViewModelInvocation, workspaceViewModel } from './remote.js';

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
    expect(workspaceRemoteContribution.descriptors).toHaveLength(28);
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
      'novelWorkspace/uploadStart', 'novelWorkspace/uploadChunk', 'novelWorkspace/uploadFinalize', 'novelWorkspace/uploadCancel',
      'novelWorkspace/projectList', 'novelWorkspace/projectCreate', 'novelWorkspace/projectOpen',
    ]);
  });

  it('exposes only strict codecs so the DSH client gateway accepts the mount', () => {
    // The DSH client gateway (`dsh-api-gateway`) rejects `src-json` codecs at
    // $mount time. Every descriptor that reaches the Client must carry `strict`
    // codecs for its result and every parameter (H0-9 public Remote contract).
    for (const descriptor of [...workspaceRemoteContribution.descriptors, probeInvocation]) {
      expect(descriptor.result.mode).toBe('strict');
      for (const parameter of descriptor.parameters) {
        expect(parameter.codec.mode).toBe('strict');
      }
    }
  });

  it('uses precise typed result schemas and passthrough Host-validated input objects', () => {
    // Results carry precise domain/view schemas (never the `#json` passthrough),
    // while `input`/`patch`/`filter` objects stay passthrough because the Host
    // owns domain validation and the Client owns no schema (design §0.1.2).
    // I51 `uploadStart` and I50 `projectCreate` are the deliberate exceptions:
    // their `input` is a small typed boundary (fileName/size/sha256; strict
    // CreateProjectInput) validated strictly at the wire (R11-2 / I50 plan
    // step 14).
    for (const descriptor of workspaceRemoteContribution.descriptors) {
      expect((descriptor.result as { typeSymbol: string }).typeSymbol).not.toBe('novel-creation-tool#json');
    }
    for (const descriptor of workspaceRemoteContribution.descriptors) {
      if (descriptor.method === 'uploadStart' || descriptor.method === 'projectCreate') continue;
      for (const parameter of descriptor.parameters) {
        if (['input', 'patch', 'filter'].includes(parameter.wire)) {
          expect((parameter.codec as { typeSymbol: string }).typeSymbol).toBe('novel-creation-tool#json');
        }
      }
    }
  });
});
