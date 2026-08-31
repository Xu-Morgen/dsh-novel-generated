import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLocalizedEditService, type LocalizedEditResult, type ReparseRequest } from './edit-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { GenerationSettings } from '../llm/port/index.js';
import { asLlmBackend } from '../llm/port/index.js';
import { parseC2StateFromNarrative } from '../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative } from '../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative } from '../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative } from '../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative } from '../llm/parse/worldview.js';
import { buildFiveLayerWriters } from './five-layer-writeback.js';
import type { Scene } from '../core/schema/text.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import { fingerprintEdit, type EditRange } from '../core/edit/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import {
  assertStructuralPreviewPlanFresh,
  consumeStructuralPreviewPlan,
  prepareStructuralPreviewPlan,
  scanStructuralPreviewCommit,
  structuralPreviewFingerprint,
  type StructuralPreviewFreshnessInput,
  type StructuralPreviewLayerBaseline,
  type StructuralPreviewPlan,
} from './writing-adjudication/structural-preview-plan.js';

/** I61 重解析 fan-out 的层顺序（与 I30 生命周期一致，design §6.6）。 */
export const REPARSE_LAYERS = ['c2', 'c1', 'c3', 'c4', 'b2'] as const;
export type ReparseLayer = (typeof REPARSE_LAYERS)[number];

export interface ReparseProposeResult {
  readonly proposalId: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
}

export interface ReparseAcceptResult {
  readonly status: 'written';
  readonly scene: Scene;
  readonly layers: readonly ReparseLayer[];
}

export interface ReparsePostScan {
  readonly status: 'pending' | 'matched' | 'mismatch';
  readonly mismatchedLayers: readonly ReparseLayer[];
  readonly sourceMatched: boolean;
}

/** Client-safe projection of a session-only reparse plan. */
export interface ReparseLayerPreview {
  readonly proposalId: string;
  readonly range: EditRange;
  readonly replacement: string;
  readonly sourceHash: string;
  readonly targetHash: string;
  readonly generationBaseline: StructuralPreviewPlan['generationBaseline'];
  readonly changes: StructuralPreviewPlan['changes'];
  readonly postScan: ReparsePostScan;
}

export interface TextEditDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly confirmation: NovelConfirmationService;
  /** I110/I111 outline evidence owners; omitted only by legacy direct compositions. */
  readonly sceneOutlineBinding?: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly outlineGenerationBaseline?: NovelOutlineGenerationBaselineService;
  /** Test-only repository seam for exercising C5 landing failure/retry without a second owner. */
  readonly repositoryFactory?: (projectDirectory: string) => TextRepository;
  /** 解析当前活动生成设置（modelRef/credentialRef），供五个 parser 经 Host `ctx.llm` 路由。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  readonly onDispose?: (dispose: () => void) => void;
}

export interface NovelTextEditService {
  open(projectId: string): Promise<void>;
  /**
   * I42 固定范围逐字保存（design §5.12 / R13-2）：只写 C5 文本，绝不隐式修改
   * 任何结构层。`baseHash` 为客户端装载正文时的 SHA-256；当前文本哈希不一致时
   * 拒绝（脏文本保护，防止陈旧草稿覆盖并发写入）。
   */
  edit(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, baseHash?: string): Promise<LocalizedEditResult>;
  /** I111 prepares the frozen five-layer projection while the I11 proposal remains pending. */
  reparsePreview(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, baseHash?: string, signal?: AbortSignal): Promise<ReparseLayerPreview>;
  /**
   * 显式重解析：把「范围修改」作为 I11 提案交给 ConfirmationGate（kind
   * `localized-reparse`，payload 含 before/after 指纹）。未确认不解析、不写层。
   * proposalId 由 Host 按 (原文, 范围, 替换) 确定性生成；同一编辑重复提议幂等
   * 返回既有提案（不重复调用 Gate.propose）。
   */
  reparsePropose(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, baseHash?: string): Promise<ReparseProposeResult>;
  /**
   * 确认并应用重解析：先经 I11 幂等 accept，再走既有 parser fan-out（I25–I29 的
   * parser 函数 + 既有 Domain Service writers，design §14.9），最后写 C5 文本。
   * 未确认、拒绝或非法范围一律零写。`baseHash` 在 accept 时再次核对当前文本：
   * propose 与 accept 之间正文被其他写入者改动时拒绝（脏文本保护）。
   */
  reparseAccept(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, proposalId: string, baseHash?: string): Promise<ReparseAcceptResult>;
  /** 显式拒绝已提出的重解析：Gate 置 rejected，零写。 */
  reparseReject(projectId: string, proposalId: string): Promise<{ readonly proposalId: string; readonly status: 'rejected' }>;
}

/**
 * I61 C5 正文编辑与可选 reparse 的 Host owner（design §5.12 / §14.9 / R13-2）。
 *
 * 职责与不变式：
 * - `edit` 复用 I42 `createLocalizedEditService.edit`（逐字精确、范围外不变），
 *   外加 `baseHash` 脏文本保护；它只写 C5，不触达 B2/C1/C2/C3/C4。
 * - `reparsePropose` / `reparseAccept` / `reparseReject` 复用 I42 的
 *   propose/apply 状态机与 I11 Gate：accept 是唯一用户确认；未确认/拒绝时
 *   parsers 与 writers 一律不执行（拒绝零写）。
 * - 确认后的 fan-out 只复用既有 parser 函数（I25–I29）与既有 Domain Service
 *   writers（与 I30 生命周期 / agent-tools 同一批函数），不新增第二套解析或
 *   写入语义（R2-7「NarrativeParser 独立于正文生成」）。
 * - B2 改写保持 confirmation-first：writer 经共享 ConfirmationGate 提出并接受
 *   `b2-worldview-parser-supersedes` 提案后再经既有改写服务落盘。
 * - 低置信结构化变更 fail-closed（抛错），与 agent-tools 同一策略。
 * - proposalId 确定性生成：`scene-reparse-<sha256(chapterId|sceneId|range|replacement|beforeHash)>`
 *   —— 同一次编辑的 propose/accept 引用同一提案；重复提议幂等返回既有提案，
 *   不重复调用 Gate.propose（Gate replay 语义保留给业务无关的重复 id）。
 */
export function createTextEditService(deps: TextEditDeps): NovelTextEditService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const backend = asLlmBackend(deps.llm);
  const editService = createLocalizedEditService(deps.llm, projectsRoot, deps.onDispose);
  const repositoryFactory = deps.repositoryFactory ?? ((directory: string) => new TextRepository(directory));
  const opened = new Set<string>();
  const repositories = new Map<string, TextRepository>();
  interface ReparseSession {
    readonly plan: StructuralPreviewPlan;
    readonly range: EditRange;
    readonly replacement: string;
    readonly targetHash: string;
    structuredApplied: boolean;
    postScan: ReparsePostScan;
    result?: ReparseAcceptResult;
  }
  const reparseSessions = new Map<string, ReparseSession>();

  const ensureOpen = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    if (opened.has(projectId)) return;
    await editService.open(projectId);
    opened.add(projectId);
  };
  const repository = async (projectId: string): Promise<TextRepository> => {
    validateProjectId(projectId);
    let repo = repositories.get(projectId);
    if (repo === undefined) {
      repo = repositoryFactory(projectDirectory(projectsRoot, projectId));
      await repo.open();
      repositories.set(projectId, repo);
    }
    return repo;
  };

  const hash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

  const assertRange = (content: string, range: EditRange): void => {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end > content.length) {
      throw new Error(`Invalid UTF-16 text range: ${range.start}-${range.end}`);
    }
  };

  const assertBaseHash = (actual: string, baseHash: string | undefined, projectId: string, chapterId: string, sceneId: string): void => {
    if (baseHash !== undefined && hash(actual) !== baseHash) {
      throw new Error(`正文已变化（脏文本保护）：请刷新 ${projectId}/${chapterId}/${sceneId} 后重试`);
    }
  };

  const proposalIdFor = (chapterId: string, sceneId: string, range: EditRange, replacement: string, beforeHash: string): string => {
    const digest = createHash('sha256')
      .update([chapterId, sceneId, String(range.start), String(range.end), replacement, beforeHash].join('\u0000'), 'utf8')
      .digest('hex')
      .slice(0, 24);
    return `scene-reparse-${digest}`;
  };

  const readScene = async (projectId: string, chapterId: string, sceneId: string): Promise<{ readonly repository: TextRepository; readonly scene: Scene }> => {
    const repo = await repository(projectId);
    const chapter = await repo.readChapter(chapterId);
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
    return { repository: repo, scene };
  };

  const readLayerBaselines = async (projectId: string): Promise<StructuralPreviewLayerBaseline[]> => {
    const [state, relationships, knowledge, canon, worldview] = await Promise.all([
      Promise.resolve(deps.state.current(projectId)),
      deps.relationship.read(projectId),
      deps.knowledge.read(projectId),
      Promise.resolve(deps.canon.query(projectId)),
      deps.worldview.list(projectId),
    ]);
    return [
      { layer: 'c2', snapshot: state, fingerprint: structuralPreviewFingerprint(state) },
      { layer: 'c1', snapshot: relationships, fingerprint: structuralPreviewFingerprint(relationships) },
      { layer: 'c3', snapshot: { entries: [...knowledge.entries], states: [...knowledge.states] }, fingerprint: structuralPreviewFingerprint({ entries: [...knowledge.entries], states: [...knowledge.states] }) },
      { layer: 'c4', snapshot: [...canon], fingerprint: structuralPreviewFingerprint([...canon]) },
      { layer: 'b2', snapshot: worldview, fingerprint: structuralPreviewFingerprint(worldview) },
    ];
  };

  const generationBaselineFor = async (projectId: string, chapterId: string, sceneId: string): Promise<StructuralPreviewPlan['generationBaseline']> => {
    if (deps.sceneOutlineBinding === undefined || deps.outlineGenerationBaseline === undefined) return { kind: 'no-outline-baseline' };
    const binding = await deps.sceneOutlineBinding.read(projectId);
    const owned = binding.effective.find((item) => item.chapterId === chapterId && item.sceneId === sceneId);
    if (owned === undefined) return { kind: 'no-outline-baseline' };
    const result = await deps.outlineGenerationBaseline.current(projectId, {
      chapterId, sceneId, detailBeatId: owned.detailBeatId,
    });
    if (result.freshness === 'stale') {
      throw new Error(`Stale outline generation baseline for reparse ${sceneId}: ${result.staleReasons.join(', ')}`);
    }
    if (result.baseline === null) throw new Error(`Reparse target requires a current outline generation baseline: ${sceneId}/${owned.detailBeatId}`);
    return {
      kind: 'baseline', generationBaselineId: result.baseline.baselineId, baselineRevision: result.baseline.revision,
      detailBeatId: result.baseline.detailBeatId, b5ContentFingerprint: result.baseline.b5ContentFingerprint,
      bindingFingerprint: result.baseline.bindingFingerprint,
    };
  };

  const currentFreshness = async (projectId: string, chapterId: string, sceneId: string): Promise<StructuralPreviewFreshnessInput> => {
    const { scene } = await readScene(projectId, chapterId, sceneId);
    const baselines = await readLayerBaselines(projectId);
    return {
      sourceHash: hash(scene.content),
      generationBaseline: await generationBaselineFor(projectId, chapterId, sceneId),
      layerFingerprints: Object.fromEntries(baselines.map((baseline) => [baseline.layer, baseline.fingerprint])) as StructuralPreviewFreshnessInput['layerFingerprints'],
    };
  };

  const assertProposalPayload = (record: ConfirmationRecord, chapterId: string, sceneId: string, range: EditRange, replacement: string): void => {
    const payload = record.payload as { chapterId?: string; sceneId?: string; range?: EditRange; replacement?: string };
    if (payload.chapterId !== chapterId || payload.sceneId !== sceneId
      || payload.replacement !== replacement || payload.range?.start !== range.start || payload.range?.end !== range.end) {
      throw new Error(`Reparse preview does not match proposal ${record.id}`);
    }
  };

  const previewProjection = (session: ReparseSession): ReparseLayerPreview => Object.freeze({
    proposalId: session.plan.candidateId,
    range: Object.freeze({ ...session.range }),
    replacement: session.replacement,
    sourceHash: session.plan.sourceHash,
    targetHash: session.targetHash,
    generationBaseline: session.plan.generationBaseline,
    changes: session.plan.changes,
    postScan: session.postScan,
  });

  /** 确认后的 fan-out：真实 parser 闭包（I25–I29）作用于「编辑后」正文。 */
  const buildParsers = (
    projectId: string,
    prose: string,
    settings: GenerationSettings,
    signal?: AbortSignal,
  ): ReparseRequest['parsers'] => ({
    c2: () => parseC2StateFromNarrative(backend, { prose, state: deps.state.current(projectId) }, settings, signal),
    c1: async () => parseC1RelationshipsFromNarrative(backend, { prose, current: await deps.relationship.read(projectId) }, settings, signal),
    c3: async () => parseC3KnowledgeFromNarrative(backend, { prose, ...(await deps.knowledge.read(projectId)) }, settings, signal),
    c4: () => parseC4CanonFromNarrative(backend, { prose, canon: deps.canon.query(projectId) }, settings, signal),
    b2: async () => parseB2WorldviewFromNarrative(backend, { prose, current: await deps.worldview.list(projectId) }, settings, signal),
  });

  /** 既有 Domain Service 写回器（与 I30 / agent-tools 同一批函数，C2→C1→C3→C4→B2；共享实现见 five-layer-writeback，I79 复制源归零）。 */
  const buildWriters = (projectId: string, reparseProposalId: string): ReparseRequest['writers'] => buildFiveLayerWriters(
    { state: deps.state, relationship: deps.relationship, knowledge: deps.knowledge, canon: deps.canon, worldview: deps.worldview, confirmation: deps.confirmation },
    projectId,
    reparseProposalId,
    // I61 语义：B2 ops 为空时跳过 Gate 提案（空改写不产生空提案审计噪音）。
    { skipEmptyB2Proposal: true },
  );

  const prepareReparseSession = async (
    projectId: string,
    chapterId: string,
    sceneId: string,
    range: EditRange,
    replacement: string,
    proposalId: string,
    baseHash: string | undefined,
    signal?: AbortSignal,
  ): Promise<ReparseSession> => {
    const { scene } = await readScene(projectId, chapterId, sceneId);
    assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
    assertRange(scene.content, range);
    const evidence = fingerprintEdit(scene.content, range, replacement);
    const layerBaselines = await readLayerBaselines(projectId);
    const generationBaseline = await generationBaselineFor(projectId, chapterId, sceneId);
    const settings = await deps.resolveSettings();
    const prose = scene.content.slice(0, range.start) + replacement + scene.content.slice(range.end);
    const parsers = buildParsers(projectId, prose, settings, signal);
    const [c2, c1, c3, c4, b2] = await Promise.all([parsers.c2(), parsers.c1(), parsers.c3(), parsers.c4(), parsers.b2()]);
    const plan = prepareStructuralPreviewPlan({
      planId: `reparse-${proposalId}`, projectId, candidateId: proposalId, sourceHash: evidence.before,
      generationBaseline, layerBaselines, parserOutputs: { c2, c1, c3, c4, b2 }, createdAt: new Date().toISOString(),
    });
    return {
      plan,
      range: Object.freeze({ ...range }),
      replacement,
      targetHash: evidence.after,
      structuredApplied: false,
      postScan: Object.freeze({ status: 'pending', mismatchedLayers: Object.freeze([]), sourceMatched: false }),
    };
  };

  const postScan = async (
    session: ReparseSession,
    projectId: string,
    chapterId: string,
    sceneId: string,
  ): Promise<void> => {
    const { scene } = await readScene(projectId, chapterId, sceneId);
    const baselines = await readLayerBaselines(projectId);
    const structural = scanStructuralPreviewCommit(session.plan, baselines);
    const sourceMatched = hash(scene.content) === session.targetHash;
    const mismatchedLayers = structural.mismatchedLayers;
    session.postScan = Object.freeze({
      status: structural.status === 'matched' && sourceMatched ? 'matched' : 'mismatch',
      mismatchedLayers: Object.freeze([...mismatchedLayers]),
      sourceMatched,
    });
    if (session.postScan.status !== 'matched') {
      const owners = mismatchedLayers.length > 0 ? ` layers=${mismatchedLayers.join(',')}` : '';
      const source = sourceMatched ? '' : ' source';
      throw new Error(`Reparse post-commit scan mismatch:${source}${owners}`);
    }
  };

  const service: NovelTextEditService = {
    async open(projectId) {
      await ensureOpen(projectId);
      await repository(projectId);
    },
    async edit(projectId, chapterId, sceneId, range, replacement, baseHash) {
      await ensureOpen(projectId);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      return editService.edit(projectId, chapterId, sceneId, range, replacement);
    },
    async reparsePreview(projectId, chapterId, sceneId, range, replacement, baseHash, signal) {
      await ensureOpen(projectId);
      const { scene } = await readScene(projectId, chapterId, sceneId);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      assertRange(scene.content, range);
      const proposalId = proposalIdFor(chapterId, sceneId, range, replacement, hash(scene.content));
      const existing = reparseSessions.get(proposalId);
      if (existing !== undefined) return previewProjection(existing);
      const record = deps.confirmation.get(projectId, proposalId);
      if (record.status === 'rejected') throw new Error(`Reparse proposal is rejected: ${proposalId}`);
      if (record.status !== 'pending') throw new Error(`Reparse proposal is already ${record.status}: ${proposalId}`);
      assertProposalPayload(record, chapterId, sceneId, range, replacement);
      const session = await prepareReparseSession(projectId, chapterId, sceneId, range, replacement, proposalId, baseHash, signal);
      reparseSessions.set(proposalId, session);
      return previewProjection(session);
    },
    async reparsePropose(projectId, chapterId, sceneId, range, replacement, baseHash) {
      await ensureOpen(projectId);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      assertRange(scene.content, range);
      const beforeHash = hash(scene.content);
      const proposalId = proposalIdFor(chapterId, sceneId, range, replacement, beforeHash);
      // 幂等提议：同一编辑（原文+范围+替换确定同一 proposalId）重复提议直接返回
      // 既有提案记录，绝不重复调用 Gate.propose（replay 由 Gate 语义保留）。
      let record: ConfirmationRecord;
      try {
        record = deps.confirmation.get(projectId, proposalId);
      } catch {
        // propose 阶段不解析、不写层、不解析设置：占位闭包只满足 I42 契约
        // （I42 proposeReparse 仅消费 id/projectId/chapterId/sceneId/range/replacement）。
        const noopParse = async (): Promise<{ ops: never[] }> => ({ ops: [] });
        const noopWrite = async (): Promise<void> => undefined;
        const request: ReparseRequest = {
          id: proposalId, projectId, chapterId, sceneId, range, replacement,
          parsers: { c2: noopParse, c1: noopParse, c3: noopParse, c4: noopParse, b2: noopParse },
          writers: { c2: noopWrite, c1: noopWrite, c3: noopWrite, c4: noopWrite, b2: noopWrite },
        };
        record = await editService.proposeReparse(request);
      }
      return Object.freeze({ proposalId: record.id, status: record.status });
    },
    async reparseAccept(projectId, chapterId, sceneId, range, replacement, proposalId, baseHash) {
      await ensureOpen(projectId);
      const session = reparseSessions.get(proposalId);
      if (session?.result !== undefined) return session.result;
      if (session?.postScan.status === 'mismatch') throw new Error(`Reparse post-commit scan mismatch: ${proposalId}`);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      assertRange(scene.content, range);
      if (session !== undefined) {
        if (session.range.start !== range.start || session.range.end !== range.end || session.replacement !== replacement) {
          throw new Error(`Reparse accept does not match prepared preview: ${proposalId}`);
        }
        if (!session.structuredApplied) {
          const current = await currentFreshness(projectId, chapterId, sceneId);
          assertStructuralPreviewPlanFresh(session.plan, current);
          // 唯一用户确认：I11 accept 幂等；preview plan 已在 Gate pending 时冻结。
          await deps.confirmation.accept(projectId, proposalId);
          try {
            await consumeStructuralPreviewPlan(session.plan, current, buildWriters(projectId, proposalId));
            session.structuredApplied = true;
          } catch (cause) {
            throw new Error(`Reparse structured writeback failed before C5; retry requires the same proposal ${proposalId}`, { cause });
          }
        } else {
          // If C5 failed after the structural writeback committed, retry only the
          // missing C5 landing. Requiring the original plan baseline here would
          // incorrectly reject the already-applied five-layer delta as stale.
          const record = deps.confirmation.get(projectId, proposalId);
          if (record.status !== 'accepted') throw new Error(`Reparse structured writeback is not accepted: ${proposalId}`);
          const structural = scanStructuralPreviewCommit(session.plan, await readLayerBaselines(projectId));
          if (structural.status !== 'matched') throw new Error(`Reparse structured writeback changed before C5 retry: ${proposalId}`);
        }
        let appliedScene: Scene;
        try {
          const latest = await readScene(projectId, chapterId, sceneId);
          assertBaseHash(latest.scene.content, baseHash, projectId, chapterId, sceneId);
          appliedScene = await latest.repository.replaceRange(chapterId, sceneId, range, replacement);
        } catch (cause) {
          throw new Error(`C5 reparse landing failed after structured writeback; retry accept resumes C5 only: ${proposalId}`, { cause });
        }
        await postScan(session, projectId, chapterId, sceneId);
        const result = Object.freeze({ status: 'written' as const, scene: appliedScene, layers: REPARSE_LAYERS });
        session.result = result;
        return result;
      }
      // Legacy callers may still accept directly without the new preview seam;
      // preserve I61 parser timing and result shape for those clients.
      const prose = scene.content.slice(0, range.start) + replacement + scene.content.slice(range.end);
      const settings = await deps.resolveSettings();
      const request: ReparseRequest = {
        id: proposalId, projectId, chapterId, sceneId, range, replacement,
        parsers: buildParsers(projectId, prose, settings),
        writers: buildWriters(projectId, proposalId),
      };
      await deps.confirmation.accept(projectId, proposalId);
      const applied = await editService.applyAcceptedReparse(request);
      return Object.freeze({ status: 'written' as const, scene: applied.scene, layers: REPARSE_LAYERS });
    },
    async reparseReject(projectId, proposalId) {
      await ensureOpen(projectId);
      reparseSessions.delete(proposalId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      return Object.freeze({ proposalId: record.id, status: 'rejected' as const });
    },
  };
  return Object.freeze(service);
}
