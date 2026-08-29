import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  isKnowledgeChangeSatisfied,
  knowledgeChangeInputSchema,
  knowledgePovHint,
  knowledgeProposalId,
  nextKnowledgeDocument,
  validateKnowledgeChange,
  type KnowledgeChangeInput,
  type KnowledgeChangeKind,
} from '../core/knowledge/actions.js';
import type { KnowledgeEntry, KnowledgeKind, KnowledgeStatus } from '../core/schema/knowledge.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';

/**
 * I66 C3 知情与揭示管理面 Host owner（design §14.10「C3 知情与揭示」/ R14-1）。
 *
 * 产品语义：
 * - `list`：按事实与角色双视图投影 —— 事实（fact/kind/status/holders/
 *   revealPlan/POV 边界提示）与角色（characterId/name/knows 计数）；只返回
 *   最小 owned JSON，绝不序列化完整 live object 或文件路径。
 * - `read`：单条事实详情（holders/planned 带角色名 + 该事实的 pending 提案）。
 * - `propose`：唯一揭示 / holder 变更提案入口 —— 先对当前 C3 文档 fail-fast
 *   校验（未知 entry/角色、已知情 holder、逆向 status 全部零写拒绝），再写入
 *   I11 ConfirmationGate（pending）。未确认前 C3 零写。
 * - `accept`：Gate 确认后受控写回 —— 复用 KnowledgeRepository.saveAll 的
 *   assertKnowledgeOnlyAdvances（知情只增不退）；变更已生效时幂等 no-op。
 * - `reject`：Gate 拒绝，C3 零写。
 * - `pending`：待确认提案只读列表（重载一致：Gate 持久化，新实例可见）。
 *
 * 契约与不变式：
 * - POV 边界：本服务只经 KnowledgeRepository 读全量 C3 文档（作者全知管理面），
 *   绝不调用单角色 POV 过滤入口 —— 不把过滤后的角色视图混入管理投影，
 *   也不绕过 KnowledgeFilter 的知情边界（holder 变更保持 holders/knows 镜像）。
 * - 无在飞任务：accept/reject 是单步持久操作，无需 Fiber 级中止；onDispose
 *   保留为生命周期挂钩（H0-6）。
 */
export interface KnowledgeManagerDeps {
  readonly knowledge: NovelKnowledgeService;
  readonly characters: NovelCharacterService;
  readonly confirmation: NovelConfirmationService;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
}

export interface KnowledgeEntryView {
  readonly id: string;
  readonly fact: string;
  readonly kind: KnowledgeKind;
  readonly status: KnowledgeStatus;
  readonly holders: readonly string[];
  readonly revealPlan: { readonly revealTo: readonly string[]; readonly revealAt: string };
  /** POV 边界提示（作者视角速览，由 Host 解析角色名生成）。 */
  readonly povHint: string;
}

export interface KnowledgeCharacterView {
  readonly characterId: string;
  readonly name: string;
  readonly knows: readonly string[];
}

export interface KnowledgeProjection {
  readonly projectId: string;
  readonly entries: readonly KnowledgeEntryView[];
  readonly characters: readonly KnowledgeCharacterView[];
  readonly summary: {
    readonly total: number;
    readonly hidden: number;
    readonly partiallyRevealed: number;
    readonly revealed: number;
    readonly withPlan: number;
  };
}

export interface KnowledgeNamedRef {
  readonly characterId: string;
  readonly name: string;
}

export interface KnowledgeProposalView {
  readonly proposalId: string;
  readonly kind: KnowledgeChangeKind;
  readonly entryId: string;
  readonly holders: readonly string[];
  readonly status?: KnowledgeStatus;
  readonly revealAt?: string;
}

export interface KnowledgeEntryDetail {
  readonly projectId: string;
  readonly entry: KnowledgeEntryView;
  readonly holders: readonly KnowledgeNamedRef[];
  readonly planned: readonly KnowledgeNamedRef[];
  readonly pendingProposals: readonly KnowledgeProposalView[];
}

export interface KnowledgeProposeOutcome {
  readonly projectId: string;
  readonly proposalId: string;
  readonly kind: KnowledgeChangeKind;
  readonly status: 'pending';
  /** 提案生效后的事实预览（确认前展示预期结果）。 */
  readonly preview: KnowledgeEntryView;
}

export interface KnowledgeApplyOutcome {
  readonly projectId: string;
  readonly proposalId: string;
  readonly applied: boolean;
  /** 写回后的最新投影（无需再次 list）。 */
  readonly projection: KnowledgeProjection;
}

export interface KnowledgeRejectOutcome {
  readonly projectId: string;
  readonly proposalId: string;
  readonly status: 'rejected';
}

export interface NovelKnowledgeManagerService {
  list(projectId: string): Promise<KnowledgeProjection>;
  read(projectId: string, entryId: string): Promise<KnowledgeEntryDetail>;
  propose(projectId: string, input: KnowledgeChangeInput): Promise<KnowledgeProposeOutcome>;
  accept(projectId: string, proposalId: string): Promise<KnowledgeApplyOutcome>;
  reject(projectId: string, proposalId: string): Promise<KnowledgeRejectOutcome>;
  pending(projectId: string): Promise<readonly KnowledgeProposalView[]>;
}

const PROPOSAL_KIND = 'knowledge-change';

export function createKnowledgeManagerService(deps: KnowledgeManagerDeps): NovelKnowledgeManagerService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const opened = new Set<string>();
  const dispose = () => { opened.clear(); };
  deps.onDispose?.(dispose);

  const ensureOpen = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    if (opened.has(projectId)) return;
    await deps.knowledge.open(projectId);
    await deps.characters.open(projectId);
    await deps.confirmation.open(projectId);
    opened.add(projectId);
  };

  const entryView = (entry: KnowledgeEntry, nameOf: ReadonlyMap<string, string>): KnowledgeEntryView => Object.freeze({
    id: entry.id,
    fact: entry.fact,
    kind: entry.kind,
    status: entry.status,
    holders: Object.freeze([...entry.holders]),
    revealPlan: Object.freeze({ revealTo: Object.freeze([...entry.revealPlan.revealTo]), revealAt: entry.revealPlan.revealAt }),
    povHint: knowledgePovHint(entry, nameOf),
  });

  const projection = async (projectId: string): Promise<KnowledgeProjection> => {
    const document = await deps.knowledge.read(projectId);
    const characters = await deps.characters.list(projectId);
    const nameOf = new Map(characters.map((character) => [character.id, character.name]));
    const entries = document.entries.map((entry) => entryView(entry, nameOf));
    const stateByCharacter = new Map(document.states.map((state) => [state.characterId, state.knows]));
    const characterViews = characters.map((character) => Object.freeze({
      characterId: character.id,
      name: character.name,
      knows: Object.freeze([...(stateByCharacter.get(character.id) ?? [])]),
    }));
    const summary = {
      total: entries.length,
      hidden: entries.filter((entry) => entry.status === 'hidden').length,
      partiallyRevealed: entries.filter((entry) => entry.status === 'partially-revealed').length,
      revealed: entries.filter((entry) => entry.status === 'revealed').length,
      withPlan: entries.filter((entry) => entry.revealPlan.revealTo.length > 0).length,
    };
    return Object.freeze({ projectId, entries: Object.freeze(entries), characters: Object.freeze(characterViews), summary: Object.freeze(summary) });
  };

  const proposalView = (input: KnowledgeChangeInput, proposalId: string): KnowledgeProposalView =>
    input.kind === 'reveal'
      ? Object.freeze({ proposalId, kind: input.kind, entryId: input.entryId, holders: Object.freeze([...input.holders]), status: input.status, revealAt: input.revealAt })
      : Object.freeze({ proposalId, kind: input.kind, entryId: input.entryId, holders: Object.freeze([...input.holders]) });

  const parseProposal = (payload: unknown): KnowledgeChangeInput => {
    try {
      return knowledgeChangeInputSchema.parse(payload);
    } catch (cause) {
      throw new Error('Invalid knowledge-change proposal payload', { cause });
    }
  };

  const service: NovelKnowledgeManagerService = {
    async list(projectId: string) {
      await ensureOpen(projectId);
      return projection(projectId);
    },
    async read(projectId: string, entryId: string) {
      await ensureOpen(projectId);
      const document = await deps.knowledge.read(projectId);
      const entry = document.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error(`Unknown knowledge entry: ${entryId}`);
      const characters = await deps.characters.list(projectId);
      const nameOf = new Map(characters.map((character) => [character.id, character.name]));
      const named = (ids: readonly string[]): KnowledgeNamedRef[] =>
        ids.map((id) => Object.freeze({ characterId: id, name: nameOf.get(id) ?? id }));
      const pending = (await deps.confirmation.pending(projectId))
        .filter((record) => record.kind === PROPOSAL_KIND)
        .map((record) => ({ record, input: parseProposal(record.payload) }))
        .filter(({ input }) => input.entryId === entryId)
        .map(({ record, input }) => proposalView(input, record.id));
      return Object.freeze({
        projectId,
        entry: entryView(entry, nameOf),
        holders: Object.freeze(named(entry.holders)),
        planned: Object.freeze(named(entry.revealPlan.revealTo)),
        pendingProposals: Object.freeze(pending),
      });
    },
    async propose(projectId: string, input: KnowledgeChangeInput) {
      await ensureOpen(projectId);
      const parsed = knowledgeChangeInputSchema.parse(input);
      const document = await deps.knowledge.read(projectId);
      const validIds = new Set((await deps.characters.list(projectId)).map((character) => character.id));
      validateKnowledgeChange(document, parsed, validIds);
      const proposalId = knowledgeProposalId(parsed.entryId, Date.now());
      await deps.confirmation.propose(projectId, { id: proposalId, kind: PROPOSAL_KIND, payload: parsed });
      const previewEntry = nextKnowledgeDocument(document, parsed).entries.find((item) => item.id === parsed.entryId)!;
      const names = new Map((await deps.characters.list(projectId)).map((character) => [character.id, character.name]));
      return Object.freeze({ projectId, proposalId, kind: parsed.kind, status: 'pending', preview: entryView(previewEntry, names) });
    },
    async accept(projectId: string, proposalId: string) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.accept(projectId, proposalId);
      if (record.kind !== PROPOSAL_KIND) throw new Error(`Invalid knowledge-change proposal kind: ${record.kind}`);
      const input = parseProposal(record.payload);
      const document = await deps.knowledge.read(projectId);
      if (isKnowledgeChangeSatisfied(document, input)) {
        // 幂等：变更已生效（重复 accept / 重启后重放）→ no-op，不重复写 C3。
        return Object.freeze({ projectId, proposalId, applied: false, projection: await projection(projectId) });
      }
      const validIds = new Set((await deps.characters.list(projectId)).map((character) => character.id));
      validateKnowledgeChange(document, input, validIds);
      const next = nextKnowledgeDocument(document, input);
      await deps.knowledge.saveAll(projectId, next.entries, next.states);
      return Object.freeze({ projectId, proposalId, applied: true, projection: await projection(projectId) });
    },
    async reject(projectId: string, proposalId: string) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      if (record.kind !== PROPOSAL_KIND) throw new Error(`Invalid knowledge-change proposal kind: ${record.kind}`);
      return Object.freeze({ projectId, proposalId, status: 'rejected' });
    },
    async pending(projectId: string) {
      await ensureOpen(projectId);
      const records = await deps.confirmation.pending(projectId);
      return Object.freeze(records
        .filter((record) => record.kind === PROPOSAL_KIND)
        .map((record) => proposalView(parseProposal(record.payload), record.id)));
    },
  };
  return Object.freeze(service);
}
