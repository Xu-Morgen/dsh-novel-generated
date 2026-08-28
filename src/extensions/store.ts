import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import { extensionIdSchema } from './registry.js';

/**
 * Host-owned storage for internal custom layers (design §§0.1.2, 11.1).
 *
 * Files remain under the canonical project directory. Extension definitions
 * never receive this repository or a path; the Host validates the provider
 * schema before every write and after every read.
 *
 * I98（review v2.0 §8#4 / 计划 §18 I98）：store 不再只是校验 layerId 后直写——
 * 构造时注入按 layerId 解析 provider schema 的 resolver，`save` 写前校验、
 * `load` 读后校验（strict wire 边界表达真实存储合同）；领域服务侧复验保留
 * （防御纵深）。
 */
export class ExtensionLayerStore {
  private readonly root: string;
  private readonly resolveSchema: (layerId: string) => ZodType<unknown>;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string, resolveSchema: (layerId: string) => ZodType<unknown>) {
    this.root = join(projectDirectory, 'extensions');
    this.resolveSchema = resolveSchema;
  }

  async open(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  /** 写前校验：按 layerId 解析 schema 并 parse 后再落盘（非法内容被拒、零写）。 */
  async save(layerId: string, value: unknown): Promise<unknown> {
    return this.enqueue(async () => {
      const id = extensionIdSchema.parse(layerId);
      const validated = this.resolveSchema(id).parse(value);
      await writeYaml(join(this.root, `${id}.yaml`), validated);
      return structuredClone(validated);
    });
  }

  /** 读后校验：raw YAML 先经 layerId 对应的 provider schema parse 才返回。 */
  async load(layerId: string): Promise<unknown> {
    return this.enqueue(async () => {
      const id = extensionIdSchema.parse(layerId);
      const raw = await readYaml<unknown>(join(this.root, `${id}.yaml`));
      return this.resolveSchema(id).parse(raw);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
