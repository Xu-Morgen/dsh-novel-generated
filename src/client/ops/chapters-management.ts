import { unwrap } from '../shared.js';
import type { ChapterMetadataPatch, SceneMetadataPatch } from '../../core/schema/text-mutation.js';
import type { TextDeletionTarget } from '../../core/schema/text-deletion.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import type { OutlineReconciliationChoice } from '../../core/schema/outline-reconciliation.js';
import type { OutlineReconciliationPanelState } from '../layers/chapters.js';
import type { ChapterManagementDraft, ChapterManagementState, ChaptersEditOps, SceneManagementDraft } from '../layers/chapters.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type ManagementPort = Pick<OpsPorts, 'workspace' | 'writing' | 'queueNamespace' | 'textMutation' | 'sceneOutlineBinding' | 'textDeletion' | 'outlineReconciliation'>;

/**
 * I106 章节管理 ops：所有 CRUD、绑定和删除交互都经 Host Remote；成功后重读
 * 章节树，Client 只保存表单/状态机，不乐观维护 C5 真相（design §14.14）。
 */
export function createChaptersManagementOps(runtime: OpsRuntime, port: ManagementPort) {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const patch = (value: Partial<ChapterManagementState>): void => act.chaptersManagement(value);
  const managementPatch = (value: Partial<ChapterManagementState>): void => patch(value);
  const chapterDraft = (value: Partial<ChapterManagementDraft>): void => patch({ chapterDraft: { ...snapshot.chapters.management.chapterDraft, ...value } });
  const sceneDraft = (value: Partial<SceneManagementDraft>): void => patch({ sceneDraft: { ...snapshot.chapters.management.sceneDraft, ...value } });
  const reconciliationPatch = (value: Partial<OutlineReconciliationPanelState>): void => patch({ reconciliation: { ...snapshot.chapters.management.reconciliation, ...value } });

  const reloadTree = (key: string): void => {
    const workspace = port.workspace;
    if (!workspace || projectId === undefined || !beginOp(key)) return;
    void unwrap(workspace.chapterList(projectId)).then((list) => {
      endOp(key);
      if (isActive()) act.setChapters('ready', list as unknown[]);
    }, (cause: Error) => {
      endOp(key);
      if (isActive()) act.setChapters('error', [], cause.message);
    });
  };

  const refreshManagement = (): void => {
    const text = port.textMutation;
    const binding = port.sceneOutlineBinding;
    if (!text || !binding || projectId === undefined || !beginOp('chapters:management:refresh')) return;
    patch({ status: 'loading', binding: { status: 'loading', manual: [], effective: [] } });
    void Promise.all([unwrap(text.fingerprint(projectId)), unwrap(binding.read(projectId))]).then(([fingerprint, result]) => {
      endOp('chapters:management:refresh');
      if (!isActive()) return;
      const value = result as { manual: Array<{ sceneId: string; detailBeatId: string }>; effective: Array<{ sceneId: string; detailBeatId: string; chapterId: string; source: 'manual' | 'default' }>; fingerprint: string };
      patch({ status: 'ready', projectFingerprint: (fingerprint as { fingerprint: string }).fingerprint, binding: { status: 'ready', ...value } });
    }, (cause: Error) => {
      endOp('chapters:management:refresh');
      if (isActive()) patch({ status: 'error', message: cause.message, binding: { status: 'error', manual: [], effective: [], message: cause.message } });
    });
  };

  const afterMutation = (fingerprint: string, key: string): void => {
    patch({ projectFingerprint: fingerprint });
    reloadTree(key);
  };

  const createChapter = (): void => {
    const text = port.textMutation;
    const draft = snapshot.chapters.management.chapterDraft;
    if (!text || projectId === undefined || !beginOp('chapters:management:create-chapter')) return;
    patch({ status: 'loading', message: '' });
    void unwrap(text.chapterCreate(projectId, { ...draft, expectedFingerprint: snapshot.chapters.management.projectFingerprint ?? '' })).then((result) => {
      endOp('chapters:management:create-chapter');
      if (!isActive()) return;
      const value = result as { fingerprint: string };
      patch({ status: 'ready', projectFingerprint: value.fingerprint, chapterDraft: { ...draft, id: '', title: '' } });
      reloadTree('chapters:management:reload:create-chapter');
    }, (cause: Error) => { endOp('chapters:management:create-chapter'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const updateChapter = (): void => {
    const text = port.textMutation;
    const draft = snapshot.chapters.management.chapterDraft;
    if (!text || projectId === undefined || draft.id === '' || !beginOp('chapters:management:update-chapter')) return;
    const input: { chapterId: string; patch: ChapterMetadataPatch; expectedFingerprint: string } = {
      chapterId: draft.id,
      patch: { title: draft.title, pov: draft.pov, status: draft.status },
      expectedFingerprint: snapshot.chapters.management.projectFingerprint ?? '',
    };
    patch({ status: 'loading', message: '' });
    void unwrap(text.chapterUpdate(projectId, input)).then((result) => {
      endOp('chapters:management:update-chapter');
      if (!isActive()) return;
      const value = result as { fingerprint: string };
      patch({ status: 'ready', projectFingerprint: value.fingerprint });
      reloadTree('chapters:management:reload:update-chapter');
    }, (cause: Error) => { endOp('chapters:management:update-chapter'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const createScene = (): void => {
    const text = port.textMutation;
    const chapterId = snapshot.chapters.selectedChapterId;
    const draft = snapshot.chapters.management.sceneDraft;
    if (!text || projectId === undefined || chapterId === undefined || !beginOp('chapters:management:create-scene')) return;
    patch({ status: 'loading', message: '' });
    void unwrap(text.sceneCreate(projectId, {
      chapterId,
      index: draft.index,
      scene: { id: draft.id, content: draft.content, summary: draft.summary, beats: draft.beats, canonEvents: draft.canonEvents, notes: draft.notes },
      expectedFingerprint: snapshot.chapters.management.projectFingerprint ?? '',
    })).then((result) => {
      endOp('chapters:management:create-scene');
      if (!isActive()) return;
      const value = result as { fingerprint: string };
      patch({ status: 'ready', projectFingerprint: value.fingerprint, sceneDraft: { ...draft, id: '', summary: '', content: '', beats: [], canonEvents: [], notes: '' } });
      reloadTree('chapters:management:reload:create-scene');
    }, (cause: Error) => { endOp('chapters:management:create-scene'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const updateScene = (): void => {
    const text = port.textMutation;
    const chapterId = snapshot.chapters.selectedChapterId;
    const draft = snapshot.chapters.management.sceneDraft;
    if (!text || projectId === undefined || chapterId === undefined || draft.id === '' || !beginOp('chapters:management:update-scene')) return;
    const patchValue: SceneMetadataPatch = { summary: draft.summary, beats: draft.beats, canonEvents: draft.canonEvents, notes: draft.notes };
    patch({ status: 'loading', message: '' });
    void unwrap(text.sceneUpdate(projectId, { chapterId, sceneId: draft.id, patch: patchValue, expectedFingerprint: snapshot.chapters.management.projectFingerprint ?? '' })).then((result) => {
      endOp('chapters:management:update-scene');
      if (!isActive()) return;
      const value = result as { fingerprint: string };
      patch({ status: 'ready', projectFingerprint: value.fingerprint });
      reloadTree('chapters:management:reload:update-scene');
    }, (cause: Error) => { endOp('chapters:management:update-scene'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const reorder = (direction: 'up' | 'down'): void => {
    const text = port.textMutation;
    const selected = snapshot.chapters.selectedChapterId;
    if (!text || projectId === undefined || selected === undefined || !beginOp(`chapters:management:reorder:${direction}`)) return;
    patch({ status: 'loading', message: '' });
    void Promise.all(snapshot.chapters.list.map((item) => port.workspace?.chapterRead(projectId, item.id))).then((chapters) => {
      const full = chapters.map((item) => (item as { ok?: boolean; value?: unknown })?.value as { id: string; scenes: Array<{ id: string }> });
      const entries = full.map((chapter) => ({ chapterId: chapter.id, sceneIds: chapter.scenes.map((scene) => scene.id) }));
      const at = entries.findIndex((entry) => entry.chapterId === selected);
      const next = direction === 'up' ? at - 1 : at + 1;
      if (at < 0 || next < 0 || next >= entries.length) throw new Error('没有可交换的相邻章节');
      [entries[at], entries[next]] = [entries[next], entries[at]];
      return unwrap(text.reorder(projectId, { chapters: entries, expectedFingerprint: snapshot.chapters.management.projectFingerprint ?? '' }));
    }).then((result) => {
      endOp(`chapters:management:reorder:${direction}`);
      if (!isActive()) return;
      const value = result as { fingerprint: string };
      afterMutation(value.fingerprint, 'chapters:management:reload:reorder');
    }, (cause: Error) => { endOp(`chapters:management:reorder:${direction}`); if (isActive()) patch({ status: 'error', message: (cause as Error).message }); });
  };

  const bindingSave = (): void => {
    const binding = port.sceneOutlineBinding;
    const sceneId = snapshot.chapters.selectedSceneId;
    const detailBeatId = snapshot.chapters.management.bindingDetailBeatId.trim();
    if (!binding || projectId === undefined || sceneId === undefined || detailBeatId === '' || !beginOp('chapters:management:binding-save')) return;
    void unwrap(binding.save(projectId, { sceneId, detailBeatId, expectedFingerprint: snapshot.chapters.management.binding?.fingerprint ?? '' })).then((result) => {
      endOp('chapters:management:binding-save'); if (!isActive()) return;
      const value = result as ChapterManagementState['binding'];
      patch({ binding: value as never });
    }, (cause: Error) => { endOp('chapters:management:binding-save'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const bindingRebind = (): void => {
    const binding = port.sceneOutlineBinding;
    const sceneId = snapshot.chapters.selectedSceneId;
    const current = snapshot.chapters.management.binding?.manual.find((item) => item.sceneId === sceneId);
    const nextDetailBeatId = snapshot.chapters.management.bindingDetailBeatId.trim();
    if (!binding || projectId === undefined || sceneId === undefined || current === undefined || nextDetailBeatId === '' || !beginOp('chapters:management:binding-rebind')) return;
    void unwrap(binding.rebind(projectId, { sceneId, detailBeatId: current.detailBeatId, nextDetailBeatId, expectedFingerprint: snapshot.chapters.management.binding?.fingerprint ?? '' })).then((result) => {
      endOp('chapters:management:binding-rebind'); if (!isActive()) return;
      patch({ binding: result as never });
    }, (cause: Error) => { endOp('chapters:management:binding-rebind'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const bindingUnbind = (): void => {
    const binding = port.sceneOutlineBinding;
    const sceneId = snapshot.chapters.selectedSceneId;
    const current = snapshot.chapters.management.binding?.manual.find((item) => item.sceneId === sceneId);
    if (!binding || projectId === undefined || sceneId === undefined || current === undefined || !beginOp('chapters:management:binding-unbind')) return;
    void unwrap(binding.unbind(projectId, { sceneId, detailBeatId: current.detailBeatId, expectedFingerprint: snapshot.chapters.management.binding?.fingerprint ?? '' })).then((result) => {
      endOp('chapters:management:binding-unbind'); if (!isActive()) return;
      patch({ binding: result as never });
    }, (cause: Error) => { endOp('chapters:management:binding-unbind'); if (isActive()) patch({ status: 'error', message: cause.message }); });
  };

  const refreshDeleteImpact = (targetOverride?: TextDeletionTarget): void => {
    const deletion = port.textDeletion;
    const target = targetOverride ?? snapshot.chapters.management.deletion.target;
    if (!deletion || projectId === undefined || target === undefined || !beginOp('chapters:management:delete-impact')) return;
    patch({ deletion: { status: 'loading', target } });
    void unwrap(deletion.impact(projectId, target)).then((result) => {
      endOp('chapters:management:delete-impact'); if (!isActive()) return;
      const value = result as { status: 'ready' | 'blocked'; impact: import('../../core/schema/text-deletion.js').TextDeletionImpact };
      patch({ deletion: { status: value.status, target, impact: value.impact } });
    }, (cause: Error) => { endOp('chapters:management:delete-impact'); if (isActive()) patch({ deletion: { status: 'error', target, message: cause.message } }); });
  };

  const chooseDeleteTarget = (target: TextDeletionTarget): void => {
    patch({ deletion: { status: 'idle', target } });
    refreshDeleteImpact(target);
  };

  const cancelDeleteQueue = (): void => {
    const queue = port.queueNamespace;
    const current = snapshot.chapters.management.deletion;
    if (!queue || projectId === undefined || current.impact === undefined || current.impact.activeQueue.length === 0 || !beginOp('chapters:management:delete-cancel-queue')) return;
    const stopRun = current.impact.activeQueue.some((task) => task.status === 'running')
      ? unwrap(queue.cancel(projectId))
      : Promise.resolve(undefined);
    void stopRun.then(() => Promise.all(current.impact!.activeQueue.map((task) => task.status === 'candidate-ready'
      ? unwrap(queue.retry(projectId, task.id))
      : unwrap(queue.cancelTask(projectId, task.id)))))
      .then(() => {
      endOp('chapters:management:delete-cancel-queue');
      if (isActive()) refreshDeleteImpact(current.target);
      }, (cause: Error) => {
      endOp('chapters:management:delete-cancel-queue');
      if (isActive()) patch({ deletion: { ...current, status: 'error', message: cause.message } });
      });
  };

  const rejectDeleteCandidates = (): void => {
    const writing = port.writing;
    const current = snapshot.chapters.management.deletion;
    if (!writing || current.impact === undefined || current.impact.activeCandidates.length === 0 || !beginOp('chapters:management:delete-reject-candidates')) return;
    void Promise.all(current.impact.activeCandidates.map((candidate) => unwrap(writing.adjudicate(candidate.candidateId, 'reject', undefined)))).then(() => {
      endOp('chapters:management:delete-reject-candidates');
      if (isActive()) refreshDeleteImpact(current.target);
    }, (cause: Error) => {
      endOp('chapters:management:delete-reject-candidates');
      if (isActive()) patch({ deletion: { ...current, status: 'error', message: cause.message } });
    });
  };

  const proposeDelete = (): void => {
    const deletion = port.textDeletion;
    const current = snapshot.chapters.management.deletion;
    if (!deletion || projectId === undefined || current.target === undefined || current.impact === undefined || current.status !== 'ready' || !beginOp('chapters:management:delete-propose')) return;
    patch({ deletion: { ...current, status: 'proposing' } });
    void unwrap(deletion.propose(projectId, current.target, current.impact.impactFingerprint)).then((result) => {
      endOp('chapters:management:delete-propose'); if (!isActive()) return;
      const value = result as { status: 'pending' | 'stale' | 'blocked'; proposalId?: string; impact: import('../../core/schema/text-deletion.js').TextDeletionImpact };
      patch({ deletion: { status: value.status, target: current.target, impact: value.impact, proposalId: value.proposalId } });
    }, (cause: Error) => { endOp('chapters:management:delete-propose'); if (isActive()) patch({ deletion: { ...current, status: 'error', message: cause.message } }); });
  };

  const applyDelete = (): void => {
    const deletion = port.textDeletion;
    const current = snapshot.chapters.management.deletion;
    if (!deletion || projectId === undefined || current.proposalId === undefined || !beginOp('chapters:management:delete-apply')) return;
    patch({ deletion: { ...current, status: 'applying' } });
    void unwrap(deletion.apply(projectId, current.proposalId)).then((result) => {
      endOp('chapters:management:delete-apply'); if (!isActive()) return;
      const value = result as { status: 'deleted' | 'already-deleted' | 'stale' | 'blocked'; impact?: import('../../core/schema/text-deletion.js').TextDeletionImpact; fingerprint?: string };
      if (value.status === 'deleted' || value.status === 'already-deleted') {
        patch({ deletion: { status: 'done', target: current.target, proposalId: current.proposalId, message: value.status === 'already-deleted' ? '目标已删除，已安全重试' : '删除完成' }, projectFingerprint: value.fingerprint });
        reloadTree('chapters:management:reload:delete');
      } else {
        patch({ deletion: { status: value.status, target: current.target, proposalId: current.proposalId, impact: value.impact } });
      }
    }, (cause: Error) => { endOp('chapters:management:delete-apply'); if (isActive()) patch({ deletion: { ...current, status: 'error', message: cause.message } }); });
  };

  const rejectDelete = (): void => {
    const deletion = port.textDeletion;
    const current = snapshot.chapters.management.deletion;
    if (!deletion || projectId === undefined || current.proposalId === undefined || !beginOp('chapters:management:delete-reject')) return;
    patch({ deletion: { ...current, status: 'rejecting' } });
    void unwrap(deletion.reject(projectId, current.proposalId)).then(() => {
      endOp('chapters:management:delete-reject'); if (isActive()) patch({ deletion: { status: 'idle', target: current.target } });
    }, (cause: Error) => { endOp('chapters:management:delete-reject'); if (isActive()) patch({ deletion: { ...current, status: 'error', message: cause.message } }); });
  };

  const reconciliationPlanId = (value: string): void => reconciliationPatch({ planId: value, message: undefined });
  const reconciliationRead = (): void => {
    const remote = port.outlineReconciliation;
    const planId = snapshot.chapters.management.reconciliation.planId.trim();
    if (!remote || projectId === undefined || planId === '' || !beginOp('chapters:reconciliation:read')) return;
    reconciliationPatch({ status: 'loading', message: undefined });
    void unwrap(remote.read(projectId, planId)).then((plan) => {
      endOp('chapters:reconciliation:read');
      if (!isActive()) return;
      const value = plan as import('../../core/schema/outline-reconciliation.js').OutlineReconciliationPlan;
      const decisions = Object.fromEntries(value.items.map((item) => [item.detailBeatId, item.choice]));
      const manualValues = Object.fromEntries(value.items.map((item) => [item.detailBeatId, item.manualValue ?? item.before]));
      reconciliationPatch({ status: 'ready', plan: value, decisions, manualValues, proposalId: undefined, finalResult: undefined, continueResult: undefined });
    }, (cause: Error) => {
      endOp('chapters:reconciliation:read');
      if (isActive()) reconciliationPatch({ status: 'error', message: cause.message });
    });
  };
  const reconciliationChoice = (detailBeatId: string, choice: OutlineReconciliationChoice): void => {
    const plan = snapshot.chapters.management.reconciliation.plan;
    if (plan === undefined || !plan.items.some((item) => item.detailBeatId === detailBeatId)) return;
    reconciliationPatch({ decisions: { ...snapshot.chapters.management.reconciliation.decisions, [detailBeatId]: choice }, message: undefined });
  };
  const reconciliationManualPatch = (detailBeatId: string, value: Partial<DetailBeat>): void => {
    const current = snapshot.chapters.management.reconciliation.manualValues[detailBeatId];
    if (current === undefined) return;
    reconciliationPatch({ manualValues: { ...snapshot.chapters.management.reconciliation.manualValues, [detailBeatId]: { ...current, ...value, id: detailBeatId, status: 'planned' } } });
  };
  const reconciliationDecisions = () => {
    const current = snapshot.chapters.management.reconciliation;
    if (current.plan === undefined) throw new Error('请先读取调和计划');
    return current.plan.items.map((item) => ({ detailBeatId: item.detailBeatId, choice: current.decisions[item.detailBeatId] ?? item.choice, ...((current.decisions[item.detailBeatId] ?? item.choice) === 'manual' ? { manualValue: current.manualValues[item.detailBeatId] ?? item.before } : {}) }));
  };
  const reconciliationPropose = (): void => {
    const remote = port.outlineReconciliation;
    const current = snapshot.chapters.management.reconciliation;
    if (!remote || projectId === undefined || current.plan === undefined || !beginOp('chapters:reconciliation:propose')) return;
    reconciliationPatch({ status: 'proposing', message: undefined });
    void unwrap(remote.propose(projectId, { planId: current.plan.planId, decisions: reconciliationDecisions() })).then((result) => {
      endOp('chapters:reconciliation:propose'); if (!isActive()) return;
      const value = result as import('../../core/schema/outline-reconciliation-application.js').OutlineReconciliationProposeResult;
      reconciliationPatch({ status: 'pending', proposalId: value.proposalId });
    }, (cause: Error) => { endOp('chapters:reconciliation:propose'); if (isActive()) reconciliationPatch({ status: 'error', message: cause.message }); });
  };
  const reconciliationAccept = (): void => {
    const remote = port.outlineReconciliation;
    const current = snapshot.chapters.management.reconciliation;
    if (!remote || projectId === undefined || current.proposalId === undefined || !beginOp('chapters:reconciliation:accept')) return;
    reconciliationPatch({ status: 'accepting', message: undefined });
    void unwrap(remote.accept(projectId, current.proposalId)).then(() => {
      endOp('chapters:reconciliation:accept'); if (isActive()) reconciliationPatch({ status: 'done' });
    }, (cause: Error) => { endOp('chapters:reconciliation:accept'); if (isActive()) reconciliationPatch({ status: 'error', message: cause.message }); });
  };
  const reconciliationReject = (): void => {
    const remote = port.outlineReconciliation;
    const current = snapshot.chapters.management.reconciliation;
    if (!remote || projectId === undefined || current.proposalId === undefined || !beginOp('chapters:reconciliation:reject')) return;
    reconciliationPatch({ status: 'rejecting', message: undefined });
    void unwrap(remote.reject(projectId, current.proposalId)).then(() => {
      endOp('chapters:reconciliation:reject'); if (isActive()) reconciliationPatch({ status: 'idle', proposalId: undefined });
    }, (cause: Error) => { endOp('chapters:reconciliation:reject'); if (isActive()) reconciliationPatch({ status: 'error', message: cause.message }); });
  };
  const reconciliationFinalize = (): void => {
    const remote = port.outlineReconciliation;
    const current = snapshot.chapters.management.reconciliation;
    if (!remote || projectId === undefined || current.plan === undefined || !beginOp('chapters:reconciliation:finalize')) return;
    reconciliationPatch({ status: 'finalizing', message: undefined });
    void unwrap(remote.finalize(projectId, { planId: current.plan.planId, finalSourceHash: current.plan.finalSourceHash })).then((result) => {
      endOp('chapters:reconciliation:finalize'); if (!isActive()) return;
      reconciliationPatch({ status: 'done', finalResult: result as import('../../core/schema/outline-reconciliation-application.js').OutlineReconciliationFinalizeResult });
    }, (cause: Error) => { endOp('chapters:reconciliation:finalize'); if (isActive()) reconciliationPatch({ status: 'error', message: cause.message }); });
  };
  const reconciliationContinue = (): void => {
    const remote = port.outlineReconciliation;
    const current = snapshot.chapters.management.reconciliation;
    if (!remote || projectId === undefined || current.plan === undefined || !beginOp('chapters:reconciliation:continue')) return;
    reconciliationPatch({ status: 'continuing', message: undefined });
    void unwrap(remote.continue(projectId, { planId: current.plan.planId, finalSourceHash: current.plan.finalSourceHash })).then((result) => {
      endOp('chapters:reconciliation:continue'); if (!isActive()) return;
      const value = result as import('../../core/schema/outline-reconciliation-application.js').OutlineReconciliationContinueResult;
      reconciliationPatch({ status: value.status === 'continued' ? 'done' : value.status, continueResult: value });
    }, (cause: Error) => { endOp('chapters:reconciliation:continue'); if (isActive()) reconciliationPatch({ status: 'error', message: cause.message }); });
  };

  return {
    chapterDraft,
    sceneDraft,
    managementPatch,
    createChapter,
    updateChapter,
    createScene,
    updateScene,
    reorder,
    refreshManagement,
    bindingSave,
    bindingRebind,
    bindingUnbind,
    chooseDeleteTarget,
    refreshDeleteImpact,
    cancelDeleteQueue,
    rejectDeleteCandidates,
    proposeDelete,
    applyDelete,
    rejectDelete,
    reconciliationPlanId,
    reconciliationRead,
    reconciliationChoice,
    reconciliationManualPatch,
    reconciliationPropose,
    reconciliationAccept,
    reconciliationReject,
    reconciliationFinalize,
    reconciliationContinue,
  } satisfies Pick<ChaptersEditOps, 'chapterDraft' | 'sceneDraft' | 'managementPatch' | 'createChapter' | 'updateChapter' | 'createScene' | 'updateScene' | 'reorder' | 'refreshManagement' | 'bindingSave' | 'bindingRebind' | 'bindingUnbind' | 'chooseDeleteTarget' | 'refreshDeleteImpact' | 'cancelDeleteQueue' | 'rejectDeleteCandidates' | 'proposeDelete' | 'applyDelete' | 'rejectDelete' | 'reconciliationPlanId' | 'reconciliationRead' | 'reconciliationChoice' | 'reconciliationManualPatch' | 'reconciliationPropose' | 'reconciliationAccept' | 'reconciliationReject' | 'reconciliationFinalize' | 'reconciliationContinue'>;
}
