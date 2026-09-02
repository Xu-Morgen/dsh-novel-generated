import type { El } from './shared.js';

const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  id: '内部引用（只读）', version: '版本', name: '名称', title: '标题', statement: '规则内容',
  scope: '适用范围', kind: '类型', priority: '优先级', immutable: '不可改写', active: '启用',
  examples: '示例', person: '叙述人称', tense: '叙述时态', povScope: '视角范围', tone: '基调',
  proseStyle: '行文风格', chapterFormat: '章节格式', dialogueConventions: '对话规范', forbidden: '避免表达',
  content: '内容', summary: '摘要', description: '描述', goal: '目标', acts: '幕', beats: '节',
  detailBeats: '细纲场景卡', charactersInvolved: '参与角色', conflictType: '冲突类型', prerequisites: '前置节',
  optional: '可选', pov: '视角角色', wordTarget: '目标字数', points: '要点', status: '状态',
  from: '起点角色', to: '终点角色', affinity: '亲密度', trust: '信任度', milestones: '关系里程碑',
  knownTo: '知情角色', aliases: '别名', personality: '性格', background: '背景', motivation: '动机',
  goals: '目标', flaws: '缺陷', abilities: '能力', speechStyle: '口吻', arc: '角色弧光',
  startingPoint: '起点', desiredEnd: '归宿', keyBeats: '关键节拍', keywords: '触发词', triggerMode: '触发方式',
  weight: '权重', parent: '父条目', mutable: '可改写', supersededBy: '后续修订', logline: '一句话梗概',
  themes: '主题', foreshadowing: '伏笔', endings: '结局方向', index: '顺序',
});

const ENUM_BY_FIELD: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  scope: Object.freeze({ global: '全局', faction: '阵营', location: '地点', character: '角色', item: '物品' }),
  kind: Object.freeze({ physics: '物理规则', magic: '魔法规则', technology: '科技规则', genre: '类型规则', taboo: '禁忌', permission: '许可', protagonist: '主角', antagonist: '对立角色', supporting: '重要配角', extra: '次要角色', pov: '视角角色', geography: '地理', history: '历史', faction: '阵营', culture: '文化', race: '族群', concept: '概念', artifact: '器物' }),
  person: Object.freeze({ first: '第一人称', second: '第二人称', 'third-limited': '第三人称限知', 'third-omniscient': '第三人称全知' }),
  tense: Object.freeze({ past: '过去时', present: '现在时' }),
  povScope: Object.freeze({ single: '单一视角', multi: '多视角', omniscient: '全知视角' }),
  triggerMode: Object.freeze({ constant: '始终生效', keyword: '关键词触发', regex: '模式匹配' }),
  type: Object.freeze({ kin: '亲属', romantic: '情感关系', friendship: '朋友', rivalry: '竞争对手', enmity: '敌对', allegiance: '同盟', mentor: '师徒', subordinate: '上下级' }),
  status: Object.freeze({ planned: '待写', writing: '写作中', done: '已完成', draft: '草稿', revised: '已修订', canon: '已定稿', active: '生效', rewritten: '已改写' }),
  conflictType: Object.freeze({ internal: '内心冲突', external: '外部冲突', relational: '关系冲突', world: '世界规则冲突' }),
});

function fieldLabel(key: string, position: number): string {
  return FIELD_LABELS[key] ?? `其他内容 ${position + 1}`;
}

const RULE_KINDS = Object.freeze({ physics: '物理规则', magic: '魔法规则', technology: '科技规则', genre: '类型规则', taboo: '禁忌', permission: '许可' });
const CHARACTER_KINDS = Object.freeze({ protagonist: '主角', antagonist: '对立角色', supporting: '重要配角', extra: '次要角色', pov: '视角角色' });
const WORLD_KINDS = Object.freeze({ geography: '地理', history: '历史', faction: '阵营', culture: '文化', race: '族群', concept: '概念', artifact: '器物' });

function enumOptions(anchor: string, path: string, value: string): Readonly<Record<string, string>> | undefined {
  const field = path.split('.').at(-1) ?? '';
  const options = field === 'kind'
    ? anchor.includes('rules') ? RULE_KINDS : anchor.includes('characters') ? CHARACTER_KINDS : anchor.includes('worldview') ? WORLD_KINDS : undefined
    : ENUM_BY_FIELD[field];
  return options !== undefined && Object.hasOwn(options, value) ? options : undefined;
}

/**
 * Render JSON-compatible candidate data as Chinese field controls. Canonical
 * keys/enum values stay in callbacks only; no raw document editor is exposed.
 */
export function structuredEditor(h: El, value: unknown, onChange: (value: unknown) => void, anchor: string, path = 'root'): unknown {
  if (Array.isArray(value)) {
    return h('fieldset', { className: 'nv-structured-editor__group', 'data-novel-structured-array': path },
      h('legend', { className: 'nv-field__label' }, value.length === 0 ? '暂无条目' : `共 ${value.length} 项`),
      value.map((item, index) => structuredEditor(h, item, (next) => onChange(value.map((entry, position) => position === index ? next : entry)), anchor, `${path}.${index}`)),
    );
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return h('fieldset', { className: 'nv-structured-editor__group', 'data-novel-structured-object': path },
      entries.map(([key, item], index) => h('div', { key, className: 'nv-structured-editor__field', 'data-novel-structured-field': key },
        h('span', { className: 'nv-field__label' }, fieldLabel(key, index)),
        key === 'id' || key === 'version'
          ? h('span', { className: 'nv-field__hint' }, '由系统维护')
          : structuredEditor(h, item, (next) => onChange({ ...(value as Record<string, unknown>), [key]: next }), anchor, `${path}.${key}`),
      )),
    );
  }
  if (typeof value === 'boolean') {
    return h('input', { type: 'checkbox', checked: value, 'aria-label': '切换选项', 'data-novel-structured-input': anchor, onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked) });
  }
  if (typeof value === 'number') {
    return h('input', { type: 'number', className: 'nv-field__input', value, 'aria-label': '数值', 'data-novel-structured-input': anchor, onChange: (event: { target: { value: string } }) => onChange(Number(event.target.value)) });
  }
  const text = typeof value === 'string' ? value : '';
  const options = enumOptions(anchor, path, text);
  if (options !== undefined) {
    return h('select', { className: 'nv-field__input', value: text, 'aria-label': '选择内容', 'data-novel-structured-input': anchor, onChange: (event: { target: { value: string } }) => onChange(event.target.value) },
      Object.entries(options).map(([canonical, label]) => h('option', { key: canonical, value: canonical }, label)),
    );
  }
  return h('input', { type: 'text', className: 'nv-field__input', value: text, 'aria-label': '编辑内容', 'data-novel-structured-input': anchor, onChange: (event: { target: { value: string } }) => onChange(event.target.value) });
}
