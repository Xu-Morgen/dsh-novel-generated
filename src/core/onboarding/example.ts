import type { OnboardingAnalysisOutput } from '../schema/onboarding.js';

/**
 * I52 few-shot example embedded in the analysis/regenerate prompts.
 *
 * This is a *prompt artifact*, not a sample/gold: it demonstrates the exact
 * per-layer candidate field names and nesting the model must reproduce. Its
 * core content mirrors the frozen canonical corpus case `canonical-harbor-mystery`
 * (samples/i52/cases.json, immutable); it additionally shows one `foreshadowing`
 * and one `endings` object, a second character and a `relationship` candidate
 * (numbers + id references) so the model sees those shapes (the frozen case
 * leaves them empty). The example is schema-valid by construction and is
 * asserted parseable by the deterministic test suite.
 * The empty `candidates` example alone is not enough for weak models — the
 * observed failure mode is a shape collapse into generic
 * `{type,name,summary,confidence,evidenceIds}` candidates (see
 * formatContractViolation).
 *
 * I81 拆分（架构审查 §4.1）：170 行 few-shot 字面量独立为 example.ts，prompt 构建
 * 引用它；本模块是纯字面量，不承载任何 prompt/校验逻辑。
 */
export const ONBOARDING_PROMPT_EXAMPLE: OnboardingAnalysisOutput = {
  evidence: {
    e01: { sourceChunkIndex: 0, quote: '北港位于内海西岸，是北方最大的贸易港。' },
    e02: { sourceChunkIndex: 1, quote: '米拉是一名见习测绘师，性格谨慎，擅长辨认星图。' },
    e03: { sourceChunkIndex: 1, quote: '她受雇追查港口失踪的灯塔守夜人。' },
    e04: { sourceChunkIndex: 2, quote: '米拉在码头的旧灯塔里发现了半张被烧焦的海图。' },
  },
  layers: {
    characters: {
      candidates: [{
        id: 'mira',
        name: '米拉',
        aliases: [],
        kind: 'protagonist',
        personality: '谨慎',
        background: '见习测绘师，擅长辨认星图',
        motivation: '追查港口失踪的灯塔守夜人',
        goals: ['查明灯塔守夜人失踪真相'],
        flaws: [],
        abilities: ['辨认星图'],
        speechStyle: '',
        staticTraits: [],
        arc: { startingPoint: '受雇调查失踪案', desiredEnd: '揭开真相', keyBeats: [] },
        relationships: [],
        knowledgeIds: [],
      }, {
        // 追加的第二角色：让 relationship 示例有可引用的字符 id（prompt 工件）。
        id: 'laozhou',
        name: '灯塔守夜人',
        aliases: [],
        kind: 'supporting',
        personality: '',
        background: '北港灯塔守夜人',
        motivation: '',
        goals: [],
        flaws: [],
        abilities: [],
        speechStyle: '',
        staticTraits: [],
        arc: { startingPoint: '', desiredEnd: '', keyBeats: [] },
        relationships: [],
        knowledgeIds: [],
      }],
      confidence: 'high',
      warnings: [],
      evidenceIds: ['e02', 'e03'],
    },
    worldview: {
      candidates: [{
        id: 'north-harbor',
        kind: 'geography',
        title: '北港',
        content: '北港位于内海西岸，是北方最大的贸易港。',
        keywords: ['北港'],
        triggerMode: 'keyword',
        weight: 1,
        parent: null,
        mutable: true,
      }],
      confidence: 'high',
      warnings: [],
      evidenceIds: ['e01'],
    },
    outline: {
      candidates: [{
        id: 'outline-harbor-mystery',
        structure: 'three-act',
        logline: '一名测绘师追查港口灯塔守夜人失踪之谜。',
        themes: ['追查'],
        acts: [{
          id: 'act-1',
          index: 0,
          title: '第一幕',
          goal: '接受委托',
          beats: [{
            id: 'beat-1',
            title: '午夜旧灯塔',
            description: '米拉在旧灯塔发现被烧焦的海图。',
            charactersInvolved: ['mira'],
            conflictType: 'external',
            prerequisites: [],
            optional: false,
            detailBeats: [{
              id: 'detail-1',
              title: '发现海图',
              summary: '在码头旧灯塔里发现半张烧焦海图',
              pov: 'mira',
              wordTarget: 500,
              points: ['发现海图'],
              status: 'planned',
            }],
          }],
        }],
        // 超出冻结 canonical 样本的演示条目：为让模型看到 foreshadowing/endings
        // 的「对象」形状而追加（prompt 工件，非样本/gold）。
        foreshadowing: [{
          id: 'foreshadow-map',
          hint: '深夜码头旧灯塔里出现半张烧焦海图。',
          payoff: '海图指向灯塔守夜人失踪的真相。',
          status: 'planted',
          knownBy: ['mira'],
        }],
        endings: [{
          id: 'ending-truth',
          title: '真相揭晓',
          conditions: ['追查灯塔守夜人失踪真相'],
          description: '米拉查明守夜人失踪与海图有关。',
        }],
      }],
      confidence: 'medium',
      warnings: [],
      evidenceIds: ['e03', 'e04'],
    },
    // 追加的 relationship 示例：演示 affinity/trust 是 JSON 数字、from/to/knownTo
    // 引用 characters 候选 id、milestones 为空（prompt 工件，非样本/gold）。
    relationship: {
      candidates: [{
        id: 'mira-laozhou-search',
        from: 'mira',
        to: 'laozhou',
        type: 'mentor',
        affinity: 40,
        trust: 30,
        status: '受雇调查对象',
        milestones: [],
        knownTo: ['mira'],
      }],
      confidence: 'high',
      warnings: [],
      evidenceIds: ['e03'],
    },
    state: {
      candidates: [{
        id: 'initial-state',
        storyTime: '',
        scene: { location: '旧灯塔', timeOfDay: '深夜', weather: '', season: '', atmosphere: '' },
        characters: [{
          characterId: 'mira',
          location: '旧灯塔',
          alive: true,
          health: '健康',
          mood: '警觉',
          inventory: ['半张烧焦的海图'],
          condition: '',
          currentGoal: '追查灯塔守夜人失踪',
          flags: {},
        }],
      }],
      confidence: 'medium',
      warnings: [],
      evidenceIds: ['e04'],
    },
    canon: {
      candidates: [{
        id: 'canon-harbor-map',
        storyTime: '',
        kind: 'event',
        summary: '米拉在旧灯塔发现半张烧焦的海图。',
        detail: '深夜，米拉在码头的旧灯塔里发现了半张被烧焦的海图。',
        participants: ['mira'],
        location: '旧灯塔',
        consequences: [],
        affectedLayers: ['C5'],
      }],
      confidence: 'high',
      warnings: [],
      evidenceIds: ['e04'],
    },
  },
};
