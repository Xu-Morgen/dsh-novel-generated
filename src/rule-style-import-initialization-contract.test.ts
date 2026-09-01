import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRemoteContractLock } from './contract-lock.js';
import { ruleStyleImportInitializationInvocations } from './host/remote/rule-style-import-initialization.js';

const lock = JSON.parse(readFileSync(new URL('../contracts/stage20/rule-style-import-initialization-remote.json', import.meta.url), 'utf8')) as {
  descriptorIds: string[];
  descriptors: Record<string, unknown>;
  resultSchemaIds: string[];
  resultSchemas: Record<string, unknown>;
};

describe('I151 rule/style import initialization Remote contract lock', () => {
  it('locks begin/status/result/propose/accept/reject/cancel and exposes no regenerate method', () => {
    expect(lock.descriptorIds).toEqual(ruleStyleImportInitializationInvocations.map((descriptor) => descriptor.id));
    expect(lock.descriptorIds.some((id) => id.endsWith('/regenerate'))).toBe(false);
    expect(lock.resultSchemaIds).toEqual(lock.descriptorIds);
    expect(checkRemoteContractLock(lock, ruleStyleImportInitializationInvocations, ruleStyleImportInitializationInvocations)).toEqual([]);
  });
});
