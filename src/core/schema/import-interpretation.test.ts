import { describe, expect, it } from 'vitest';
import {
  fingerprintImportSourceBinding,
  importSourceBindingSchema,
  serializeImportSourceBinding,
  validateImportIntent,
} from './import-interpretation.js';

const hash = 'a'.repeat(64);
const limited = {
  pov: 'limited' as const,
  protagonistId: 'mira',
  initialKnown: ['mira'],
  revealPacing: 'balanced' as const,
};

describe('I141 import interpretation contract', () => {
  it('round-trips the two independent axes and stable fingerprint', () => {
    const binding = validateImportIntent({
      projectId: 'demo', sourceHash: hash, sourceRole: 'background-material',
      treatment: 'adapt-pov', narrativeIntent: limited,
    }, { existingCharacterIds: ['mira'] });
    expect(importSourceBindingSchema.parse(binding)).toEqual(binding);
    expect(serializeImportSourceBinding(binding)).toBe(serializeImportSourceBinding(structuredClone(binding)));
    expect(fingerprintImportSourceBinding(binding)).toHaveLength(64);
    expect(fingerprintImportSourceBinding(binding)).toBe(fingerprintImportSourceBinding(structuredClone(binding)));
  });

  it('rejects preserve-prose, treatment/intent mismatch, and missing limited POV', () => {
    expect(() => importSourceBindingSchema.parse({
      projectId: 'demo', sourceHash: hash, sourceRole: 'existing-prose', treatment: 'preserve-prose',
    })).toThrow();
    expect(() => importSourceBindingSchema.parse({
      projectId: 'demo', sourceHash: hash, sourceRole: 'idea', treatment: 'expand-outline', narrativeIntent: limited,
    })).toThrow(/only valid/);
    expect(() => importSourceBindingSchema.parse({
      projectId: 'demo', sourceHash: hash, sourceRole: 'hybrid', treatment: 'adapt-pov',
      narrativeIntent: { pov: 'limited', initialKnown: [], revealPacing: 'slow' },
    })).toThrow(/limited POV/);
  });

  it('rejects unknown focal ids unless the stable candidate is resolved', () => {
    expect(() => validateImportIntent({
      projectId: 'demo', sourceHash: hash, sourceRole: 'hybrid', treatment: 'adapt-pov',
      narrativeIntent: { ...limited, protagonistId: 'unknown' },
    }, { existingCharacterIds: ['mira'] })).toThrow(/Unknown protagonist/);
    expect(validateImportIntent({
      projectId: 'demo', sourceHash: hash, sourceRole: 'hybrid', treatment: 'adapt-pov',
      narrativeIntent: { pov: 'limited', protagonistCandidateId: 'new-hero', initialKnown: [], revealPacing: 'slow' },
    }, { candidateCharacterIds: ['new-hero'] }).narrativeIntent?.protagonistCandidateId).toBe('new-hero');
  });

  it('keeps old onboarding contracts outside the new schema', () => {
    expect(() => importSourceBindingSchema.parse({
      projectId: 'demo', sourceHash: hash, sourceRole: 'idea', treatment: 'expand-outline', extra: true,
    })).toThrow();
  });
});

