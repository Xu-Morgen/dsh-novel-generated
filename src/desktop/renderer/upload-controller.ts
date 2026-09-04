import type { WorkspaceNamespace } from '../../client/shared.js';
import { slug } from '../../client/shared.js';
import type { WorkbenchActions } from '../../client/store/types.js';
import { toUserMessage } from '../../client/presentation.js';
import { selectDocxFromMain } from '../../client/desktop-upload.js';
import type { UploadProgress } from '../../client/upload.js';

interface DesktopUploadControllerDeps {
  workspace(): WorkspaceNamespace | undefined;
  currentProjectId(): string | undefined;
  isActive(): boolean;
  beginOp(key: string): boolean;
  endOp(key: string): void;
  dispatch(fn: (actions: WorkbenchActions) => void): void;
  startSourceReview(projectId: string, source: { sourceHash: string; text: string; chunks: readonly unknown[] }): void;
  createProject(input: { projectId: string; name: string }, onOpened?: () => void): void;
}

export interface DesktopUploadController {
  /** Main-dialog upload; `file` is intentionally ignored and never read. */
  uploadFile(file: File | undefined, browsing: boolean, currentProjectEligible: boolean): void;
}

function projectIdForUpload(title: string, uploadId: string): string {
  const suffix = slug(uploadId).slice(-36);
  const prefixLimit = 64 - suffix.length - 1;
  const prefix = slug(title).slice(0, prefixLimit).replace(/[-_]+$/g, '') || 'untitled';
  return `${prefix}-${suffix}`;
}

/**
 * Desktop source upload owner. It preserves the existing empty-project gate
 * and routes both directory and opened-project imports to the same semantic
 * review without exposing a browser `File` capability.
 */
export function createDesktopUploadController(deps: DesktopUploadControllerDeps): DesktopUploadController {
  const uploadFile = (_file: File | undefined, browsing: boolean, currentProjectEligible: boolean): void => {
    const target = deps.workspace();
    if (!target || !deps.isActive()) return;
    if (deps.currentProjectId() !== undefined && !browsing && !currentProjectEligible) {
      deps.dispatch((actions) => actions.sourceImportPatch({ status: 'error', error: '当前作品已有内容，不能合并导入。请返回作品列表，新建独立作品后再导入。' }));
      return;
    }
    if (!deps.beginOp('upload')) return;
    void selectDocxFromMain(target, (progress: UploadProgress) => deps.dispatch((actions) => actions.uploadProgress(progress))).then(
      (result) => {
        deps.endOp('upload');
        if (result === undefined) {
          deps.dispatch((actions) => actions.uploadSettled(undefined));
          return;
        }
        const { uploadId, ...uploadResult } = result;
        deps.dispatch((actions) => { actions.uploadSettled(uploadResult); actions.uploadProgress({ phase: 'done' }); });
        const projectId = deps.currentProjectId();
        if (projectId !== undefined && !browsing) {
          deps.startSourceReview(projectId, { sourceHash: result.sourceHash, text: result.text, chunks: result.chunks });
          return;
        }
        const name = result.fileName.replace(/\.docx$/i, '') || '未命名作品';
        deps.createProject({ projectId: projectIdForUpload(name, uploadId), name }, () => {
          const openedId = deps.currentProjectId();
          if (openedId !== undefined) deps.startSourceReview(openedId, { sourceHash: result.sourceHash, text: result.text, chunks: result.chunks });
        });
      },
      (error: Error) => {
        deps.endOp('upload');
        deps.dispatch((actions) => {
          actions.uploadSettled(undefined);
          actions.uploadProgress({ phase: 'error', message: toUserMessage(error, '文件上传未完成，请重试。') });
        });
      },
    );
  };
  return Object.freeze({ uploadFile });
}
