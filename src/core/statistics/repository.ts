import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildStatistics } from './build.js';
import type { StatisticsFile, StatisticsSources } from './types.js';
import { STATISTICS_DIRECTORY, STATISTICS_FILE, STATISTICS_VERSION } from './types.js';

/**
 * I72 写作进度面板 —— 统计投影的**文件仓库**（design §14.10 / R14-7；架构审查
 * §4.1 拆分：repository.ts 只持有文件 IO 与版本锁，纯构建逻辑在 build.ts）。
 *
 * 本仓库从不写任何 source-of-truth 层（派生视图，计划 §16「派生视图风险」）：
 * `build` 写派生文件、`drop` 删除、`load` 读取。
 */
export class StatisticsRepository {
  private readonly filePath: string;

  constructor(projectDirectory: string) {
    this.filePath = join(projectDirectory, STATISTICS_DIRECTORY, STATISTICS_FILE);
  }

  /** 从调用方给定的 C5/B5/C6/I65 输入构建并落盘派生统计（重建路径；幂等覆盖）。 */
  async build(sources: StatisticsSources, projectId: string): Promise<StatisticsFile> {
    const file: StatisticsFile = {
      version: STATISTICS_VERSION,
      projectId,
      builtAt: new Date().toISOString(),
      projection: buildStatistics(sources),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file)}\n`, 'utf8');
    return file;
  }

  /** 读取当前派生统计；不存在返回 undefined（由调用方决定 fail-closed 或引导重建）。 */
  async load(): Promise<StatisticsFile | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = JSON.parse(raw) as StatisticsFile;
    if (parsed.version !== STATISTICS_VERSION || !Array.isArray(parsed.projection?.chapters)) {
      throw new Error(`Invalid statistics projection (version ${String(parsed?.version)}) — rebuild it`);
    }
    return parsed;
  }

  /** 删除派生统计（删除后可重建；返回是否确实删除）。 */
  async drop(): Promise<boolean> {
    try {
      await rm(this.filePath, { force: false });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
