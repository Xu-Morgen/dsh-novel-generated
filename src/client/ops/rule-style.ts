// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// rule-style 层编辑动作 = I67 规则与文风 ops（R14-2）：刷新/规则选中与新建/表单草稿/保存，经 ruleStyleNamespace。

import { unwrap } from '../shared.js';
import { freshRuleDraft, freshStyleDraft } from '../layers/rule-style.js';
import type { RuleDraftShape, RuleShape, RuleStyleEditOps, RuleStyleLayerState, RuleStyleProjectionShape, StyleDraftShape, StyleShape } from '../layers/rule-style.js';
import type { OpsContext } from './context.js';

export function createRuleStyleOps(ctx: OpsContext): RuleStyleEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const ruleStyleNamespace = ctx.ruleStyleNamespace;
      const ruleStylePatch = (patch: Partial<RuleStyleLayerState>): void => act.ruleStylePatch(patch);
      const ruleDraftFrom = (rule: RuleShape): RuleDraftShape => ({
        id: rule.id, scope: rule.scope, kind: rule.kind, statement: rule.statement,
        priority: String(rule.priority), immutable: rule.immutable, active: rule.active,
        examples: [...rule.examples],
      });
      const styleDraftFrom = (style: StyleShape | null): StyleDraftShape => style === null
        ? freshStyleDraft()
        : {
          name: style.name, person: style.person, tense: style.tense, povScope: style.povScope,
          tone: style.tone, proseStyle: style.proseStyle, chapterFormat: style.chapterFormat,
          dialogueConventions: style.dialogueConventions, forbidden: [...style.forbidden],
        };
      return {
        refresh(): void {
          const target = ruleStyleNamespace;
          if (!target || projectId === undefined) { ruleStylePatch({ status: 'error', message: '规则与文风服务不可用' }); return; }
          if (!beginOp('ruleStyle:refresh')) return;
          const release = (): void => endOp('ruleStyle:refresh');
          ruleStylePatch({ status: 'loading', message: undefined });
          void unwrap(target.list(projectId)).then((projection) => {
            release();
            if (!isActive()) return;
            const result = projection as RuleStyleProjectionShape;
            ruleStylePatch({ status: 'ready', projection: result, styleDraft: styleDraftFrom(result.style), message: undefined });
          }, (cause: Error) => { release(); if (!isActive()) return; ruleStylePatch({ status: 'error', message: (cause as Error).message }); });
        },
        selectRule(ruleId: string): void {
          const target = ruleStyleNamespace;
          const state = snapshot.ruleStyle;
          if (!target || projectId === undefined || state.acting) return;
          if (state.editingRuleId === ruleId) {
            ruleStylePatch({ editingRuleId: undefined, ruleDraft: undefined, message: undefined });
            return;
          }
          if (!beginOp(`ruleStyle:read:${ruleId}`)) return;
          const release = (): void => endOp(`ruleStyle:read:${ruleId}`);
          void unwrap(target.readRule(projectId, ruleId)).then((rule) => {
            release();
            if (!isActive()) return;
            ruleStylePatch({ editingRuleId: ruleId, ruleDraft: ruleDraftFrom(rule as RuleShape), message: undefined });
          }, (cause: Error) => { release(); if (!isActive()) return; ruleStylePatch({ message: (cause as Error).message }); });
        },
        newRule(): void {
          const editing = snapshot.ruleStyle.editingRuleId === '__new__';
          ruleStylePatch({ editingRuleId: editing ? undefined : '__new__', ruleDraft: editing ? undefined : freshRuleDraft(), message: undefined });
        },
        cancelRuleEdit(): void { ruleStylePatch({ editingRuleId: undefined, ruleDraft: undefined, message: undefined }); },
        setRuleDraft(patch: Partial<RuleDraftShape>): void {
          const draft = snapshot.ruleStyle.ruleDraft;
          if (draft === undefined) return;
          ruleStylePatch({ ruleDraft: { ...draft, ...patch }, message: undefined });
        },
        saveRule(): void {
          const target = ruleStyleNamespace;
          const state = snapshot.ruleStyle;
          if (!target || projectId === undefined || state.ruleDraft === undefined || state.acting) return;
          const draft = state.ruleDraft;
          if (!beginOp(`ruleStyle:save:${state.editingRuleId ?? ''}`)) return;
          const release = (): void => endOp(`ruleStyle:save:${state.editingRuleId ?? ''}`);
          const payload = {
            scope: draft.scope, kind: draft.kind, statement: draft.statement.trim(),
            priority: Number(draft.priority), immutable: draft.immutable, active: draft.active,
            examples: [...draft.examples],
          };
          ruleStylePatch({ acting: true, message: undefined });
          const call = state.editingRuleId === '__new__'
            ? target.createRule(projectId, { ...payload, id: draft.id.trim() })
            : target.updateRule(projectId, draft.id.trim(), payload);
          void unwrap(call).then((rule) => {
            release();
            if (!isActive()) return;
            const saved = rule as RuleShape;
            ruleStylePatch({ acting: false, editingRuleId: undefined, ruleDraft: undefined, message: `已保存规则「${saved.id}」（v${saved.version}）。` });
            // 刷新列表投影以反映同一 Host 真相（生成/检测消费同一存储）。
            void unwrap(target.list(projectId)).then((projection) => {
              if (!isActive()) return;
              const result = projection as RuleStyleProjectionShape;
              ruleStylePatch({ projection: result, status: 'ready' });
            }, () => undefined);
          }, (cause: Error) => { release(); if (!isActive()) return; ruleStylePatch({ acting: false, message: (cause as Error).message }); });
        },
        setStyleDraft(patch: Partial<StyleDraftShape>): void {
          ruleStylePatch({ styleDraft: { ...snapshot.ruleStyle.styleDraft, ...patch }, message: undefined });
        },
        saveStyle(): void {
          const target = ruleStyleNamespace;
          const state = snapshot.ruleStyle;
          if (!target || projectId === undefined || state.acting) return;
          if (!beginOp('ruleStyle:saveStyle')) return;
          const release = (): void => endOp('ruleStyle:saveStyle');
          const draft = state.styleDraft;
          const input = {
            name: draft.name.trim(), person: draft.person, tense: draft.tense, povScope: draft.povScope,
            tone: draft.tone.trim(), proseStyle: draft.proseStyle.trim(), chapterFormat: draft.chapterFormat.trim(),
            dialogueConventions: draft.dialogueConventions.trim(), forbidden: [...draft.forbidden],
          };
          ruleStylePatch({ acting: true, message: undefined });
          void unwrap(target.saveStyle(projectId, input)).then((style) => {
            release();
            if (!isActive()) return;
            const saved = style as StyleShape;
            ruleStylePatch({ acting: false, message: `已保存风格档案「${saved.name}」（v${saved.version}，id ${saved.id}）。` });
            // 刷新投影：style 视图同步（含 version/id）。
            void unwrap(target.list(projectId)).then((projection) => {
              if (!isActive()) return;
              const result = projection as RuleStyleProjectionShape;
              ruleStylePatch({ projection: result, status: 'ready', styleDraft: styleDraftFrom(result.style) });
            }, () => undefined);
          }, (cause: Error) => { release(); if (!isActive()) return; ruleStylePatch({ acting: false, message: (cause as Error).message }); });
        },
        dismiss() { ruleStylePatch({ status: 'idle', projection: undefined, message: undefined, editingRuleId: undefined, ruleDraft: undefined, styleDraft: freshStyleDraft(), acting: false }); },
      };
}
