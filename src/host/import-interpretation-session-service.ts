import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { projectDirectory } from '../core/io/path.js';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import {
  importSourceBindingSchema,
  type ImportSourceBinding,
} from '../core/schema/import-interpretation.js';
import {
  importInterpretationSessionConfirmInputSchema,
  importInterpretationSessionCreateInputSchema,
  importInterpretationSessionDiscardInputSchema,
  importInterpretationSessionFileSchema,
  importInterpretationSessionReadInputSchema,
  importInterpretationSessionSchema,
  type ImportInterpretationSession,
  type ImportInterpretationSessionConfirmInput,
  type ImportInterpretationSessionCreateInput,
  type ImportInterpretationSessionDiscardInput,
  type ImportInterpretationSessionReadInput,
} from '../core/schema/import-interpretation-session.js';

export const IMPORT_INTERPRETATION_SESSIONS_FILE = '.import-interpretation-sessions.yaml';

interface FileQueue {
  tail: Promise<void>;
}

const fileQueues = new Map<string, FileQueue>();

function queueFor(filePath: string): FileQueue {
  const key = process.platform === 'win32' ? resolve(filePath).toLowerCase() : resolve(filePath);
  const existing = fileQueues.get(key);
  if (existing !== undefined) return existing;
  const created: FileQueue = { tail: Promise.resolve() };
  fileQueues.set(key, created);
  return created;
}

function schedule<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const queue = queueFor(filePath);
  const previous = queue.tail;
  const run = previous.then(task, task);
  queue.tail = run.then(() => undefined, () => undefined);
  return run;
}

function isMissingYaml(error: unknown): boolean {
  return error instanceof Error
    && error.cause !== undefined
    && typeof error.cause === 'object'
    && error.cause !== null
    && 'code' in error.cause
    && (error.cause as { code?: unknown }).code === 'ENOENT';
}

function sessionFile(projectsRoot: string, projectId: string): string {
  return join(projectDirectory(projectsRoot, projectId), IMPORT_INTERPRETATION_SESSIONS_FILE);
}

async function readStore(filePath: string): Promise<ImportInterpretationSession[]> {
  try {
    const raw = await readYaml<unknown>(filePath);
    return importInterpretationSessionFileSchema.parse(raw).sessions;
  } catch (error) {
    if (isMissingYaml(error)) return [];
    throw error;
  }
}

async function writeStore(filePath: string, sessions: readonly ImportInterpretationSession[]): Promise<void> {
  const directory = resolve(filePath, '..');
  await mkdir(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeYaml(temporary, importInterpretationSessionFileSchema.parse({ sessions }));
    await rename(temporary, filePath);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function now(): string { return new Date().toISOString(); }

function bindingFor(projectId: string, sourceHash: string, input: { intent: ImportInterpretationSessionCreateInput['intent'] }): ImportSourceBinding {
  return importSourceBindingSchema.parse({ projectId, sourceHash, ...input.intent });
}

function sessionId(): string { return `imp-${randomUUID()}`; }

function requireSession(sessions: readonly ImportInterpretationSession[], importSessionId: string): ImportInterpretationSession {
  const session = sessions.find((item) => item.importSessionId === importSessionId);
  if (session === undefined) throw new Error(`Unknown import interpretation session: ${importSessionId}`);
  return session;
}

function assertIdentity(session: ImportInterpretationSession, input: { projectId: string; sourceHash: string }): void {
  if (session.projectId !== input.projectId) throw new Error('Import interpretation session belongs to another project');
  if (session.sourceHash !== input.sourceHash) throw new Error('Import interpretation session source hash mismatch');
}

function assertProject(session: ImportInterpretationSession, projectId: string): void {
  if (session.projectId !== projectId) throw new Error('Import interpretation session belongs to another project');
}

/**
 * I142 Host owner for the recoverable source-interpretation checkpoint
 * (design §14.15.1 / R19-1b). The store is operational metadata only: it never
 * writes a narrative layer, never classifies source text, and never silently
 * accepts a changed source hash.
 */
export interface NovelImportInterpretationSessionService {
  create(input: ImportInterpretationSessionCreateInput): Promise<ImportInterpretationSession>;
  read(input: ImportInterpretationSessionReadInput): Promise<ImportInterpretationSession>;
  confirm(input: ImportInterpretationSessionConfirmInput): Promise<ImportInterpretationSession>;
  discard(input: ImportInterpretationSessionDiscardInput): Promise<ImportInterpretationSession>;
  /** I151 internal eligibility probe; never exposed as an author decision Remote. */
  firstConfirmed(input: ImportInterpretationSessionReadInput): Promise<ImportInterpretationSession>;
  dispose(): void;
}

export function createImportInterpretationSessionService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onDispose?: (dispose: () => void) => void,
): NovelImportInterpretationSessionService {
  let disposed = false;
  const root = resolve(projectsRoot);
  const ensureActive = (): void => {
    if (disposed) throw new Error('Import interpretation session service is disposed');
  };

  const service: NovelImportInterpretationSessionService = {
    create(rawInput) {
      ensureActive();
      const input = importInterpretationSessionCreateInputSchema.parse(rawInput);
      // Parse through I141's binding so the two public contracts cannot drift.
      bindingFor(input.projectId, input.sourceHash, input);
      const filePath = sessionFile(root, input.projectId);
      return schedule(filePath, async () => {
        ensureActive();
        const createdAt = now();
        const session = importInterpretationSessionSchema.parse({
          projectId: input.projectId,
          importSessionId: sessionId(),
          sourceHash: input.sourceHash,
          intent: input.intent,
          paragraphDecisions: input.paragraphDecisions,
          status: 'draft',
          createdAt,
          updatedAt: createdAt,
        });
        const sessions = await readStore(filePath);
        await writeStore(filePath, [...sessions, session]);
        return structuredClone(session);
      });
    },

    read(rawInput) {
      ensureActive();
      const input = importInterpretationSessionReadInputSchema.parse(rawInput);
      const filePath = sessionFile(root, input.projectId);
      return schedule(filePath, async () => {
        ensureActive();
        const sessions = await readStore(filePath);
        const current = requireSession(sessions, input.importSessionId);
        assertProject(current, input.projectId);
        if (current.sourceHash !== input.sourceHash) {
          if (current.status === 'discarded') throw new Error('Import interpretation session source hash mismatch');
          const stale = importInterpretationSessionSchema.parse({ ...current, status: 'stale', updatedAt: now() });
          await writeStore(filePath, sessions.map((item) => item.importSessionId === stale.importSessionId ? stale : item));
          return structuredClone(stale);
        }
        return structuredClone(current);
      });
    },

    confirm(rawInput) {
      ensureActive();
      const input = importInterpretationSessionConfirmInputSchema.parse(rawInput);
      bindingFor(input.projectId, input.sourceHash, input);
      const filePath = sessionFile(root, input.projectId);
      return schedule(filePath, async () => {
        ensureActive();
        const sessions = await readStore(filePath);
        const current = requireSession(sessions, input.importSessionId);
        assertIdentity(current, { projectId: input.projectId, sourceHash: input.sourceHash });
        if (current.status !== 'draft') throw new Error(`Cannot confirm ${current.status} import interpretation session: ${current.importSessionId}`);
        const confirmed = importInterpretationSessionSchema.parse({
          ...current,
          intent: input.intent,
          paragraphDecisions: input.paragraphDecisions,
          status: 'confirmed',
          updatedAt: now(),
        });
        await writeStore(filePath, sessions.map((item) => item.importSessionId === confirmed.importSessionId ? confirmed : item));
        return structuredClone(confirmed);
      });
    },

    discard(rawInput) {
      ensureActive();
      const input = importInterpretationSessionDiscardInputSchema.parse(rawInput);
      const filePath = sessionFile(root, input.projectId);
      return schedule(filePath, async () => {
        ensureActive();
        const sessions = await readStore(filePath);
        const current = requireSession(sessions, input.importSessionId);
        assertIdentity(current, { projectId: input.projectId, sourceHash: input.sourceHash });
        if (current.status === 'discarded') return structuredClone(current);
        const discarded = importInterpretationSessionSchema.parse({ ...current, status: 'discarded', updatedAt: now() });
        await writeStore(filePath, sessions.map((item) => item.importSessionId === discarded.importSessionId ? discarded : item));
        return structuredClone(discarded);
      });
    },

    firstConfirmed(rawInput) {
      ensureActive();
      const input = importInterpretationSessionReadInputSchema.parse(rawInput);
      const filePath = sessionFile(root, input.projectId);
      return schedule(filePath, async () => {
        ensureActive();
        const sessions = await readStore(filePath);
        const current = requireSession(sessions, input.importSessionId);
        assertIdentity(current, input);
        if (current.status !== 'confirmed') throw new Error('Rule/style initialization requires a confirmed import session');
        const first = sessions.find((item) => item.status === 'confirmed');
        if (first?.importSessionId !== current.importSessionId) throw new Error('Rule/style initialization is only allowed for the first controlled import');
        return structuredClone(current);
      });
    },

    dispose() { disposed = true; },
  };
  onDispose?.(() => service.dispose());
  return service;
}
