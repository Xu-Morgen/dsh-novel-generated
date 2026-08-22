import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../core/confirm/index.js';
import {
  exportPlainText, exportProject, importProject, parseArchive, proposePortableImport, serializeArchive,
  type ArchiveMode, type ImportResult, type PortableArchive, type PortableImportOptions,
} from '../core/export/index.js';

/** Host owner for I39 portable archives and C5/settings text exports. */
export interface NovelExportService {
  export(projectDirectory: string, mode?: ArchiveMode): Promise<PortableArchive>;
  serialize(archive: PortableArchive): string;
  parse(raw: string): PortableArchive;
  plainText(projectDirectory: string): Promise<Record<string, string>>;
  import(archive: PortableArchive, targetDirectory: string, options?: PortableImportOptions): Promise<ImportResult>;
  proposeConflict(gate: ConfirmationGate, proposalId: string, archive: PortableArchive, conflicts: readonly string[]): Promise<unknown>;
}

export function createExportService(): NovelExportService {
  return { export: exportProject, serialize: serializeArchive, parse: parseArchive, plainText: exportPlainText, import: importProject, proposeConflict: proposePortableImport };
}

export function defaultExportProjectsRoot(): string { return join(homedir(), '.dsh', 'novel-projects'); }
