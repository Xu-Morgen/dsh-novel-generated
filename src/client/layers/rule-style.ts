import type { El, RuleStyleNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';

/**
 * I67 B1 规则与 B4 文风控制面面板（design §14.10「B1/B4 控制面」/ R14-2）。
 *
 * 作者编辑 B1 规则（优先级/immutable/scope/kind/statement/examples/active）与
 * B4 风格档案（人称/时态/POV/基调/行文/章节格式/对话规范/禁用表达）：
 * - 规则列表：优先级降序 + id 升序（与 I13 消费者排序一致），中文 scope/kind 徽标、
 *   immutable/active 徽标；点选规则进入详情表单，也可新建规则；
 * - 详情表单：scope/kind 中文下拉、priority 数字输入、statement/examples 文本域、
 *   immutable/active 复选框 —— 全部只收集值并提交 Host；非法枚举、越界优先级、
 *   immutable 改写失败由 Host fail-fast 拒绝并以中文错误反馈展示；
 * - 风格档案：person/tense/povScope 中文下拉 + 各文本域 + 禁用表达列表；未初始化
 *   （I3 `{}` 占位）时显示「尚未初始化」并引导新建。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelRuleStyleManager` Remote；Client 只持有最小 owned JSON
 *   投影与表单草稿，不导入 core schema、不复制领域校验、不做任何领域 fallback
 *   （枚举下拉只是受控选项，合法性一律由 Host 判定后反馈）。
 */

export interface RuleShape {
  readonly id: string;
  readonly version: number;
  readonly scope: 'global' | 'faction' | 'location' | 'character' | 'item';
  readonly kind: 'physics' | 'magic' | 'technology' | 'genre' | 'taboo' | 'permission';
  readonly statement: string;
  readonly priority: number;
  readonly immutable: boolean;
  readonly examples: readonly string[];
  readonly active: boolean;
}

export interface StyleShape {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly person: 'first' | 'second' | 'third-limited' | 'third-omniscient';
  readonly tense: 'past' | 'present';
  readonly povScope: 'single' | 'multi' | 'omniscient';
  readonly tone: string;
  readonly proseStyle: string;
  readonly chapterFormat: string;
  readonly dialogueConventions: string;
  readonly forbidden: readonly string[];
}

export interface RuleStyleProjectionShape {
  readonly projectId: string;
  readonly rules: readonly RuleShape[];
  /** null = 未初始化（I3 初始 `{}` 占位）。 */
  readonly style: StyleShape | null;
}

export interface RuleDraftShape {
  readonly id: string;
  readonly scope: RuleShape['scope'];
  readonly kind: RuleShape['kind'];
  readonly statement: string;
  readonly priority: string;
  readonly immutable: boolean;
  readonly active: boolean;
  readonly examples: readonly string[];
}

export interface StyleDraftShape {
  readonly name: string;
  readonly person: StyleShape['person'];
  readonly tense: StyleShape['tense'];
  readonly povScope: StyleShape['povScope'];
  readonly tone: string;
  readonly proseStyle: string;
  readonly chapterFormat: string;
  readonly dialogueConventions: string;
  readonly forbidden: readonly string[];
}

export interface RuleStyleLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly message?: string;
  readonly projection?: RuleStyleProjectionShape;
  /** 编辑中的规则 id；'__new__' = 新建草稿；undefined = 未在编辑。 */
  readonly editingRuleId?: string;
  /** 新建/编辑规则草稿（仅 UI 收集；Host 是唯一校验 owner）。 */
  readonly ruleDraft?: RuleDraftShape;
  /** 风格档案草稿（未初始化时也为空草稿，新建后成为 B4 真相）。 */
  readonly styleDraft: StyleDraftShape;
  readonly acting: boolean;
}

export interface RuleStyleEditOps {
  refresh(): void;
  /** 点选规则 → 经 Host readRule 拉详情并进入编辑表单。 */
  selectRule(ruleId: string): void;
  /** 新建规则：初始化空草稿并进入编辑表单。 */
  newRule(): void;
  cancelRuleEdit(): void;
  setRuleDraft(patch: Partial<RuleDraftShape>): void;
  /** 保存规则：新建走 createRule、编辑既有走 updateRule（Host fail-fast 拒绝非法值）。 */
  saveRule(): void;
  setStyleDraft(patch: Partial<StyleDraftShape>): void;
  saveStyle(): void;
  dismiss(): void;
}

export function freshRuleStyle(): RuleStyleLayerState {
  return { status: 'idle', styleDraft: freshStyleDraft(), acting: false };
}

export function freshRuleDraft(): RuleDraftShape {
  return { id: '', scope: 'global', kind: 'physics', statement: '', priority: '50', immutable: false, active: true, examples: [] };
}

export function freshStyleDraft(): StyleDraftShape {
  return { name: '', person: 'third-limited', tense: 'past', povScope: 'single', tone: '', proseStyle: '', chapterFormat: '', dialogueConventions: '', forbidden: [] };
}

/** 中文枚举标签（R14-2「中文枚举」）：只作展示映射，合法性判定在 Host。 */
export const RULE_SCOPE_LABELS: Readonly<Record<string, string>> = {
  global: '全局', faction: '阵营', location: '地点', character: '角色', item: '物品',
};
export const RULE_KIND_LABELS: Readonly<Record<string, string>> = {
  physics: '物理', magic: '魔法', technology: '科技', genre: '类型', taboo: '禁忌', permission: '许可',
};
export const PERSON_LABELS: Readonly<Record<string, string>> = {
  first: '第一人称', second: '第二人称', 'third-limited': '第三人称限知', 'third-omniscient': '第三人称全知',
};
export const TENSE_LABELS: Readonly<Record<string, string>> = { past: '过去时', present: '现在时' };
export const POV_LABELS: Readonly<Record<string, string>> = { single: '单一视角', multi: '多视角', omniscient: '全知视角' };

export const RULE_SCOPES = Object.keys(RULE_SCOPE_LABELS) as RuleShape['scope'][];
export const RULE_KINDS = Object.keys(RULE_KIND_LABELS) as RuleShape['kind'][];
export const PERSONS = Object.keys(PERSON_LABELS) as StyleShape['person'][];
export const TENSES = Object.keys(TENSE_LABELS) as StyleShape['tense'][];
export const POVS = Object.keys(POV_LABELS) as StyleShape['povScope'][];

function ruleCard(h: El, rule: RuleShape, selected: boolean, ops: RuleStyleEditOps): unknown {
  return h('li', { className: 'nv-rulestyle__rule' + (selected ? ' is-selected' : ''), 'data-novel-rule-item': rule.id },
    h('div', { className: 'nv-rulestyle__rule-main' },
      h('span', { className: 'nv-rulestyle__rule-priority', 'data-novel-rule-priority': '' }, String(rule.priority)),
      h('p', { className: 'nv-rulestyle__rule-statement', 'data-novel-rule-statement': '' }, rule.statement),
    ),
    h('div', { className: 'nv-rulestyle__rule-badges' },
      h('span', { className: 'nv-rulestyle__badge', 'data-novel-rule-scope': rule.scope }, RULE_SCOPE_LABELS[rule.scope] ?? rule.scope),
      h('span', { className: 'nv-rulestyle__badge', 'data-novel-rule-kind': rule.kind }, RULE_KIND_LABELS[rule.kind] ?? rule.kind),
      rule.immutable ? h('span', { className: 'nv-rulestyle__badge nv-rulestyle__badge--strong', 'data-novel-rule-immutable': '' }, '不可改写') : null,
      rule.active ? null : h('span', { className: 'nv-rulestyle__badge', 'data-novel-rule-active': '' }, '停用'),
    ),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-rule-edit': rule.id, onClick: () => ops.selectRule(rule.id) },
      selected ? '收起编辑' : '编辑'),
  );
}

function ruleForm(h: El, draft: RuleDraftShape, acting: boolean, isNew: boolean, ops: RuleStyleEditOps): unknown {
  return h('div', { className: 'nv-rulestyle__form', 'data-novel-rule-form': isNew ? '__new__' : draft.id },
    h('p', { className: 'nv-rulestyle__form-title', 'data-novel-rule-form-title': '' }, isNew ? '新建规则' : `编辑规则：${draft.id}`),
    !isNew ? null : h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '规则 ID（稳定标识，保存后不可改）'),
      h('input', { type: 'text', className: 'nv-field__input', 'data-novel-rule-edit-id': '', value: draft.id, onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ id: event.target.value }) }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '规则陈述'),
      h('textarea', { className: 'nv-field__input', 'data-novel-rule-edit-statement': '', rows: 3, value: draft.statement, onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ statement: event.target.value }) }),
    ),
    h('div', { className: 'nv-rulestyle__row' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '作用域'),
        h('select', { className: 'nv-field__input', 'data-novel-rule-edit-scope': '', value: draft.scope, onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ scope: event.target.value as RuleShape['scope'] }) },
          RULE_SCOPES.map((value) => h('option', { key: value, value }, RULE_SCOPE_LABELS[value]))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类别'),
        h('select', { className: 'nv-field__input', 'data-novel-rule-edit-kind': '', value: draft.kind, onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ kind: event.target.value as RuleShape['kind'] }) },
          RULE_KINDS.map((value) => h('option', { key: value, value }, RULE_KIND_LABELS[value]))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '优先级（冲突时数值大者优先；1–100）'),
        h('input', { type: 'number', min: 1, max: 100, className: 'nv-field__input', 'data-novel-rule-edit-priority': '', value: draft.priority, onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ priority: event.target.value }) }),
      ),
    ),
    h('div', { className: 'nv-rulestyle__checks' },
      h('label', { className: 'nv-rulestyle__check' },
        h('input', { type: 'checkbox', 'data-novel-rule-edit-immutable': '', checked: draft.immutable, onChange: () => ops.setRuleDraft({ immutable: !draft.immutable }) }),
        h('span', null, '不可改写（保存后任何字段都不可再编辑，只能整条停用）'),
      ),
      h('label', { className: 'nv-rulestyle__check' },
        h('input', { type: 'checkbox', 'data-novel-rule-edit-active': '', checked: draft.active, onChange: () => ops.setRuleDraft({ active: !draft.active }) }),
        h('span', null, '启用（生成与检测读取）'),
      ),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '示例（每行一条）'),
      h('textarea', { className: 'nv-field__input', 'data-novel-rule-edit-examples': '', rows: 2, value: draft.examples.join('\n'), onChange: (event: { target: { value: string } }) => ops.setRuleDraft({ examples: event.target.value.split('\n').map((item) => item.trim()).filter((item) => item.length > 0) }) }),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-rule-save': '', disabled: acting, onClick: () => ops.saveRule() }, acting ? '保存中…' : '保存规则'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-rule-cancel': '', disabled: acting, onClick: () => ops.cancelRuleEdit() }, '取消'),
    ),
  );
}

function styleForm(h: El, style: StyleShape | null, draft: StyleDraftShape, acting: boolean, ops: RuleStyleEditOps): unknown {
  return h('div', { className: 'nv-rulestyle__style', 'data-novel-style-form': '' },
    style === null
      ? h('p', { className: 'nv-rulestyle__hint', 'data-novel-style-uninitialized': '' }, '风格档案尚未初始化。填写并保存后，它会用于后续生成与检查。')
      : h('p', { className: 'nv-rulestyle__hint', 'data-novel-style-version': '' }, `当前版本 v${style.version}（${style.name}）`),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '档案名称'),
      h('input', { type: 'text', className: 'nv-field__input', 'data-novel-style-name': '', value: draft.name, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ name: event.target.value }) }),
    ),
    h('div', { className: 'nv-rulestyle__row' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '人称'),
        h('select', { className: 'nv-field__input', 'data-novel-style-person': '', value: draft.person, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ person: event.target.value as StyleShape['person'] }) },
          PERSONS.map((value) => h('option', { key: value, value }, PERSON_LABELS[value]))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '时态'),
        h('select', { className: 'nv-field__input', 'data-novel-style-tense': '', value: draft.tense, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ tense: event.target.value as StyleShape['tense'] }) },
          TENSES.map((value) => h('option', { key: value, value }, TENSE_LABELS[value]))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, 'POV'),
        h('select', { className: 'nv-field__input', 'data-novel-style-pov': '', value: draft.povScope, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ povScope: event.target.value as StyleShape['povScope'] }) },
          POVS.map((value) => h('option', { key: value, value }, POV_LABELS[value]))),
      ),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '基调'),
      h('input', { type: 'text', className: 'nv-field__input', 'data-novel-style-tone': '', value: draft.tone, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ tone: event.target.value }) }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '行文风格'),
      h('textarea', { className: 'nv-field__input', 'data-novel-style-prose': '', rows: 2, value: draft.proseStyle, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ proseStyle: event.target.value }) }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '章节格式'),
      h('textarea', { className: 'nv-field__input', 'data-novel-style-format': '', rows: 2, value: draft.chapterFormat, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ chapterFormat: event.target.value }) }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '对话规范'),
      h('textarea', { className: 'nv-field__input', 'data-novel-style-dialogue': '', rows: 2, value: draft.dialogueConventions, onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ dialogueConventions: event.target.value }) }),
    ),
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '禁用表达（每行一条；生成与风格检测读取）'),
      h('textarea', { className: 'nv-field__input', 'data-novel-style-forbidden': '', rows: 3, value: draft.forbidden.join('\n'), onChange: (event: { target: { value: string } }) => ops.setStyleDraft({ forbidden: event.target.value.split('\n').map((item) => item.trim()).filter((item) => item.length > 0) }) }),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-style-save': '', disabled: acting, onClick: () => ops.saveStyle() }, acting ? '保存中…' : '保存风格档案'),
    ),
  );
}

/**
 * B1/B4 控制面面板。状态机：idle → loading → ready / error。ready 后展示规则
 * 列表 + 规则详情表单 + 风格档案表单；Host 错误（非法枚举/越界优先级/immutable
 * 改写失败）显示在 message 区并保留当前草稿供修正。
 */
export function ruleStylePanel(h: El, projectId: string, namespace: RuleStyleNamespace | undefined, state: RuleStyleLayerState, ops: RuleStyleEditOps): unknown {
  const available = namespace !== undefined && projectId !== undefined;
  const busy = state.acting || state.status === 'loading';
  let body: unknown;
  if (!available) {
    body = h('p', { className: 'nv-rulestyle__hint', 'data-novel-rule-style-unavailable': '' }, '规则与文风功能暂时不可用，请稍后重试。');
  } else if (state.status === 'idle') {
    body = h('p', { className: 'nv-rulestyle__hint', 'data-novel-rule-style-idle': '' }, '尚未读取内容。点击「刷新」查看规则与风格档案。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-rulestyle__hint', 'data-novel-rule-style-loading': '', role: 'status', 'aria-live': 'polite' }, '正在装载规则与文风…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-rulestyle__error', 'data-novel-rule-style-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', { 'data-novel-rule-style-error-text': '' }, toUserMessage(state.message ?? '规则与文风读取失败')),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-rule-style-retry': '', onClick: () => ops.refresh() }, '重试'),
    );
  } else {
    const projection = state.projection;
    const rules = projection?.rules ?? [];
    const style = projection?.style ?? null;
    const editing = state.ruleDraft;
    body = h('div', { className: 'nv-rulestyle__ready', 'data-novel-rule-style-ready': '' },
      h('p', { className: 'nv-rulestyle__summary', 'data-novel-rule-style-summary': '', role: 'status', 'aria-live': 'polite' },
        `共 ${rules.length} 条规则（不可变 ${rules.filter((rule) => rule.immutable).length} 条；启用 ${rules.filter((rule) => rule.active).length} 条）`),
      h('div', { className: 'nv-rulestyle__section', 'data-novel-rules-section': '' },
        h('h4', { className: 'nv-rulestyle__section-title' }, '硬性规则（冲突时优先级高者胜）'),
        rules.length === 0
          ? h('p', { className: 'nv-rulestyle__empty', 'data-novel-rules-empty': '' }, '尚无规则。新建第一条规则后，它会用于后续生成与检查。')
          : h('ul', { className: 'nv-rulestyle__rules', 'data-novel-rules-list': '' },
            rules.map((rule) => ruleCard(h, rule, rule.id === state.editingRuleId, ops))),
        state.editingRuleId === '__new__' || state.editingRuleId === undefined
          ? h('button', { type: 'button', className: 'nv-btn', 'data-novel-rule-new': '', disabled: busy, onClick: () => ops.newRule() }, '新建规则')
          : null,
        editing === undefined ? null : ruleForm(h, editing, state.acting, state.editingRuleId === '__new__', ops),
      ),
      h('div', { className: 'nv-rulestyle__section', 'data-novel-style-section': '' },
        h('h4', { className: 'nv-rulestyle__section-title' }, '文风档案（人称 / 时态 / 视角 / 禁用表达）'),
        styleForm(h, style, state.styleDraft, state.acting, ops),
      ),
      state.message === undefined ? null
        : h('p', { className: 'nv-rulestyle__message', 'data-novel-rule-style-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
    );
  }
  return h('section', { className: 'nv-rulestyle', 'data-novel-rule-style-panel': '', 'data-novel-rule-style-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '规则与文风'),
    h('p', { className: 'nv-rulestyle__hint', 'data-novel-rule-style-desc': '' }, '编辑硬性规则（优先级 / 不可变）与全局风格（人称、时态、视角、禁用表达）；保存后生成与检查会使用同一份内容。'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-rule-style-refresh': '', disabled: busy, onClick: () => ops.refresh() }, busy ? '处理中…' : '刷新'),
    ),
    body,
  );
}
