import { access, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createImportInterpretationSessionService,
  IMPORT_INTERPRETATION_SESSIONS_FILE,
} from './import-interpretation-session-service.js';

const sourceHash = 'a'.repeat(64);
const replacementHash = 'b'.repeat(64);
const createInput = {
  projectId: 'demo',
  sourceHash,
  intent: { sourceRole: 'background-material' as const, treatment: 'expand-outline' as const },
  paragraphDecisions: [{ paragraphId: 'p-001', decision: 'accepted' as const, role: 'world-truth' as const, summary: '保留为幕后证据。' }],
};

describe('I142 import interpretation session owner', () => {
  it('I156 retries transient Windows rename locks but fails closed for permanent I/O errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i156-session-retry-'));
    try {
      let attempts = 0;
      const delays: number[] = [];
      const recovered = createImportInterpretationSessionService(root, undefined, {
        renameFile: async (temporary, target) => {
          attempts += 1;
          if (attempts <= 3) throw Object.assign(new Error('temporary lock'), { code: attempts === 1 ? 'EPERM' : attempts === 2 ? 'EBUSY' : 'EACCES' });
          await rename(temporary, target);
        },
        delay: async (milliseconds) => { delays.push(milliseconds); },
      });
      await expect(recovered.create(createInput)).resolves.toMatchObject({ status: 'draft' });
      expect(attempts).toBe(4);
      expect(delays).toEqual([20, 40, 60]);
      await access(join(root, 'demo', IMPORT_INTERPRETATION_SESSIONS_FILE));

      let permanentAttempts = 0;
      const permanent = createImportInterpretationSessionService(join(root, 'permanent'), undefined, {
        renameFile: async () => { permanentAttempts += 1; throw Object.assign(new Error('disk failure'), { code: 'EIO' }); },
        delay: async () => { throw new Error('non-transient errors must not back off'); },
      });
      await expect(permanent.create(createInput)).rejects.toThrow('disk failure');
      expect(permanentAttempts).toBe(1);

      let exhaustedAttempts = 0;
      const exhausted = createImportInterpretationSessionService(join(root, 'exhausted'), undefined, {
        renameFile: async () => { exhaustedAttempts += 1; throw Object.assign(new Error('still locked'), { code: 'EPERM' }); },
        delay: async () => undefined,
      });
      await expect(exhausted.create(createInput)).rejects.toThrow('still locked');
      expect(exhaustedAttempts).toBe(6);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists, reopens, confirms, and exposes source freshness without writing narrative layers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i142-session-'));
    try {
      let registeredDispose: (() => void) | undefined;
      const first = createImportInterpretationSessionService(root, (dispose) => { registeredDispose = dispose; });
      const draft = await first.create(createInput);
      expect(draft.status).toBe('draft');
      expect(draft.paragraphDecisions[0]?.role).toBe('world-truth');
      expect(registeredDispose).toBeTypeOf('function');
      await access(join(root, 'demo', IMPORT_INTERPRETATION_SESSIONS_FILE));
      expect(await readFile(join(root, 'demo', 'characters.yaml'), 'utf8').catch(() => undefined)).toBeUndefined();

      const reopened = createImportInterpretationSessionService(root);
      await expect(reopened.read({ projectId: 'demo', importSessionId: draft.importSessionId, sourceHash }))
        .resolves.toMatchObject({ status: 'draft', importSessionId: draft.importSessionId });
      const confirmed = await reopened.confirm({
        projectId: 'demo', importSessionId: draft.importSessionId, sourceHash,
        intent: createInput.intent, paragraphDecisions: createInput.paragraphDecisions,
      });
      expect(confirmed.status).toBe('confirmed');

      const legacy = await reopened.create({
        ...createInput,
        sourceHash: replacementHash,
        paragraphDecisions: [{ paragraphId: 'p-legacy', decision: 'accepted', summary: '旧调用方摘要' }],
      });
      expect(legacy.paragraphDecisions[0]).toEqual({ paragraphId: 'p-legacy', decision: 'accepted', summary: '旧调用方摘要' });

      const afterRestart = createImportInterpretationSessionService(root);
      await expect(afterRestart.read({ projectId: 'demo', importSessionId: draft.importSessionId, sourceHash }))
        .resolves.toMatchObject({ status: 'confirmed' });
      const stale = await afterRestart.read({ projectId: 'demo', importSessionId: draft.importSessionId, sourceHash: replacementHash });
      expect(stale.status).toBe('stale');
      await expect(afterRestart.confirm({
        projectId: 'demo', importSessionId: draft.importSessionId, sourceHash,
        intent: createInput.intent, paragraphDecisions: createInput.paragraphDecisions,
      })).rejects.toThrow(/Cannot confirm stale/);
      await expect(afterRestart.discard({
        projectId: 'demo', importSessionId: draft.importSessionId, sourceHash: replacementHash,
      })).rejects.toThrow(/source hash mismatch/);

      registeredDispose?.();
      expect(() => first.read({ projectId: 'demo', importSessionId: draft.importSessionId, sourceHash }))
        .toThrow(/disposed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects cross-project access, forged hash commands, duplicate paragraph summaries, and invalid intent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i142-negative-'));
    try {
      const service = createImportInterpretationSessionService(root);
      const session = await service.create(createInput);
      await expect(service.read({ projectId: 'other', importSessionId: session.importSessionId, sourceHash }))
        .rejects.toThrow(/Unknown import interpretation session/);
      await expect(service.confirm({
        projectId: 'demo', importSessionId: session.importSessionId, sourceHash: replacementHash,
        intent: createInput.intent, paragraphDecisions: createInput.paragraphDecisions,
      })).rejects.toThrow(/source hash mismatch/);
      await expect(service.create({
        ...createInput,
        paragraphDecisions: [
          ...createInput.paragraphDecisions,
          { paragraphId: 'p-001', decision: 'edited', summary: '重复 id。' },
        ],
      })).rejects.toThrow(/Duplicate paragraph id/);
      expect(() => service.create({
        ...createInput,
        intent: { sourceRole: 'background-material', treatment: 'adapt-pov' },
      })).toThrow(/narrativeIntent/);
      await expect(service.discard({
        projectId: 'demo', importSessionId: session.importSessionId, sourceHash: replacementHash,
      })).rejects.toThrow(/source hash mismatch/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I151 identifies only the first confirmed controlled import as eligible', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i151-first-import-'));
    try {
      const service = createImportInterpretationSessionService(root);
      const first = await service.create(createInput);
      await service.confirm({ ...createInput, importSessionId: first.importSessionId });
      await expect(service.firstConfirmed({ projectId: 'demo', importSessionId: first.importSessionId, sourceHash })).resolves.toMatchObject({ status: 'confirmed' });
      const second = await service.create({ ...createInput, sourceHash: replacementHash });
      await service.confirm({ ...createInput, importSessionId: second.importSessionId, sourceHash: replacementHash });
      await expect(service.firstConfirmed({ projectId: 'demo', importSessionId: second.importSessionId, sourceHash: replacementHash })).rejects.toThrow(/only allowed for the first/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
