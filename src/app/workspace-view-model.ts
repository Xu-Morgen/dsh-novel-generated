/**
 * Stable workspace capability projection shared by Main consumers. Keeping
 * this value in the framework-neutral app layer prevents a retired transport
 * descriptor from becoming a hidden production dependency.
 */
export interface WorkspaceViewModel {
  readonly product: 'novel-creation-tool';
  readonly version: '2.0.0';
  readonly ready: true;
  readonly capabilities: readonly ('generate' | 'rewrite' | 'continue' | 'inspire')[];
}

export function workspaceViewModel(): WorkspaceViewModel {
  return Object.freeze({
    product: 'novel-creation-tool' as const,
    version: '2.0.0' as const,
    ready: true as const,
    capabilities: Object.freeze(['generate', 'rewrite', 'continue', 'inspire'] as const),
  });
}
