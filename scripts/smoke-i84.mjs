import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I84 smoke: ${message}`); };
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
  }
};
walk(resolve(repoRoot, 'src'));
const source = files.map((path) => [path, readFileSync(path, 'utf8')]);

// R16-2: text pipeline and browser SHA each have one implementation.
{
  const normalizeDefs = source.filter(([, text]) => /\b(?:function\s+normalizeText\s*\(|(?:const|let|var)\s+normalizeText\s*=)/.test(text));
  const chunkDefs = source.filter(([, text]) => /\b(?:function\s+chunkText\s*\(|(?:const|let|var)\s+chunkText\s*=)/.test(text));
  if (normalizeDefs.length !== 1 || !normalizeDefs[0][0].endsWith(join('core', 'text', 'pipeline.ts'))) fail('normalizeText must have one core/text/pipeline owner');
  if (chunkDefs.length !== 1 || !chunkDefs[0][0].endsWith(join('core', 'text', 'pipeline.ts'))) fail('chunkText must have one core/text/pipeline owner');
  const clientDigest = source.filter(([, text]) => /crypto\.subtle\.digest\(\s*['"]SHA-256['"]/.test(text));
  if (clientDigest.length !== 1 || !clientDigest[0][0].endsWith(join('client', 'sha256.ts'))) fail('browser SHA-256 must have one client/sha256 owner');
  for (const path of ['src/client.ts', 'src/client/upload.ts', 'src/client/ops/chapters.ts']) {
    if (!read(path).includes('sha256Hex')) fail(`${path} must consume sha256Hex`);
  }
}

// R16-5: named inversion edges and all core -> host/client imports remain absent.
{
  const settings = read('src/core/settings-index/index.ts');
  const template = read('src/llm/template/index.ts');
  if (settings.includes('llm/port')) fail('core/settings-index -> llm/port inversion remains');
  if (template.includes('core/settings-index')) fail('llm/template -> core/settings-index edge remains');
  const coreRoot = `${resolve(repoRoot, 'src/core')}${sep}`;
  const hostRoot = `${resolve(repoRoot, 'src/host')}${sep}`;
  const clientRoot = `${resolve(repoRoot, 'src/client')}${sep}`;
  const clientEntry = resolve(repoRoot, 'src/client.ts');
  const reverse = source.flatMap(([path, text]) => {
    if (!path.startsWith(coreRoot)) return [];
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(path), specifier.replace(/\.js$/, '.ts'));
      if (target.startsWith(hostRoot) || target.startsWith(clientRoot) || target === clientEntry) return [path];
    }
    return [];
  });
  if (reverse.length) fail(`core -> host/client imports remain: ${reverse.join(', ')}`);
  const upload = read('src/core/upload/index.ts');
  if (upload.includes('../../import/')) fail('core/upload -> import inversion remains');
  if (/export\s*\{\s*chunkText/.test(upload)) fail('retired core/upload chunkText carrier remains');
  if (existsSync(resolve(repoRoot, 'src/import/docx.ts'))) fail('retired import/docx compatibility carrier remains');
  if (!read('src/import/index.ts').includes("../core/docx/index.js")) fail('import facade must consume canonical core/docx owner directly');
  if (!read('src/host/onboarding-analyzer-service.ts').includes("../core/text/pipeline.js")) fail('onboarding analyzer must consume canonical text pipeline directly');
  if (!read('src/core/queue/schema.ts').includes('queueSettingsSchema = GenerationSettingsSchema')) fail('queue settings must derive from canonical generation settings');
  const a2IdDefs = source.filter(([, text]) => /(?:const|let|var)\s+a2IdSchema\s*=/.test(text));
  if (a2IdDefs.length !== 1 || !a2IdDefs[0][0].endsWith(join('core', 'schema', 'prompt-template.ts'))) fail('A2 identifier schema must have one canonical owner');
}

// Misc debt: truthful required dependencies, reported background failure, named polling constant.
{
  const workspace = read('src/host/workspace-service.ts');
  const signature = workspace.slice(workspace.indexOf('export function createWorkspaceEditorService'), workspace.indexOf('): WorkspaceEditorService'));
  if (signature.includes('?:')) fail('workspace service dependencies must be required');
  if (/Host service is required|services are required/.test(workspace)) fail('workspace runtime dependency throws remain');
  const analyzer = read('src/host/onboarding-analyzer-service.ts');
  if (!analyzer.includes('onBackgroundError(error, current.onboardingSessionId)')) fail('background analyzer rejection is not reported');
  const queue = read('src/client/ops/queue.ts');
  if (!queue.includes('QUEUE_POLL_INTERVAL_MS = 2_000') || queue.includes('setTimeout(pollQueueStatus, 2000)')) fail('queue poll interval is not named');
  const indexLines = (read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts')).split('\n');
  for (const symbol of ['const consistencyDetectionService', 'const knowledgeLeakDetectionService', 'const relationshipStyleDetectionService']) {
    const line = indexLines.find((value) => value.includes(symbol));
    if (!line || !line.startsWith('  ') || line.startsWith('   ')) fail(`src/index.ts indentation sentinel failed: ${symbol}`);
  }
}

// Internal names clarify semantics while every public service/Remote name stays frozen.
{
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  for (const name of ['fileImportService', 'portableArchiveService', 'projectPortabilityService', 'rangeEditService', 'controlledTextEditService']) {
    if (!index.includes(name)) fail(`semantic internal name missing: ${name}`);
  }
  for (const key of ['novelImport', 'novelImportExport', 'novelExport', 'novelOutlineProgress', 'novelTextEdit', 'novelLocalizedEdit']) {
    if (!new RegExp(`ctx\\.provide\\('${key}'(?:,|\\))`).test(index)) fail(`public service key changed: ${key}`);
  }
}

// Built behavior/evidence.
{
  for (const path of ['lib/core/text/pipeline.js', 'lib/core/docx/index.js', 'lib/client/sha256.js']) {
    if (!existsSync(resolve(repoRoot, path))) fail(`${path} missing; run build first`);
  }
  const { normalizeText, chunkText } = await import('../lib/core/text/pipeline.js');
  assert.equal(normalizeText('\uFEFFA\r\nB  \n\n\nC'), 'A\nB\n\nC');
  assert.deepEqual(chunkText('alpha\n\nbeta', 7), [
    { index: 0, text: 'alpha', startOffset: 0, endOffset: 5 },
    { index: 1, text: 'beta', startOffset: 7, endOffset: 11 },
  ]);
}

console.log('I84 smoke: text/SHA single owners, dependency direction, misc debt, naming compatibility, and built behavior OK');
