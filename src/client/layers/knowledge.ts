import type { El, KnowledgeNamespace } from '../shared.js';

/**
 * I66 C3 知情与揭示管理面面板（design §14.10「C3 知情与揭示」/ R14-1）。
 *
 * 作者按事实与角色查看 holders/revealPlan/status，并受控执行揭示或 holder 变更：
 * - 双视图：`data-novel-knowledge-view` = facts（事实视图：fact/kind/status/
 *   holders/规划揭示/POV 边界提示）或 characters（角色视图：角色名 + 已知事实）；
 * - 揭示 / holder 变更提案：选择一条事实 → 勾选新增知情角色（可另选更高 status
 *   与 revealAt）→ 「发起揭示提案」`data-novel-knowledge-propose`（reveal）或
 *   「发起 holder 变更提案」（holder-add）—— 全部先经 Host 校验并写入 I11 Gate
 *   成为 pending（未确认零写，逆向 status / 未知角色 / 已知情角色被拒）；
 * - 确认：`data-novel-knowledge-accept`（Gate 确认后受控写回，知情只增不退；
 *   已生效变更幂等）与 `data-novel-knowledge-reject`（拒绝，C3 零写）；
 * - 待确认提案列表 `data-novel-knowledge-pending`：重载后依然可见（Gate 持久化）。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelKnowledgeManager` Remote；Client 只持有最小 owned
 *   JSON 投影（事实/角色/提案视图），不持有 C3 文档、文件路径或 live object；
 * - POV 边界：事实卡展示 `povHint`（谁已知 / 计划揭示谁），提示生成注入按角色
 *   POV 过滤；Client 不做任何领域推断或 fallback。
 */

export interface KnowledgeFactShape {
  readonly id: string;
  readonly fact: string;
  readonly kind: 'secret' | 'foreshadow' | 'plotpoint' | 'backstory';
  readonly status: 'hidden' | 'partially-revealed' | 'revealed';
  readonly holders: readonly string[];
  readonly revealPlan: { readonly revealTo: readonly string[]; readonly revealAt: string };
  readonly povHint: string;
}

export interface KnowledgeCharacterShape {
  readonly characterId: string;
  readonly name: string;
  readonly knows: readonly string[];
}

export interface KnowledgeProjectionShape {
  readonly projectId: string;
  readonly entries: readonly KnowledgeFactShape[];
  readonly characters: readonly KnowledgeCharacterShape[];
  readonly summary: { readonly total: number; readonly hidden: number; readonly partiallyRevealed: number; readonly revealed: number; readonly withPlan: number };
}

export interface KnowledgeNamedRefShape {
  readonly characterId: string;
  readonly name: string;
}

export interface KnowledgeProposalShape {
  readonly proposalId: string;
  readonly kind: 'reveal' | 'holder-add';
  readonly entryId: string;
  readonly holders: readonly string[];
  readonly status?: 'partially-revealed' | 'revealed';
  readonly revealAt?: string;
}

export interface KnowledgeEntryDetailShape {
  readonly projectId: string;
  readonly entry: KnowledgeFactShape;
  readonly holders: readonly KnowledgeNamedRefShape[];
  readonly planned: readonly KnowledgeNamedRefShape[];
  readonly pendingProposals: readonly KnowledgeProposalShape[];
}

export interface KnowledgeProposeOutcomeShape {
  readonly projectId: string;
  readonly proposalId: string;
  readonly kind: 'reveal' | 'holder-add';
  readonly status: 'pending';
  readonly preview: KnowledgeFactShape;
}

export interface KnowledgeApplyOutcomeShape {
  readonly projectId: string;
  readonly proposalId: string;
  readonly applied: boolean;
  readonly projection: KnowledgeProjectionShape;
}

export type KnowledgeViewId = 'facts' | 'characters';

export interface KnowledgeLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly projection?: KnowledgeProjectionShape;
  /** 事实 / 角色双视图（R14-1 角色/事实双视图）。 */
  readonly view: KnowledgeViewId;
  /** 当前操作中的事实（打开其揭示/变更表单）。 */
  readonly selectedEntryId?: string;
  /** 提案草稿：新增知情角色勾选 + （reveal 时）目标 status 与 revealAt。 */
  readonly draft: { readonly holders: readonly string[]; readonly status: '' | 'partially-revealed' | 'revealed'; readonly revealAt: string };
  /** 待确认提案（propose/accept/reject 后随投影刷新；重载一致）。 */
  readonly pending: readonly KnowledgeProposalShape[];
  readonly acting: boolean;
}

export interface KnowledgeEditOps {
  refresh(): void;
  setView(view: KnowledgeViewId): void;
  selectFact(entryId: string): void;
  toggleDraftHolder(characterId: string): void;
  setDraftStatus(value: '' | 'partially-revealed' | 'revealed'): void;
  setDraftRevealAt(value: string): void;
  /** 发起 Gate 提案（reveal = 揭示；holder-add = holder 变更；未确认零写）。 */
  propose(kind: 'reveal' | 'holder-add'): void;
  accept(proposalId: string): void;
  reject(proposalId: string): void;
  dismiss(): void;
}

export function freshKnowledge(): KnowledgeLayerState {
  return { status: 'idle', view: 'facts', draft: { holders: [], status: '', revealAt: '' }, pending: [], acting: false };
}

export const KNOWLEDGE_KIND_LABELS: Readonly<Record<string, string>> = {
  secret: '秘密', foreshadow: '伏笔', plotpoint: '关键点', backstory: '身世',
};
export const KNOWLEDGE_STATUS_LABELS: Readonly<Record<string, string>> = {
  hidden: '隐藏', 'partially-revealed': '部分揭示', revealed: '已揭示',
};

function factCard(h: El, fact: KnowledgeFactShape, nameOf: ReadonlyMap<string, string>, selected: boolean, ops: KnowledgeEditOps): unknown {
  const holderNames = fact.holders.map((id) => nameOf.get(id) ?? id).join('、');
  const planNames = fact.revealPlan.revealTo.map((id) => nameOf.get(id) ?? id).join('、');
  return h('li', { className: 'nv-knowledge__fact' + (selected ? ' is-selected' : ''), 'data-novel-knowledge-fact': fact.id, 'data-novel-knowledge-fact-status': fact.status },
    h('div', { className: 'nv-knowledge__fact-main' },
      h('p', { className: 'nv-knowledge__fact-text', 'data-novel-knowledge-fact-text': '' }, fact.fact),
      h('span', { className: 'nv-knowledge__badge', 'data-novel-knowledge-fact-kind': fact.kind }, KNOWLEDGE_KIND_LABELS[fact.kind] ?? fact.kind),
      h('span', { className: 'nv-knowledge__badge nv-knowledge__badge--' + fact.status, 'data-novel-knowledge-fact-status-badge': fact.status }, KNOWLEDGE_STATUS_LABELS[fact.status] ?? fact.status),
    ),
    h('p', { className: 'nv-knowledge__fact-meta', 'data-novel-knowledge-fact-meta': '' },
      `知情：${fact.holders.length === 0 ? '无' : holderNames} · 计划揭示：${fact.revealPlan.revealTo.length === 0 ? '无' : `${planNames}（${fact.revealPlan.revealAt}）`}`),
    // POV 边界提示（Host 解析角色名生成；作者视角速览，R14-1 POV 边界）。
    h('p', { className: 'nv-knowledge__pov-hint', 'data-novel-knowledge-pov-hint': '' }, fact.povHint),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-knowledge-fact-action': fact.id, onClick: () => ops.selectFact(fact.id) },
      selected ? '收起操作' : '揭示 / 变更 holder'),
  );
}

function characterCard(h: El, character: KnowledgeCharacterShape, factsById: ReadonlyMap<string, KnowledgeFactShape>): unknown {
  return h('li', { className: 'nv-knowledge__character', 'data-novel-knowledge-character': character.characterId },
    h('div', { className: 'nv-knowledge__character-main' },
      h('span', { className: 'nv-knowledge__character-name', 'data-novel-knowledge-character-name': '' }, character.name),
      h('span', { className: 'nv-knowledge__badge', 'data-novel-knowledge-character-count': '' }, `已知 ${character.knows.length} 条`),
    ),
    character.knows.length === 0
      ? h('p', { className: 'nv-knowledge__character-empty', 'data-novel-knowledge-character-empty': '' }, '尚未知晓任何事实。')
      : h('ul', { className: 'nv-knowledge__character-knows' },
        character.knows.map((factId) => h('li', { key: factId, 'data-novel-knowledge-character-fact': factId },
          factsById.get(factId)?.fact ?? factId)),
      ),
  );
}

/**
 * 知情与揭示管理面板。状态机：idle → loading → ready / error。ready 后按当前
 * 视图渲染事实卡或角色卡；选中事实后渲染揭示/变更表单，提案经 Gate 确认才写回。
 */
export function knowledgePanel(h: El, projectId: string, knowledge: KnowledgeNamespace | undefined, state: KnowledgeLayerState, ops: KnowledgeEditOps): unknown {
  const available = knowledge !== undefined && projectId !== undefined;
  const busy = state.acting || state.status === 'loading';
  let body: unknown;
  if (!available) {
    body = h('p', { className: 'nv-knowledge__hint', 'data-novel-knowledge-unavailable': '' }, '知情与揭示服务不可用（novelKnowledgeManager Remote 未挂载）。');
  } else if (state.status === 'idle') {
    body = h('p', { className: 'nv-knowledge__hint', 'data-novel-knowledge-idle': '' }, '尚未装载。点击「刷新」按事实与角色查看 C3 知情与揭示。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-knowledge__hint', 'data-novel-knowledge-loading': '', role: 'status', 'aria-live': 'polite' }, '正在装载知情与揭示…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-knowledge__error', 'data-novel-knowledge-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', { 'data-novel-knowledge-error-text': '' }, state.message ?? '知情与揭示读取失败'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-knowledge-retry': '', onClick: () => ops.refresh() }, '重试'),
    );
  } else {
    const projection = state.projection;
    const summary = projection?.summary;
    const nameOf = new Map((projection?.characters ?? []).map((character) => [character.characterId, character.name]));
    const factsById = new Map((projection?.entries ?? []).map((fact) => [fact.id, fact]));
    const selectedFact = state.selectedEntryId === undefined ? undefined : factsById.get(state.selectedEntryId);
    const pending = state.pending;
    body = h('div', { className: 'nv-knowledge__ready', 'data-novel-knowledge-ready': '' },
      h('p', { className: 'nv-knowledge__summary', 'data-novel-knowledge-summary': '', role: 'status', 'aria-live': 'polite' },
        `共 ${summary?.total ?? 0} 条事实（隐藏 ${summary?.hidden ?? 0} / 部分揭示 ${summary?.partiallyRevealed ?? 0} / 已揭示 ${summary?.revealed ?? 0}；${summary?.withPlan ?? 0} 条规划揭示）`),
      // 事实 / 角色双视图切换（R14-1）。
      h('div', { className: 'nv-knowledge__view-tabs', 'data-novel-knowledge-view-tabs': '', role: 'tablist', 'aria-label': '知情视图' },
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.view === 'facts'), className: 'nv-btn' + (state.view === 'facts' ? ' is-active' : ''), 'data-novel-knowledge-view-tab': 'facts', onClick: () => ops.setView('facts') }, '按事实'),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.view === 'characters'), className: 'nv-btn' + (state.view === 'characters' ? ' is-active' : ''), 'data-novel-knowledge-view-tab': 'characters', onClick: () => ops.setView('characters') }, '按角色'),
      ),
      state.view === 'facts'
        ? (projection?.entries.length === 0
          ? h('p', { className: 'nv-knowledge__empty', 'data-novel-knowledge-empty': '' }, '尚无 C3 事实（初始化不推断知情；可在六层初始化后经正文解析或手动录入建立）。')
          : h('div', { 'data-novel-knowledge-view': 'facts' },
            h('ul', { className: 'nv-knowledge__facts', 'data-novel-knowledge-facts': '' },
              (projection?.entries ?? []).map((fact) => factCard(h, fact, nameOf, fact.id === state.selectedEntryId, ops))),
            // 选中事实的揭示 / holder 变更表单（提案先经 Host 校验 + Gate pending）。
            selectedFact === undefined ? null : h('div', { className: 'nv-knowledge__action', 'data-novel-knowledge-action': selectedFact.id },
              h('p', { className: 'nv-knowledge__action-title', 'data-novel-knowledge-action-title': '' }, `对「${selectedFact.fact}」发起变更（知情只增不退）`),
              h('div', { className: 'nv-knowledge__holders', 'data-novel-knowledge-holders': '' },
                (projection?.characters ?? []).filter((character) => !selectedFact.holders.includes(character.characterId)).map((character) => {
                  const checked = state.draft.holders.includes(character.characterId);
                  return h('label', { key: character.characterId, className: 'nv-knowledge__holder' },
                    h('input', { type: 'checkbox', 'data-novel-knowledge-holder-check': character.characterId, checked, onChange: () => ops.toggleDraftHolder(character.characterId) }),
                    h('span', null, character.name),
                  );
                }),
                (projection?.characters ?? []).filter((character) => selectedFact.holders.includes(character.characterId)).length === 0
                  ? null
                  : h('p', { className: 'nv-knowledge__hint', 'data-novel-knowledge-holders-known': '' }, `当前知情：${selectedFact.holders.join('、')}`),
              ),
              h('div', { className: 'nv-knowledge__options' },
                h('label', { className: 'nv-field' },
                  h('span', { className: 'nv-field__label' }, '目标状态（揭示时；不选则至少推进到部分揭示）'),
                  h('select', {
                    className: 'nv-field__input',
                    'data-novel-knowledge-status': '',
                    value: state.draft.status,
                    onChange: (event: { target: { value: string } }) => ops.setDraftStatus(event.target.value as '' | 'partially-revealed' | 'revealed'),
                  },
                    h('option', { value: '' }, '自动（≥ 部分揭示）'),
                    h('option', { value: 'partially-revealed' }, '部分揭示'),
                    h('option', { value: 'revealed' }, '已揭示'),
                  ),
                ),
                h('label', { className: 'nv-field' },
                  h('span', { className: 'nv-field__label' }, '揭示时机（可选）'),
                  h('input', { type: 'text', className: 'nv-field__input', 'data-novel-knowledge-reveal-at': '', value: state.draft.revealAt, onChange: (event: { target: { value: string } }) => ops.setDraftRevealAt(event.target.value), placeholder: '如：第三幕' }),
                ),
              ),
              h('div', { className: 'nv-editor__actions' },
                h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-knowledge-propose': 'reveal', disabled: busy || state.draft.holders.length === 0, onClick: () => ops.propose('reveal') }, state.acting ? '提交中…' : '发起揭示提案'),
                h('button', { type: 'button', className: 'nv-btn', 'data-novel-knowledge-propose': 'holder-add', disabled: busy || state.draft.holders.length === 0, onClick: () => ops.propose('holder-add') }, state.acting ? '提交中…' : '发起 holder 变更提案'),
              ),
            ),
          ))
        : (projection?.characters.length === 0
          ? h('p', { className: 'nv-knowledge__empty', 'data-novel-knowledge-empty': '' }, '尚无角色。')
          : h('div', { 'data-novel-knowledge-view': 'characters' },
            h('ul', { className: 'nv-knowledge__characters', 'data-novel-knowledge-characters': '' },
              (projection?.characters ?? []).map((character) => characterCard(h, character, factsById))),
          )),
      // 待确认提案（Gate pending；重载后依然可见 —— R14-1 确认断言 + 重载一致）。
      pending.length === 0 ? null
        : h('details', { className: 'nv-knowledge__pending', 'data-novel-knowledge-pending': '' },
          h('summary', { 'data-novel-knowledge-pending-summary': '' }, `待确认提案（${pending.length} 条）`),
          h('ul', null, pending.map((proposal) => {
            const fact = factsById.get(proposal.entryId);
            return h('li', { key: proposal.proposalId, 'data-novel-knowledge-pending-item': proposal.proposalId },
              h('p', { className: 'nv-knowledge__pending-text', 'data-novel-knowledge-pending-text': '' },
                `${proposal.kind === 'reveal' ? '揭示' : 'holder 变更'}「${fact?.fact ?? proposal.entryId}」→ 新增知情：${proposal.holders.join('、')}`,
                proposal.status === undefined ? '' : `；目标状态：${KNOWLEDGE_STATUS_LABELS[proposal.status] ?? proposal.status}`,
                proposal.revealAt === undefined ? '' : `；时机：${proposal.revealAt}`),
              h('div', { className: 'nv-editor__actions' },
                h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-knowledge-accept': proposal.proposalId, disabled: busy, onClick: () => ops.accept(proposal.proposalId) }, state.acting ? '应用中…' : '确认应用'),
                h('button', { type: 'button', className: 'nv-btn', 'data-novel-knowledge-reject': proposal.proposalId, disabled: busy, onClick: () => ops.reject(proposal.proposalId) }, '拒绝'),
              ),
            );
          })),
        ),
      state.message === undefined ? null
        : h('p', { className: 'nv-knowledge__message', 'data-novel-knowledge-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    );
  }
  return h('section', { className: 'nv-knowledge', 'data-novel-knowledge-panel': '', 'data-novel-knowledge-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '知情与揭示（C3）'),
    h('p', { className: 'nv-knowledge__hint', 'data-novel-knowledge-desc': '' }, '按事实与角色查看 holders / revealPlan / status；揭示与 holder 变更须经确认（Gate）后生效，知情只增不退。'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-knowledge-refresh': '', disabled: busy, onClick: () => ops.refresh() }, busy ? '处理中…' : '刷新'),
    ),
    body,
  );
}
