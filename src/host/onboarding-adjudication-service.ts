import type {
  OnboardingAcceptedLayer,
  OnboardingAdjudicateInput,
  OnboardingApplyResult,
  OnboardingFinalApplyInput,
  OnboardingLayerKey,
} from '../core/schema/onboarding.js';
import {
  onboardingApplyResultSchema,
  onboardingFinalApplyInputSchema,
  ONBOARDING_LAYER_KEYS,
} from '../core/schema/onboarding.js';
import { APPLY_ORDER } from '../core/onboarding/apply.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import {
  createAdjudicationCore,
  type OnboardingAdjudicationCore,
  type OnboardingLayerSource,
  type SessionState,
} from './onboarding-adjudication/state-machine.js';
import { createLayerApplier, type LayerApplier, type Owners } from './onboarding-adjudication/apply-layers.js';

/**
 * I53 Host facade 组合根（design §14.7.4 / R11-4；架构审查 §4.1 / §3.3 / §9 #4 拆分）。
 *
 * I80 拆分后本文件只做编排：裁决状态机（4 种用户裁决 + 会话记账）在
 * `onboarding-adjudication/state-machine.ts`，跨层 preflight + 6 个 applyLayer 与
 * 类型化输入管线在 `onboarding-adjudication/apply-layers.ts`；本根持有公开服务面
 * （adjudicate / acceptedLayers / finalApply）与 finalApply 落地编排（pending 检查、
 * skipped/blocked 记账、APPLY_ORDER 循环、每层独立失败域），不直接持有领域写实现。
 *
 * 契约与不变式（与 I53/I56 完全一致）：
 * - 四裁决经 state-machine 映射到 I11 Gate：accept/edit/regenerate/skip（pending ≠
 *   skip；空候选不可接受，I56/R12-3；edit 精确采用用户 editedValue，不回退原候选）。
 * - `finalApply` 拒绝在任一层仍有 pending 提案时运行；随后按固定顺序
 *   B3→B2→B5→C2→C4→C1 应用已接受子集，每层独立失败域：被阻塞层不回滚已独立应用
 *   的层，重试只继续未完成层（无补偿删除），重复 apply 按领域身份幂等。
 * - 本组合根是唯一把四种裁决映射到 Gate 的地方（facade 注释 §14.7.4），其余模块
 *   只是切片；公开 Remote/wire 契约形状不变（I80 明确不做）。
 */

/** 组合根依赖：六层 Domain Service + I11 Gate owner。 */
export interface OnboardingOwners extends Owners {
  confirmation: NovelConfirmationService;
}

export interface NovelOnboardingAdjudicationService {
  /** Apply one user verdict for one layer; returns the terminal (or new pending) proposal record. */
  adjudicate(input: OnboardingAdjudicateInput, settings?: unknown): Promise<ConfirmationRecord>;
  /** The accepted layers (accepted Gate records) for a session. */
  acceptedLayers(onboardingSessionId: string): OnboardingAcceptedLayer[];
  /** Apply every accepted layer in fixed order; each layer is its own failure domain. */
  finalApply(input: OnboardingFinalApplyInput): Promise<OnboardingApplyResult>;
}

export function createOnboardingAdjudicationService(
  owners: OnboardingOwners,
  layerSource: OnboardingLayerSource | undefined,
): NovelOnboardingAdjudicationService {
  const core: OnboardingAdjudicationCore = createAdjudicationCore(owners.confirmation, layerSource);
  const applier: LayerApplier = createLayerApplier(owners);

  const finalApply: NovelOnboardingAdjudicationService['finalApply'] = async (input) => {
    const parsed = onboardingFinalApplyInputSchema.parse(input);
    const session: SessionState = core.session(parsed);

    const appliedLayers: OnboardingLayerKey[] = [];
    const skippedLayers: OnboardingLayerKey[] = [];
    const blockedLayers: OnboardingLayerKey[] = [];
    const pendingLayers: OnboardingLayerKey[] = [];
    const errors: string[] = [];

    // pending ≠ skip: any pending proposal blocks first apply.
    for (const layer of ONBOARDING_LAYER_KEYS) {
      const proposalId = session.proposalByLayer.get(layer);
      if (proposalId === undefined) {
        if (!session.skippedLayers.has(layer)) pendingLayers.push(layer);
        continue;
      }
      if (owners.confirmation.get(session.projectId, proposalId).status === 'pending') pendingLayers.push(layer);
    }
    if (pendingLayers.length > 0) {
      return onboardingApplyResultSchema.parse({
        projectId: parsed.projectId, onboardingSessionId: parsed.onboardingSessionId,
        appliedLayers, skippedLayers, blockedLayers, pendingLayers, retryable: false,
        errors: [`Pending layers block apply: ${pendingLayers.join(', ')}`],
      });
    }

    const accepted = core.acceptedLayers(parsed.onboardingSessionId);
    const byLayer = new Map<OnboardingLayerKey, OnboardingAcceptedLayer>(accepted.map((a) => [a.layer, a]));
    for (const layer of ONBOARDING_LAYER_KEYS) {
      // A layer is explicitly skipped when it has no accepted proposal AND no
      // active (pending) proposal — i.e. the user skipped or never proposed it.
      if (byLayer.has(layer)) continue;
      skippedLayers.push(layer);
    }

    // Fail closed: an accepted layer with no candidates has nothing to land
    // (I56/R12-3 空候选阻止 apply). Normal adjudication already blocks accept/
    // edit on empty layers; this guards any legacy/buggy accepted record.
    for (const [layer, item] of byLayer) {
      if (item.candidates.length === 0) {
        blockedLayers.push(layer);
        errors.push(`${layer}: accepted layer has no candidates — nothing to apply`);
      }
    }

    const existingCharacterIds = await applier.existingCharacters(parsed.projectId);
    // Full preflight is read-only: it classifies bad layers (and their
    // dependents) before the first Domain Service write, per design §14.7.4.
    const preflight = await applier.preflightAccepted(parsed.projectId, byLayer, existingCharacterIds);
    for (const [layer, message] of preflight) {
      blockedLayers.push(layer);
      errors.push(`${layer}: ${message}`);
    }
    const failed = new Set<OnboardingLayerKey>(blockedLayers);

    for (const layer of APPLY_ORDER) {
      const item = byLayer.get(layer);
      if (!item || failed.has(layer)) continue;
      if (applier.isDependentOnFailedLayer(layer, failed)) {
        failed.add(layer);
        blockedLayers.push(layer);
        errors.push(`${layer}: blocked by an earlier failed prerequisite layer`);
        continue;
      }
      try {
        await applier.applyLayer(layer, item, parsed.projectId, existingCharacterIds);
        appliedLayers.push(layer);
      } catch (cause) {
        failed.add(layer);
        blockedLayers.push(layer);
        errors.push(`${layer}: ${(cause as Error).message}`);
      }
    }

    return onboardingApplyResultSchema.parse({
      projectId: parsed.projectId, onboardingSessionId: parsed.onboardingSessionId,
      appliedLayers, skippedLayers, blockedLayers, pendingLayers,
      retryable: blockedLayers.length > 0, errors,
    });
  };

  return Object.freeze({
    adjudicate: core.adjudicate,
    acceptedLayers: core.acceptedLayers,
    finalApply,
  });
}

export type { OnboardingLayerSource } from './onboarding-adjudication/state-machine.js';
export { assertCandidateable } from './onboarding-adjudication/state-machine.js';
export type { Owners } from './onboarding-adjudication/apply-layers.js';
