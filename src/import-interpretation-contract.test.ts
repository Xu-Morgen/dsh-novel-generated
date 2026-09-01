import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { importInterpretationInvocations } from './host/remote/import-interpretation.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage19/import-interpretation-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I142 import interpretation Remote contract lock', () => {
  it('locks the four additive descriptors and their strict result schemas', () => {
    expect(lock.descriptorIds).toEqual(importInterpretationInvocations.map((descriptor) => descriptor.id));
    expect(lock.resultSchemaIds).toEqual(importInterpretationInvocations.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(lock, importInterpretationInvocations, importInterpretationInvocations)).toEqual([]);
  });

  it('keeps the operational namespace out of the legacy Stage 18 baseline', () => {
    const oldLock = JSON.parse(readFileSync(new URL('../contracts/stage18/remote-descriptors.json', import.meta.url), 'utf8')) as {
      descriptorIds: string[];
      resultSchemaIds: string[];
    };
    expect(oldLock.descriptorIds).not.toContain(importInterpretationInvocations[0].id);
    expect(oldLock.resultSchemaIds).not.toContain(importInterpretationInvocations[0].id);
  });
});
