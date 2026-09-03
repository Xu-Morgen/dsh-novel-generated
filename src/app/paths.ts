/** The four filesystem roots owned by the desktop application. */
export interface DesktopPaths {
  /** Electron `userData` equivalent supplied by Main. */
  readonly userDataRoot: string;
  /** Active and archived project trees live below this root. */
  readonly libraryRoot: string;
  /** Host-only settings, separate from project/export data. */
  readonly settingsRoot: string;
  /** Rebuildable indexes and other disposable caches. */
  readonly cacheRoot: string;
  /** Temporary upload/import/work files. */
  readonly tempRoot: string;
  projectDirectory(projectId: string): string;
  archivedProjectDirectory(projectId: string): string;
  settingsFile(fileName: string): string;
  cacheFile(fileName: string): string;
  tempFile(fileName: string): string;
  assertLibraryContained(target: string): Promise<void>;
}
