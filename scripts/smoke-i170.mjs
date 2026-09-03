import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const adapter = readFileSync(resolve(root, 'src/platform/openai-compatible-llm.ts'), 'utf8');
const main = readFileSync(resolve(root, 'src/desktop/main/main.ts'), 'utf8');
const renderer = readFileSync(resolve(root, 'src/desktop/renderer/main.ts'), 'utf8');

for (const token of ['reasoning_effort', 'stopSequences', 'request.signal', 'chat/completions', 'authorization']) {
  if (!adapter.includes(token)) throw new Error(`I170 adapter missing ${token}`);
}
if (!main.includes('createLlmBackend')) throw new Error('I170 Main does not own the LlmBackend factory');
if (renderer.includes('openai') || renderer.includes('chat/completions')) throw new Error('I170 Renderer contains an LLM endpoint');
if (adapter.includes('console.log') || adapter.includes('console.error')) throw new Error('I170 adapter contains logging that could leak credentials');

const result = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/platform/openai-compatible-llm.test.ts', 'src/llm/port/index.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (result.status !== 0) throw new Error(`I170 LlmBackend smoke failed (exit ${result.status}):\n${result.output}`);

process.stdout.write('I170 smoke: Main-owned OpenAI-compatible stream/reasoning/stop/cancel/error adapter, credential seam, and Renderer endpoint scan passed\n');
