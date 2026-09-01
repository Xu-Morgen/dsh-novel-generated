import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { narrativeAdaptationInvocations } from './host/remote/narrative-adaptation.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage19/narrative-adaptation-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I145 narrative adaptation Remote contract lock', () => {
  it('locks candidate-only begin/status/cancel/result descriptors and strict results', () => {
    expect(lock.descriptorIds).toEqual(narrativeAdaptationInvocations.map((descriptor) => descriptor.id));
    expect(lock.resultSchemaIds).toEqual(narrativeAdaptationInvocations.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(lock, narrativeAdaptationInvocations, narrativeAdaptationInvocations)).toEqual([]);
  });
});
