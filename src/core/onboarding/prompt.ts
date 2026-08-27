import type { OnboardingAnalysisInput, OnboardingLayerKey } from '../schema/onboarding.js';
import { ONBOARDING_PROMPT_EXAMPLE } from './example.js';

/**
 * I52 six-layer initialization analyzer —— **prompt 构建段**（design §14.8 / R11-3；
 * 架构审查 §4.1 拆分：prompt.ts 持确定性 prompt 组装与超长契约字符串；校验在
 * validate.ts，few-shot 字面量在 example.ts）。
 *
 * 本模块只做字符串组装：把输入文本块、绑定三元组、契约摘要与 few-shot 示例拼成
 * 模型提示；不含任何 LLM 传输、持久化或解析逻辑。
 */

const LAYER_KEY_TO_NAME: Record<OnboardingLayerKey, string> = {
  characters: 'B3',
  worldview: 'B2',
  outline: 'B5',
  relationship: 'C1',
  state: 'C2',
  canon: 'C4',
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

/** 供 analyzer 根（layerHash）与 prompt 自身使用的层→缩写映射。 */
export { LAYER_KEY_TO_NAME };
