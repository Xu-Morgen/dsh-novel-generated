import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { importInterpretationAnalysisInvocations } from './host/remote/import-interpretation-analysis.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage19/import-interpretation-analysis-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I143 import interpretation analysis Remote contract lock', () => {
  it('locks begin/status/cancel/result descriptors and strict result schemas', () => {
    expect(lock.descriptorIds).toEqual(importInterpretationAnalysisInvocations.map((descriptor) => descriptor.id));
    expect(lock.resultSchemaIds).toEqual(importInterpretationAnalysisInvocations.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(lock, importInterpretationAnalysisInvocations, importInterpretationAnalysisInvocations)).toEqual([]);
  });
});
