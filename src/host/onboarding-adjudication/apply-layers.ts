import { z } from 'zod';
import type {
  OnboardingAcceptedLayer,
  OnboardingCanon,
  OnboardingCharacter,
  OnboardingLayerKey,
  OnboardingOutline,
  OnboardingRelationship,
  OnboardingState,
  OnboardingWorldview,
} from '../../core/schema/onboarding.js';
import {
  onboardingCanonSchema,
  onboardingCharacterSchema,
  onboardingOutlineSchema,
  onboardingRelationshipSchema,
  onboardingStateSchema,
  onboardingWorldviewSchema,
} from '../../core/schema/onboarding.js';
import type { WorldEntry } from '../../core/schema/worldview.js';
import type { WorldState } from '../../core/schema/state.js';
import type { CanonEventInput } from '../../core/schema/canon.js';
import { topologicalWorldviewOrder } from '../../core/onboarding/apply.js';
import type { NovelCharacterService } from '../character-service.js';
import type { NovelWorldviewService } from '../worldview-service.js';
import type { NovelOutlineService } from '../outline-service.js';
import type { NovelRelationshipService } from '../relationship-service.js';
import type { NovelStateService } from '../state-service.js';
import type { NovelCanonService } from '../canon-service.js';

/**
 * I80 六层落地段（design §14.7.4 / R11-4；架构审查 §4.1 / §3.3 / §9 #4 拆分）。
 *
 * 本模块是 onboarding 裁决的「跨层 preflight + 6 个 applyLayer」独立切片：组合根只做
 * 落地编排（pending/skipped/blocked 记账与 APPLY_ORDER 循环），一切领域写与引用预检
 * 都落在这里，且只经**类型化输入管线**进入 —— 已接受层的 `candidates`（`z.json()`
 * 裸值）先按该层 onboarding 候选 schema 复验为具体候选类型，再进预检/落地；不再有
 * `raw as unknown as XxxInput` 领域输入断言（I80 验收归零，审查 §3.3）。
 *
 * 语义不变式（与 I53/I56 完全一致）：
 * - apply 顺序由组合根按 `APPLY_ORDER`（B3→B2→B5→C2→C4→C1，core/onboarding/apply）
 *   驱动，本段只实现单层落地，不做顺序决策。
 * - 幂等由 Domain Service 的领域身份保证（create/append/save 拒绝重复 id；state
 *   事务收敛）；本段在写前对已存在 id 做语义等价比较，不等即 throw（该层失败域）。
 * - 每层独立失败域：本段任何 throw 由组合根捕获并记为该层 blocked，不跨层回滚。
 * - B3 强制空契约（design §14.7.3：relationships/knowledgeIds/arc.keyBeats 恒空）
 *   在预检与落地两处都 fail-closed。
 */

/** 六层落地所需的既有 Domain Service owner 集合。 */
export interface Owners {
  characters: NovelCharacterService;
  worldview: NovelWorldviewService;
  outline: NovelOutlineService;
  relationship: NovelRelationshipService;
  state: NovelStateService;
  canon: NovelCanonService;
}

/** 落地段公开能力：组合根（finalApply）消费的预检与单层落地。 */
export interface LayerApplier {
  /** 只读预检：分类坏层（及其依赖层），在任何 Domain Service 写之前（design §14.7.4）。 */
  preflightAccepted(
    projectId: string,
    byLayer: ReadonlyMap<OnboardingLayerKey, OnboardingAcceptedLayer>,
    existingCharacterIds: ReadonlySet<string>,
  ): Promise<Map<OnboardingLayerKey, string>>;
  /**
   * 应用一个已接受层；throw = 该层失败域（由组合根记账为 blocked）。
   * `existingCharacterIds` 是跨层共享的可变引用闭包：B3 落地后把新角色 id 追加进该
   * 集合，供后续 B5/C2/C4/C1 的引用校验消费（I53 语义，apply 前由组合根做一次
   * existingCharacters 读取）。
   */
  applyLayer(layer: OnboardingLayerKey, item: OnboardingAcceptedLayer, projectId: string, existingCharacterIds: Set<string>): Promise<void>;
  /** 读出现有 B3 id 集合（finalApply 预检/落地共用的一次读取）。 */
  existingCharacters(projectId: string): Promise<Set<string>>;
  /** 依赖判定：outline/state/canon 依赖 characters，relationship 依赖 characters+canon。 */
  isDependentOnFailedLayer(layer: OnboardingLayerKey, failed: ReadonlySet<OnboardingLayerKey>): boolean;
}

/**
 * 类型化输入管线：把已接受层的裸 `candidates`（`z.json()`）按该层 onboarding 候选
 * schema 复验为具体候选类型。合法记录（accept/edit/regenerate 路径均已按同一套 layer
 * schema 校验过）必然通过；损坏的遗留记录在此 fail loudly —— 替代旧 `as unknown as`
 * 断言的唯一类型边界（I80 §3.3 消除，合法记录行为等价，损坏记录从 TypeError 变为
 * 结构化契约错误）。
 */
function parseLayerCandidates<T>(schema: z.ZodType<T>, candidates: unknown[]): T[] {
  const parsed = z.array(schema).safeParse(candidates);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`Onboarding 已接受候选不符合层契约${issues.length > 0 ? `（前 ${issues.length} 项：${issues.join('；')}）` : ''}；请重生成该层后重试。`);
  }
  return parsed.data;
}

/** 每个已接受层按对应候选 schema 复验成类型化候选后进入落地。 */
const CANDIDATE_SCHEMAS: Record<OnboardingLayerKey, z.ZodType<unknown>> = {
  characters: onboardingCharacterSchema,
  worldview: onboardingWorldviewSchema,
  outline: onboardingOutlineSchema,
  relationship: onboardingRelationshipSchema,
  state: onboardingStateSchema,
  canon: onboardingCanonSchema,
};

export function createLayerApplier(owners: Owners): LayerApplier {
  const existingCharacters = async (projectId: string): Promise<Set<string>> => {
    const list = await owners.characters.list(projectId);
    return new Set(list.map((character) => character.id));
  };

  const preflightAccepted: LayerApplier['preflightAccepted'] = async (projectId, byLayer, existingCharacterIds) => {
    const failed = new Map<OnboardingLayerKey, string>();
    const b3 = byLayer.get('characters');
    const b3Candidates = b3
      ? parseLayerCandidates(CANDIDATE_SCHEMAS.characters as z.ZodType<OnboardingCharacter>, b3.candidates)
      : [];
    // 引用闭包：已接受 B3 候选 id ∪ 既有 B3 id（B5/B2/C4/C1 预检共同消费）。
    const characterIds = new Set<string>([...existingCharacterIds, ...b3Candidates.map((candidate) => candidate.id)]);

    if (b3) {
      for (const candidate of b3Candidates) {
        if (candidate.relationships.length || candidate.knowledgeIds.length || candidate.arc.keyBeats.length) {
          failed.set('characters', `B3 candidate ${candidate.id} contains forbidden forward references`); break;
        }
        if (existingCharacterIds.has(candidate.id)) {
          const current = await owners.characters.read(projectId, candidate.id);
          if (JSON.stringify(stripVersion(current)) !== JSON.stringify(candidate)) {
            failed.set('characters', `B3 candidate id conflicts with an existing character: ${candidate.id}`); break;
          }
        }
      }
    }

    const b2 = byLayer.get('worldview');
    if (b2) {
      try {
        const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.worldview as z.ZodType<OnboardingWorldview>, b2.candidates);
        const existing = await owners.worldview.list(projectId);
        const existingIds = new Set(existing.map((entry) => entry.id));
        topologicalWorldviewOrder(candidates, existingIds);
        for (const candidate of candidates) {
          if (!existingIds.has(candidate.id)) continue;
          const current = await owners.worldview.read(projectId, candidate.id);
          if (JSON.stringify(stripStorage(current)) !== JSON.stringify(candidate)) throw new Error(`B2 candidate id conflicts with an existing entry: ${candidate.id}`);
        }
      } catch (cause) { failed.set('worldview', (cause as Error).message); }
    }

    const b5 = byLayer.get('outline');
    if (b5) {
      const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.outline as z.ZodType<OnboardingOutline>, b5.candidates);
      const outline = candidates[0];
      if (!outline) failed.set('outline', 'B5 outline candidate is missing');
      else {
        const beatIds = new Set<string>();
        for (const act of outline.acts) for (const beat of act.beats) {
          if (beatIds.has(beat.id)) failed.set('outline', `Duplicate B5 beat id: ${beat.id}`);
          beatIds.add(beat.id);
          for (const id of beat.charactersInvolved) if (!characterIds.has(id)) failed.set('outline', `B5 references unknown B3: ${id}`);
          for (const detail of beat.detailBeats) if (!characterIds.has(detail.pov)) failed.set('outline', `B5 references unknown B3: ${detail.pov}`);
          for (const id of beat.prerequisites) if (!beatIds.has(id)) failed.set('outline', `B5 prerequisites references unknown beat: ${id}`);
        }
        for (const entry of outline.foreshadowing) for (const id of entry.knownBy) if (!characterIds.has(id)) failed.set('outline', `B5 foreshadowing references unknown B3: ${id}`);
      }
    }

    const c2 = byLayer.get('state');
    if (c2) {
      const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.state as z.ZodType<OnboardingState>, c2.candidates);
      const candidate = candidates[0];
      if (!candidate) failed.set('state', 'C2 state candidate is missing');
      else for (const entry of candidate.characters) if (!characterIds.has(entry.characterId)) failed.set('state', `C2 references unknown B3: ${entry.characterId}`);
    }

    const c4 = byLayer.get('canon');
    const canonCandidates = c4
      ? parseLayerCandidates(CANDIDATE_SCHEMAS.canon as z.ZodType<OnboardingCanon>, c4.candidates)
      : [];
    const existingCanonIds = new Set(owners.canon.query(projectId).map((event) => event.id));
    const acceptedCanonIds = new Set(canonCandidates.map((candidate) => candidate.id));
    for (const candidate of canonCandidates) {
      for (const id of candidate.participants) if (!characterIds.has(id)) failed.set('canon', `C4 references unknown B3: ${id}`);
      for (const id of candidate.consequences) if (!acceptedCanonIds.has(id) && !existingCanonIds.has(id)) failed.set('canon', `C4 consequence references unavailable C4: ${id}`);
    }

    const c1 = byLayer.get('relationship');
    if (c1) {
      const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.relationship as z.ZodType<OnboardingRelationship>, c1.candidates);
      for (const candidate of candidates) {
        for (const id of [candidate.from, candidate.to, ...candidate.knownTo]) if (!characterIds.has(id)) failed.set('relationship', `C1 references unknown B3: ${id}`);
        for (const id of candidate.milestones) if (!acceptedCanonIds.has(id) && !existingCanonIds.has(id)) failed.set('relationship', `C1 milestone references unavailable C4: ${id}`);
      }
    }
    return failed;
  };

  const applyLayer: LayerApplier['applyLayer'] = async (layer, item, projectId, existingCharacterIds) => {
    switch (layer) {
      case 'characters': return applyCharacters(projectId, item, existingCharacterIds);
      case 'worldview': return applyWorldview(projectId, item);
      case 'outline': return applyOutline(projectId, item, existingCharacterIds);
      case 'state': return applyState(projectId, item, existingCharacterIds);
      case 'canon': return applyCanon(projectId, item, existingCharacterIds);
      case 'relationship': return applyRelationship(projectId, item, existingCharacterIds);
    }
  };

  async function applyCharacters(projectId: string, item: OnboardingAcceptedLayer, existing: Set<string>): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.characters as z.ZodType<OnboardingCharacter>, item.candidates);
    for (const candidate of candidates) {
      if (candidate.relationships.length || candidate.knowledgeIds.length || candidate.arc.keyBeats.length) {
        throw new Error(`B3 candidate ${candidate.id} must keep relationships/knowledgeIds/arc.keyBeats empty`);
      }
      if (existing.has(candidate.id)) {
        // 幂等：语义相等的既有角色视为已落地（领域身份 create 拒绝重复 id）。
        const current = await owners.characters.read(projectId, candidate.id);
        if (JSON.stringify(stripVersion(current)) !== JSON.stringify(candidate)) {
          throw new Error(`B3 candidate id conflicts with an existing character: ${candidate.id}`);
        }
        continue;
      }
      await owners.characters.create(projectId, candidate);
      existing.add(candidate.id);
    }
  }

  async function applyWorldview(projectId: string, item: OnboardingAcceptedLayer): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.worldview as z.ZodType<OnboardingWorldview>, item.candidates);
    const existing = await owners.worldview.list(projectId);
    const existingIds = new Set(existing.map((entry) => entry.id));
    const order = topologicalWorldviewOrder(candidates, existingIds);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    for (const id of order) {
      const candidate = byId.get(id)!;
      // OnboardingWorldview 省略 Host-owned status/supersededBy；create() 需要它们。
      const input = { ...candidate, status: 'active' as const, supersededBy: null };
      if (existingIds.has(id)) {
        const current = await owners.worldview.read(projectId, id);
        if (JSON.stringify(stripStorage(current)) !== JSON.stringify(candidate)) {
          throw new Error(`B2 candidate id conflicts with an existing entry: ${id}`);
        }
        continue;
      }
      await owners.worldview.create(projectId, input);
    }
  }

  async function applyOutline(projectId: string, item: OnboardingAcceptedLayer, characterIds: ReadonlySet<string>): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.outline as z.ZodType<OnboardingOutline>, item.candidates);
    const outline = candidates[0];
    if (!outline) throw new Error('B5 outline candidate is missing');
    const beatIds = new Set<string>();
    for (const act of outline.acts) {
      for (const beat of act.beats) {
        if (beatIds.has(beat.id)) throw new Error(`Duplicate B5 beat id: ${beat.id}`);
        beatIds.add(beat.id);
        for (const id of beat.charactersInvolved) if (!characterIds.has(id)) throw new Error(`B5 charactersInvolved references unknown B3: ${id}`);
        for (const detail of beat.detailBeats) if (!characterIds.has(detail.pov)) throw new Error(`B5 detailBeats.pov references unknown B3: ${detail.pov}`);
      }
    }
    for (const act of outline.acts) {
      for (const beat of act.beats) {
        for (const id of beat.prerequisites) if (!beatIds.has(id)) throw new Error(`B5 prerequisites references unknown beat: ${id}`);
      }
    }
    for (const f of outline.foreshadowing) {
      for (const id of f.knownBy) if (!characterIds.has(id)) throw new Error(`B5 foreshadowing.knownBy references unknown B3: ${id}`);
    }
    const readiness = await owners.outline.readiness(projectId);
    if (readiness === 'ready') {
      const current = await owners.outline.read(projectId);
      if (JSON.stringify(stripVersion(current)) === JSON.stringify(outline)) return;
      throw new Error('B5 candidate conflicts with an existing outline');
    }
    if (readiness === 'corrupt') throw new Error('B5 existing outline is corrupt');
    await owners.outline.save(projectId, outline);
  }

  async function applyState(projectId: string, item: OnboardingAcceptedLayer, characterIds: ReadonlySet<string>): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.state as z.ZodType<OnboardingState>, item.candidates);
    const candidate = candidates[0];
    if (!candidate) throw new Error('C2 state candidate is missing');
    for (const char of candidate.characters) {
      if (!characterIds.has(char.characterId)) throw new Error(`C2 characters reference unknown B3: ${char.characterId}`);
    }
    const current = owners.state.current(projectId);
    if (stateEquals(current, candidate)) return;
    await owners.state.transaction(projectId, (draft) => {
      draft.storyTime = candidate.storyTime;
      draft.scene = candidate.scene;
      draft.characters = candidate.characters;
    });
  }

  async function applyCanon(projectId: string, item: OnboardingAcceptedLayer, characterIds: ReadonlySet<string>): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.canon as z.ZodType<OnboardingCanon>, item.candidates);
    for (const candidate of candidates) {
      for (const id of candidate.participants) if (!characterIds.has(id)) throw new Error(`C4 participants references unknown B3: ${id}`);
      try {
        await owners.canon.append(projectId, candidate);
      } catch (cause) {
        // 幂等：重复 id 表示该事件已 append；语义相等即视为已落地。
        if (!/Duplicate canon event id/.test((cause as Error).message)) throw cause;
        const existing = owners.canon.query(projectId).find((event) => event.id === candidate.id);
        if (!existing || !canonEquals(existing, candidate)) throw cause;
      }
    }
  }

  async function applyRelationship(projectId: string, item: OnboardingAcceptedLayer, characterIds: ReadonlySet<string>): Promise<void> {
    const candidates = parseLayerCandidates(CANDIDATE_SCHEMAS.relationship as z.ZodType<OnboardingRelationship>, item.candidates);
    const existing = await owners.relationship.read(projectId);
    const existingById = new Map(existing.map((entry) => [entry.id, entry]));
    const canonIds = new Set(owners.canon.query(projectId).map((event) => event.id));
    for (const candidate of candidates) {
      for (const id of [candidate.from, candidate.to, ...candidate.knownTo]) if (!characterIds.has(id)) throw new Error(`C1 from/to/knownTo references unknown B3: ${id}`);
      for (const id of candidate.milestones) if (!canonIds.has(id)) throw new Error(`C1 milestones references unknown C4: ${id}`);
      const current = existingById.get(candidate.id);
      if (current) {
        if (JSON.stringify(stripVersion(current)) !== JSON.stringify(candidate)) throw new Error(`C1 candidate id conflicts with an existing relationship: ${candidate.id}`);
        continue;
      }
      await owners.relationship.save(projectId, candidate);
    }
  }

  return Object.freeze({ preflightAccepted, applyLayer, existingCharacters, isDependentOnFailedLayer });
}

/** 依赖判定：outline/state/canon 依赖 characters；relationship 依赖 characters+canon。 */
function isDependentOnFailedLayer(layer: OnboardingLayerKey, failed: ReadonlySet<OnboardingLayerKey>): boolean {
  if (layer === 'outline' || layer === 'state' || layer === 'canon') return failed.has('characters');
  if (layer === 'relationship') return failed.has('characters') || failed.has('canon');
  return false;
}

function stripVersion<T extends { version?: number }>(value: T): Omit<T, 'version'> {
  const { version: _version, ...rest } = value;
  return rest;
}

/** 剥离 Host-owned 持久化字段（version/status/supersededBy）后与候选输入比较。 */
function stripStorage(value: WorldEntry): Omit<WorldEntry, 'version' | 'status' | 'supersededBy'> {
  const { version: _v, status: _s, supersededBy: _sp, ...rest } = value;
  return rest;
}

/** C2 语义等价：忽略 seq/version 后 storyTime+scene+characters 完全一致。 */
function stateEquals(current: WorldState, candidate: OnboardingState): boolean {
  return current.storyTime === candidate.storyTime
    && JSON.stringify(current.scene) === JSON.stringify(candidate.scene)
    && JSON.stringify(current.characters) === JSON.stringify(candidate.characters);
}

/** 比较存储的 CanonEvent 与候选输入，忽略账本自有字段（seq/immutable/supersedes）。 */
function canonEquals(existing: CanonEventInput, candidate: CanonEventInput): boolean {
  return existing.storyTime === candidate.storyTime
    && existing.kind === candidate.kind
    && existing.summary === candidate.summary
    && existing.detail === candidate.detail
    && JSON.stringify(existing.participants) === JSON.stringify(candidate.participants)
    && existing.location === candidate.location
    && JSON.stringify(existing.consequences) === JSON.stringify(candidate.consequences)
    && JSON.stringify(existing.affectedLayers) === JSON.stringify(candidate.affectedLayers);
}
