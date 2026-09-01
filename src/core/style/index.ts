import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import {
  styleProfileSchema,
  type ConstantStyleSegment,
  type StyleProfile,
  type StyleProfileInput,
} from '../schema/style.js';

const STYLE_FILE = 'style.yaml';

/**
 * B4 style-profile store (design §5.6 / §10.1): the project's single
 * `style.yaml` is the canonical global StyleProfile source of truth.
 *
 * Contract / invariants:
 * - The document is re-validated on every read, so an empty initial I3 file,
 *   malformed YAML, or a tampered profile fails loudly until a valid profile is
 *   saved.
 * - `save` replaces the one global profile atomically; it does not implement
 *   chapter overrides or their precedence (I20).
 * - `forbiddenExpressions` exposes only the independently consumable forbidden
 *   list, while `constantSegment` gives I12's future serializer complete B4
 *   data without a filesystem dependency.
 */
export class StyleRepository {
  private readonly stylePath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.stylePath = join(projectDirectory, STYLE_FILE);
  }

  async open(): Promise<void> {
    await mkdir(join(this.stylePath, '..'), { recursive: true });
  }

  async save(input: StyleProfileInput): Promise<StyleProfile> {
    return this.enqueue(async () => {
      const profile = styleProfileSchema.parse({ ...input, version: input.version ?? 1 });
      await this.writeDocument(profile);
      return structuredClone(profile);
    });
  }

  /** I151 refuses to replace anything except I3's canonical empty placeholder. */
  async initialize(input: StyleProfileInput): Promise<StyleProfile> {
    return this.enqueue(async () => {
      const current = await readYaml<unknown>(this.stylePath);
      if (current === null || typeof current !== 'object' || Array.isArray(current) || Object.keys(current as object).length !== 0) {
        throw new Error('Style import initialization requires empty B4');
      }
      const profile = styleProfileSchema.parse({ ...input, version: input.version ?? 1 });
      await this.writeDocument(profile);
      return structuredClone(profile);
    });
  }

  /** I151 compensation resets only the profile created by the same operation. */
  async clearInitialization(expectedStyleId: string): Promise<void> {
    await this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.stylePath);
      const current = styleProfileSchema.parse(raw);
      if (current.id !== expectedStyleId) throw new Error('Style initialization compensation identity mismatch');
      const temporaryPath = `${this.stylePath}.rollback.tmp`;
      await writeYaml(temporaryPath, {});
      await rename(temporaryPath, this.stylePath);
    });
  }

  async isInitialized(): Promise<boolean> {
    return this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.stylePath);
      return !(raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw as object).length === 0);
    });
  }

  async read(): Promise<StyleProfile> {
    return this.enqueue(async () => {
      const raw = await readYaml<unknown>(this.stylePath);
      try {
        return styleProfileSchema.parse(raw);
      } catch (error) {
        throw new Error('Invalid style profile document', { cause: error });
      }
    });
  }

  /** Independently query the stored forbidden expressions in persisted order. */
  async forbiddenExpressions(): Promise<string[]> {
    const profile = await this.read();
    return [...profile.forbidden];
  }

  /**
   * Deterministic B4 consumer fixture for constant injection. It is structured
   * intentionally: I12 owns final prompt text serialization and section order.
   */
  async constantSegment(): Promise<ConstantStyleSegment> {
    const profile = await this.read();
    return {
      profile: structuredClone(profile),
      forbidden: [...profile.forbidden],
    };
  }

  private async writeDocument(profile: StyleProfile): Promise<void> {
    const temporaryPath = `${this.stylePath}.tmp`;
    await writeYaml(temporaryPath, profile);
    await rename(temporaryPath, this.stylePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
