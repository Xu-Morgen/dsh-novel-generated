import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  LAYER_PATHS, exportPlainText, exportProject, parseArchive, serializeArchive,
  type ArchiveMode, type PortableArchive,
} from '../core/export/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { normalizeTextInput, type ImportFormat } from '../import/index.js';

/** 受控下载载荷：内容为序列化档案文本；文件名仅供浏览器 Blob 下载，不含 Host 路径。 */
export interface ImportExportArchiveOutcome {
  readonly projectId: string;
  readonly mode: ArchiveMode;
  readonly exportedAt: string;
  readonly fileName: string;
  readonly fileCount: number;
  readonly content: string;
}

/** I39 纯文本导出（txt/md）的受控下载载荷：files 是「文件名 → 内容」映射。 */
export interface ImportExportTextOutcome {
  readonly projectId: string;
  readonly format: 'txt' | 'md';
  readonly fileName: string;
  readonly files: Readonly<Record<string, string>>;
}

/** round-trip 备份恢复结果：成功写入或按 N-7 fail closed（列出已存在层）。 */
export type ImportRestoreOutcome =
  | { readonly projectId: string; readonly status: 'imported'; readonly written: readonly string[]; readonly conflicts: readonly string[] }
  | { readonly projectId: string; readonly status: 'blocked'; readonly reason: 'non-empty-project'; readonly layers: readonly string[] };

/** I37 确定性导入预览（零写）：客户端提交已解码文本，Host 归一化 + 分块。 */
export interface ImportPreviewOutcome {
  readonly projectId: string;
  readonly fileName: string;
  readonly format: ImportFormat;
  readonly text: string;
  readonly chunks: Readonly<Array<{ readonly index: number; readonly text: string; readonly startOffset: number; readonly endOffset: number }>>;
}

export interface ImportPreviewInput {
  readonly fileName: string;
  readonly format: ImportFormat;
  readonly text: string;
}

export interface NovelImportExportService {
  exportArchive(projectId: string, mode: ArchiveMode): Promise<ImportExportArchiveOutcome>;
  exportText(projectId: string, format: 'txt' | 'md'): Promise<ImportExportTextOutcome>;
  restore(projectId: string, raw: string): Promise<ImportRestoreOutcome>;
  importPreview(projectId: string, input: ImportPreviewInput): Promise<ImportPreviewOutcome>;
}

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const TEXT_FORMATS = new Set(['txt', 'md']);

function safeFileName(projectId: string, ...parts: string[]): string {
  return [projectId, ...parts].join('.').replace(/[^a-z0-9._-]/gi, '');
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * I69 导入导出与备份 UI 的 Host owner（design §14.10「导入、导出与备份」/ R14-4）。
 *
 * 契约与不变式：
 * - 导出/恢复复用 I39 `core/export` 的可移植档案与纯文本导出；本服务不复制任何
 *   层 Schema 或写回逻辑，只做「项目目录 ↔ 受控下载载荷」的适配。
 * - 恢复（round-trip 备份恢复）按 N-7 fail closed：目标作品已有任何非空层内容
 *   时返回 blocked 并列出冲突层，绝不静默合并或覆盖已有六层；空壳（I3 createProject
 *   的 `outline.yaml: {}` 与空层目录）不算非空。
 * - 恢复先完整校验档案（parseArchive 校验 checksum 与路径安全）再写盘；写盘失败
 *   时按写前快照回滚，保证「取消/失败无半导入」。
 * - 所有载荷都是最小 owned JSON；不返回任何 Host 路径，secret/凭据从不进入作品
 *   文件（credential 只经 DSH credentials seam），因此也不进入 wire。
 */
export function createImportExportService(
  projectsRoot: string = join(homedir(), '.dsh', 'novel-projects'),
): NovelImportExportService {
  const rootOf = (projectId: string): string => {
    validateProjectId(projectId);
    return projectDirectory(projectsRoot, projectId);
  };

  const assertProjectExists = async (directory: string): Promise<void> => {
    await access(directory).catch(() => { throw new Error('Project does not exist'); });
  };

  const exportArchive = async (projectId: string, mode: ArchiveMode): Promise<ImportExportArchiveOutcome> => {
    const directory = rootOf(projectId);
    await assertProjectExists(directory);
    const archive = await exportProject(directory, mode);
    const content = serializeArchive(archive);
    return Object.freeze({
      projectId,
      mode: archive.mode,
      exportedAt: archive.exportedAt,
      fileName: safeFileName(projectId, mode, isoDate(), 'portable.json'),
      fileCount: Object.keys(archive.files).length,
      content,
    });
  };

  const exportText = async (projectId: string, format: 'txt' | 'md'): Promise<ImportExportTextOutcome> => {
    const directory = rootOf(projectId);
    await assertProjectExists(directory);
    if (!TEXT_FORMATS.has(format)) throw new Error(`Unsupported text export format: ${format}`);
    const all = await exportPlainText(directory);
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(all)) {
      if (name.endsWith(`.${format}`)) files[name] = content;
    }
    return Object.freeze({ projectId, format, fileName: safeFileName(projectId, `text.${format}`), files });
  };

  const restore = async (projectId: string, raw: string): Promise<ImportRestoreOutcome> => {
    const directory = rootOf(projectId);
    await assertProjectExists(directory);
    if (typeof raw !== 'string' || raw.length === 0) throw new Error('Restore payload is empty');
    if (raw.length > MAX_ARCHIVE_BYTES) throw new Error('Restore payload exceeds size limit');
    // 校验先行：坏 JSON / 版本 / checksum / 非法路径在写盘前即失败（无半导入）。
    const archive = parseArchive(raw);
    // N-7 fail closed：非空作品不允许静默合并/覆盖（列出已存在层供 UI 说明）。
    const layers = await detectLayerContent(directory);
    if (layers.length > 0) {
      return Object.freeze({ projectId, status: 'blocked', reason: 'non-empty-project', layers });
    }
    // 空壳作品：快照写盘，失败按写前状态回滚。
    const snapshots = new Map<string, string | null>();
    const written: string[] = [];
    try {
      for (const [path, content] of Object.entries(archive.files)) {
        const target = join(directory, path);
        snapshots.set(path, await readExisting(target));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
        written.push(path);
      }
    } catch (error) {
      await rollback(directory, snapshots);
      throw error;
    }
    return Object.freeze({ projectId, status: 'imported', written: written.sort(), conflicts: [] });
  };

  const importPreview = async (projectId: string, input: ImportPreviewInput): Promise<ImportPreviewOutcome> => {
    rootOf(projectId); // 校验 projectId；预览本身零写，不要求作品已存在。
    if (!input || typeof input.fileName !== 'string' || input.fileName.length === 0 || input.fileName.length > 255) {
      throw new Error('Import file name is required');
    }
    if (!['txt', 'md', 'docx'].includes(input.format)) throw new Error(`Unsupported import format: ${String(input.format)}`);
    if (typeof input.text !== 'string' || input.text.length === 0) throw new Error('Import text is empty');
    if (input.text.length > MAX_TEXT_BYTES) throw new Error('Import text exceeds size limit');
    const normalized = normalizeTextInput(input.text, input.format);
    return Object.freeze({
      projectId,
      fileName: input.fileName,
      format: normalized.format,
      text: normalized.text,
      chunks: normalized.chunks.map((chunk) => ({ ...chunk })),
    });
  };

  return Object.freeze({ exportArchive, exportText, restore, importPreview });
}

/** 返回目标作品中已有非空内容的层路径（与 I39 档案层清单同源，空壳不算非空）。 */
async function detectLayerContent(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const path of LAYER_PATHS) {
    const absolute = join(root, path);
    try {
      const info = await stat(absolute);
      if (info.isDirectory()) {
        if ((await filesUnder(absolute)).length > 0) found.push(path);
      } else {
        const raw = await readFile(absolute, 'utf8');
        // I3 createProject 的空壳占位（outline.yaml 为 `{}`）不算非空内容。
        if (raw.trim() !== '{}' && raw.trim() !== '') found.push(path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return found.sort();
}

async function filesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...await filesUnder(path)); else files.push(path);
    }
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** 读取文件内容；不存在返回 null。 */
async function readExisting(target: string): Promise<string | null> {
  try {
    return await readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

/** 失败回滚：把每个已写文件恢复到写前内容（不存在则删除），保证无半导入。 */
async function rollback(root: string, snapshots: Map<string, string | null>): Promise<void> {
  for (const [path, before] of snapshots) {
    const target = join(root, path);
    try {
      if (before === null) await rm(target, { force: true });
      else await writeFile(target, before, 'utf8');
    } catch {
      // 尽力回滚：任何单文件失败都不掩盖原始错误。
    }
  }
}
