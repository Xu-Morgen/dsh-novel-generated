import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { narrativeImportPlanInvocations } from './host/remote/narrative-import-plan.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage19/narrative-import-plan-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I148 NarrativeImportPlan Remote contract lock', () => {
  it('locks one-preview/one-confirmation propose/read/accept/reject/recover', () => {
    expect(lock.descriptorIds).toEqual(narrativeImportPlanInvocations.map((descriptor) => descriptor.id));
    expect(lock.resultSchemaIds).toEqual(narrativeImportPlanInvocations.map((descriptor) => descriptor.id));
    expect(checkRemoteContractLock(lock, narrativeImportPlanInvocations, narrativeImportPlanInvocations)).toEqual([]);
  });
});
