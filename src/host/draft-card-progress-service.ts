import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IpcContractError } from '../app/ipc-registry.js';
import { cardDraftInputSchema, nextCardDecisionSchema, nextCardProposalSchema, type CardDraftResult, type DraftCardProgressNamespace } from '../app/draft-card-progress-contract.js';
import { outlineContentFingerprint } from '../core/outline/index.js';
import type { Outline, DetailBeat } from '../core/schema/outline.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';

const kind = 'writing.next-scene-card';
const payloadSchema = z.object({ projectId: z.string(), candidateId: z.string(), proposal: nextCardProposalSchema, before: z.string(), after: z.string() }).strict();
const flatten = (outline: Outline) => outline.acts.slice().sort((a, b) => a.index - b.index || a.id.localeCompare(b.id)).flatMap(act => act.beats.slice().sort((a, b) => a.id.localeCompare(b.id)).flatMap(beat => beat.detailBeats));
const changed = (outline: Outline, id: string, status: DetailBeat['status']): Outline => ({ ...outline, acts: outline.acts.map(act => ({ ...act, beats: act.beats.map(beat => ({ ...beat, detailBeats: beat.detailBeats.map(card => card.id === id ? { ...card, status } : card) })) })) });

/** I216 ordered C5 adoption → B5 completion → I11 next-card proposal, with session retry after partial success. */
export function createDraftCardProgressService(deps: { writing: NovelWritingAdjudicationService; outline: NovelOutlineService; confirmation: NovelConfirmationService; binding: NovelSceneOutlineBindingService; onDispose?: (fn: () => void) => void }): DraftCardProgressNamespace {
  const entries = new Map<string, { projectId: string; before: Outline; after: Outline; result?: CardDraftResult }>();
  const lanes = new Map<string, Promise<unknown>>(); let disposed = false;
  deps.onDispose?.(() => { disposed = true; entries.clear(); lanes.clear(); });
  const lane = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const run = (lanes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => {
      if (disposed) throw new Error('Application disposed');
      return operation();
    });
    lanes.set(key, run); return run;
  };
  const save = async (projectId: string, outline: Outline, expected: string) => {
    if (!deps.outline.saveIfFingerprint) throw new Error('B5 CAS unavailable');
    return deps.outline.saveIfFingerprint(projectId, outline, expected);
  };
  return {
    sceneCardDraftAdopt(raw) {
      const { candidateId } = cardDraftInputSchema.parse(raw);
      if (!deps.writing.sceneCardDraftSource || !deps.writing.adoptDraft) throw new Error('Draft card workflow unavailable');
      const source = deps.writing.sceneCardDraftSource(candidateId);
      return lane(source.projectId, async () => {
        let entry = entries.get(candidateId);
        if (entry?.result?.completion === 'done') return entry.result;
        if (!entry) {
          const before = await deps.outline.read(source.projectId);
          const matches = flatten(before).filter(card => card.id === source.card.id);
          if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(source.card)) throw new IpcContractError('handler-failed', '本次细纲卡已变化，请重新生成候选。');
          entry = { projectId: source.projectId, before, after: changed(before, source.card.id, 'done') };
          entries.set(candidateId, entry);
        }
        const adoption = await deps.writing.adoptDraft!(candidateId);
        // Adoption already owns idempotency; a B5/Gate failure must not hide the saved draft.
        entry.result = { adoption, completion: 'pending', next: null };
        try {
          const current = await deps.outline.read(source.projectId);
          const fingerprint = outlineContentFingerprint(current);
          const afterFingerprint = outlineContentFingerprint(entry.after);
          if (fingerprint !== afterFingerprint) await save(source.projectId, entry.after, outlineContentFingerprint(entry.before));
          const bindings = await deps.binding.read(source.projectId);
          if (!bindings.manual.some(row => row.sceneId === adoption.sceneId && row.detailBeatId === source.card.id)) {
            await deps.binding.save(source.projectId, { sceneId: adoption.sceneId, detailBeatId: source.card.id, expectedFingerprint: bindings.fingerprint });
          }
          const cards = flatten(entry.after);
          const next = cards.slice(cards.findIndex(card => card.id === source.card.id) + 1).find(card => card.status !== 'done');
          let proposal: CardDraftResult['next'] = null;
          if (next) {
            await deps.confirmation.open(source.projectId);
            // Reuse a durable proposal if the response was lost after its write.
            const existing = deps.confirmation.list(source.projectId).find(record => record.kind === kind && payloadSchema.safeParse(record.payload).data?.candidateId === candidateId);
            if (existing) proposal = payloadSchema.parse(existing.payload).proposal;
            else {
              proposal = { proposalId: `next-card-${randomUUID()}`, card: next };
              await deps.confirmation.propose(source.projectId, { id: proposal.proposalId, kind, payload: { projectId: source.projectId, candidateId, proposal, before: afterFingerprint, after: outlineContentFingerprint(changed(entry.after, next.id, 'writing')) } });
            }
          }
          entry.result = { adoption, completion: 'done', next: proposal };
        } catch { /* Return explicit partial success; the author can retry the same candidate. */ }
        return entry.result;
      });
    },
    sceneCardNextDecide(raw) {
      const input = nextCardDecisionSchema.parse(raw);
      return lane(input.projectId, async () => {
        await deps.confirmation.open(input.projectId);
        const record = deps.confirmation.get(input.projectId, input.proposalId);
        if (record.kind !== kind) throw new IpcContractError('handler-failed', '确认记录类型不匹配。');
        const payload = payloadSchema.parse(record.payload);
        if (payload.projectId !== input.projectId) throw new Error('Project mismatch');
        const clearNext = () => { const entry = entries.get(payload.candidateId); if (entry?.result) entry.result = { ...entry.result, next: null }; };
        if (!input.accept) { await deps.confirmation.reject(input.projectId, input.proposalId); clearNext(); return { status: 'rejected' as const }; }
        if (record.status === 'rejected') throw new IpcContractError('handler-failed', '已取消启动此细纲卡。');
        const outline = await deps.outline.read(input.projectId);
        const fingerprint = outlineContentFingerprint(outline);
        if (fingerprint !== payload.before && fingerprint !== payload.after) throw new IpcContractError('handler-failed', '大纲或细纲内容已变化，请取消弹窗后检查大纲。');
        await deps.confirmation.accept(input.projectId, input.proposalId);
        if (fingerprint !== payload.after) await save(input.projectId, changed(outline, payload.proposal.card.id, 'writing'), payload.before);
        clearNext();
        return { status: 'accepted' as const };
      });
    },
  };
}
