import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateProjectId } from '../core/io/path.js';
import { projectOutlineProgress, type OutlineProgressProjection } from '../core/outline/projection.js';
import { directionSchema, type InspirationDirection } from './inspiration-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelInspirationService } from './inspiration-service.js';
import type { OutlineDeviation } from '../core/schema/outline-progress.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';

/**
 * I68 C6 进度与灵感方向落地 Host owner（design §14.10「C6 与灵感落地」/ R14-3）。
 *
 * 产品语义：
 * - `projection`：B5 骨架 + C6 执行态的最小 owned 进度投影（幕/节/场景卡完成
 *   状态、已完成节、偏差、导航指令与一致性判定）；只读零写。
 * - `recordDeviation` / `reconcileDeviation`：作者记录/调和结构偏差 —— 只写 C6
 *   （OutlineProgressRepository），B5 永不因偏差被改写（N-5）。
 * - `inspire`：显式「灵感时刻」—— 复用 I45 灵感 agent（零写，只产 2–3 个可区分
 *   方向）；上下文由当前进度投影组装，方向选项不写回正史。
 * - `select`：作者选定方向后写入 I11 ConfirmationGate（pending；未确认零写）。
 *   方向以 strict schema 复验后作为 Gate payload 持久化（与 I66 同模式）。
 * - `apply`：Gate 确认后受控写回 —— 只改授权的 B5（logline/themes）与 C6
 *   （追加一条偏差记录），并复用 I45 `inspirationService.apply` 的 accepted-Gate
 *   校验。幂等：C6 偏差 id 为 `${proposalId}-deviation`，重复 apply（含重启后
 *   重放）检测到该标记即 no-op，不重复写任何层。
 * - `reject`：Gate 拒绝，B5/C6 零写。`pending`：待确认方向（重载一致）。
 * - `audit`：审计记录 —— 该作品全部 inspiration.apply 裁决（accepted/rejected），
 *   按持久化插入顺序来自 I11 Gate（design §14.10「刷新与审计记录」）。
 *
 * 契约与不变式：
 * - 所有写都经 outlineService（B5/C6 唯一写 owner）与 ConfirmationGate；本服务
 *   不直接改文件。Client 只持有最小 owned JSON，方向 payload 只来自 Gate 持久化
 *   记录（accept 时从 record.payload 解析，不接受 Client 事后替换）。
 * - 无在飞任务（inspire 的 LLM 流由 I45 服务管理并支持 AbortSignal）；onDispose
 *   保留为生命周期挂钩（H0-6）。
 */

export interface ProgressInspirationDeps {
  readonly outline: NovelOutlineService;
  readonly confirmation: NovelConfirmationService;
  readonly inspiration: NovelInspirationService;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
}

/** 记录偏差的输入：id 可选（缺省由 Host 生成稳定 id），其余与 C6 schema 一致。 */
export interface DeviationRecordInput {
  readonly planned: string;
  readonly actual: string;
  readonly reason: string;
  readonly id?: string;
}

/** 待确认方向提案视图（最小 owned JSON）。 */
export interface InspirationProposalView {
  readonly proposalId: string;
  readonly direction: InspirationDirection;
  readonly status: 'pending';
}

/** 审计记录视图：一条持久化裁决（accepted/rejected）及所选择的方向。 */
export interface InspirationAuditView {
  readonly proposalId: string;
  readonly status: 'accepted' | 'rejected';
  readonly direction: InspirationDirection;
}

export interface InspirationSelectInput {
  readonly direction: InspirationDirection;
}

export interface NovelProgressInspirationService {
  projection(projectId: string): Promise<OutlineProgressProjection>;
  recordDeviation(projectId: string, input: DeviationRecordInput): Promise<OutlineProgressProjection>;
  reconcileDeviation(projectId: string, deviationId: string): Promise<OutlineProgressProjection>;
  inspire(projectId: string, prompt?: string, signal?: AbortSignal): Promise<{ projectId: string; directions: readonly InspirationDirection[] }>;
  select(projectId: string, input: InspirationSelectInput): Promise<{ projectId: string; proposalId: string; direction: InspirationDirection; status: 'pending' }>;
  apply(projectId: string, proposalId: string): Promise<{ projectId: string; proposalId: string; applied: boolean; projection: OutlineProgressProjection; audit: readonly InspirationAuditView[] }>;
  reject(projectId: string, proposalId: string): Promise<{ projectId: string; proposalId: string; status: 'rejected' }>;
  pending(projectId: string): Promise<{ proposals: readonly InspirationProposalView[] }>;
  audit(projectId: string): Promise<{ records: readonly InspirationAuditView[] }>;
}

export const INSPIRATION_APPLY_KIND = 'inspiration.apply';

/** 生成稳定、合法的提案 id（≤64 且匹配 entityId；保证 `${proposalId}-deviation` 也合法）。 */
export function inspirationProposalId(directionId: string, now = Date.now()): string {
  const safe = directionId.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'dir';
  return `insp-${safe.slice(0, 18)}-${now}`;
}

function parseDirection(payload: unknown): InspirationDirection {
  try {
    return directionSchema.parse(payload);
  } catch (cause) {
    throw new Error('Invalid inspiration.apply proposal payload', { cause });
  }
}

/** 组装灵感 agent 上下文：当前导航 + 场景卡进度 + 未调和偏差（最小摘要，不塞整份 B5）。 */
function buildInspirationContext(projection: OutlineProgressProjection): string {
  const currentBeat = projection.acts
    .flatMap((act) => act.beats)
    .find((beat) => beat.id === projection.navigation.beatId);
  const scenes = currentBeat === undefined || currentBeat.sceneCards.length === 0
    ? '（无场景卡）'
    : currentBeat.sceneCards.map((card) => `- ${card.title}（${card.status}${card.wordTarget ? `，目标 ${card.wordTarget} 字` : ''}）`).join('\n');
  const openDeviations = projection.deviations.filter((deviation) => !deviation.reconciled);
  return [
    `当前大纲：${projection.acts.length} 幕，${projection.completedBeats.length} 节已完成。`,
    `当前导航目标：${projection.navigation.title}（${projection.navigation.description}）`,
    `场景卡：\n${scenes}`,
    openDeviations.length === 0 ? '无未调和偏差。' : `未调和偏差：${openDeviations.map((deviation) => deviation.id).join('、')}。`,
  ].join('\n');
}

export function createProgressInspirationService(deps: ProgressInspirationDeps): NovelProgressInspirationService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const opened = new Set<string>();
  const dispose = (): void => { opened.clear(); };
  deps.onDispose?.(dispose);

  const ensureOpen = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    if (opened.has(projectId)) return;
    await deps.outline.open(projectId);
    await deps.confirmation.open(projectId);
    opened.add(projectId);
  };

  const projectionOf = async (projectId: string): Promise<OutlineProgressProjection> => {
    const outline = await deps.outline.read(projectId);
    const progress = await deps.outline.readProgress(projectId);
    return projectOutlineProgress(outline, progress);
  };

  const proposalView = (record: ConfirmationRecord): InspirationProposalView =>
    Object.freeze({ proposalId: record.id, direction: parseDirection(record.payload), status: 'pending' });

  const auditView = async (projectId: string): Promise<readonly InspirationAuditView[]> => {
    const records = deps.confirmation.list(projectId)
      .filter((record) => record.kind === INSPIRATION_APPLY_KIND && record.status !== 'pending');
    return Object.freeze(records.map((record) => Object.freeze({
      proposalId: record.id,
      status: record.status as 'accepted' | 'rejected',
      direction: parseDirection(record.payload),
    })));
  };

  const service: NovelProgressInspirationService = {
    async projection(projectId: string) {
      await ensureOpen(projectId);
      return projectionOf(projectId);
    },
    async recordDeviation(projectId: string, input: DeviationRecordInput) {
      await ensureOpen(projectId);
      const deviation: OutlineDeviation = {
        id: input.id ?? `dev-${Date.now()}`,
        planned: input.planned.trim(),
        actual: input.actual.trim(),
        reason: input.reason.trim(),
        reconciled: false,
      };
      await deps.outline.recordDeviation(projectId, deviation);
      return projectionOf(projectId);
    },
    async reconcileDeviation(projectId: string, deviationId: string) {
      await ensureOpen(projectId);
      await deps.outline.reconcileDeviation(projectId, deviationId);
      return projectionOf(projectId);
    },
    async inspire(projectId: string, prompt?: string, signal?: AbortSignal) {
      await ensureOpen(projectId);
      const projection = await projectionOf(projectId);
      const result = await deps.inspiration.propose(
        { prompt: prompt?.trim() || '给出 2–3 个可区分的剧情发展方向，并说明对大纲与细纲的调整建议。', context: buildInspirationContext(projection) },
        signal,
      );
      return Object.freeze({ projectId, directions: Object.freeze(result.directions.map((direction) => structuredClone(direction))) });
    },
    async select(projectId: string, input: InspirationSelectInput) {
      await ensureOpen(projectId);
      const direction = directionSchema.parse(input.direction);
      const proposalId = inspirationProposalId(direction.id);
      await deps.confirmation.propose(projectId, { id: proposalId, kind: INSPIRATION_APPLY_KIND, payload: direction });
      return Object.freeze({ projectId, proposalId, direction, status: 'pending' });
    },
    async apply(projectId: string, proposalId: string) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.accept(projectId, proposalId);
      if (record.kind !== INSPIRATION_APPLY_KIND) throw new Error(`Invalid inspiration.apply proposal kind: ${record.kind}`);
      const direction = parseDirection(record.payload);
      const outline = await deps.outline.read(projectId);
      const progress = await deps.outline.readProgress(projectId);
      const deviationMarker = `${proposalId}-deviation`;
      if (progress.deviations.some((deviation) => deviation.id === deviationMarker)) {
        // 幂等：该提案此前已生效（重复 apply / 重启后重放）→ no-op，不重复写 B5/C6。
        return Object.freeze({ projectId, proposalId, applied: false, projection: await projectionOf(projectId), audit: await auditView(projectId) });
      }
      await deps.inspiration.apply({
        projectId,
        proposalId,
        direction,
        confirmation: record,
        outline,
        progress,
        saveOutline: async (value) => deps.outline.save(projectId, value),
        saveProgress: async (value) => deps.outline.saveProgress(projectId, value),
      });
      return Object.freeze({ projectId, proposalId, applied: true, projection: await projectionOf(projectId), audit: await auditView(projectId) });
    },
    async reject(projectId: string, proposalId: string) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      if (record.kind !== INSPIRATION_APPLY_KIND) throw new Error(`Invalid inspiration.apply proposal kind: ${record.kind}`);
      return Object.freeze({ projectId, proposalId, status: 'rejected' });
    },
    async pending(projectId: string) {
      await ensureOpen(projectId);
      const proposals = deps.confirmation.pending(projectId)
        .filter((record) => record.kind === INSPIRATION_APPLY_KIND)
        .map(proposalView);
      return Object.freeze({ proposals: Object.freeze(proposals) });
    },
    async audit(projectId: string) {
      await ensureOpen(projectId);
      return Object.freeze({ records: await auditView(projectId) });
    },
  };
  return Object.freeze(service);
}
