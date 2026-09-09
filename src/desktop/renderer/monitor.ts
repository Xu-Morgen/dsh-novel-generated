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
    React.createElement('p', null, '正文与推理各仅显示最后 16000 字符，复制这里可能得到不完整的 JSON。完整脱敏记录见应用数据目录 cache/llm-traces 下的 txt 文件。'),
    [...snapshot.requests].reverse().map(row => React.createElement('article', { key: row.id, 'data-request-status': row.status },
      React.createElement('h2', null, `请求 ${row.id} · ${labels[row.status]}`),
      row.error ? React.createElement('p', { role: 'alert' }, row.error) : null,
      React.createElement('details', { 'data-request-input': row.id },
        React.createElement('summary', null, '输入提示词'),
        row.promptTruncated ? React.createElement('p', { 'data-input-truncated': '' }, '输入较长，仅显示脱敏后的前 256000 字符。') : null,
        React.createElement('pre', { 'data-request-prompt': '' }, row.prompt === undefined ? (row.status === 'connecting' ? '正在准备输入提示词…' : '本次输入提示词不可用。') : row.prompt || '（空提示词）')),
      React.createElement('details', null, React.createElement('summary', null, '推理过程'), React.createElement('pre', null, row.reasoning)),
      React.createElement('pre', null, row.text || '等待内容…'))));
}
const root = createRoot(document.getElementById('root')!);
root.render(React.createElement(Monitor));
window.addEventListener('pagehide', () => root.unmount(), { once: true });
