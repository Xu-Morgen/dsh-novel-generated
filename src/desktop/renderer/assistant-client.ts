import type { IpcEnvelope } from '../../app/ipc-registry.js';
import {
  desktopAssistantAdjudicationResultSchema,
  desktopAssistantCandidateSchema,
  desktopAssistantContextResultSchema,
  desktopAssistantInspireResultSchema,
  desktopAssistantOpenResultSchema,
  desktopAssistantStatusResponseSchema,
  DESKTOP_ASSISTANT_METHOD_IDS,
  type DesktopAssistantAdjudicationResult,
  type DesktopAssistantCandidate,
  type DesktopAssistantContextResult,
  type DesktopAssistantInspireResult,
  type DesktopAssistantOpenResult,
  type DesktopAssistantStatusResponse,
} from '../../core/schema/desktop-assistant.js';
import type { DesktopIpcClient } from './desktop-ipc-client.js';

// Keep the public client surface typed by the canonical schemas; the transport
// client deliberately knows only the generic envelope and never supplies a
// fallback value when Main returns an invalid result.
export interface DesktopAssistantClient {
  open(projectId: string): Promise<IpcEnvelope<DesktopAssistantOpenResult>>;
  status(projectId?: string): Promise<IpcEnvelope<DesktopAssistantStatusResponse>>;
  context(projectId: string): Promise<IpcEnvelope<DesktopAssistantContextResult>>;
  continue(projectId: string, chapterId?: string, sceneId?: string): Promise<IpcEnvelope<DesktopAssistantCandidate>>;
  adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite'): Promise<IpcEnvelope<DesktopAssistantAdjudicationResult>>;
  inspire(projectId: string): Promise<IpcEnvelope<DesktopAssistantInspireResult>>;
}

function invalidResult<T>(): IpcEnvelope<T> {
  return { ok: false, error: { code: 'invalid-result', message: '桌面助手返回了无效结果', details: {} } };
}

async function invoke<T>(client: DesktopIpcClient, methodId: string, args: readonly unknown[], schema: { parse(value: unknown): T }): Promise<IpcEnvelope<T>> {
  const result = await client.invoke(methodId, args);
  if (!result.ok) return result;
  try {
    return { ok: true, value: schema.parse(result.value) };
  } catch {
    return invalidResult<T>();
  }
}

/**
 * I181 Renderer adapter for the versioned assistant IPC methods.
 *
 * It owns no project data and exposes no Electron/Node capability. Every
 * successful response is parsed against the same strict schema used by the
 * canonical Main registry before UI state is updated.
 */
export function createDesktopAssistantClient(client: DesktopIpcClient): DesktopAssistantClient {
  return Object.freeze({
    open: (projectId: string) => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.open, [projectId], desktopAssistantOpenResultSchema),
    status: (projectId?: string) => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.status, [projectId], desktopAssistantStatusResponseSchema),
    context: (projectId: string) => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.context, [projectId], desktopAssistantContextResultSchema),
    continue: (projectId: string, chapterId?: string, sceneId?: string) => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.continue, [projectId, chapterId, sceneId], desktopAssistantCandidateSchema),
    adjudicate: (candidateId: string, decision: 'accept' | 'reject' | 'rewrite') => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.adjudicate, [candidateId, decision], desktopAssistantAdjudicationResultSchema),
    inspire: (projectId: string) => invoke(client, DESKTOP_ASSISTANT_METHOD_IDS.inspire, [projectId], desktopAssistantInspireResultSchema),
  });
}
