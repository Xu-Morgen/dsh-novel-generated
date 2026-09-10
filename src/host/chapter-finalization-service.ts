import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { chapterTargetSchema, chapterDecisionSchema, chapterManuscriptSchema, chapterAnalysisSchema, type ChapterFinalizationNamespace, type ChapterDecisionResult } from '../app/chapter-finalization-contract.js';
import type { Chapter } from '../core/schema/text.js';
import { asLlmBackend, type GenerationSettings } from '../llm/port/index.js';
import { parseC2StateFromNarrative } from '../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative } from '../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative } from '../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative } from '../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative } from '../llm/parse/worldview.js';
import { buildFiveLayerWriters, type FiveLayerWritebackDeps } from './five-layer-writeback.js';
import type { NovelTextServiceBundle } from './text-service.js';
import { prepareChapterProgress, chapterProgressFresh, chapterProgressPlanSchema, type ChapterProgressOwners } from './chapter-finalization-progress.js';
import { prepareStructuralPreviewPlan, structuralPreviewPlanSchema, structuralPreviewFingerprint as fingerprint, scanStructuralPreviewCommit, type StructuralPreviewLayerBaseline } from './writing-adjudication/structural-preview-plan.js';

const kind = 'chapter.finalization';
const layers = ['c2', 'c1', 'c3', 'c4', 'b2'] as const;
const payloadSchema = chapterTargetSchema.extend({ sourceHash: z.string(), plan: structuralPreviewPlanSchema, progress: chapterProgressPlanSchema.nullable() }).strict();

/** I217 canonical chapter projection: preserve prose verbatim; order, identities and empty scenes participate in freshness. */
export function chapterManuscript(projectId: string, chapter: Chapter) {
  const scenes = [...chapter.scenes].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id)).map(({ id, index, content }) => ({ id, index, content }));
  const sourceHash = fingerprint({ id: chapter.id, index: chapter.index, title: chapter.title, pov: chapter.pov, scenes });
  return chapterManuscriptSchema.parse({ projectId, chapterId: chapter.id, title: chapter.title, status: chapter.status, sourceHash, scenes });
}

/** Main-owned chapter analysis and one I11 decision. Frozen parser plans survive restart in the existing Gate record. */
export function createChapterFinalizationService(deps: FiveLayerWritebackDeps & {
  text: NovelTextServiceBundle; llm?: unknown; resolveSettings(): Promise<GenerationSettings>;
  progress?: ChapterProgressOwners;
  onApplied?: (projectId: string, chapterId: string, sceneId: string) => void;
  onDispose?: (dispose: () => void) => void;
}): ChapterFinalizationNamespace & { analyze(input: z.infer<typeof chapterTargetSchema>, signal?: AbortSignal): ReturnType<ChapterFinalizationNamespace['chapterAnalyze']> } {
  const backend = asLlmBackend(deps.llm);
  const lanes = new Map<string, Promise<unknown>>();
  let disposed = false;
  deps.onDispose?.(() => { disposed = true; lanes.clear(); });
  const run = <T>(projectId: string, fn: () => Promise<T>): Promise<T> => {
    const task = (lanes.get(projectId) ?? Promise.resolve()).catch(() => undefined).then(() => {
      if (disposed) throw new Error('Chapter finalization disposed');
      return fn();
    });
    const tail = task.then(() => undefined, () => undefined);
    lanes.set(projectId, tail);
    void tail.then(() => { if (lanes.get(projectId) === tail) lanes.delete(projectId); });
    return task;
  };
  const read = async (raw: z.infer<typeof chapterTargetSchema>) => {
    const input = chapterTargetSchema.parse(raw);
    await deps.text.open(input.projectId);
    return chapterManuscript(input.projectId, await deps.text.readChapter(input.projectId, input.chapterId));
  };
  const baselines = async (projectId: string): Promise<StructuralPreviewLayerBaseline[]> => {
    const state = deps.state.current(projectId);
    const relationships = await deps.relationship.read(projectId);
    const knowledge = await deps.knowledge.read(projectId);
    const canon = [...deps.canon.query(projectId)];
    const worldview = await deps.worldview.list(projectId);
    return [
      { layer: 'c2', snapshot: state, fingerprint: fingerprint(state) },
      { layer: 'c1', snapshot: relationships, fingerprint: fingerprint(relationships) },
      { layer: 'c3', snapshot: { entries: [...knowledge.entries], states: [...knowledge.states] }, fingerprint: fingerprint(knowledge) },
      { layer: 'c4', snapshot: canon, fingerprint: fingerprint(canon) },
      { layer: 'b2', snapshot: worldview, fingerprint: fingerprint(worldview) },
    ];
  };
  const analyze = (raw: z.infer<typeof chapterTargetSchema>, signal?: AbortSignal) => {
    const input = chapterTargetSchema.parse(raw);
    return run(input.projectId, async () => {
      const { projectId, chapterId } = input;
      const manuscript = await read(input);
      const nonempty = manuscript.scenes.filter(scene => scene.content.trim().length > 0);
      if (nonempty.length === 0) throw new Error('本章暂无已保存正文，请先完成场景写作并保存。');
      // §14.14.4: no summary substitution or silent truncation; every saved paragraph is analyzed.
      const prose = nonempty.map(scene => scene.content).join('\n\n');
      const layerBaselines = await baselines(projectId);
      const progress = deps.progress ? await prepareChapterProgress(deps.progress, projectId, chapterId, nonempty.map(scene => scene.id)) : null;
      const settings = await deps.resolveSettings();
      const [c2, c1, c3, c4, b2] = await Promise.all([
        parseC2StateFromNarrative(backend, { prose, state: deps.state.current(projectId) }, settings, signal),
        parseC1RelationshipsFromNarrative(backend, { prose, current: await deps.relationship.read(projectId) }, settings, signal),
        parseC3KnowledgeFromNarrative(backend, { prose, ...(await deps.knowledge.read(projectId)) }, settings, signal),
        parseC4CanonFromNarrative(backend, { prose, canon: deps.canon.query(projectId) }, settings, signal),
        parseB2WorldviewFromNarrative(backend, { prose, current: await deps.worldview.list(projectId) }, settings, signal),
      ]);
      signal?.throwIfAborted();
      if (disposed) throw new Error('Chapter finalization disposed');
      if ((await read(input)).sourceHash !== manuscript.sourceHash) throw new Error('分析期间本章正文发生变化，请重新分析。');
      if (fingerprint(await baselines(projectId)) !== fingerprint(layerBaselines)) throw new Error('分析期间故事资料发生变化，请重新分析。');
      if (progress && deps.progress && !await chapterProgressFresh(deps.progress, projectId, progress, false)) throw new Error('分析期间细纲或写作进度已变化，请重新分析。');
      const proposalId = `chapter-final-${randomUUID()}`;
      const plan = prepareStructuralPreviewPlan({ planId: proposalId, projectId, candidateId: proposalId, sourceHash: manuscript.sourceHash, generationBaseline: { kind: 'no-outline-baseline' }, layerBaselines, parserOutputs: { c2, c1, c3, c4, b2 }, createdAt: new Date().toISOString() });
      // Reanalysis supersedes only this chapter's still-pending summaries; accepted recovery records remain intact.
      for (const prior of deps.confirmation.pending(projectId)) {
        if (prior.kind !== kind) continue;
        const previous = payloadSchema.parse(prior.payload);
        if (previous.chapterId === chapterId && previous.projectId === projectId) await deps.confirmation.reject(projectId, prior.id);
      }
      await deps.confirmation.propose(projectId, { id: proposalId, kind, payload: z.json().parse(JSON.parse(JSON.stringify({ projectId, chapterId, sourceHash: manuscript.sourceHash, plan, progress }))) });
      return chapterAnalysisSchema.parse({ projectId, chapterId, proposalId, sourceHash: manuscript.sourceHash, sceneCount: nonempty.length, emptySceneCount: manuscript.scenes.length - nonempty.length, completedBeatCount: progress?.after.completedBeats.filter(id => !progress.before.completedBeats.includes(id)).length ?? 0, changes: plan.changes });
    });
  };
  return {
    chapterManuscript: read, analyze, chapterAnalyze: input => analyze(input),
    chapterFinalize(raw) {
      const input = chapterDecisionSchema.parse(raw);
      return run(input.projectId, async (): Promise<ChapterDecisionResult> => {
        const { projectId, proposalId } = input;
        const record = deps.confirmation.get(projectId, proposalId);
        if (record.kind !== kind) throw new Error('不是整章定稿确认。');
        const payload = payloadSchema.parse(record.payload);
        if (payload.projectId !== projectId || payload.plan.planId !== proposalId) throw new Error('定稿确认身份不匹配。');
        const { chapterId, plan } = payload;
        const result = (status: ChapterDecisionResult['status'], message: string, nextChapterId: string | null = null): ChapterDecisionResult => ({ chapterId, status, message, nextChapterId });
        if (!input.accept) {
          await deps.confirmation.reject(projectId, proposalId);
          return result('rejected', '已取消本章定稿，正文与故事资料保持不变。');
        }
        if (record.status === 'rejected') throw new Error('本次定稿已取消，请重新分析。');
        const manuscript = await read({ projectId, chapterId });
        if (manuscript.sourceHash !== payload.sourceHash) return result('stale', '本章内容或场景顺序已变化，请重新分析。');
        if (payload.progress && (!deps.progress || !await chapterProgressFresh(deps.progress, projectId, payload.progress, record.status === 'accepted'))) return result('stale', '细纲、绑定或写作进度已变化，请重新分析。');
        const current = await baselines(projectId);
        const scan = scanStructuralPreviewCommit(plan, current);
        for (const baseline of current) {
          const before = plan.layerBaselines.find(item => item.layer === baseline.layer)!;
          const alreadyApplied = record.status === 'accepted' && !scan.mismatchedLayers.includes(baseline.layer);
          if (!alreadyApplied && baseline.fingerprint !== before.fingerprint) return result('stale', '故事资料已变化；已同步部分会保留，请重新分析当前整章。');
        }
        if (record.status === 'pending') await deps.confirmation.accept(projectId, proposalId);
        const writers = buildFiveLayerWriters(deps, projectId, proposalId, { authorizedFinalization: true, skipEmptyB2Proposal: true });
        const completed: string[] = [];
        for (const layer of layers) {
          if (!scan.mismatchedLayers.includes(layer)) { completed.push(layer); continue; }
          try {
            if (layer === 'c2') await writers.c2(plan.parserOutputs.c2);
            else if (layer === 'c1') await writers.c1(plan.parserOutputs.c1);
            else if (layer === 'c3') await writers.c3(plan.parserOutputs.c3);
            else if (layer === 'c4') await writers.c4(plan.parserOutputs.c4);
            else await writers.b2(plan.parserOutputs.b2);
            completed.push(layer);
          } catch {
            return result('partial-failure', `故事同步未完成（已完成 ${completed.length}/5 阶段），请重试同步。正文已保留。`);
          }
        }
        if (scanStructuralPreviewCommit(plan, await baselines(projectId)).status !== 'matched') return result('partial-failure', '故事同步回读未匹配，请重试；正文已保留。');
        if ((await read({ projectId, chapterId })).sourceHash !== payload.sourceHash) return result('stale', '同步期间正文发生变化，请重新分析。');
        try {
          if (payload.progress && deps.progress) {
            if (!await chapterProgressFresh(deps.progress, projectId, payload.progress, true)) return result('stale', '同步期间写作进度发生变化，请重新分析。');
            if (fingerprint(await deps.progress.outline.readProgress(projectId)) !== fingerprint(payload.progress.after)) await deps.progress.outline.saveProgress(projectId, payload.progress.after);
          }
          if (manuscript.status !== 'canon') await deps.text.updateChapterMutation(projectId, { chapterId, patch: { status: 'canon' }, expectedFingerprint: await deps.text.projectFingerprint(projectId) });
        } catch { return result('partial-failure', '故事资料已同步，写作进度或章节定稿状态保存失败，请重试。'); }
        for (const scene of manuscript.scenes) deps.onApplied?.(projectId, chapterId, scene.id);
        const chapters = (await deps.text.listChapters(projectId)).sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
        const next = chapters[chapters.findIndex(chapter => chapter.id === chapterId) + 1];
        return result('done', '本章已定稿，故事状态已同步。', next?.id ?? null);
      });
    },
  };
}
