import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { LlmMonitorSnapshot } from '../llm-monitor-contract.js';

declare global { interface Window { novelMonitor: { version: 1; subscribe(listener: (snapshot: LlmMonitorSnapshot) => void): () => void }; } }
const labels = { connecting: '正在连接', reasoning: '正在推理', generating: '正在接收正文', complete: '传输完成', failed: '请求失败', cancelled: '已取消' };
function Monitor(): React.ReactElement {
  const [snapshot, setSnapshot] = React.useState<LlmMonitorSnapshot>({ version: 1, requests: [] });
  React.useEffect(() => window.novelMonitor.subscribe(setSnapshot), []);
  return React.createElement('main', null, React.createElement('h1', null, 'AI 过程与错误'),
    React.createElement('p', null, '关闭本窗口不会中断生成。传输完成后，主窗口可能继续校验或处理结果。'),
    [...snapshot.requests].reverse().map(row => React.createElement('article', { key: row.id, 'data-request-status': row.status },
      React.createElement('h2', null, `请求 ${row.id} · ${labels[row.status]}`),
      row.error ? React.createElement('p', { role: 'alert' }, row.error) : null,
      React.createElement('details', null, React.createElement('summary', null, '推理过程'), React.createElement('pre', null, row.reasoning)),
      React.createElement('pre', null, row.text || '等待内容…'))));
}
const root = createRoot(document.getElementById('root')!);
root.render(React.createElement(Monitor));
window.addEventListener('pagehide', () => root.unmount(), { once: true });
