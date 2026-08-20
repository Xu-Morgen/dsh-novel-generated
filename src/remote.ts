import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';

/**
 * I2 gate-only public Remote probe (design §0.1.3 I2, §0.1.2; H0-9).
 *
 * This module hand-authorises one Remote method, `novelProbe/probe`, against the
 * DSH public Typert contract (@deepseek-ai/dsh-typert-protocol/-registry @
 * 0.1.0-rc.7). It is deliberately NOT the product Host–Client seam: the probe
 * only proves that an ordinary out-of-tree plugin can expose a public Remote
 * whose round-trip returns probe data. The `src-json` result codec needs no
 * schema, so this contribution carries zero runtime dependencies — the typert
 * packages are type-only at this call site.
 *
 * The contribution is registered into `ctx.typert` by `src/index.ts` when the
 * DSH Typert registry is present; the DSH gateway then dispatches
 * `novelProbe/probe` to the `novelProbe` service. Consumer clients mount the
 * same descriptors through `ctx.remote.$mount` (see {@link probeRemoteContribution}).
 */

/** Wire namespace and Cordis service key of the probe Remote. */
export const NOVEL_PROBE_NAMESPACE = 'novelProbe';

/** Static marker the probe Remote returns (also rendered by the Client Slot). */
export const PROBE_MARKER = 'I2-PROBE';

/** The probe's owned round-trip payload. */
export interface ProbeData {
  readonly marker: string;
  readonly ready: boolean;
}

/** Returns the probe payload; `novelProbe` is a plain Host service, no subclass needed. */
export function probeData(): ProbeData {
  return { marker: PROBE_MARKER, ready: true };
}

/** The single public Remote method: direct, zero parameters, `src-json` result. */
export const probeInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelProbe/probe',
  service: NOVEL_PROBE_NAMESPACE,
  namespace: NOVEL_PROBE_NAMESPACE,
  method: 'probe',
  invocation: { kind: 'direct' },
  parameters: [],
  result: { mode: 'src-json' },
};

/** Host-face Typert contribution registered into `ctx.typert` (empty model: reflection only). */
export const probeContribution: TypertContribution = {
  package: 'novel-creation-tool',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation],
};

/** Client-face Remote contribution mounted through `ctx.remote.$mount`. */
export const probeRemoteContribution: TypertRemoteContribution = {
  package: 'novel-creation-tool',
  descriptors: [probeInvocation],
};
