import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chapterSchema,
  legacyChapterSchema,
  type Chapter,
} from '../schema/text.js';
import { validateProjectId } from '../io/path.js';
import { CHAPTER_DOCS_DIRECTORY, migrateLegacyChapter, parseChapterDocument, renderChapterMarkdown } from './codec.js';

/**
 * C5 章节写入队列 / Markdown 镜像 outbox（review v2.0 §8#7 / 计划 §18 I94
 * 拆分第四片）。
 *
 * 职责与不变式：
 * - 只负责文件写入路径：JSON 真相（`text/<id>.json`，tmp+rename）与可读镜像
 *   （`docs/<id>.md`，派生、可随时重建，引擎不读它）。
 * - **镜像 outbox 语义**：JSON 真相提交成功即成功；镜像写入失败**不谎报失败**
 *   （主写已成功，调用方不得看到错误），而是记录进 outbox 并显式暴露
 *   （`pendingMirrors()`），可稍后 `flushPendingMirrors()` 按最新章节重渲染重试。
 * - 真相写入失败仍正常上抛（该操作确实失败）。
 * - `enqueue` 是唯一的串行化原语；调用方必须在 `enqueue` 内调用 `commitChapter`，
 *   不得再嵌套 enqueue（避免自等待）。
 */
export interface PendingMirrorFailure {
  readonly chapterId: string;
  readonly reason: string;
}

export class ChapterWriteQueue {
  private readonly textDirectory: string;
  private readonly docsDirectory: string;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending: PendingMirrorFailure[] = [];

  constructor(projectDirectory: string) {
    this.textDirectory = join(projectDirectory, 'text');
    this.docsDirectory = join(projectDirectory, CHAPTER_DOCS_DIRECTORY);
  }

  /** 串行化所有写路径；失败不阻断后续操作（tail 吞错恢复）。 */
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  async open(): Promise<void> {
    await mkdir(this.textDirectory, { recursive: true });
  }

  /** 章节 JSON 文档路径（校验 chapterId 后再拼路径）。 */
  chapterPath(chapterId: string): string {
    validateProjectId(chapterId);
    return join(this.textDirectory, `${chapterId}.json`);
  }

  /** 枚举 text/ 目录下的章节 JSON 文件名（含 .json 后缀，排序前）。 */
  async listChapterFiles(): Promise<string[]> {
    const entries = await readdir(this.textDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name);
  }

  /** 读取章节原始 JSON 文本；文档不存在时抛 `Unknown chapter`。 */
  async readChapterFile(chapterId: string): Promise<string> {
    try {
      return await readFile(this.chapterPath(chapterId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Unknown chapter: ${chapterId}`);
      throw error;
    }
  }

  /**
   * 提交一章：JSON 真相（tmp+rename）→ 尽力同步 Markdown 镜像。镜像失败进
   * outbox（不抛错）；真相失败照常上抛。
   */
  async commitChapter(chapter: Chapter): Promise<void> {
    const filePath = this.chapterPath(chapter.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
    try {
      await this.writeChapterMarkdown(chapter);
    } catch (error) {
      // I94：镜像失败不谎报——记录 outbox 待重试，调用方不感知失败（主写已成功）。
      this.pending.push({
        chapterId: chapter.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** 显式暴露尚未成功同步的镜像（I94 outbox 可观察面）。 */
  pendingMirrors(): ReadonlyArray<PendingMirrorFailure> {
    return this.pending.map((entry) => ({ ...entry }));
  }

  /** 按最新章节内容重渲染并重试全部待处理镜像；返回本次成功条数。 */
  async flushPendingMirrors(): Promise<number> {
    const retrying = this.pending.splice(0);
    let succeeded = 0;
    for (const entry of retrying) {
      try {
        const chapter = parseChapterDocument(await this.readChapterFile(entry.chapterId));
        await this.writeChapterMarkdown(chapter);
        succeeded += 1;
      } catch (error) {
        this.pending.push({
          chapterId: entry.chapterId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return succeeded;
  }

  /** I70 迁移扫描：legacy 文档回写 canonical；canonical 与 legacy 都不是 → fail closed（抛错、零写）。 */
  async migrateLegacyDocuments(): Promise<void> {
    const files = await this.listChapterFiles();
    for (const file of files.sort()) {
      const chapterId = file.slice(0, -'.json'.length);
      const raw = await this.readChapterFile(chapterId);
      let migrated: Chapter | undefined;
      try {
        // canonical 已解析 = 已迁移（或新建）文档，跳过；legacy 解析成功 → 迁移。
        chapterSchema.parse(JSON.parse(raw));
      } catch {
        try {
          migrated = migrateLegacyChapter(legacyChapterSchema.parse(JSON.parse(raw)));
        } catch (error) {
          // 两种形状都解析失败（坏文档/半迁移冲突）：fail closed，零猜测零写。
          throw new Error(`Invalid chapter document: ${chapterId}`, { cause: error });
        }
      }
      if (migrated !== undefined) await this.commitChapter(migrated);
    }
  }

  private async writeChapterMarkdown(chapter: Chapter): Promise<void> {
    await mkdir(this.docsDirectory, { recursive: true });
    const filePath = join(this.docsDirectory, `${chapter.id}.md`);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, renderChapterMarkdown(chapter), 'utf8');
    await rename(temporaryPath, filePath);
  }
}
