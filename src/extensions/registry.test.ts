import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ExtensionRegistry, type Extension } from './registry.js';

const provider = (id = 'economy-provider'): Extension => ({
  id,
  kind: 'provider',
  layerId: 'economy',
  schema: z.object({ currency: z.string().min(1) }).strict(),
});

describe('I32 ExtensionRegistry lifecycle and authorization', () => {
  it('registers all six categories in one registry and releases each seam', () => {
    const registry = new ExtensionRegistry();
    const handles = [
      registry.register(provider()),
      registry.register({ id: 'economy-injector', kind: 'injector', layerId: 'economy', heading: 'Economy', serialize: () => 'coins' }),
      registry.register({ id: 'economy-validator', kind: 'validator', check: () => [] }),
      registry.register({ id: 'economy-parser', kind: 'parser', layerId: 'economy', outputSchema: z.object({ ops: z.array(z.unknown()) }).strict(), parse: async () => ({ ops: [] }) }),
      registry.register({ id: 'betrayal-rule', kind: 'relationship-rule', evaluate: () => [] }),
      registry.register({ id: 'low-temperature', kind: 'backend-strategy', adapt: (input) => input }),
    ];

    const beforeArm = registry.seams();
    expect(beforeArm.providers).toHaveLength(1);
    expect(beforeArm.injectors).toHaveLength(1);
    expect(beforeArm.validators).toHaveLength(1);
    expect(beforeArm.parsers).toHaveLength(1);
    expect(beforeArm.relationshipRules).toHaveLength(0);
    expect(beforeArm.backendStrategies).toHaveLength(1);

    registry.armRelationshipRules();
    expect(registry.seams().relationshipRules).toHaveLength(1);
    for (const handle of handles) handle.release();
    expect(registry.seams()).toEqual({
      providers: [], injectors: [], validators: [], parsers: [], relationshipRules: [], backendStrategies: [],
    });
  });

  it('rejects duplicate ids, duplicate layer seam owners, and unauthorized capability fields', () => {
    const registry = new ExtensionRegistry();
    registry.register(provider());
    expect(() => registry.register({ id: 'economy-provider', kind: 'validator', check: () => [] })).toThrow(/Duplicate extension id/);
    expect(() => registry.register({ id: 'economy-provider-two', kind: 'provider', layerId: 'economy', schema: z.unknown() })).toThrow(/Duplicate provider owner/);

    expect(() => registry.register({
      id: 'unsafe-validator',
      kind: 'validator',
      check: () => [],
      filePath: '/tmp/owned-by-extension',
    } as unknown as Extension)).toThrow(/Unauthorized extension fields: filePath/);
  });

  it('disposes the complete lifecycle and rejects later registration or dispatch', () => {
    const registry = new ExtensionRegistry();
    registry.register(provider());
    registry.dispose();
    expect(() => registry.seams()).toThrow(/disposed/);
    expect(() => registry.register(provider('late-provider'))).toThrow(/disposed/);
  });
});
