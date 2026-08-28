import type { El, WorkspaceNamespace } from './shared.js';
import { unwrap } from './shared.js';
import { sha256Hex } from './sha256.js';

/**
 * I51 受控 DOCX 上传 UI 助销器（design §14.7.2 / N-3 / R11-2）。
 *
 * Client 只运输受限字节：读取用户选择的 File，按 Host 声明的块大小分块并 base64，
 * 经 `uploadStart → uploadChunk → uploadFinalize` Remote 调用。Client 不解析
 * ZIP/XML、不接触 Node fs、不持有作品路径；取消时调用 `uploadCancel` 通知 Host
 * 清理临时区。全部逻辑仅存在于浏览器运行时的内存与 React DOM。
 */

export interface UploadProgress {
  readonly phase: 'idle' | 'reading' | 'uploading' | 'finalizing' | 'done' | 'error';
  readonly message?: string;
  readonly chunks?: number;
  readonly uploaded?: number;
}

const DEFAULT_CHUNK_BYTES = 64 * 1024;
const MAX_DECLARED_BYTES = 10 * 1024 * 1024;

function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Drive one full controlled upload to the Host and resolve to the finalized
 * `{ sourceHash, fileName, text }` evidence object. `report` receives progress.
 */
export async function uploadDocx(workspace: WorkspaceNamespace, file: File, report: (progress: UploadProgress) => void): Promise<{ sourceHash: string; fileName: string; text: string; chunks: unknown[] }> {
  if (file.size <= 0) throw new Error('文件为空');
  if (file.size > MAX_DECLARED_BYTES) throw new Error('文件超过 10 MiB 上传上限');
  if (!/\.docx$/i.test(file.name)) throw new Error('仅支持 .docx 文件');

  report({ phase: 'reading' });
  const buffer = await readFileBytes(file);
  const sha256 = await sha256Hex(buffer);
  report({ phase: 'uploading' });

  const started = await unwrap(workspace.uploadStart({ fileName: file.name, size: file.size, sha256 })) as { uploadId: string; chunkSize: number; nextIndex: number };
  const uploadId = started.uploadId;
  const chunkSize = started.chunkSize || DEFAULT_CHUNK_BYTES;
  const total = Math.ceil(file.size / chunkSize);
  try {
    for (let index = 0; index < total; index += 1) {
      const slice = new Uint8Array(buffer.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size)));
      await unwrap(workspace.uploadChunk(uploadId, index, bytesToBase64(slice)));
      report({ phase: 'uploading', chunks: total, uploaded: index + 1 });
    }
    report({ phase: 'finalizing' });
    const finalized = await unwrap(workspace.uploadFinalize(uploadId)) as { sourceHash: string; fileName: string; text: string; chunks: unknown[] };
    report({ phase: 'done' });
    return finalized;
  } catch (error) {
    try { await unwrap(workspace.uploadCancel(uploadId)); } catch {}
    report({ phase: 'error', message: (error as Error).message });
    throw error;
  }
}

/** Render the file selector + status line for the DOCX new-works-entry. */
export function uploadPicker(h: El, workspace: WorkspaceNamespace | undefined, onProgress: (progress: UploadProgress) => void, onResult: (result: { sourceHash: string; fileName: string; text: string; chunks: unknown[] }) => void, onError: (message: string) => void): unknown {
  return h('input', {
    type: 'file',
    accept: '.docx',
    className: 'nv-upload__input',
    'data-novel-upload-input': '',
    onChange: (event: { target: { files: FileList | null } }) => {
      const file = event.target.files?.[0];
      if (!file || !workspace) return;
      uploadDocx(workspace, file, onProgress).then(onResult, (error: Error) => onError(error.message));
    },
  });
}
