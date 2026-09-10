import * as React from 'react';
import { Button } from './ui/button.js';
import type { DesktopServiceBag } from './desktop-ipc-client.js';
import type { WorkbenchActions } from '../../client/store/types.js';
import type { ImportInterpretationReviewState } from '../../client/import-interpretation-review.js';
import { automaticProtagonistCandidateId } from '../../client/import-interpretation-review.js';
import { narrativeIntentSchema, type NarrativeIntent } from '../../core/schema/import-interpretation.js';
import { createOnboardingController } from '../../client/controllers.js';
import { analysisPanel, onboardingReview } from '../../client/onboarding-panels.js';
import type { OnboardingState } from '../../client/onboarding-types.js';
import { structuredEditor } from '../../client/structured-editor.js';
import { unwrap, type El } from '../../client/shared.js';
import { rawError, toUserMessage } from '../../client/presentation.js';
import type { NarrativeImportPlan, NarrativeImportPlanIdentity } from '../../core/schema/narrative-import-plan.js';
import type { NarrativeAdaptationIdentity } from '../../core/schema/narrative-adaptation.js';
import type { NarrativeRevealIdentity } from '../../core/schema/narrative-reveal.js';
import { SourcePlanStep, sourcePlanInputKey } from './source-plan-step.js';

const LABELS = { characters: '角色', worldview: '世界观', outline: '读者体验大纲', state: '起始状态', canon: '开场已公开事实', relationship: '关系', knowledge: '秘密与揭示计划' } as const;
const identityOf = ({ projectId, importSessionId, sourceHash, planId }: NarrativeImportPlan): NarrativeImportPlanIdentity => ({ projectId, importSessionId, sourceHash, planId });

/** I219: the final I11 plan may resolve the automatic placeholder to a reviewed foundation character. */
export function sourceIntentMatchesPlan(intent: NarrativeIntent | undefined, plan: NarrativeImportPlan): boolean {
  if (JSON.stringify(intent) === JSON.stringify(plan.narrativeIntent)) return true;
  const selected = plan.narrativeIntent.protagonistId;
  if (!intent || intent.protagonistCandidateId !== automaticProtagonistCandidateId(plan.sourceHash) || !selected || plan.package.outline.protagonistCandidate || !plan.package.characters.candidates.some(character => character.id === selected)) return false;
  return JSON.stringify(narrativeIntentSchema.parse({ ...intent, protagonistId: selected, protagonistCandidateId: undefined })) === JSON.stringify(narrativeIntentSchema.parse(plan.narrativeIntent));
}

/** Human-readable plan preview. Internal bindings remain in the strict Main document. */
function planPreview(plan: NarrativeImportPlan, layer: keyof typeof LABELS): React.ReactNode {
  const h = React.createElement;
  const pack = plan.package;
  const names = new Map(pack.characters.candidates.map(c => [c.id, c.name]));
  const person = (id: string): string => names.get(id) ?? '待建立角色';
  const lines = (items: readonly string[]): React.ReactNode => items.length ? h('ul', null, items.map((text,index)=>h('li',{key:index},text))) : h('p', null, '本次没有新增内容。');
  switch (layer) {
    case 'characters': return lines(pack.characters.candidates.map(c=>`${c.name}：${c.background}；${c.motivation}`));
    case 'worldview': return lines(pack.worldview.candidates.map(c=>`${c.title}：${c.content}`));
    case 'relationship': return lines(pack.relationship.candidates.map(c=>`${person(c.from)}与${person(c.to)}：亲密度 ${c.affinity}，信任度 ${c.trust}`));
    case 'state': return lines(pack.state.candidates.map(c=>`开场时间：${c.storyTime}；场景：${c.scene.location}`));
    case 'canon': return lines(pack.canon.candidates.map(c=>c.summary));
    case 'outline': return h('div',null,h('p',null,pack.outline.outline.logline),...pack.outline.outline.acts.map(act=>h('article',{key:act.id},h('h3',null,act.title),h('p',null,act.goal),lines(act.beats.map(beat=>`${beat.title}：${beat.description}`)))),h('p',null,pack.outline.rationale));
    case 'knowledge': return h('div',null,lines(pack.knowledge.entries.map(entry=>`${entry.fact}；开场知情者：${entry.holders.map(person).join('、') || '无人'}；揭示给：${entry.revealPlan.revealTo.map(person).join('、')}；揭示位置：${pack.outline.outline.acts.flatMap(a=>a.beats).find(b=>b.id===entry.revealPlan.revealAt)?.title ?? '待核对节拍'}`)),h('p',null,pack.knowledge.rationale));
  }
}

/**
 * I194 / §14.15: source-confirmed consumer of existing Main candidates and I11 plans.
 * Only a plan identity is remembered locally. Reload reads the durable Main checkpoint;
 * generation is explicit, cancellable, and cannot write a domain layer before confirmation.
 */
export function useSourcePlanPanel(props: {
  readonly projectId: string; readonly review?: ImportInterpretationReviewState;
  readonly services: DesktopServiceBag; readonly actions: WorkbenchActions;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onboarding?: OnboardingState; readonly onComplete: () => void;
}): React.ReactElement | null {
  const { services, review, projectId } = props;
  const [busy, setBusy] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [manualSettingsReady, setManualSettingsReady] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [plan, setPlan] = React.useState<NarrativeImportPlan>();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<NarrativeImportPlan['package']>();
  const [foundationCharacters, setFoundationCharacters] = React.useState<{ key: string; list: { id: string; name: string; background: string }[] }>();
  const [protagonistChoice, setProtagonistChoice] = React.useState<{ key: string; id: string }>();
  React.useEffect(() => { props.onDirtyChange(editing); return () => props.onDirtyChange(false); }, [editing, projectId]);
  const active = React.useRef(true);
  const projectRef = React.useRef(projectId);
  projectRef.current = projectId;
  const isCurrent = (): boolean => active.current && projectRef.current === projectId;
  const generation = React.useRef(0);
  const lock = React.useRef(false);
  const cancelRemote = React.useRef<() => Promise<unknown>>(async () => {});
  const steps = React.useRef({ foundation: new SourcePlanStep<string>(), adaptation: new SourcePlanStep<NarrativeAdaptationIdentity>(), reveal: new SourcePlanStep<NarrativeRevealIdentity>() });
  const key = `novel-source-plan:${projectId}`;
  const remember = (value: NarrativeImportPlan): void => {
    if (!isCurrent()) return;
    setPlan(value); setDraft(value.package); setEditing(false);
    try { localStorage.setItem(key, JSON.stringify(identityOf(value))); } catch { /* Main checkpoint remains authoritative. */ }
  };
  const ordinary = React.useMemo(() => {
    const operations = new Set<string>();
    return createOnboardingController({
      analyzer: () => services.analyzer, onboarding: () => services.onboarding,
      currentProjectId: () => projectId, isActive: isCurrent,
      dispatch: (fn) => { if (isCurrent()) fn(props.actions); },
      beginOp: (op) => { if (operations.has(op)) return false; operations.add(op); return true; },
      endOp: (op) => { operations.delete(op); },
      openProject: () => props.onComplete(),
    });
  }, [services, projectId, props.actions]);
  React.useEffect(() => {
    active.current = true;
    Object.values(steps.current).forEach(step => step.clear());
    setFoundationCharacters(undefined); setProtagonistChoice(undefined);
    setPlan(undefined); setDraft(undefined); setEditing(false); setError(''); setBusy(false); setGenerating(false); setManualSettingsReady(false); lock.current = false;
    if (!projectId) return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (raw && typeof raw === 'object' && 'projectId' in raw && raw.projectId === projectId) {
        // Untrusted preference is sent through the strict canonical argument gate.
        void unwrap(services.narrativeImportPlan.read(raw as NarrativeImportPlanIdentity)).then(value => {
          if (isCurrent()) remember(value);
        }, () => { if (isCurrent()) setError('上次导入计划无法读取，请核对作品与来源后重试。'); });
      }
    } catch { setError('导入恢复记录无效，请重新审阅来源。'); }
    return () => { ordinary.cancelAnalysis(); active.current = false; generation.current++; ordinary.clearPoll(); void cancelRemote.current().catch(() => {}); };
  }, [projectId, services, ordinary]);
  const run = async (operation: () => Promise<void>, kind: 'command' | 'generation' = 'command'): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setGenerating(kind === 'generation'); setError('');
    const turn = generation.current;
    try { await operation(); }
    catch (cause) { if (isCurrent() && turn === generation.current) {
      // unwrap appends transport metadata; it must not turn safe Chinese errors into a generic fallback.
      const message = rawError(cause).replace(/ \[code=[\w-]+; method=[^\]]+\]$/, '');
      if (message.startsWith('计划合并失败：大纲')) { steps.current.adaptation.clear(); steps.current.reveal.clear(); }
      if (message.startsWith('计划合并失败：故事资料') || message.startsWith('故事资料任务与当前作品')) Object.values(steps.current).forEach(step => step.clear());
      setError(toUserMessage(message, '操作未完成，请检查后重试。'));
      if (kind === 'generation') setMessage('本次生成未完成，尚未写入故事资料。');
    } }
    finally { if (isCurrent() && turn === generation.current) { lock.current = false; setBusy(false); setGenerating(false); } }
  };
  const generate = (): void => { void run(async () => {
    if (!review?.confirmed || !review.importSessionId || review.paragraphs.some(p => p.decision === 'pending')) throw new Error('请先确认全部来源。');
    const turn = generation.current;
    const assertCurrent = (): void => { if (!isCurrent() || turn !== generation.current) throw new Error('生成已取消'); };
    const registerCancel = async (cancel: () => Promise<unknown>): Promise<void> => { cancelRemote.current = cancel; if (!isCurrent() || turn !== generation.current) { await cancel(); assertCurrent(); } };
    const identity = { projectId, importSessionId: review.importSessionId, sourceHash: review.sourceHash };
    const confirmed = await unwrap(services.importInterpretation.read(identity));
    if (confirmed.status !== 'confirmed') throw new Error('来源确认已失效，请返回重新审阅。');
    const evidence = review.paragraphs.filter(p => p.decision !== 'rejected').map(p => { const role = p.selectedRole ?? p.suggestedRole; if (!role) throw new Error('来源段落缺少已确认分类。'); return { paragraphId: p.paragraphId, role, text: p.text }; });
    if (confirmed.intent.treatment !== 'adapt-pov' || !confirmed.intent.narrativeIntent || confirmed.intent.sourceRole === 'existing-prose' || confirmed.intent.sourceRole === 'synopsis') throw new Error('当前来源不属于视角重构路径。');
    const input = { ...identity, sourceRole: confirmed.intent.sourceRole, treatment: 'adapt-pov' as const, narrativeIntent: confirmed.intent.narrativeIntent, evidence };
    const inputKey = await sourcePlanInputKey(input); assertCurrent();
    const poll = async (status: () => Promise<string>, result: () => Promise<unknown>, label: string): Promise<void> => {
      for (;;) { assertCurrent(); const value = await status(); assertCurrent(); if (value === 'succeeded') return;
        if (value === 'failed') { await result(); assertCurrent(); throw new Error(`${label}生成失败，请重试。`); }
        if (value === 'cancelled') throw new Error(`${label}生成已取消。`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    };
    setMessage('正在分析角色、世界观、关系与起始状态…');
    const foundationSessionId = await steps.current.foundation.acquire(inputKey, async () => {
      const value = await unwrap(services.analyzer.begin({ projectId, sourceHash: review.sourceHash, text: evidence.map(p=>p.text).join('\n\n') }, undefined));
      await registerCancel(() => unwrap(services.analyzer.cancel(value.onboardingSessionId))); return value.onboardingSessionId;
    }, id => unwrap(services.analyzer.status(id)), assertCurrent);
    const foundationId = { onboardingSessionId: foundationSessionId };
    await registerCancel(() => unwrap(services.analyzer.cancel(foundationId.onboardingSessionId)));
    await poll(() => unwrap(services.analyzer.status(foundationId.onboardingSessionId)), () => unwrap(services.analyzer.result(foundationId.onboardingSessionId)), '故事资料');
    const foundation = await unwrap(services.analyzer.result(foundationId.onboardingSessionId)); assertCurrent();
    setFoundationCharacters({ key: inputKey, list: foundation.layers.characters.candidates.map(({ id, name, background }) => ({ id, name, background })) });
    if (protagonistChoice?.key === inputKey && input.narrativeIntent.pov === 'limited') {
      if (!foundation.layers.characters.candidates.some(character => character.id === protagonistChoice.id)) throw new Error('选择的基础角色已变化，请重新选择。');
      input.narrativeIntent = { ...input.narrativeIntent, protagonistId: protagonistChoice.id, protagonistCandidateId: undefined };
    }
    const narrativeKey = await sourcePlanInputKey(input); assertCurrent();
    setMessage('正在安排读者体验与视角大纲…');
    const adaptationId = await steps.current.adaptation.acquire(`${narrativeKey}:${foundationSessionId}`, async () => {
      const value = await unwrap(services.narrativeAdaptation.beginBound({ input, onboardingSessionId: foundationSessionId }));
      await registerCancel(() => unwrap(services.narrativeAdaptation.cancel(value))); return value;
    }, async id => (await unwrap(services.narrativeAdaptation.status(id))).status, assertCurrent);
    await registerCancel(() => unwrap(services.narrativeAdaptation.cancel(adaptationId)));
    await poll(async () => {
      const progress = await unwrap(services.narrativeAdaptation.repairProgress(adaptationId)); assertCurrent();
      if (progress.attempt) setMessage(`正在修正读者体验大纲，第 ${progress.attempt}/2 次…`);
      return (await unwrap(services.narrativeAdaptation.status(adaptationId))).status;
    }, () => unwrap(services.narrativeAdaptation.result(adaptationId)), '读者体验大纲');
    const outline = (await unwrap(services.narrativeAdaptation.result(adaptationId))).candidate; assertCurrent();
    setMessage('正在安排秘密与揭示时机…');
    const characterIds = [...new Set([...foundation.layers.characters.candidates.map(c=>c.id), ...(outline.protagonistCandidate ? [outline.protagonistCandidate.id] : [])])];
    const revealId = await steps.current.reveal.acquire(`${narrativeKey}:${adaptationId.adaptationId}`, async () => {
      const value = await unwrap(services.narrativeReveal.begin({ ...input, b5CandidateId: outline.candidateId, characterIds, b5Anchors: outline.outline.acts.flatMap(act=>act.beats.map(beat=>({id:beat.id,actId:act.id,beatId:beat.id,label:beat.title}))) }, undefined));
      await registerCancel(() => unwrap(services.narrativeReveal.cancel(value))); return value;
    }, async id => (await unwrap(services.narrativeReveal.status(id))).status, assertCurrent);
    await registerCancel(() => unwrap(services.narrativeReveal.cancel(revealId)));
    await poll(async () => {
      const progress = await unwrap(services.narrativeReveal.repairProgress(revealId)); assertCurrent();
      if (progress.attempt) setMessage(`正在修正秘密揭示计划，第 ${progress.attempt}/2 次…`);
      return (await unwrap(services.narrativeReveal.status(revealId))).status;
    }, () => unwrap(services.narrativeReveal.result(revealId)), '秘密揭示计划');
    const knowledge = (await unwrap(services.narrativeReveal.result(revealId))).candidate; assertCurrent();
    // §14.15: no source paragraph has author-confirmed public-at-start visibility here.
    // The old analyzer's B5/C4 output therefore cannot enter this plan.
    const value = await unwrap(services.narrativeImportPlan.propose({ ...identity, sourceRole: input.sourceRole, treatment: 'adapt-pov', narrativeIntent: input.narrativeIntent,
      package: { characters: foundation.layers.characters, worldview: foundation.layers.worldview, state: foundation.layers.state, relationship: foundation.layers.relationship,
        outline, knowledge, canon: { candidates: [], confidence: 'high', warnings: ['尚未确认开场已公开事实，初始正史留空。'], evidenceIds: [] } } }));
    assertCurrent(); remember(value); Object.values(steps.current).forEach(step => step.clear()); setMessage('计划已生成；确认前不会写入故事资料。');
  }, 'generation'); };
  const cancel = (): void => { if (!generating) return; setGenerating(false); generation.current++; lock.current = false; setBusy(false); setMessage('生成已取消，尚未应用故事资料。'); void cancelRemote.current().catch(()=>{}); };
  const decision = (kind: 'accept' | 'reject' | 'recover'): void => { if (!plan) return; void run(async () => {
    const source = await unwrap(services.importInterpretation.read({projectId,importSessionId:plan.importSessionId,sourceHash:plan.sourceHash}));
    if (source.status !== 'confirmed' || source.intent.treatment !== plan.treatment || source.intent.sourceRole !== plan.sourceRole || !sourceIntentMatchesPlan(source.intent.narrativeIntent, plan)) throw new Error('来源意图已改变，请重新生成计划。');
    const result = await unwrap(services.narrativeImportPlan[kind](identityOf(plan)));
    if (!isCurrent()) return;
    remember(result);
    setMessage(result.status === 'applied' ? '故事资料已写入，可以进入大纲。' : result.status === 'rejected' ? '已不采用本计划。' : '计划尚未全部写入，请恢复同一计划。');
    if (result.errors.length) setError(result.errors.join('；'));
  }); };
  const confirmed = review?.confirmed === true;
  if (!confirmed && !plan && !error) return null;
  const h = React.createElement;
  const initialized = manualSettingsReady || review?.ruleStyleInitialization?.status === 'applied';
  if (!plan && confirmed && !initialized) return h('section', { className: 'nv-panel' }, h('p', { className: 'nv-control-reason' }, '先完成规则与文风确认，或在规则与文风页手工保存。'),
    h(Button,{disabled:busy,onClick:()=>{void run(async()=>{const value=await unwrap(services.ruleStyleNamespace.list(projectId)); if(!value.style || !value.rules.some(r=>r.active)) throw new Error('请保存至少一条生效规则和完整文风。');if(isCurrent()) setManualSettingsReady(true);});}},'检查已保存的规则与文风'),error?h('p',{role:'alert'},error):null);
  if (review?.treatment === 'expand-outline') return h('section', { className: 'nv-panel', 'data-novel-source-plan': 'ordinary' },
    h('h2', null, '故事资料与大纲'),
    h('p', null, '角色未指定起点知情信息时从未知状态开始；本次不自动添加秘密或已知事实。'),
    props.onboarding === undefined ? h(Button, { variant: 'primary', 'data-novel-source-plan-generate': '', onClick: () => ordinary.startAnalysis(projectId, review.sourceHash, review.paragraphs.filter(p=>p.decision!=='rejected').map(p=>p.text).join('\n\n')) }, '生成故事资料候选') : null,
    props.onboarding ? analysisPanel(h as El, props.onboarding, ordinary.cancelAnalysis, ordinary.retryAnalysis) as React.ReactNode : null,
    props.onboarding?.layers ? onboardingReview(h as El, services.onboarding, props.onboarding, ordinary.patchOnboarding, ordinary.decideOnboarding, ordinary.applyOnboarding) as React.ReactNode : null,
  );
  return h('section', { className: 'nv-panel', 'data-novel-source-plan': plan?.status ?? 'idle', 'aria-busy': busy },
    h('h2', null, '故事资料、读者体验与揭示计划'),
    h('p', null, '检查角色、事件顺序与秘密揭示时机后，再确认写入。'),
    message ? h('p', { role: 'status', 'aria-live': 'polite' }, message) : null,
    error ? h('p', { role: 'alert', 'data-novel-source-plan-error': '' }, error) : null,
    error && !plan && review?.narrativeIntent?.pov === 'limited' && foundationCharacters?.list.length ? h('section', { 'data-novel-protagonist-reuse': '' },
      h('p', null, '基础资料已包含以下角色。可以选择其中一位作为主角，再点击重试；仅重新生成后续大纲与揭示计划，最终写入仍需确认。'),
      h('select', { 'aria-label': '复用基础角色作为主角', 'data-novel-protagonist-select': '', disabled: busy, value: protagonistChoice?.key === foundationCharacters.key ? protagonistChoice.id : '', onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setProtagonistChoice(event.target.value ? { key: foundationCharacters.key, id: event.target.value } : undefined) },
        h('option', { value: '' }, '沿用原来的新主角请求'),
        ...foundationCharacters.list.map(character => h('option', { key: character.id, value: character.id }, `${character.name}：${character.background}`))),
    ) : null,
    !plan || plan.status === 'rejected' || plan.status === 'stale' ? h(Button, { variant:'primary', disabled:busy || !confirmed, 'data-novel-source-plan-generate':'', onClick:generate }, busy?'正在生成…':error?'重试未完成步骤':'生成叙事计划') : null,
    error && !plan ? h('p', null, '同一页面与来源下，已成功步骤会保留；重试只重新请求失败或取消的步骤，并继续后续流程。') : null,
    generating ? h(Button, { variant:'ghost', onClick:cancel, 'data-novel-source-plan-cancel':'' }, '取消生成') : null,
    plan ? h('div', null,
      h('p', { role:'status' }, `已写入 ${plan.committedStages.length} 类资料`),
      Object.entries(LABELS).map(([name,label])=>h('details',{key:name,className:'nv-fieldset',open:name==='outline'},h('summary',null,label),
        editing ? structuredEditor(h as El, draft?.[name as keyof typeof LABELS], next=>setDraft(value=>value ? {...value,[name]:next} : value),`source-plan-${name}`) as React.ReactNode
          : planPreview(plan,name as keyof typeof LABELS))),
      plan.status==='pending' ? h('div',{className:'nv-editor__actions'},
        h(Button,{variant:'primary',disabled:busy || editing,'data-novel-source-plan-accept':'',onClick:()=>decision('accept')},'确认写入故事资料'),
        h(Button,{variant:'secondary',disabled:busy,'data-novel-source-plan-edit':'',onClick:()=>setEditing(!editing)},editing?'取消修改':'修改计划'),
        editing ? h(Button,{disabled:busy,'data-novel-source-plan-edit-save':'',onClick:()=>{void run(async()=>{
          if(!draft) return;
          const next=await unwrap(services.narrativeImportPlan.propose({projectId,importSessionId:plan.importSessionId,sourceHash:plan.sourceHash,sourceRole:plan.sourceRole,treatment:plan.treatment,narrativeIntent:plan.narrativeIntent,package:draft}));
          // An unchanged edit can return the same idempotent proposal. Never reject it.
          if (next.planId !== plan.planId) await unwrap(services.narrativeImportPlan.reject(identityOf(plan)));
          if(isCurrent()) remember(next);
        });}},'提交修改后重新确认') : null,
        h(Button,{variant:'ghost',disabled:busy,'data-novel-source-plan-reject':'',onClick:()=>decision('reject')},'不采用计划')) : null,
      plan.status==='partial-failure'||plan.status==='pending-recovery'||plan.status==='accepted' ? h(Button,{variant:'primary',disabled:busy,'data-novel-source-plan-recover':'',onClick:()=>decision(plan.status==='accepted'?'accept':'recover')},'恢复未完成的写入') : null,
      plan.status==='applied' ? h(Button,{variant:'primary','data-novel-source-plan-next':'',onClick:props.onComplete},'进入大纲与细纲') : null,
    ) : null,
  );
}
