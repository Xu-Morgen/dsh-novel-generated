import { ONBOARDING_PROMPT_EXAMPLE } from '../src/core/onboarding/example.ts';
import { startUiTestProvider } from './ui-test-provider.mjs';

export const sourceText = Object.values(ONBOARDING_PROMPT_EXAMPLE.evidence).map(e=>e.quote).join('\n\n') + '\n\n北港没有魔法，任何调查都需要可核对的线索。灯塔下藏着半张海图，这个秘密将在调查后揭示。';
const readLine = (prompt,label) => JSON.parse(prompt.split('\n').find(line=>line.startsWith(label)).slice(label.length));
/** Fixed model-boundary fixture, separate from frozen sample/gold and application callbacks. */
export function startSourceTestProvider(override) {
  return startUiTestProvider(prompt => {
    const overridden = override?.(prompt);
    if (overridden !== undefined) return overridden;
    const result = (kind,value) => ({kind,output:JSON.stringify(value)});
    if(prompt.includes('你是来源解释分类器')) {
      const paragraphs=readLine(prompt,'Host 段落（按 index 阅读）：');
      return result('source',{sourceRole:'background-material',confidence:'high',evidenceParagraphIds:paragraphs.map(p=>p.paragraphId),paragraphs:paragraphs.map(p=>({paragraphId:p.paragraphId,role:'world-truth',confidence:'high',evidence:'北港背景素材'})),rationale:'背景素材只供作者规划。'});
    }
    if(prompt.includes('一次性 B1 规则与 B4')) return result('rule-style',{rules:[{id:'no-magic',scope:'global',kind:'genre',statement:'北港没有魔法，调查需要可核对的线索。',priority:50,immutable:false,examples:[],active:true}],style:{id:'style-imported',name:'北港悬疑',person:'third-limited',tense:'past',povScope:'single',tone:'克制',proseStyle:'紧贴角色感知',chapterFormat:'plain',dialogueConventions:'quotes',forbidden:['提前讲明秘密']}});
    if(prompt.includes('POV 叙事化候选生成器')) {
      const intent=readLine(prompt,'已确认叙事意图：'), evidence=readLine(prompt,'已确认证据段（必须按 paragraphId 回引）：');
      const id=intent.protagonistCandidateId ?? intent.protagonistId;
      return result('adaptation',{confidence:'high',evidenceParagraphIds:evidence.map(e=>e.paragraphId),outline:{id:'outline',structure:'free',logline:'林舟追查北港灯塔的失踪案。',themes:['追查'],acts:[{id:'act-1',index:0,title:'调查雨夜',goal:'追踪线索',beats:[{id:'beat-1',title:'码头疑问',description:'林舟追查一条潮痕线索。',charactersInvolved:[id],conflictType:'external',prerequisites:[],optional:false,detailBeats:[{id:'detail-1',title:'码头线索',summary:'林舟辨认旧灯塔旁的脚印。',pov:id,wordTarget:100,points:['脚印'],status:'planned'}]}]}],foreshadowing:[],endings:[]},...(intent.protagonistCandidateId?{protagonistCandidate:{id,name:'林舟',premise:'循线调查的青年'}}:{}),rationale:'从调查线索开始，不预先揭示幕后事实。'});
    }
    if(prompt.includes('B5 anchors：')) {
      const ids=readLine(prompt,'允许的角色：'),anchors=readLine(prompt,'B5 anchors：'),evidence=readLine(prompt,'已确认来源证据：'),intent=readLine(prompt,'POV 意图：');
      return result('reveal',{confidence:'high',entries:[{id:'map-secret',fact:'灯塔下藏着半张海图',kind:'secret',holders:[],revealPlan:{revealTo:[intent.protagonistCandidateId??intent.protagonistId],revealAt:anchors[0].id},status:'hidden',evidenceParagraphIds:evidence.map(e=>e.paragraphId)}],states:ids.map(characterId=>({characterId,knows:[]})),rationale:'调查之前主角不知道藏图。'});
    }
    if(prompt.includes('单层重生成模块')) {
      const key={B3:'characters',B2:'worldview',B5:'outline',C1:'relationship',C2:'state',C4:'canon'}[prompt.match(/只重新生成「(.*?)」/)[1]];
      return result('regenerate',structuredClone(ONBOARDING_PROMPT_EXAMPLE.layers[key]));
    }
    if(prompt.includes('六层') && prompt.includes('evidence')) {
      const value=structuredClone(ONBOARDING_PROMPT_EXAMPLE);
      for(const evidence of Object.values(value.evidence)) evidence.sourceChunkIndex=0;
      return result('foundation',value);
    }
    return undefined;
  });
}
