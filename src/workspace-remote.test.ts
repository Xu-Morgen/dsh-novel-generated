import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';
import { NOVEL_WORKSPACE_NAMESPACE, workspaceContribution, workspaceRemoteContribution, workspaceViewModelInvocation, workspaceViewModel } from './remote.js';

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
    expect(workspaceRemoteContribution.descriptors).toHaveLength(21);
    await root.fiber.dispose();
  });
});
