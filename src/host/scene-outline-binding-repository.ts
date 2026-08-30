import { createHash } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import {
  sceneOutlineBindingDocumentSchema,
  type SceneOutlineBindingDocument,
  type SceneOutlineManualBinding,
} from '../core/schema/scene-outline-binding.js';

const BINDING_FILE = 'scene-outline-bindings.yaml';
const EMPTY_DOCUMENT: SceneOutlineBindingDocument = { version: 1, bindings: [] };

interface BindingCoordinator { tail: Promise<unknown> }
const coordinators = new Map<string, BindingCoordinator>();
function coordinatorFor(filePath: string): BindingCoordinator {
  const resolved = resolve(filePath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const existing = coordinators.get(key);
  if (existing !== undefined) return existing;
  const created: BindingCoordinator = { tail: Promise.resolve() };
  coordinators.set(key, created);
  return created;
}

function sortedBindings(bindings: readonly SceneOutlineManualBinding[]): SceneOutlineManualBinding[] {
  return bindings.slice().sort((left, right) => left.sceneId.localeCompare(right.sceneId) || left.detailBeatId.localeCompare(right.detailBeatId));
}

/** Deterministic SHA-256 over the canonical manual-only versioned document. */
export function sceneOutlineBindingFingerprint(document: SceneOutlineBindingDocument): string {
  const canonical = { version: 1 as const, bindings: sortedBindings(document.bindings) };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface SceneOutlineBindingRepositoryOptions {
  /** Focused atomic-write fault seam; production leaves it undefined. */
  readonly beforeRename?: () => void | Promise<void>;
}

/**
 * Canonical Host persistence owner for design §14.14.2 R18-1 bindings.
 * All instances targeting one resolved file share a process-wide serial lane.
 */
export class SceneOutlineBindingRepository {
  private readonly filePath: string;
  private readonly coordinator: BindingCoordinator;

  constructor(projectDirectory: string, private readonly options: SceneOutlineBindingRepositoryOptions = {}) {
    this.filePath = join(resolve(projectDirectory), BINDING_FILE);
    this.coordinator = coordinatorFor(this.filePath);
  }

  open(): Promise<void> {
    return this.schedule(() => mkdir(join(this.filePath, '..'), { recursive: true }).then(() => undefined));
  }

  read(): Promise<{ document: SceneOutlineBindingDocument; fingerprint: string }> {
    return this.schedule(async () => this.readUnlocked());
  }

  /** Compare-and-swap mutation; stale callers and concurrent repository instances fail closed. */
  mutate(
    expectedFingerprint: string,
    transform: (bindings: readonly SceneOutlineManualBinding[]) => readonly SceneOutlineManualBinding[],
  ): Promise<{ document: SceneOutlineBindingDocument; fingerprint: string }> {
    return this.schedule(async () => {
      const current = await this.readUnlocked();
      if (current.fingerprint !== expectedFingerprint) {
        throw new Error(`Stale binding fingerprint: expected ${expectedFingerprint}, actual ${current.fingerprint}`);
      }
      const document = sceneOutlineBindingDocumentSchema.parse({ version: 1, bindings: sortedBindings(transform(current.document.bindings)) });
      await this.writeUnlocked(document);
      return { document: structuredClone(document), fingerprint: sceneOutlineBindingFingerprint(document) };
    });
  }

  private async readUnlocked(): Promise<{ document: SceneOutlineBindingDocument; fingerprint: string }> {
    let raw: unknown;
    try {
      raw = await readYaml<unknown>(this.filePath);
    } catch (error) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        const document = structuredClone(EMPTY_DOCUMENT);
        return { document, fingerprint: sceneOutlineBindingFingerprint(document) };
      }
      throw error;
    }
    try {
      const parsed = sceneOutlineBindingDocumentSchema.parse(raw);
      const document = sceneOutlineBindingDocumentSchema.parse({ version: 1, bindings: sortedBindings(parsed.bindings) });
      return { document, fingerprint: sceneOutlineBindingFingerprint(document) };
    } catch (error) {
      throw new Error('Invalid scene-outline binding document', { cause: error });
    }
  }

  private async writeUnlocked(document: SceneOutlineBindingDocument): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeYaml(temporaryPath, document);
    await this.options.beforeRename?.();
    await rename(temporaryPath, this.filePath);
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.coordinator.tail.then(operation, operation);
    this.coordinator.tail = run.catch(() => undefined);
    return run;
  }
}
