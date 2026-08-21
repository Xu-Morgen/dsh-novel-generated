import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import { extensionIdSchema } from './registry.js';

/**
 * Host-owned storage for internal custom layers (design §§0.1.2, 11.1).
 *
 * Files remain under the canonical project directory. Extension definitions
 * never receive this repository or a path; the Host validates the provider
 * schema before every write and after every read.
 */
export class ExtensionLayerStore {
  private readonly root: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.root = join(projectDirectory, 'extensions');
  }

  async open(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async save(layerId: string, value: unknown): Promise<unknown> {
    return this.enqueue(async () => {
      const id = extensionIdSchema.parse(layerId);
      await writeYaml(join(this.root, `${id}.yaml`), value);
      return structuredClone(value);
    });
  }

  async load(layerId: string): Promise<unknown> {
    return this.enqueue(async () => readYaml<unknown>(join(this.root, `${extensionIdSchema.parse(layerId)}.yaml`)));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
