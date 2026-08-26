import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  ONBOARDING_LAYER_KEYS,
  onboardingAnalysisOutputSchema,
  onboardingAnalysisResultSchema,
  type OnboardingAnalysisInput,
  type OnboardingAnalysisOutput,
  type OnboardingAnalysisResult,
  type OnboardingLayerKey,
  type OnboardingLayers,
  type OnboardingSession,
} from '../schema/onboarding.js';

/**
 * I52 six-layer initialization analyzer core (design §14.8 / R11-3).
 *
 * The analyzer is split into four mechanical, deterministic stages so that
 * every LLM-adjacent failure mode is fail-closed before any bytes are written:
 *
 * 1. `assertInput`         — input normalization/structure guards.
 * 2. `parseOutput`         — strict JSON-only envelope decode.
 * 3. `assertOutput`        — cross-layer invariants (evidence reachability,
 *                            id uniqueness, B3 empty forward refs, no C3/items/
 *                            factions/globalFlags, C4 text-explicit only).
 * 4. `reduceLayers`        — bind the binding triple and drop non-canonical
 *                            layer fields, producing the final result.
 *
 * This module owns no LLM transport and no persistence; the Host service wraps
 * it with the `ctx.llm` backend and the Cordis Fiber abort scope.
 */

export const FREE_TEXT_MAX_BYTES = 2 * 1024 * 1024;

/** Hard-coded input size budget; the LLM is never entered for oversized text. */
export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** Structurally validate free text before any model call. */
export function assertFreeText(text: string): string {
  const normalized = text.normalize('NFC').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) throw new Error('Free text is empty');
  if (normalized.includes('\u0000')) throw new Error('Free text contains NUL');
  if (byteLength(normalized) > FREE_TEXT_MAX_BYTES) throw new Error('Free text exceeds 2 MiB limit');
  return normalized.trim();
}

/** One validation issue extracted from a Zod failure, for the concise error. */
interface ContractIssue {
  path?: Array<string | number>;
  message?: string;
}

/**
 * Map a strict-schema validation failure into a concise, actionable error while
 * preserving the original ZodError as `cause` for server-side diagnostics.
 *
 * Rationale (design §14.7.3): illegal model output must fail closed with zero
 * writes, but the raw multi-hundred-line issue dump is not a user-facing
 * message. We surface the first few offending paths plus the recovery verb, and
 * keep the full issues on `error.cause`.
 */
export function formatContractViolation(context: string, guidance: string, cause: unknown): Error {
  const issues = ((cause as { issues?: ContractIssue[] } | null)?.issues ?? []).filter((issue) => issue.message !== undefined);
  const sample = issues.slice(0, 3).map((issue) => `${(issue.path ?? []).join('.') || '(root)'}: ${issue.message}`).join('；');
  const detail = sample ? `（前 ${Math.min(issues.length, 3)} 项：${sample}）` : '';
  return new Error(`${context}不符合六层候选契约${detail}。${guidance}`, { cause });
}

/** Parse a model response into the strict I52 envelope (JSON only, no markdown). */
export function parseOnboardingOutput(text: unknown): OnboardingAnalysisOutput {
  let raw: string;
  try {
    raw = z.string().trim().min(1).parse(text);
  } catch (cause) {
    // Empty/whitespace completions (e.g. reasoning-only API responses) surface
    // as the same readable, retryable failure as malformed JSON.
    throw new Error('Onboarding output must be valid JSON', { cause });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Onboarding output must be valid JSON', { cause });
  }
  try {
    return onboardingAnalysisOutputSchema.parse(json);
  } catch (cause) {
    throw formatContractViolation(
      '六层分析结果',
      '模型输出已被拒绝且未写入任何层；请重试分析，或在审阅页对不合格层执行整层重生成。',
      cause,
    );
  }
}

function assertUniqueIds(layers: OnboardingLayers): void {
  const seen = new Map<OnboardingLayerKey, Set<string>>();
  for (const layer of ONBOARDING_LAYER_KEYS) {
    const ids = new Set<string>();
    for (const candidate of layers[layer].candidates) {
      if (ids.has(candidate.id)) throw new Error(`Duplicate ${layer} candidate id: ${candidate.id}`);
      ids.add(candidate.id);
    }
    seen.set(layer, ids);
  }
  for (const layer of ONBOARDING_LAYER_KEYS) {
    const self = seen.get(layer)!;
    const witnesses = new Set<string>();
    for (const other of ONBOARDING_LAYER_KEYS) {
      if (other === layer) continue;
      for (const id of seen.get(other)!) {
        if (self.has(id) && !witnesses.has(id)) witnesses.add(id);
      }
    }
    if (witnesses.size > 0) throw new Error(`Candidate id collides across layers: ${[...witnesses].join(', ')}`);
  }
}

function assertNoForbiddenFields(layers: OnboardingLayers): void {
  for (const character of layers.characters.candidates) {
    if (character.relationships.length !== 0) throw new Error(`B3 character ${character.id} must not infer relationships`);
    if (character.knowledgeIds.length !== 0) throw new Error(`B3 character ${character.id} must not infer knowledgeIds`);
    if (character.arc.keyBeats.length !== 0) throw new Error(`B3 character ${character.id} arc.keyBeats must be empty`);
  }
  const serialized = JSON.stringify(layers);
  if (/"(items|factions|globalFlags|knowledge)"/.test(serialized)) {
    throw new Error('Forbidden C3/items/factions/globalFlags fields present');
  }
}

function assertEvidenceReachable(output: OnboardingAnalysisOutput): void {
  const evidenceIds = new Set(Object.keys(output.evidence));
  for (const layer of ONBOARDING_LAYER_KEYS) {
    for (const id of output.layers[layer].evidenceIds) {
      if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id in ${layer}: ${id}`);
    }
  }
}

/**
 * Validate the model envelope against every cross-layer invariant. Throws on the
 * first violation; the caller must fail closed (no candidate is ever persisted).
 */
export function assertOnboardingOutput(output: OnboardingAnalysisOutput): void {
  assertEvidenceReachable(output);
  assertUniqueIds(output.layers);
  assertNoForbiddenFields(output.layers);
}

const LAYER_KEY_TO_NAME: Record<OnboardingLayerKey, string> = {
  characters: 'B3',
  worldview: 'B2',
  outline: 'B5',
  relationship: 'C1',
  state: 'C2',
  canon: 'C4',
};

/**
 * Reduce the parsed envelope into a Host-bound result: attach the binding triple
 * and return only the six layer projections plus the shared evidence map.
 */
export function reduceOnboardingResult(
  session: OnboardingSession,
  output: OnboardingAnalysisOutput,
): OnboardingAnalysisResult {
  const result = {
    projectId: session.projectId,
    onboardingSessionId: session.onboardingSessionId,
    sourceHash: session.sourceHash,
    evidence: output.evidence,
    layers: output.layers,
  };
  return onboardingAnalysisResultSchema.parse(result);
}

/** Deterministic candidate fingerprint for one layer (cross-layer isolation). */
export function layerHash(layers: OnboardingLayers, key: OnboardingLayerKey): string {
  const canonical = JSON.stringify({
    label: LAYER_KEY_TO_NAME[key],
    layer: layers[key],
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** All six layer hashes, keyed by layer, for regenerate isolation assertions. */
export function layerHashes(layers: OnboardingLayers): Record<OnboardingLayerKey, string> {
  const result = {} as Record<OnboardingLayerKey, string>;
  for (const key of ONBOARDING_LAYER_KEYS) result[key] = layerHash(layers, key);
  return result;
}

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

/**
 * Compact per-layer candidate field contracts for the prompts. Each layer is a
 * closed field list; any extra field (e.g. generic `type/name/summary`) or a
 * layer-level field leaked into a candidate is a contract violation.
 */
const ONBOARDING_LAYER_CONTRACT_SUMMARY =
  '每层 candidates 的字段契约（candidates 内禁止自造任何其他字段，也禁止把层级的 confidence/warnings/evidenceIds 放进候选；除非字段契约明确为字符串数组，否则数组元素必须是对象；所有枚举值必须逐字取自括号内选项，禁止自造）：' +
  '引用与数字规范：id 与引用字段（id,from,to,parent,participants,charactersInvolved,prerequisites,pov,characterId,knownBy,milestones,consequences 等）只能是 ASCII 小写字母/数字/下划线/连字符组成的引用 id（如 mira、act-1、north-harbor），禁止中文、空格与自然语言短语，且必须指向同包内其他候选的 id（无引用则为空数组）；数字字段（weight,affinity,trust,wordTarget,index,sourceChunkIndex）必须是 JSON number，禁止加引号。' +
  'characters: id,name,aliases,kind(protagonist|antagonist|supporting|extra|pov),personality,background,motivation,goals,flaws,abilities,speechStyle,staticTraits,arc{startingPoint,desiredEnd,keyBeats},relationships,knowledgeIds；' +
  'worldview: id,kind(geography|history|faction|culture|race|concept|artifact),title,content,keywords,triggerMode(keyword|regex|constant),weight,parent,mutable；' +
  'outline: id,structure(three-act|hero-journey|serial|free),logline,themes,acts[{id,index,title,goal,beats[{id,title,description,charactersInvolved,conflictType(internal|external|relational|world),prerequisites,optional,detailBeats[{id,title,summary,pov,wordTarget,points,status(planned|writing|done)}]}]}],foreshadowing[{id,hint,payoff,status(unplanted|planted|payed),knownBy}],endings[{id,title,conditions,description}]；' +
  'relationship: id,from(本包 characters 候选 id),to(本包 characters 候选 id),type(kin|romantic|friendship|rivalry|enmity|allegiance|mentor|subordinate),affinity(整数,-100..100),trust(整数,0..100),status,milestones(本包 canon 候选 id 或空数组),knownTo(本包 characters 候选 id 或空数组)；' +
  'state: id,storyTime,scene{location,timeOfDay,weather,season,atmosphere},characters[{characterId,location,alive,health,mood,inventory,condition,currentGoal,flags}]；' +
  'canon: id,storyTime,kind(event|decision|revelation|statechange|dialogue|correction),summary,detail,participants,location,consequences,affectedLayers。';

/** Build the deterministic I52 prompt for a full six-layer analysis. */
export function buildOnboardingPrompt(input: OnboardingAnalysisInput): string {
  return [
    '你是小说六层初始化分析器。根据输入文本生成严格候选包，只输出一个 JSON 对象，不得解释，不得写文件，不得使用 Markdown。',
    '必须输出 evidence（共享证据 map，键为证据 id，值为 sourceChunkIndex 与 quote）与 layers（六层）。',
    '六层为：characters(B3)、worldview(B2)、outline(B5)、relationship(C1)、state(C2)、canon(C4)。每层结构为 {candidates, confidence, warnings, evidenceIds}。',
    ONBOARDING_LAYER_CONTRACT_SUMMARY,
    '强制约束：B3 的 relationships/knowledgeIds/arc.keyBeats 必须为空数组；C2 只表达输入终点/故事起点，仅含 scene 与 characters 子集；C4 只包含文本明确事件且可为空数组。',
    '严格禁止：C3 知情层、items、factions、globalFlags、以及任何 C3/知识泄漏推断；candidates 内禁止出现 type/name/summary/confidence/evidenceIds 等通用字段。',
    `完整输出示例（仅演示字段名与嵌套结构，必须逐字遵循其键名；示例内容为格式演示，不得照抄到你的输出）：${JSON.stringify(ONBOARDING_PROMPT_EXAMPLE)}`,
    `输入文本块：${JSON.stringify(input.chunks)}`,
    `绑定（仅供你输出合法性参考，不得改写）：projectId=${input.projectId} onboardingSessionId=${input.onboardingSessionId} sourceHash=${input.sourceHash}`,
  ].join('\n');
}

/** Build a single-layer regeneration prompt; the other five layers are frozen. */
export function buildRegeneratePrompt(input: OnboardingAnalysisInput, layer: OnboardingLayerKey): string {
  return [
    '你是小说六层初始化分析器的单层重生成模块。',
    `只重新生成「${LAYER_KEY_TO_NAME[layer]}」这一层，严格保持其候选、confidence、warnings 与 evidenceIds 的结构契约。`,
    '只输出该层的 JSON 对象（{candidates,confidence,warnings,evidenceIds}），不得输出其他五层，不得解释，不得写文件，不得使用 Markdown。',
    ONBOARDING_LAYER_CONTRACT_SUMMARY,
    `本层候选字段示例（仅演示字段名与结构，必须逐字遵循其键名；内容不得照抄）：${JSON.stringify(ONBOARDING_PROMPT_EXAMPLE.layers[layer].candidates)}`,
    layer === 'characters' ? 'B3 的 relationships/knowledgeIds/arc.keyBeats 必须为空数组。' : '',
    layer === 'state' ? 'C2 只表达输入终点/故事起点，仅含 scene 与 characters 子集。' : '',
    layer === 'canon' ? 'C4 只包含文本明确事件且可为空数组。' : '',
    `输入文本块：${JSON.stringify(input.chunks)}`,
    `绑定：projectId=${input.projectId} onboardingSessionId=${input.onboardingSessionId} sourceHash=${input.sourceHash}`,
  ].filter(Boolean).join('\n');
}
