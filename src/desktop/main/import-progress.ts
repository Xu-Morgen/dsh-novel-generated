import type { NovelOutlineService } from '../../host/outline-service.js';

function isMissing(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if ('code' in cause && cause.code === 'ENOENT') return true;
  return cause.cause !== cause && isMissing(cause.cause);
}

/**
 * I194 / §14.15: once the author applies an imported B5, prepare its initial
 * C6 cursor through the existing outline owner. Replays preserve progress;
 * damaged or stale documents fail visibly and are never reset to the start.
 */
export async function ensureImportedProgress(outline: NovelOutlineService, projectId: string): Promise<void> {
  try { await outline.readProgress(projectId); return; }
  catch (cause) { if (!isMissing(cause)) throw cause; }
  const value = await outline.read(projectId);
  const act = value.acts.find(item => item.beats.length > 0);
  if (!act) return;
  await outline.saveProgress(projectId, { outlineId: value.id, currentAct: act.id, currentBeat: act.beats[0].id, completedBeats: [], deviations: [], tensionLevel: 0 });
}
