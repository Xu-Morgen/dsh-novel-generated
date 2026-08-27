import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { timelineSchema, type Timeline } from './schema.js';

/**
 * 剧情时间线文件仓库（timeline.yaml，方案 A 时间线层）。
 *
 * 纯 schema / 派生逻辑在 schema.ts（Client bundle 可安全入图）；本模块依赖
 * node:fs/path，只服务 Host（与 core/review/ledger 同模式）。文档校验、骨架
 * 生成与关系过滤语义见 schema.ts / core/timeline/index 文档注释。
 */
export { buildTimelineFromOutline, effectiveRelationshipIds, anchorNodeId, filterRelationshipsByTimeline } from './schema.js';
export type { Timeline, TimelineNode, TimelineReveal } from './schema.js';
export { timelineSchema, timelineNodeSchema, timelineRevealSchema } from './schema.js';

const TIMELINE_FILE = 'timeline.yaml';

/** 剧情时间线文件仓库（与 lifecycle-journal 同模式：tmp+rename 原子替换）。 */
export class TimelineRepository {
  private readonly timelinePath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.timelinePath = join(projectDirectory, TIMELINE_FILE);
  }

  async open(): Promise<void> {
    await mkdir(join(this.timelinePath, '..'), { recursive: true });
  }

  /** 读取时间线；文档缺失返回 null（首次自建由调用方决定）。 */
  async read(): Promise<Timeline | null> {
    return this.enqueue(async () => {
      let raw: unknown;
      try {
        raw = await readYaml<unknown>(this.timelinePath);
      } catch (error) {
        if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return null;
        throw error;
      }
      try {
        return timelineSchema.parse(raw);
      } catch (error) {
        throw new Error('Invalid timeline document', { cause: error });
      }
    });
  }

  /** 保存完整时间线（调用方先经 timelineSchema 校验）。 */
  async save(timeline: Timeline): Promise<Timeline> {
    return this.enqueue(async () => {
      const parsed = timelineSchema.parse(timeline);
      const temporaryPath = `${this.timelinePath}.tmp`;
      await writeYaml(temporaryPath, parsed);
      await rename(temporaryPath, this.timelinePath);
      return structuredClone(parsed);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
