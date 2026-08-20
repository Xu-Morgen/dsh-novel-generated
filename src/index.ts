import type { Context } from '@deepseek-ai/cordis';

import { createCanonService } from './host/canon-service.js';
import { createProjectService } from './host/project-service.js';
import { createStateService } from './host/state-service.js';
import { NOVEL_PROBE_NAMESPACE, probeContribution, probeData } from './remote.js';

/**
 * I1 Host plugin extended by I2 (design §0.1.3 I2): proves the ordinary
 * out-of-tree Cordis package contract with a Host service, and now also
 * registers the gate-only public Remote probe.
 *
 * - `novelCreation` (I1): minimal read-only status service, removed on dispose.
 * - `novelProject` (I3) / `novelState` (I4) / `novelCanon` (I5): Host facades over
 *   the project, C2 state, and C4 canon stores respectively.
 * - `novelProbe` (I2): plain Host service backing the `novelProbe/probe` Remote.
 *   Its Typert contribution is registered only when the DSH Typert registry
 *   (`ctx.typert`, key `typert`) is present, so the plugin still boots in the
 *   minimal I1 loader smoke where that registry is absent. Registration runs
 *   through `ctx.effect`, so Fiber dispose withdraws it (H0-6).
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export interface NovelCreationConfig {
  projectsRoot?: string;
}

export function apply(ctx: Context, config: NovelCreationConfig = {}): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Services are owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
  const projectsRoot = config.projectsRoot;
  ctx.provide('novelProject', createProjectService(projectsRoot));
  ctx.provide('novelState', createStateService(projectsRoot));
  ctx.provide('novelCanon', createCanonService(projectsRoot));

  // I2 public Remote probe: provide the service, then register its Typert
  // contribution when the registry is available (full DSH Host composition).
  ctx.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
  const typert = ctx.get('typert', false);
  if (typert !== undefined) {
    ctx.effect(() => typert.register(probeContribution));
  }
}
