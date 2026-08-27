import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type {
  OnboardingAcceptedLayer,
  OnboardingAdjudicateInput,
  OnboardingLayerKey,
  OnboardingLayerProposalPayload,
  OnboardingLayers,
} from '../../core/schema/onboarding.js';
import {
  onboardingAdjudicateInputSchema,
  onboardingCanonLayerSchema,
  onboardingCharacterLayerSchema,
  onboardingOutlineLayerSchema,
  onboardingRelationshipLayerSchema,
  onboardingStateLayerSchema,
  onboardingWorldviewLayerSchema,
  ONBOARDING_LAYER_KEYS,
} from '../../core/schema/onboarding.js';
import type { ConfirmationRecord } from '../../core/schema/confirm.js';
import type { NovelConfirmationService } from '../confirmation-service.js';

/**
 * I80 六层裁决状态机（design §14.7.4 / R11-4；架构审查 §4.1 / §3.3 / §9 #4 拆分）。
 *
 * 本模块持有 I53 的「4 种裁决语义 + 会话状态机」：`SessionState`（会话绑定三元组 +
 * 每层提案 id + 显式跳过集合）、`propose`（I11 Gate 提案，payload 携带绑定 provenance
 * 与 replacesId/mode 血统）、`adjudicate`（accept/edit/regenerate/skip 四裁决）、
 * `acceptedLayers`（已接受 Gate 记录的证据投影）。落地编排（finalApply）在组合根，
 * 经 `session()` 访问本机状态。
 *
 * 契约与不变式：
 * - 每操作绑定不可变的 `projectId / onboardingSessionId / sourceHash` 三元组；
 *   `session()` 在装载或命中时校验绑定，不匹配即 throw（I53 验收）。
 * - 每次持久决策都是 I11 Gate 提案；本模块是唯一把四种用户裁决映射到 Gate 的地方：
 *   accept 保持当前提案并 resolve accepted（空候选不可接受，I56/R12-3）；
 *   edit 拒绝当前提案后以用户 editedValue 精确建后继并立即 accepted；
 *   regenerate 拒绝当前提案后重跑单层并提出 pending 后继（fresh value 须再审）；
 *   skip 拒绝当前提案且不建后继（pending ≠ skip）。
 * - `assertCandidateable`（I56/R12-3 裁决门）：值须过该层 onboarding schema、
 *   至少一个候选、且遵守 B3 强制空契约（design §14.7.3）；返回解析后的规范值。
 */

/** 分析器暴露给裁决的只读输入面：装载会话 / 重跑单层。 */
export interface OnboardingLayerSource {
  getResult(onboardingSessionId: string): { projectId: string; onboardingSessionId: string; sourceHash: string; layers: OnboardingLayers } | undefined;
  /** Re-run one layer and return a fresh bound result (used by `regenerate`). */
  regenerate(onboardingSessionId: string, layer: OnboardingLayerKey, settings?: unknown): Promise<{ layers: OnboardingLayers }>;
}

/** 一个已装载会话的进程内状态：绑定三元组 + 每层提案/跳过记账。 */
export interface SessionState {
  projectId: string;
  onboardingSessionId: string;
  sourceHash: string;
  layers: OnboardingLayers;
  /** Active proposal id per layer, including the rejected record for an explicit skip. */
  proposalByLayer: Map<OnboardingLayerKey, string>;
  /** Only an explicit user rejection with no successor counts as skipped. */
  skippedLayers: Set<OnboardingLayerKey>;
}

/** 裁决核心公开能力：四裁决 / 已接受层投影 / 装载会话（组合根 finalApply 消费）。 */
export interface OnboardingAdjudicationCore {
  adjudicate(input: OnboardingAdjudicateInput, settings?: unknown): Promise<ConfirmationRecord>;
  acceptedLayers(onboardingSessionId: string): OnboardingAcceptedLayer[];
  /** 装载（或命中缓存）会话并强制绑定三元组一致；不匹配即 throw。 */
  session(binding: { projectId: string; onboardingSessionId: string; sourceHash: string }): SessionState;
}

const PROPOSAL_KIND = 'onboarding-layer';

export function createAdjudicationCore(
  confirmation: NovelConfirmationService,
  layerSource: OnboardingLayerSource | undefined,
): OnboardingAdjudicationCore {
  const sessions = new Map<string, SessionState>();

  const loadSession = (onboardingSessionId: string): SessionState => {
    const existing = sessions.get(onboardingSessionId);
    if (existing) return existing;
    if (!layerSource) throw new Error('Onboarding analyzer source is unavailable');
    const result = layerSource.getResult(onboardingSessionId);
    if (!result) throw new Error(`Unknown onboarding session: ${onboardingSessionId}`);
    const session: SessionState = {
      projectId: result.projectId,
      onboardingSessionId: result.onboardingSessionId,
      sourceHash: result.sourceHash,
      layers: result.layers,
      proposalByLayer: new Map(),
      skippedLayers: new Set(),
    };
    sessions.set(onboardingSessionId, session);
    return session;
  };

  const session = (binding: { projectId: string; onboardingSessionId: string; sourceHash: string }): SessionState => {
    const loaded = loadSession(binding.onboardingSessionId);
    if (loaded.projectId !== binding.projectId || loaded.sourceHash !== binding.sourceHash) {
      throw new Error('Onboarding binding mismatch: project/session/sourceHash must match exactly');
    }
    return loaded;
  };

  const layerValue = (layers: OnboardingLayers, layer: OnboardingLayerKey): unknown => layers[layer];

  const propose = (session: SessionState, layer: OnboardingLayerKey, value: unknown, lineage?: { replacesId: string | null; mode: 'edited' | 'regenerated'; feedback?: string }): Promise<ConfirmationRecord> => {
    const payload: OnboardingLayerProposalPayload & { replacesId?: string | null; mode?: string; feedback?: string } = {
      version: 1,
      provenance: { projectId: session.projectId, onboardingSessionId: session.onboardingSessionId, sourceHash: session.sourceHash, layer, schemaVersion: 1 },
      value: JSON.parse(JSON.stringify(value)) as OnboardingLayerProposalPayload['value'],
    };
    if (lineage) { payload.replacesId = lineage.replacesId; payload.mode = lineage.mode; if (lineage.feedback !== undefined) payload.feedback = lineage.feedback; }
    return confirmation.propose(session.projectId, { id: randomUUID(), kind: PROPOSAL_KIND, payload });
  };

  const adjudicate: OnboardingAdjudicationCore['adjudicate'] = async (input, settings) => {
    const parsed = onboardingAdjudicateInputSchema.parse(input);
    const session = loadSession(parsed.onboardingSessionId);
    if (session.projectId !== parsed.projectId || session.sourceHash !== parsed.sourceHash) {
      throw new Error('Onboarding binding mismatch: project/session/sourceHash must match exactly');
    }
    const layer = parsed.layer as OnboardingLayerKey;
    const priorId = session.proposalByLayer.get(layer);

    if (parsed.decision === 'skip') {
      let proposalId = priorId;
      if (proposalId === undefined) {
        const created = await propose(session, layer, layerValue(session.layers, layer));
        proposalId = created.id;
      }
      const record = confirmation.get(session.projectId, proposalId);
      if (record.status === 'pending') await confirmation.reject(session.projectId, proposalId);
      session.proposalByLayer.set(layer, proposalId);
      session.skippedLayers.add(layer);
      // Explicit skip is a durable I11 rejection with no successor.
      return confirmation.get(session.projectId, proposalId);
    }

    if (parsed.decision === 'accept') {
      // 空候选不能「接受」：没有可授权的候选，用户必须重生成或显式跳过（I56/R12-3）。
      const value = layerValue(session.layers, layer);
      assertCandidateable(layer, value, '接受');
      let proposalId = priorId;
      if (proposalId === undefined) {
        const created = await propose(session, layer, value);
        proposalId = created.id;
      }
      return confirmation.accept(session.projectId, proposalId).then((record) => {
        session.proposalByLayer.set(layer, proposalId!);
        session.skippedLayers.delete(layer);
        return record;
      });
    }

    if (parsed.decision === 'edit') {
      // 「修改后接受」必须提交真实 editedValue；Host 精确采用用户值，绝不回退
      // 写原候选（I56/R12-3，schema 层已强制 edit 必带 editedValue）。
      const edited = assertCandidateable(layer, parsed.editedValue, '修改后接受');
      if (priorId !== undefined) {
        const record = confirmation.get(session.projectId, priorId);
        if (record.status === 'pending') await confirmation.reject(session.projectId, priorId);
      }
      const successor = await propose(session, layer, edited, { replacesId: priorId ?? null, mode: 'edited' });
      session.proposalByLayer.set(layer, successor.id);
      session.skippedLayers.delete(layer);
      // 「手动修改后接受」: the edited, user-validated value is accepted now.
      return confirmation.accept(session.projectId, successor.id);
    }

    // regenerate: reject current, re-run the one layer, propose a pending successor.
    if (priorId !== undefined) {
      const record = confirmation.get(session.projectId, priorId);
      if (record.status === 'pending') await confirmation.reject(session.projectId, priorId);
    }
    const regeneratedLayers = await regenerateLayer(layerSource, session, layer, settings);
    session.layers = regeneratedLayers.layers;
    const successor = await propose(session, layer, layerValue(session.layers, layer), { replacesId: priorId ?? null, mode: 'regenerated', feedback: parsed.feedback });
    session.proposalByLayer.set(layer, successor.id);
    session.skippedLayers.delete(layer);
    return successor;
  };

  const acceptedLayers: OnboardingAdjudicationCore['acceptedLayers'] = (onboardingSessionId) => {
    const session = loadSession(onboardingSessionId);
    const accepted: OnboardingAcceptedLayer[] = [];
    for (const layer of ONBOARDING_LAYER_KEYS) {
      const proposalId = session.proposalByLayer.get(layer);
      if (proposalId === undefined) continue;
      const record = confirmation.get(session.projectId, proposalId);
      if (record.status !== 'accepted') continue;
      const payload = record.payload as { value?: unknown };
      const value = payload.value ?? layerValue(session.layers, layer);
      accepted.push({
        layer,
        proposalId,
        confidence: (session.layers[layer] as { confidence: OnboardingAcceptedLayer['confidence'] }).confidence,
        candidates: toCandidateJson(value),
      });
    }
    return accepted;
  };

  return Object.freeze({ adjudicate, acceptedLayers, session });
}

async function regenerateLayer(
  layerSource: OnboardingLayerSource | undefined,
  session: SessionState,
  layer: OnboardingLayerKey,
  settings?: unknown,
): Promise<{ layers: OnboardingLayers }> {
  if (!layerSource) throw new Error('Onboarding analyzer source is unavailable for regeneration');
  return layerSource.regenerate(session.onboardingSessionId, layer, settings);
}

/** Per-layer onboarding value schema, keyed by layer (edited values must reuse
 * the exact analyzer contract — no second layer model, design §14.7.3). */
const LAYER_VALUE_SCHEMAS: Record<OnboardingLayerKey, z.ZodType<OnboardingLayers[OnboardingLayerKey]>> = {
  characters: onboardingCharacterLayerSchema,
  worldview: onboardingWorldviewLayerSchema,
  outline: onboardingOutlineLayerSchema,
  relationship: onboardingRelationshipLayerSchema,
  state: onboardingStateLayerSchema,
  canon: onboardingCanonLayerSchema,
};

const LAYER_DISPLAY: Record<OnboardingLayerKey, string> = {
  characters: '角色（B3）',
  worldview: '世界观（B2）',
  outline: '大纲（B5）',
  relationship: '关系（C1）',
  state: '状态（C2）',
  canon: '正史（C4）',
};

/**
 * I56/R12-3 adjudication gate: a value may only be accepted (or edited) when it
 * parses against the layer's onboarding schema, carries at least one candidate
 * (空候选阻止裁决), and honours the B3 forced-empty contract (design §14.7.3:
 * `relationships` / `knowledgeIds` / `arc.keyBeats` stay empty, including for
 * manually edited proposals). Returns the parsed canonical value.
 */
export function assertCandidateable(layer: OnboardingLayerKey, value: unknown, verdict: string): OnboardingLayers[OnboardingLayerKey] {
  const parsed = LAYER_VALUE_SCHEMAS[layer].safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`${LAYER_DISPLAY[layer]}「${verdict}」的候选值不符合层契约${issues.length > 0 ? `（前 ${issues.length} 项：${issues.join('；')}）` : ''}；请修正候选值后重试，或整层重生成/显式跳过。`);
  }
  if (parsed.data.candidates.length === 0) {
    throw new Error(`${LAYER_DISPLAY[layer]}无候选，不能${verdict}；请整层重生成或显式跳过（空候选阻止裁决）。`);
  }
  if (layer === 'characters') {
    const candidates = parsed.data.candidates as OnboardingLayers['characters']['candidates'];
    for (const candidate of candidates) {
      if (candidate.relationships.length !== 0 || candidate.knowledgeIds.length !== 0 || candidate.arc.keyBeats.length !== 0) {
        throw new Error(`B3 角色 ${candidate.id} 必须保持 relationships/knowledgeIds/arc.keyBeats 为空（初始化合同 §14.7.3）。`);
      }
    }
  }
  return parsed.data;
}

/** 已接受层的候选证据投影：JSON 深拷贝为可独立持有的裸 JSON（I53 不变式）。 */
function toCandidateJson(value: unknown): OnboardingAcceptedLayer['candidates'] {
  const wrapper = value as { candidates?: unknown[] };
  if (!wrapper || !Array.isArray(wrapper.candidates)) return [];
  return wrapper.candidates.map((candidate) => JSON.parse(JSON.stringify(candidate)));
}
