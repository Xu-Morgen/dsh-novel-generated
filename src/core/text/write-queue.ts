import { access, copyFile, mkdir, open as openFile, readFile, readdir, rename, rm, type FileHandle } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { z } from 'zod';
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
 * - crash guarantee：支持单 DSH Host **进程崩溃**后的 journal/outbox 恢复；POSIX
 *   使用 directory fsync。Node/Windows 不暴露等价目录/卷 flush，sentinel sync 仅为
 *   defense-in-depth，突然断电 durability 明确为 best effort，不作强保证。
 * - `enqueue` 是唯一的串行化原语；调用方必须在 `enqueue` 内调用 `commitChapter`，
 *   不得再嵌套 enqueue（避免自等待）。
 */
export interface PendingMirrorFailure {
  readonly operation: 'write' | 'delete';
  readonly chapterId: string;
  readonly reason: string;
}

interface MirrorOutboxEntry {
  readonly chapterId: string;
  readonly operation: 'write' | 'delete';
}

interface ProjectCommitJournalEntry extends MirrorOutboxEntry {
  readonly existed: boolean;
}

interface ProjectCommitJournal {
  readonly version: 1;
  readonly transactionId: string;
  readonly phase: 'prepared' | 'committed';
  readonly entries: readonly ProjectCommitJournalEntry[];
}

const mirrorOutboxSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    chapterId: z.string(),
    operation: z.enum(['write', 'delete']),
  }).strict()),
}).strict();

const projectCommitJournalSchema = z.object({
  version: z.literal(1),
  transactionId: z.string().uuid(),
  phase: z.enum(['prepared', 'committed']),
  entries: z.array(z.object({
    chapterId: z.string(),
    operation: z.enum(['write', 'delete']),
    existed: z.boolean(),
  }).strict()),
}).strict();

/** I104 project-UoW fault seam; production leaves it undefined. */
export type ProjectCommitPhase = 'stage' | 'snapshot' | 'journal' | 'apply' | 'restore' | 'cleanup';

export interface ChapterWriteQueueOptions {
  readonly beforeProjectCommitStep?: (step: number, chapterId: string, phase: ProjectCommitPhase) => void | Promise<void>;
}

interface ProjectCoordinator {
  tail: Promise<unknown>;
  readonly pending: PendingMirrorFailure[];
}
/** DSH owns files in one Host process; every repository for one canonical path shares this lane. */
const projectCoordinators = new Map<string, ProjectCoordinator>();
function coordinatorFor(projectDirectory: string): ProjectCoordinator {
  const resolved = resolve(projectDirectory);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const existing = projectCoordinators.get(key);
  if (existing !== undefined) return existing;
  const created: ProjectCoordinator = { tail: Promise.resolve(), pending: [] };
  projectCoordinators.set(key, created);
  return created;
}

export class ChapterWriteQueue {
  private readonly textDirectory: string;
  private readonly docsDirectory: string;
  private readonly projectJournalPath: string;
  private readonly mirrorOutboxPath: string;
  private readonly coordinator: ProjectCoordinator;

  constructor(projectDirectory: string, private readonly options: ChapterWriteQueueOptions = {}) {
    const canonicalProjectDirectory = resolve(projectDirectory);
    this.coordinator = coordinatorFor(canonicalProjectDirectory);
    this.textDirectory = join(canonicalProjectDirectory, 'text');
    this.docsDirectory = join(canonicalProjectDirectory, CHAPTER_DOCS_DIRECTORY);
    this.projectJournalPath = join(this.textDirectory, '.project-uow-journal');
    this.mirrorOutboxPath = join(this.textDirectory, '.mirror-outbox');
  }

  private get pending(): PendingMirrorFailure[] {
    return this.coordinator.pending;
  }

  /** One process-wide exclusive lane per canonical project path. */
  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.coordinator.tail.then(operation, operation);
    this.coordinator.tail = run.catch(() => undefined);
    return run;
  }

  /** 串行化同一路径所有实例的写路径；失败不阻断后续恢复。 */
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return this.schedule(async () => {
      await this.recoverProjectCommit('write');
      return operation();
    });
  }

  /** Reads share the path-global lane and recover any pending project journal first. */
  read<T>(operation: () => Promise<T>): Promise<T> {
    return this.schedule(async () => {
      await this.recoverProjectCommit('read');
      return operation();
    });
  }

  open(): Promise<void> {
    return this.schedule(async () => {
      await mkdir(this.textDirectory, { recursive: true });
      await this.recoverProjectCommit('read');
      await this.cleanupOrphanProjectArtifacts();
      await this.flushDurableMirrors();
    });
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
   * 提交一章也复用 project UoW：不存在 JSON-truth → mirror-intent crash gap。
   * 镜像失败仍只进入 durable outbox，不把已提交真相谎报为失败。
   */
  commitChapter(chapter: Chapter): Promise<void> {
    return this.commitProject([chapter]);
  }

  /**
   * I104 project-level UoW: stage every chapter JSON, snapshot old files, then
   * replace/remove them under the queue. Any fault restores every old JSON
   * before the operation rejects; readers wait on `read()` and cannot observe
   * intermediate duplicate indexes. Markdown remains a rebuildable outbox.
   */
  async commitProject(chapters: readonly Chapter[], removedChapterIds: readonly string[] = []): Promise<void> {
    await this.recoverProjectCommit('write');
    const transactionId = randomUUID();
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const ids = [...chapterById.keys(), ...removedChapterIds];
    if (new Set(ids).size !== ids.length) throw new Error('Project commit contains duplicate chapter ids');
    const entries: Array<ProjectCommitJournalEntry> = [
      ...chapters.map((chapter) => ({ chapterId: chapter.id, operation: 'write' as const, existed: false })),
      ...removedChapterIds.map((chapterId) => ({ chapterId, operation: 'delete' as const, existed: false })),
    ];
    let step = 0;

    try {
      for (const entry of entries.filter((item) => item.operation === 'write')) {
        await this.options.beforeProjectCommitStep?.(step++, entry.chapterId, 'stage');
        const chapter = chapterById.get(entry.chapterId);
        if (chapter === undefined) throw new Error(`Missing staged chapter: ${entry.chapterId}`);
        await this.writeDurableFile(this.transactionPath(entry.chapterId, transactionId, 'next'), `${JSON.stringify(chapter, null, 2)}\n`);
      }
      for (let position = 0; position < entries.length; position += 1) {
        const entry = entries[position];
        await this.options.beforeProjectCommitStep?.(step++, entry.chapterId, 'snapshot');
        const existed = await this.pathExists(this.chapterPath(entry.chapterId));
        entries[position] = { ...entry, existed };
        if (existed) {
          const backupPath = this.transactionPath(entry.chapterId, transactionId, 'bak');
          await copyFile(this.chapterPath(entry.chapterId), backupPath);
          await this.syncFile(backupPath);
        }
      }
      await this.syncTextDirectory();
      await this.options.beforeProjectCommitStep?.(step++, entries[0]?.chapterId ?? 'project', 'journal');
      await this.writeProjectJournal({ version: 1, transactionId, phase: 'prepared', entries });
    } catch (error) {
      const cleanupErrors = await this.cleanupTransactionArtifacts(transactionId, entries);
      if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], 'Project commit preparation and cleanup failed');
      throw error;
    }

    try {
      for (const entry of entries) {
        await this.options.beforeProjectCommitStep?.(step++, entry.chapterId, 'apply');
        if (entry.operation === 'write') {
          await rename(this.transactionPath(entry.chapterId, transactionId, 'next'), this.chapterPath(entry.chapterId));
        } else {
          await rm(this.chapterPath(entry.chapterId), { force: true });
        }
      }
      await this.syncTextDirectory();
      await this.options.beforeProjectCommitStep?.(step++, entries[0]?.chapterId ?? 'project', 'journal');
      await this.writeProjectJournal({ version: 1, transactionId, phase: 'committed', entries });
    } catch (error) {
      const restoreErrors = await this.restorePreparedProject({ version: 1, transactionId, phase: 'prepared', entries });
      if (restoreErrors.length > 0) {
        throw new AggregateError([error, ...restoreErrors], 'Project commit failed and recovery remains pending');
      }
      try {
        await this.removeProjectJournal();
      } catch (journalError) {
        throw new AggregateError([error, journalError], 'Project rollback succeeded but journal cleanup failed; backups retained');
      }
      await this.cleanupTransactionArtifacts(transactionId, entries);
      throw error;
    }

    // Publish durable mirror actions before retiring the committed journal. A
    // crash at any point leaves either the journal or outbox able to replay.
    const mirrorEntries = entries.map(({ chapterId, operation }) => ({ chapterId, operation }));
    let outboxPublished = false;
    try {
      await this.enqueueMirrorOutbox(mirrorEntries);
      outboxPublished = true;
    } catch (error) {
      for (const entry of mirrorEntries) this.recordMirrorFailure(entry, error);
    }
    if (outboxPublished) {
      try {
        await this.removeProjectJournal();
        await this.cleanupTransactionArtifacts(transactionId, entries);
      } catch {
        // A committed journal plus durable outbox is replay-safe; truth success
        // is not converted into a false failure by cleanup metadata.
      }
      await this.flushDurableMirrors();
    }
  }

  /** 显式暴露尚未成功同步的镜像（I94 outbox 可观察面）。 */
  pendingMirrors(): ReadonlyArray<PendingMirrorFailure> {
    return this.pending.map((entry) => ({ ...entry }));
  }

  /** 按最新章节内容重渲染并重试全部待处理镜像；与 C5 写 UoW 串行。 */
  flushPendingMirrors(): Promise<number> {
    return this.read(() => this.flushPendingMirrorsUnlocked());
  }

  private flushPendingMirrorsUnlocked(): Promise<number> {
    return this.flushDurableMirrors();
  }

  private recordMirrorFailure(entry: MirrorOutboxEntry, error: unknown): void {
    const position = this.pending.findIndex((item) => item.chapterId === entry.chapterId);
    if (position >= 0) this.pending.splice(position, 1);
    this.pending.push({
      ...entry,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  private clearMirrorFailure(chapterId: string): void {
    for (let position = this.pending.length - 1; position >= 0; position -= 1) {
      if (this.pending[position].chapterId === chapterId) this.pending.splice(position, 1);
    }
  }

  private async readMirrorOutbox(): Promise<MirrorOutboxEntry[]> {
    if (!(await this.pathExists(this.mirrorOutboxPath))) return [];
    try {
      const parsed = mirrorOutboxSchema.parse(JSON.parse(await readFile(this.mirrorOutboxPath, 'utf8')));
      for (const entry of parsed.entries) validateProjectId(entry.chapterId);
      return parsed.entries;
    } catch (error) {
      throw new Error('Invalid C5 mirror outbox; manual recovery required', { cause: error });
    }
  }

  private async writeMirrorOutbox(entries: readonly MirrorOutboxEntry[]): Promise<void> {
    if (entries.length === 0) {
      await rm(this.mirrorOutboxPath, { force: true });
      await this.syncTextDirectory();
      return;
    }
    const temporaryPath = `${this.mirrorOutboxPath}.tmp`;
    await this.writeDurableFile(temporaryPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
    await rename(temporaryPath, this.mirrorOutboxPath);
    await this.syncTextDirectory();
  }

  private async enqueueMirrorOutbox(entries: readonly MirrorOutboxEntry[]): Promise<void> {
    const merged = new Map((await this.readMirrorOutbox()).map((entry) => [entry.chapterId, entry]));
    for (const entry of entries) merged.set(entry.chapterId, entry);
    await this.writeMirrorOutbox([...merged.values()]);
    for (const entry of entries) this.clearMirrorFailure(entry.chapterId);
  }

  private async flushDurableMirrors(): Promise<number> {
    const merged = new Map((await this.readMirrorOutbox()).map((entry) => [entry.chapterId, entry]));
    for (const pending of this.pending) merged.set(pending.chapterId, { chapterId: pending.chapterId, operation: pending.operation });
    const retrying = [...merged.values()];
    const remaining: MirrorOutboxEntry[] = [];
    let succeeded = 0;
    for (const entry of retrying) {
      try {
        if (entry.operation === 'delete') {
          await rm(join(this.docsDirectory, `${entry.chapterId}.md`), { force: true });
          await this.syncDirectory(this.docsDirectory);
        } else {
          const chapter = parseChapterDocument(await this.readChapterFile(entry.chapterId));
          await this.writeChapterMarkdown(chapter);
        }
        this.clearMirrorFailure(entry.chapterId);
        succeeded += 1;
      } catch (error) {
        remaining.push(entry);
        this.recordMirrorFailure(entry, error);
      }
    }
    try { await this.writeMirrorOutbox(remaining); }
    catch (error) {
      for (const entry of remaining) this.recordMirrorFailure(entry, error);
    }
    return succeeded;
  }

  private transactionPath(chapterId: string, transactionId: string, suffix: 'next' | 'bak'): string {
    return `${this.chapterPath(chapterId)}.${transactionId}.${suffix}`;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async writeDurableFile(path: string, content: string): Promise<void> {
    const handle = await openFile(path, 'w');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async syncFile(path: string): Promise<void> {
    const handle = await openFile(path, 'r+');
    try { await handle.sync(); }
    finally { await handle.close(); }
  }

  /**
   * Persist directory metadata where the platform permits directory fsync.
   * Windows rejects it with EPERM; a synced sentinel is defense-in-depth only
   * and deliberately does not claim equivalent power-loss durability.
   */
  private async syncDirectory(directory: string): Promise<void> {
    let directoryHandle: FileHandle | undefined;
    try {
      directoryHandle = await openFile(directory, 'r');
      await directoryHandle.sync();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EISDIR' && code !== 'EINVAL') throw error;
    } finally {
      await directoryHandle?.close();
    }
    const barrier = await openFile(join(directory, '.fsync-barrier'), 'a');
    try { await barrier.sync(); }
    finally { await barrier.close(); }
  }

  private syncTextDirectory(): Promise<void> {
    return this.syncDirectory(this.textDirectory);
  }

  private async removeProjectJournal(): Promise<void> {
    await rm(this.projectJournalPath, { force: true });
    await this.syncTextDirectory();
  }

  private async writeProjectJournal(journal: ProjectCommitJournal): Promise<void> {
    const temporaryPath = `${this.projectJournalPath}.tmp`;
    await this.writeDurableFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`);
    await rename(temporaryPath, this.projectJournalPath);
    await this.syncTextDirectory();
  }

  private async readProjectJournal(): Promise<ProjectCommitJournal | undefined> {
    if (!(await this.pathExists(this.projectJournalPath))) return undefined;
    try {
      return projectCommitJournalSchema.parse(JSON.parse(await readFile(this.projectJournalPath, 'utf8')));
    } catch (error) {
      throw new Error('Invalid C5 project commit journal; manual recovery required', { cause: error });
    }
  }

  /** Restore every touched truth file; never delete journal/backups on any restore failure. */
  private async restorePreparedProject(journal: ProjectCommitJournal): Promise<Error[]> {
    const errors: Error[] = [];
    let step = 0;
    for (const entry of journal.entries.slice().reverse()) {
      try {
        await this.options.beforeProjectCommitStep?.(step++, entry.chapterId, 'restore');
        if (entry.existed) {
          const target = this.chapterPath(entry.chapterId);
          await copyFile(this.transactionPath(entry.chapterId, journal.transactionId, 'bak'), target);
          await this.syncFile(target);
        } else {
          await rm(this.chapterPath(entry.chapterId), { force: true });
        }
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    try { await this.syncTextDirectory(); }
    catch (error) { errors.push(error instanceof Error ? error : new Error(String(error))); }
    return errors;
  }

  /** Artifact cleanup is retryable after the transaction truth decision is durable. */
  private async cleanupTransactionArtifacts(
    transactionId: string,
    entries: readonly ProjectCommitJournalEntry[],
  ): Promise<Error[]> {
    const errors: Error[] = [];
    let step = 0;
    for (const entry of entries) {
      try {
        await this.options.beforeProjectCommitStep?.(step++, entry.chapterId, 'cleanup');
        await rm(this.transactionPath(entry.chapterId, transactionId, 'next'), { force: true });
        await rm(this.transactionPath(entry.chapterId, transactionId, 'bak'), { force: true });
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    try { await this.syncTextDirectory(); }
    catch (error) { errors.push(error instanceof Error ? error : new Error(String(error))); }
    return errors;
  }

  /** Open/next operation recovers truth and hands committed mirror work to the durable outbox. */
  private async recoverProjectCommit(mode: 'read' | 'write'): Promise<void> {
    const journal = await this.readProjectJournal();
    if (journal === undefined) return;
    for (const entry of journal.entries) validateProjectId(entry.chapterId);
    if (journal.phase === 'prepared') {
      const restoreErrors = await this.restorePreparedProject(journal);
      if (restoreErrors.length > 0) throw new AggregateError(restoreErrors, 'C5 project commit recovery failed; journal and backups retained');
    } else {
      const mirrorEntries = journal.entries.map(({ chapterId, operation }) => ({ chapterId, operation }));
      try {
        await this.enqueueMirrorOutbox(mirrorEntries);
      } catch (error) {
        for (const entry of mirrorEntries) this.recordMirrorFailure(entry, error);
        // Reads may consume committed JSON truth, but another write must not
        // overwrite the only durable replay owner before outbox publication.
        if (mode === 'write') throw new Error('Committed C5 mirror outbox publication is pending', { cause: error });
        return;
      }
    }
    // Prepared was fully restored, or committed mirror work is now durable.
    // Remove the journal before best-effort artifact cleanup: partial cleanup
    // then leaves only harmless orphans, never incomplete recovery material.
    await this.removeProjectJournal();
    await this.cleanupTransactionArtifacts(journal.transactionId, journal.entries);
    if (journal.phase === 'committed') await this.flushDurableMirrors();
  }

  /** With no journal, next/bak files are pre-publish or post-decision orphans and never truth. */
  private async cleanupOrphanProjectArtifacts(): Promise<void> {
    if (await this.pathExists(this.projectJournalPath)) return;
    const entries = await readdir(this.textDirectory, { withFileTypes: true });
    let changed = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (/\.json\.[0-9a-f-]{36}\.(?:next|bak)$/.test(entry.name) || entry.name === '.project-uow-journal.tmp' || entry.name === '.mirror-outbox.tmp') {
        await rm(join(this.textDirectory, entry.name), { force: true });
        changed = true;
      }
    }
    if (changed) await this.syncTextDirectory();
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
    await this.writeDurableFile(temporaryPath, renderChapterMarkdown(chapter));
    await rename(temporaryPath, filePath);
    await this.syncDirectory(this.docsDirectory);
  }
}
