import { Button } from './ui/button.js';
import * as React from 'react';

import type {
  DesktopAssistantAdjudicationResult,
  DesktopAssistantCandidate,
  DesktopAssistantContextResult,
  DesktopAssistantInspireResult,
  DesktopAssistantStatusResponse,
} from '../../core/schema/desktop-assistant.js';
import type { DesktopAssistantClient } from './assistant-client.js';

type AssistantResult = {
  readonly status?: DesktopAssistantStatusResponse;
  readonly context?: DesktopAssistantContextResult;
  readonly candidate?: DesktopAssistantCandidate;
  readonly inspiration?: DesktopAssistantInspireResult;
};

function errorMessage(result: { readonly ok: false; readonly error: { readonly message: string } }): string {
  return result.error.message;
}

function adjudicationMessage(result: DesktopAssistantAdjudicationResult): string {
  if (result.status === 'written') return '候选已通过确认并写入正文。';
  if (result.status === 'rejected') return '候选已拒绝，正文未修改。';
  if (result.status === 'rewritten') return '已生成后继候选，原候选不再可接受。';
  if (result.status === 'pending-compensation') return '写作落地需要恢复，请在正文工作区继续处理。';
  return '候选未通过校验，正文未修改。';
}

function statusView(result: DesktopAssistantStatusResponse): React.ReactNode {
  if ('projects' in result) return `作品目录中有 ${result.projects.length} 个作品。`;
  return `作品状态：角色 ${result.characters}，世界观 ${result.worldview}，场景 ${result.scenes}。`;
}

/**
 * I181 最小桌面助手面：按钮只提交 Main-owned commands，结果仅保留本地
 * 交互态。接受候选仍经同一写作裁决服务与 ConfirmationGate，不提供命令行或
 * 任意 shell 能力（requirements R34-10）。
 */
export function DesktopAssistantPanel(props: { readonly client: DesktopAssistantClient; readonly projectId: string; readonly target?: { readonly chapterId: string; readonly sceneId: string } }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const busyRef = React.useRef(false);
  const generation = React.useRef(0);
  const [message, setMessage] = React.useState<string>('选择一个助手动作查看结果。');
  const [result, setResult] = React.useState<AssistantResult>({});
  const [candidate, setCandidate] = React.useState<DesktopAssistantCandidate | undefined>();

  React.useEffect(() => {
    generation.current += 1;
    busyRef.current = false;
    setFailed(false);
    setBusy(false);
    setMessage('选择一个助手动作查看结果。');
    setResult({});
    setCandidate(undefined);
    return () => { generation.current += 1; busyRef.current = false; };
  }, [props.projectId]);

  const run = async <T,>(request: () => Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } }>, apply: (value: T) => void): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    const currentGeneration = generation.current;
    setFailed(false);
    setBusy(true);
    try {
      const response = await request();
      if (generation.current !== currentGeneration) return;
      if (!response.ok) { setFailed(true); setMessage(errorMessage(response)); return; }
      apply(response.value);
    } catch {
      if (generation.current === currentGeneration) { setFailed(true); setMessage('助手操作失败，请稍后重试。'); }
    } finally {
      if (generation.current === currentGeneration) { busyRef.current = false; setBusy(false); }
    }
  };

  const h = React.createElement;
  return h('section', { className: 'nv-panel nv-assistant', 'data-novel-assistant': '', 'aria-label': '创作助手' },
    h('div', { className: 'nv-panel__header' },
      h('div', null, h('h2', { className: 'nv-panel__title' }, '创作助手'), h('p', { className: 'nv-panel__hint' }, '查看当前创作位置，获取灵感或审阅续写候选。')),
    ),
    h('div', { className: 'nv-assistant__actions' },
      h(Button, { type: 'button', variant: 'secondary', disabled: busy, 'data-novel-assistant-status': '', onClick: () => { void run(() => props.client.status(props.projectId), (value) => { setResult({ status: value }); setMessage(statusView(value) as string); }); } }, '查看状态'),
      h(Button, { type: 'button', variant: 'secondary', disabled: busy, 'data-novel-assistant-context': '', onClick: () => { void run(() => props.client.context(props.projectId), (value) => { setResult({ context: value }); setMessage(`当前写作卡：${value.currentCard.title}。最近已有 ${value.recentScenes} 个场景。`); }); } }, '查看上下文'),
      h(Button, { type: 'button', variant: candidate === undefined ? 'primary' : 'secondary', disabled: busy, 'data-novel-assistant-continue': '', onClick: () => { void run(() => props.client.continue(props.projectId, props.target?.chapterId, props.target ? `scene-${crypto.randomUUID()}` : undefined), (value) => { setCandidate(value); setResult({ candidate: value }); setMessage('续写候选已生成，确认前不会修改正文。'); }); } }, busy ? '处理中…' : '生成续写候选'),
      h(Button, { type: 'button', variant: 'secondary', disabled: busy, 'data-novel-assistant-inspire': '', onClick: () => { void run(() => props.client.inspire(props.projectId), (value) => { setResult({ inspiration: value }); setMessage(`已生成 ${value.directions.length} 个灵感方向；不会直接修改作品。`); }); } }, '获取灵感'),
    ),
    h('p', { className: 'nv-panel__hint', role: failed ? 'alert' : 'status', 'aria-live': failed ? 'assertive' : 'polite', 'data-novel-assistant-message': '' }, message),
    result.status === undefined ? null : h('p', { className: 'nv-assistant__result', 'data-novel-assistant-status-result': '' }, statusView(result.status)),
    result.context === undefined ? null : h('p', { className: 'nv-assistant__result', 'data-novel-assistant-context-result': '' }, `当前卡：${result.context.currentCard.title} · 可见角色 ${result.context.characters} 个`),
    result.inspiration === undefined ? null : h('ul', { className: 'nv-assistant__directions', 'data-novel-assistant-inspiration-result': '' }, result.inspiration.directions.map((direction) => h('li', { key: direction.id }, h('strong', null, direction.title), h('span', null, `：${direction.premise}`)))),
    candidate === undefined ? null : h('article', { className: 'nv-assistant__candidate', 'data-novel-assistant-candidate': candidate.candidateId },
      h('h3', { className: 'nv-panel__subtitle' }, '续写候选'),
      h('p', { className: 'nv-assistant__candidate-text', 'data-novel-assistant-candidate-text': '' }, candidate.text),
      h('div', { className: 'nv-assistant__candidate-actions' },
        h(Button, { type: 'button', variant: 'primary', disabled: busy, 'data-novel-assistant-accept': '', onClick: () => { void run(() => props.client.adjudicate(candidate.candidateId, 'accept'), (value) => { setMessage(adjudicationMessage(value)); if (value.status === 'written' || value.status === 'rejected') setCandidate(undefined); if (value.status === 'rewritten') setCandidate(value.candidate); }); } }, '确认并写入正文'),
        h(Button, { type: 'button', variant: 'ghost', disabled: busy, 'data-novel-assistant-reject': '', onClick: () => { void run(() => props.client.adjudicate(candidate.candidateId, 'reject'), (value) => { setMessage(adjudicationMessage(value)); setCandidate(undefined); }); } }, '不采用候选'),
      ),
    ),
  );
}
