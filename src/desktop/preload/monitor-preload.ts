import { contextBridge, ipcRenderer } from 'electron';
import { LLM_MONITOR_CHANNEL, llmMonitorSchema, type LlmMonitorSnapshot } from '../llm-monitor-contract.js';

// Cache the last validated event before React mounts; no initial-state request is needed.
let latest: LlmMonitorSnapshot | undefined;
const listeners = new Set<(value: LlmMonitorSnapshot) => void>();
ipcRenderer.on(LLM_MONITOR_CHANNEL, (_event, value: unknown) => {
  const parsed = llmMonitorSchema.safeParse(value);
  if (!parsed.success) return;
  latest = parsed.data;
  for (const listener of listeners) listener(latest);
});
// I197: independent push-only allowlist, no domain invocation bridge.
contextBridge.exposeInMainWorld('novelMonitor', Object.freeze({ version: 1,
  subscribe(listener: (value: LlmMonitorSnapshot) => void) {
    listeners.add(listener);
    if (latest) listener(latest);
    return () => { listeners.delete(listener); };
  },
}));
