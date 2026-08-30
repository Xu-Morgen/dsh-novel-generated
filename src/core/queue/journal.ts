import { access, mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { legacyQueueJournalSchema, queueJournalSchema, type QueueJournalData } from './task.js';

/** Windows 下刚写完的 tmp 文件可能被 Defender/索引器瞬时锁住，rename 偶发
 *  EPERM/ENOENT：有界退避重试（≤5 次），避免高频队列持久化被环境抖动误杀。 */
async function renameWithRetry(temporary: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((resolve) => { setTimeout(resolve, 20 * (attempt + 1)); });
    }
  }
}

/** 每次写入使用唯一 tmp 名（pid+序号）：两个实例并发写同一账本时不再互相消费
 *  对方 tmp 导致 rename ENOENT；rename 到同一目标仍原子，最后 rename 者胜
 *  （整快照覆盖，语义与同 tmp 路径一致，见 I65 场景 6 恢复竞态修复）。 */
let writeSequence = 0;
function temporaryPathFor(target: string): string {
  writeSequence += 1;
  return `${target}.tmp-${process.pid}-${writeSequence}`;
}

/**
 * I65 队列账本持久化（design §14.9 / R13-6「任务恢复依赖稳定 ID 与幂等状态」）。
 *
 * 每个项目一个 `queue-journal.yaml`（与 lifecycle-journal / review-audit 同模式）：
 * - `read()` 从磁盘读并严格复验（queueJournalSchema）；文件缺失返回 fresh 账本
 *   （projectId 从项目目录名派生；runState=idle、空任务列表）—— 首次使用不报错。
 * - `write()` 走唯一 tmp + rename 原子替换；candidate-ready 任务内联候选正文，
 *   因此单次写入即任务状态 + 候选的原子快照（无半写、无孤儿候选）。
 * - 账本是队列的唯一持久 truth；运行/恢复/停止状态全部经本文件往返。
 */
export class QueueJournalFile {
  private constructor(
    private readonly path: string,
    private readonly projectId: string,
  ) {}

  static forProject(projectDirectory: string): QueueJournalFile {
    return new QueueJournalFile(join(projectDirectory, 'queue-journal.yaml'), basename(projectDirectory));
  }

  async read(): Promise<QueueJournalData> {
    try {
      await access(this.path);
      const raw = await readYaml<unknown>(this.path);
      const current = queueJournalSchema.safeParse(raw);
      if (current.success) return current.data;
      const legacy = legacyQueueJournalSchema.parse(raw);
      return queueJournalSchema.parse({
        version: 2,
        projectId: legacy.projectId,
        runState: legacy.runState,
        config: legacy.config,
        consumedUnits: legacy.consumedUnits,
        tasks: legacy.tasks.map((task) => ({ version: 1, ...task })),
        updatedAt: legacy.updatedAt,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return queueJournalSchema.parse({
        version: 2,
        projectId: this.projectId,
        runState: 'idle',
        config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 0,
        tasks: [],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async write(journal: QueueJournalData): Promise<void> {
    const next = queueJournalSchema.parse(journal);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = temporaryPathFor(this.path);
    await writeYaml(temporary, next);
    await renameWithRetry(temporary, this.path);
  }
}
