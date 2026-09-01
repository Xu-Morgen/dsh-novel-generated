import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { narrativeRevealInvocations } from './host/remote/narrative-reveal.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage19/narrative-reveal-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I146 narrative reveal Remote contract lock', () => {
  it('locks candidate-only begin/status/cancel/result descriptors and strict results', () => {
    expect(lock.descriptorIds).toEqual(narrativeRevealInvocations.map((descriptor) => descriptor.id));
    expect(lock.resultSchemaIds).toEqual(narrativeRevealInvocations.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(lock, narrativeRevealInvocations, narrativeRevealInvocations)).toEqual([]);
  });
});
