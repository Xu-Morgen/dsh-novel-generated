import type { El } from '../shared.js';
import { mergeFieldSchema, type CharacterMergeInput, type CharacterMergePreview, type CharacterMergeNamespace } from '../../app/character-merge-contract.js';

/** Local form and durable-plan handles only; Main owns the merge snapshots. */
export interface CharacterMergeEditor{
  sourceId:string;targetId:string;fields:CharacterMergeInput['fields'];stateFrom:'source'|'target';knowledgeFrom:'source'|'target';
  preview?:CharacterMergePreview;
  pending:Awaited<ReturnType<CharacterMergeNamespace['characterMergePending']>>;
}
export const emptyCharacterMerge=():CharacterMergeEditor=>({sourceId:'',targetId:'',fields:[],stateFrom:'target',knowledgeFrom:'target',pending:[]});
export interface CharacterMergeOps{
  changeMerge?(patch:Partial<CharacterMergeEditor>):void;
  proposeMerge?():void;
  decideMerge?(proposalId:string,accept:boolean):void;
}
const labels:Record<string,string>={name:'名称',aliases:'别名',kind:'类型',personality:'性格',background:'背景',motivation:'动机',goals:'目标',flaws:'缺陷',abilities:'能力',speechStyle:'口吻',staticTraits:'固定特征',arc:'人物弧光',relationships:'关系索引',knowledgeIds:'知识索引'};
/** Explicit author choices plus I11 preview and reloadable recovery actions. */
export function characterMergePanel(h:El,editor:CharacterMergeEditor,records:{id:string;name:string;status:string}[],busy:boolean,ops:CharacterMergeOps):unknown{
  const choice=(label:string,key:'stateFrom'|'knowledgeFrom')=>h('label',null,label,h('select',{'data-character-merge-choice':key,value:editor[key],disabled:busy,onChange:(event:{target:{value:'source'|'target'}})=>ops.changeMerge?.({[key]:event.target.value,preview:undefined})},h('option',{value:'target'},'采用保留角色'),h('option',{value:'source'},'采用原角色')));
  return h('section',{'data-character-merge':''},
    h('h3',null,'合并重复角色'),h('p',null,'选择保留身份，再选择每项资料来源。先预览，确认后迁移当前引用并冻结原角色。'),
    ...(['sourceId','targetId'] as const).map(key=>h('label',{key},key==='sourceId'?'原角色（合并后冻结）':'保留角色',h('select',{'data-character-merge-select':key,value:editor[key],disabled:busy||editor.pending.length>0,onChange:(event:{target:{value:string}})=>ops.changeMerge?.({[key]:event.target.value,preview:undefined})},h('option',{value:''},'请选择角色'),...records.filter(record=>record.status!=='deleted'&&(key==='sourceId'||record.status==='active')).map(record=>h('option',{key:record.id,value:record.id},`${record.name}（${record.id}）`))))),
    h('details',null,h('summary',null,'逐项选择资料来源（默认保留角色）'),...mergeFieldSchema.options.map(field=>h('label',{key:field},labels[field],h('select',{'data-character-merge-field':field,value:editor.fields.find(item=>item.field===field)?.from??'target',disabled:busy||editor.pending.length>0,onChange:(event:{target:{value:'source'|'target'}})=>ops.changeMerge?.({fields:editor.fields.filter(item=>item.field!==field).concat({field,from:event.target.value}),preview:undefined})},h('option',{value:'target'},'采用保留角色'),h('option',{value:'source'},'采用原角色'))))),
    choice('当前状态来源','stateFrom'),choice('知情来源（不会取两方并集）','knowledgeFrom'),
    h('button',{type:'button',className:'nv-btn','data-character-merge-propose':'',disabled:busy||editor.pending.length>0||!editor.sourceId||!editor.targetId||editor.sourceId===editor.targetId,onClick:ops.proposeMerge},'预览合并'),
    editor.preview?h('div',{'data-character-merge-preview':''},...editor.preview.changes.map((line,index)=>h('p',{key:index},line)),h('details',null,h('summary',null,'原角色资料'),h('pre',null,JSON.stringify(editor.preview.source,null,2))),h('details',null,h('summary',null,'保留角色原资料'),h('pre',null,JSON.stringify(editor.preview.target,null,2))),h('h4',null,'合并后的资料'),h('pre',null,JSON.stringify(editor.preview.result,null,2)),h('h4',null,'合并后的当前状态'),h('pre',null,JSON.stringify(editor.preview.state,null,2)),h('h4',null,'合并后已知事实'),h('p',null,editor.preview.knownFacts.join('\n')||'无')):null,
    ...editor.pending.map(plan=>h('div',{key:plan.proposalId,'data-character-merge-pending':plan.proposalId},h('p',null,`${plan.sourceId} → ${plan.targetId}`),h('button',{type:'button',className:'nv-btn','data-character-merge-confirm':'',disabled:busy||(!plan.accepted&&!editor.preview),onClick:()=>ops.decideMerge?.(plan.proposalId,true)},plan.accepted?'继续完成已确认合并':'确认合并'),!plan.accepted?h('button',{type:'button',className:'nv-btn','data-character-merge-cancel':'',disabled:busy,onClick:()=>ops.decideMerge?.(plan.proposalId,false)},'取消预览'):null)),
  );
}
