import { validateProjectId } from '../core/io/path.js';
import { stableSceneId } from '../core/queue/task.js';
import {
  BOOK_READINESS_MAX_ISSUES,
  BOOK_READINESS_PAGE_LIMIT,
  bookReadinessPageInputSchema,
  bookReadinessResultSchema,
  type BookReadinessIssue,
  type BookReadinessPageInput,
  type BookReadinessResult,
} from '../core/schema/book-readiness.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import type { DetailBeat, Outline, OutlineBeatCard } from '../core/schema/outline.js';
import type { OutlineProgress } from '../core/schema/outline-progress.js';
import type { ReviewProjection } from '../core/review/issue.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelReviewService } from './review-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextServiceBundle } from './text-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';

/**
 * I137 全书完成门 owner（design §14.14.2 / D25，计划 §18 I137）。
 *
 * 这是可重建的读取投影，不是新的作品状态：每次请求都从 C5、B5/C6、绑定、
 * I11 pending records 与既有 review detector 重新计算。Client 只看到有界章节
 * 摘要和问题，不会拿到全书正文或可手改的「完成」标记。
 */
export interface NovelBookCompletionService {
  /** 结构完成门：不调用 LLM、不写任何领域文件。 */
  readiness(projectId: string, page?: BookReadinessPageInput): Promise<BookReadinessResult>;
  /** 在同一完成投影上运行既有审校 detector，并保留软警告裁决状态。 */
  scan(projectId: string, page?: BookReadinessPageInput, settings?: unknown): Promise<BookReadinessResult>;
}

interface BookCompletionDeps {
  readonly text: Pick<NovelTextServiceBundle, 'listChapters' | 'projectFingerprint'>;
  readonly outline: Pick<NovelOutlineService, 'readiness' | 'read' | 'readProgress' | 'contentFingerprint'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly confirmation: Pick<NovelConfirmationService, 'pending'>;
  readonly review: Pick<NovelReviewService, 'scan'>;
  readonly writing?: Pick<NovelWritingAdjudicationService, 'listActiveCandidates'>;
}

interface CardRef {
  readonly card: OutlineBeatCard;
  readonly beatOptional: boolean;
  readonly actIndex: number;
  readonly beatIndex: number;
  readonly detailIndex: number;
}

interface StructuralSnapshot {
  readonly chapters: Awaited<ReturnType<NovelTextServiceBundle['listChapters']>>;
  readonly outline: Outline | undefined;
  readonly progress: OutlineProgress | undefined;
  readonly binding: Awaited<ReturnType<NovelSceneOutlineBindingService['read']>>;
  readonly textFingerprint: string;
  readonly outlineFingerprint: string | null;
}

const issueKey = (kind: BookReadinessIssue['kind'], suffix: string): string => `book-${kind}-${suffix}`.slice(0, 128);

function makeIssue(
  kind: BookReadinessIssue['kind'],
  severity: BookReadinessIssue['severity'],
  status: BookReadinessIssue['status'],
  message: string,
  location: { chapterId?: string; sceneId?: string; detailBeatId?: string } = {},
  sourceIssueId?: string,
): BookReadinessIssue {
  return {
    id: issueKey(kind, sourceIssueId ?? location.detailBeatId ?? location.sceneId ?? location.chapterId ?? 'book'),
    kind,
    severity,
    status,
    message,
    ...(location.chapterId === undefined ? {} : { chapterId: location.chapterId }),
    ...(location.sceneId === undefined ? {} : { sceneId: location.sceneId }),
    ...(location.detailBeatId === undefined ? {} : { detailBeatId: location.detailBeatId }),
    ...(sourceIssueId === undefined ? {} : { sourceIssueId }),
  };
}

function cardRefs(outline: Outline): readonly CardRef[] {
  return outline.acts.flatMap((act, actIndex) => act.beats.flatMap((beat, beatIndex) => beat.detailBeats.map((detailBeat, detailIndex) => ({
    card: { actId: act.id, beatId: beat.id, beatTitle: beat.title, detailBeat },
    beatOptional: beat.optional,
    actIndex,
    beatIndex,
    detailIndex,
  }))));
}

function pageOf(input: BookReadinessPageInput | undefined): BookReadinessPageInput {
  return bookReadinessPageInputSchema.parse(input ?? { offset: 0, limit: BOOK_READINESS_PAGE_LIMIT });
}

function appendIssue(issues: BookReadinessIssue[], issue: BookReadinessIssue): void {
  if (issues.some((existing) => existing.id === issue.id)) return;
  if (issues.length >= BOOK_READINESS_MAX_ISSUES) throw new Error(`Book readiness issue budget exceeded: ${BOOK_READINESS_MAX_ISSUES}`);
  issues.push(issue);
}

function pendingIssue(record: ConfirmationRecord): BookReadinessIssue | undefined {
  switch (record.kind) {
    case 'finalization.apply':
      return makeIssue('pending-finalization', 'hard', 'pending', '存在待确认的正文定稿，发布门保持关闭。');
    case 'outline-reconciliation.apply':
      return makeIssue('pending-reconciliation', 'hard', 'pending', '存在待确认的大纲偏差裁决，发布门保持关闭。');
    case 'outline-detail-generation.apply':
      return makeIssue('pending-outline-change', 'hard', 'pending', '存在待确认的细纲变更，发布门保持关闭。');
    default:
      return undefined;
  }
}

function orderIssues(
  chapters: StructuralSnapshot['chapters'],
  cards: readonly CardRef[],
  issues: BookReadinessIssue[],
): void {
  const chapterIds = new Set<string>();
  const chapterIndexes = new Set<number>();
  chapters.forEach((chapter, position) => {
    if (chapterIds.has(chapter.id) || chapterIndexes.has(chapter.index) || chapter.index !== position + 1) {
      appendIssue(issues, makeIssue('order-integrity', 'hard', 'open', '章节顺序或编号不连续，无法建立全书发布范围。', { chapterId: chapter.id }));
    }
    chapterIds.add(chapter.id);
    chapterIndexes.add(chapter.index);
    const sceneIds = new Set<string>();
    chapter.scenes.forEach((scene, scenePosition) => {
      if (sceneIds.has(scene.id) || scene.index !== scenePosition) {
        appendIssue(issues, makeIssue('order-integrity', 'hard', 'open', '章节内场景顺序或编号不连续，无法建立全书发布范围。', { chapterId: chapter.id, sceneId: scene.id }));
      }
      sceneIds.add(scene.id);
    });
  });
  const knownSceneIds = new Set<string>();
  for (const chapter of chapters) {
    for (const scene of chapter.scenes) {
      if (knownSceneIds.has(scene.id)) appendIssue(issues, makeIssue('order-integrity', 'hard', 'open', '全书存在重复场景标识，无法建立唯一发布范围。', { chapterId: chapter.id, sceneId: scene.id }));
      knownSceneIds.add(scene.id);
    }
  }
  const cardIds = new Set<string>();
  for (const ref of cards) {
    if (cardIds.has(ref.card.detailBeat.id)) appendIssue(issues, makeIssue('order-integrity', 'hard', 'open', '全书存在重复细纲卡标识，无法建立唯一发布范围。', { detailBeatId: ref.card.detailBeat.id }));
    cardIds.add(ref.card.detailBeat.id);
  }
}

function reviewIssues(projection: ReviewProjection): readonly BookReadinessIssue[] {
  return projection.issues.map((issue) => makeIssue(
    issue.severity === 'hard' ? 'hard-review' : 'review-warning',
    issue.severity === 'hard' ? 'hard' : 'warning',
    issue.status,
    issue.message,
    issue.location === undefined ? {} : { chapterId: issue.location.chapterId, sceneId: issue.location.sceneId },
    issue.id,
  ));
}

async function readStructural(deps: BookCompletionDeps, projectId: string): Promise<StructuralSnapshot> {
  const [chapters, readiness, textFingerprint] = await Promise.all([
    deps.text.listChapters(projectId),
    deps.outline.readiness(projectId),
    deps.text.projectFingerprint(projectId),
  ]);
  let binding: StructuralSnapshot['binding'];
  try {
    binding = await deps.binding.read(projectId);
  } catch (cause) {
    if (readiness !== 'corrupt') throw cause;
    // A corrupt B5 cannot resolve computed bindings. Keep the result fail-closed
    // while retaining a valid, explicit fingerprint shape for the read projection.
    binding = { manual: [], effective: [], fingerprint: '0'.repeat(64) };
  }
  if (readiness === 'ready') {
    const outline = await deps.outline.read(projectId);
    let progress: OutlineProgress | undefined;
    try {
      progress = await deps.outline.readProgress(projectId);
    } catch {
      progress = undefined;
    }
    return {
      chapters,
      outline,
      progress,
      binding,
      textFingerprint,
      outlineFingerprint: await deps.outline.contentFingerprint(projectId),
    };
  }
  return { chapters, outline: undefined, progress: undefined, binding, textFingerprint, outlineFingerprint: null };
}

function structuralIssues(snapshot: StructuralSnapshot): { issues: BookReadinessIssue[]; cards: readonly CardRef[] } {
  const issues: BookReadinessIssue[] = [];
  if (snapshot.outline === undefined) {
    appendIssue(issues, makeIssue('outline-unavailable', 'hard', 'open', '全书缺少可用的 B5 大纲，发布门保持关闭。'));
    return { issues, cards: [] };
  }
  const cards = cardRefs(snapshot.outline);
  orderIssues(snapshot.chapters, cards, issues);
  if (snapshot.progress === undefined) {
    appendIssue(issues, makeIssue('missing-progress', 'hard', 'open', '全书缺少可用的 C6 执行进度，发布门保持关闭。'));
  }
  const sceneById = new Map(snapshot.chapters.flatMap((chapter) => chapter.scenes.map((scene) => [scene.id, { chapter, scene }] as const)));
  const bindingByScene = new Map(snapshot.binding.effective.map((binding) => [binding.sceneId, binding]));
  const bindingByCard = new Map(snapshot.binding.effective.map((binding) => [binding.detailBeatId, binding]));
  const cardById = new Map(cards.map((ref) => [ref.card.detailBeat.id, ref]));
  for (const chapter of snapshot.chapters) {
    for (const scene of chapter.scenes) {
      const binding = bindingByScene.get(scene.id);
      if (binding === undefined) {
        appendIssue(issues, makeIssue('missing-binding', 'hard', 'open', '正文场景没有对应细纲卡绑定。', { chapterId: chapter.id, sceneId: scene.id }));
      } else if (!cardById.has(binding.detailBeatId)) {
        appendIssue(issues, makeIssue('binding-target-missing', 'hard', 'open', '正文场景绑定的细纲卡已不存在。', { chapterId: chapter.id, sceneId: scene.id, detailBeatId: binding.detailBeatId }));
      }
      if (scene.content.trim().length === 0) appendIssue(issues, makeIssue('missing-prose', 'hard', 'open', '正文场景没有可发布的正文内容。', { chapterId: chapter.id, sceneId: scene.id }));
    }
  }
  for (const binding of snapshot.binding.effective) {
    const target = sceneById.get(binding.sceneId);
    if (target === undefined) {
      appendIssue(issues, makeIssue('binding-target-missing', 'hard', 'open', '细纲绑定指向不存在的正文场景。', { chapterId: binding.chapterId, sceneId: binding.sceneId, detailBeatId: binding.detailBeatId }));
    } else if (target.chapter.id !== binding.chapterId) {
      appendIssue(issues, makeIssue('binding-target-missing', 'hard', 'open', '细纲绑定记录的章节归属与正文不一致。', { chapterId: binding.chapterId, sceneId: binding.sceneId, detailBeatId: binding.detailBeatId }));
    }
  }
  if (snapshot.progress !== undefined) {
    const completedBeats = new Set(snapshot.progress.completedBeats);
    for (const act of snapshot.outline.acts) {
      for (const beat of act.beats) {
        if (!beat.optional && !completedBeats.has(beat.id)) {
          appendIssue(issues, { id: issueKey('incomplete-beat', beat.id), kind: 'incomplete-beat', severity: 'hard', status: 'open', message: `剧情节点「${beat.title}」尚未在 C6 中完成。` });
        }
      }
    }
    for (const ref of cards) {
      if (ref.beatOptional) continue;
      const detailBeat: DetailBeat = ref.card.detailBeat;
      const binding = bindingByCard.get(detailBeat.id);
      if (detailBeat.status !== 'done') {
        appendIssue(issues, makeIssue('incomplete-card', 'hard', 'open', `细纲卡「${detailBeat.title}」尚未完成。`, { detailBeatId: detailBeat.id, ...(binding === undefined ? {} : { chapterId: binding.chapterId, sceneId: binding.sceneId }) }));
      }
      if (binding === undefined) {
        appendIssue(issues, makeIssue('missing-binding', 'hard', 'open', `细纲卡「${detailBeat.title}」没有对应正文场景。`, { detailBeatId: detailBeat.id }));
      } else {
        const target = sceneById.get(binding.sceneId);
        if (target === undefined) appendIssue(issues, makeIssue('binding-target-missing', 'hard', 'open', `细纲卡「${detailBeat.title}」的正文目标不存在。`, { chapterId: binding.chapterId, sceneId: binding.sceneId, detailBeatId: detailBeat.id }));
        else if (target.scene.content.trim().length === 0) appendIssue(issues, makeIssue('missing-prose', 'hard', 'open', `细纲卡「${detailBeat.title}」缺少正文内容。`, { chapterId: target.chapter.id, sceneId: target.scene.id, detailBeatId: detailBeat.id }));
      }
    }
  }
  return { issues, cards };
}

function chapterPage(snapshot: StructuralSnapshot, cards: readonly CardRef[], page: BookReadinessPageInput) {
  const bindingByScene = new Map(snapshot.binding.effective.map((binding) => [binding.sceneId, binding]));
  const bindingByCard = new Map(snapshot.binding.effective.map((binding) => [binding.detailBeatId, binding]));
  const pageChapters = snapshot.chapters.slice(page.offset, page.offset + page.limit).map((chapter) => {
    const chapterSceneIds = new Set(chapter.scenes.map((scene) => scene.id));
    const chapterCards = cards.filter((ref) => {
      const binding = bindingByCard.get(ref.card.detailBeat.id);
      return binding?.chapterId === chapter.id || (binding === undefined && ref.card.detailBeat.id.length > 0 && stableSceneId(ref.card.actId, ref.card.beatId, ref.card.detailBeat.id) !== '' && chapterSceneIds.has(stableSceneId(ref.card.actId, ref.card.beatId, ref.card.detailBeat.id)));
    });
    return {
      chapterId: chapter.id,
      index: chapter.index,
      title: chapter.title,
      sceneCount: chapter.scenes.length,
      proseSceneCount: chapter.scenes.filter((scene) => scene.content.trim().length > 0).length,
      boundSceneCount: chapter.scenes.filter((scene) => bindingByScene.has(scene.id)).length,
      requiredCardCount: chapterCards.filter((ref) => !ref.beatOptional).length,
      completedCardCount: chapterCards.filter((ref) => !ref.beatOptional && ref.card.detailBeat.status === 'done').length,
    };
  });
  const nextOffset = page.offset + pageChapters.length < snapshot.chapters.length ? page.offset + pageChapters.length : null;
  return { offset: page.offset, limit: page.limit, total: snapshot.chapters.length, nextOffset, chapters: pageChapters };
}

function counts(snapshot: StructuralSnapshot, cards: readonly CardRef[], issues: readonly BookReadinessIssue[]) {
  return {
    chapters: snapshot.chapters.length,
    scenes: snapshot.chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
    requiredCards: cards.filter((ref) => !ref.beatOptional).length,
    completedCards: cards.filter((ref) => !ref.beatOptional && ref.card.detailBeat.status === 'done').length,
    boundCards: new Set(snapshot.binding.effective.map((binding) => binding.detailBeatId)).size,
    proseScenes: snapshot.chapters.reduce((total, chapter) => total + chapter.scenes.filter((scene) => scene.content.trim().length > 0).length, 0),
    hardIssues: issues.filter((issue) => issue.severity === 'hard').length,
    warningIssues: issues.filter((issue) => issue.severity === 'warning').length,
  };
}

function finalize(
  projectId: string,
  snapshot: StructuralSnapshot,
  cards: readonly CardRef[],
  page: BookReadinessPageInput,
  issues: readonly BookReadinessIssue[],
  review: BookReadinessResult['review'],
): BookReadinessResult {
  const frozenIssues = [...issues];
  const gateOpen = frozenIssues.every((issue) => issue.severity === 'warning' && issue.status === 'continued');
  return bookReadinessResultSchema.parse({
    projectId,
    status: gateOpen ? 'ready' : 'blocked',
    gateOpen,
    computedAt: new Date().toISOString(),
    page: chapterPage(snapshot, cards, page),
    counts: counts(snapshot, cards, frozenIssues),
    review,
    issues: frozenIssues,
    fingerprints: { text: snapshot.textFingerprint, outline: snapshot.outlineFingerprint, binding: snapshot.binding.fingerprint },
  });
}

export function createBookCompletionService(deps: BookCompletionDeps): NovelBookCompletionService {
  const compute = async (projectId: string, pageInput: BookReadinessPageInput | undefined, settings: unknown, withReview: boolean): Promise<BookReadinessResult> => {
    validateProjectId(projectId);
    const page = pageOf(pageInput);
    const snapshot = await readStructural(deps, projectId);
    const structural = structuralIssues(snapshot);
    const issues = structural.issues;
    for (const record of await deps.confirmation.pending(projectId)) {
      const issue = pendingIssue(record);
      if (issue !== undefined) appendIssue(issues, { ...issue, id: issueKey(issue.kind, record.id) });
    }
    for (const candidate of await deps.writing?.listActiveCandidates?.(projectId) ?? []) {
      appendIssue(issues, {
        ...makeIssue('pending-candidate', 'hard', 'pending', '存在待作者裁决的写作候选，发布门保持关闭。', { chapterId: candidate.chapterId, sceneId: candidate.sceneId }),
        id: issueKey('pending-candidate', candidate.candidateId),
      });
    }
    let review: BookReadinessResult['review'] = { status: 'not-run', total: 0, hard: 0, warning: 0 };
    if (withReview) {
      const projection = await deps.review.scan(projectId, settings);
      const projected = reviewIssues(projection);
      for (const issue of projected) appendIssue(issues, issue);
      review = {
        status: 'completed',
        total: projected.length,
        hard: projected.filter((issue) => issue.severity === 'hard').length,
        warning: projected.filter((issue) => issue.severity === 'warning').length,
      };
    }
    return finalize(projectId, snapshot, structural.cards, page, issues, review);
  };
  return Object.freeze({
    readiness: (projectId: string, page?: BookReadinessPageInput) => compute(projectId, page, undefined, false),
    scan: (projectId: string, page?: BookReadinessPageInput, settings?: unknown) => compute(projectId, page, settings, true),
  });
}
