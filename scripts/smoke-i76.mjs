import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I76 llm 解析/检测公共基座 smoke（架构审查 §9#2 / §5.4）。
 *
 * 交付物核验：
 * - `confidenceSchema` 生产定义唯一：`const confidenceSchema = z.enum(...)` 全仓只有
 *   `src/core/schema/base.ts` 一份（7 份复制归零；`llm/parse/shared.ts` 再导出作为
 *   llm 侧收敛点，`core/schema/onboarding.ts` 从 core 叶子直引，无 core→llm 边）。
 * - parse 样板单份：`JSON.parse(response)` 模式只存在于 `src/llm/parse/shared.ts`
 *   （9 份 parse-JSON-or-throw 归零）；`llm/parse` 与 `llm/validate` 域内零
 *   `must be valid JSON` 残留。
 * - violation schema builder 唯一：`violationSchema(...)` 只定义于
 *   `src/llm/validate/shared.ts`；3 个 validator 只保留 kind enum/literal 参数。
 * - 行为等价夹具（运行时，跑在 `pnpm build` 之后）：9 个公开 parseXxx 函数的
 *   合法/非法 JSON、额外字段 fail-closed、severity fail-closed 与错误消息与重构前
 *   逐一等价；shared 再导出与 base 定义为同一对象。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I76 smoke: ${msg}`); };

/** 过滤注释行，只留代码行做 grep 断言（tsc 保留注释，src 与 lib 统一口径）。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const countIn = (p, pattern) => codeLines(p).filter((line) => line.includes(pattern)).length;

const srcParseDir = resolve(repoRoot, 'src/llm/parse');
const srcValidateDir = resolve(repoRoot, 'src/llm/validate');
const listTs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'shared.ts');
const allSrcTs = [];
const walkSrc = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) allSrcTs.push(path);
  }
};
walkSrc(resolve(repoRoot, 'src'));

// Part 1 — 复制源归零（src）。
{
  // 1a) confidenceSchema 生产定义唯一：7 份 → 1 份，且只在 core/schema/base.ts。
  const definitions = allSrcTs.flatMap((p) => codeLines(p)
    .filter((line) => line.includes('const confidenceSchema = z.enum'))
    .map((line) => `${p}: ${line.trim()}`));
  if (definitions.length !== 1) fail(`expected exactly 1 production confidenceSchema definition, got ${definitions.length}:\n${definitions.join('\n')}`);
  if (!definitions[0].startsWith(`${resolve(repoRoot, 'src/core/schema/base.ts')}:`)) {
    fail('the single confidenceSchema definition must live in src/core/schema/base.ts (core leaf, no core→llm edge; review §8#4)');
  }

  // 1b) llm 侧收敛点：shared.ts 再导出，且 llm/parse 与 llm/validate 域内零本地定义。
  if (countIn('src/llm/parse/shared.ts', "export { confidenceSchema") !== 1) {
    fail('src/llm/parse/shared.ts must re-export the canonical confidenceSchema');
  }
  for (const [dirLabel, dir] of [['src/llm/parse', srcParseDir], ['src/llm/validate', srcValidateDir]]) {
    for (const f of listTs(dir)) {
      if (countIn(`${dirLabel}/${f}`, 'const confidenceSchema') !== 0) {
        fail(`${dirLabel}/${f} still defines a local confidenceSchema`);
      }
    }
  }

  // 1c) parse 样板单份：`JSON.parse(response)` 全仓只有 shared.ts 一份；域内零错误文案残留。
  const jsonParseCopies = allSrcTs.flatMap((p) => codeLines(p)
    .filter((line) => line.includes('JSON.parse(response)'))
    .map((line) => `${p}: ${line.trim()}`));
  if (jsonParseCopies.length !== 1) fail(`expected exactly 1 JSON.parse(response) (in shared.ts), got ${jsonParseCopies.length}:\n${jsonParseCopies.join('\n')}`);
  if (!jsonParseCopies[0].startsWith(`${resolve(repoRoot, 'src/llm/parse/shared.ts')}:`)) {
    fail('the single parse-JSON boilerplate must live in src/llm/parse/shared.ts');
  }
  for (const [dirLabel, dir] of [['src/llm/parse', srcParseDir], ['src/llm/validate', srcValidateDir]]) {
    for (const f of listTs(dir)) {
      if (countIn(`${dirLabel}/${f}`, 'must be valid JSON') !== 0) {
        fail(`${dirLabel}/${f} still carries a local parse-JSON-or-throw boilerplate`);
      }
    }
  }

  // 1d) violation schema builder 唯一：只有 validate/shared.ts 定义，3 个 validator 零本地形状。
  const builderSites = allSrcTs.flatMap((p) => codeLines(p)
    .filter((line) => line.includes('function violationSchema'))
    .map((line) => `${p}: ${line.trim()}`));
  if (builderSites.length !== 1 || !builderSites[0].startsWith(`${resolve(repoRoot, 'src/llm/validate/shared.ts')}:`)) {
    fail(`violationSchema builder must be defined exactly once in src/llm/validate/shared.ts:\n${builderSites.join('\n')}`);
  }
  for (const f of ['index.ts', 'knowledge.ts', 'relationship-style.ts']) {
    const violations = codeLines(`src/llm/validate/${f}`).filter((line) => line.includes('ViolationSchema = z.object'));
    if (violations.length !== 0) fail(`src/llm/validate/${f} still defines a local violation schema object`);
  }
}

// Part 2 — 构建产物同口径（tsc 保留注释，同样过滤后断言）。
{
  if (!existsSync(resolve(repoRoot, 'lib/llm/parse/shared.js'))) fail('lib/llm/parse/shared.js missing — run `pnpm build` first');
  if (countIn('lib/core/schema/base.js', 'const confidenceSchema = z.enum') !== 1) {
    fail('lib/core/schema/base.js must carry the single confidenceSchema definition');
  }
  if (countIn('lib/llm/parse/shared.js', 'JSON.parse(response)') !== 1) {
    fail('lib/llm/parse/shared.js must carry the single parse-JSON boilerplate');
  }
  for (const f of readdirSync(resolve(repoRoot, 'lib/llm/parse')).filter((n) => n.endsWith('.js') && n !== 'shared.js')) {
    if (countIn(`lib/llm/parse/${f}`, 'must be valid JSON') !== 0) fail(`lib/llm/parse/${f} still carries parse-JSON boilerplate`);
  }
  for (const f of readdirSync(resolve(repoRoot, 'lib/llm/validate')).filter((n) => n.endsWith('.js') && n !== 'shared.js')) {
    if (countIn(`lib/llm/validate/${f}`, 'must be valid JSON') !== 0) fail(`lib/llm/validate/${f} still carries parse-JSON boilerplate`);
    if (countIn(`lib/llm/validate/${f}`, 'ViolationSchema = z.object') !== 0) fail(`lib/llm/validate/${f} still carries a local violation schema object`);
  }
}

// Part 3 — 行为等价夹具（与重构前逐一等价：合法形状 / 非法 JSON 消息 / 额外字段 / 非字符串）。
{
  const { parseC2StateParserOutput } = await import('../lib/llm/parse/state.js');
  const { parseC4CanonParserOutput } = await import('../lib/llm/parse/canon.js');
  const { parseB2WorldviewParserOutput } = await import('../lib/llm/parse/worldview.js');
  const { parseC1RelationshipParserOutput } = await import('../lib/llm/parse/relationship.js');
  const { parseC3KnowledgeParserOutput } = await import('../lib/llm/parse/knowledge.js');
  const { parseSplitAgentOutput } = await import('../lib/llm/parse/split.js');
  const { parseRuleCanonDetectorOutput } = await import('../lib/llm/validate/index.js');
  const { parseKnowledgeLeakDetectorOutput } = await import('../lib/llm/validate/knowledge.js');
  const { parseRelationshipStyleDetectorOutput } = await import('../lib/llm/validate/relationship-style.js');
  const { confidenceSchema: sharedConfidence } = await import('../lib/llm/parse/shared.js');
  const { confidenceSchema: baseConfidence } = await import('../lib/core/schema/base.js');

  const fixtures = [
    { name: 'C2 state', fn: parseC2StateParserOutput, label: 'C2 state parser output', valid: '{"ops":[]}', expected: { ops: [] } },
    { name: 'C4 canon', fn: parseC4CanonParserOutput, label: 'C4 Canon parser output', valid: '{"ops":[]}', expected: { ops: [] } },
    { name: 'B2 worldview', fn: parseB2WorldviewParserOutput, label: 'B2 worldview parser output', valid: '{"ops":[]}', expected: { ops: [] } },
    { name: 'C1 relationship', fn: parseC1RelationshipParserOutput, label: 'C1 relationship parser output', valid: '{"ops":[]}', expected: { ops: [] } },
    { name: 'C3 knowledge', fn: parseC3KnowledgeParserOutput, label: 'C3 knowledge parser output', valid: '{"ops":[]}', expected: { ops: [] } },
    { name: 'split agent', fn: parseSplitAgentOutput, label: 'Split agent output', valid: '{"candidates":[]}', expected: { candidates: [] } },
    { name: 'rule/canon detector', fn: parseRuleCanonDetectorOutput, label: 'Rule/canon detector output', valid: '{"violations":[]}', expected: { violations: [] } },
    { name: 'knowledge-leak detector', fn: parseKnowledgeLeakDetectorOutput, label: 'Knowledge-leak detector output', valid: '{"violations":[]}', expected: { violations: [] } },
    { name: 'relationship/style detector', fn: parseRelationshipStyleDetectorOutput, label: 'Relationship/style detector output', valid: '{"violations":[]}', expected: { violations: [] } },
  ];
  for (const { name, fn, label, valid, expected } of fixtures) {
    if (JSON.stringify(fn(valid)) !== JSON.stringify(expected)) fail(`${name}: valid JSON shape changed`);
    let threw = false;
    try { fn('not json'); } catch (cause) {
      threw = true;
      if (!cause.message.includes(`${label} must be valid JSON`)) fail(`${name}: malformed-JSON error message changed: ${cause.message}`);
    }
    if (!threw) fail(`${name}: malformed JSON did not throw`);
    threw = false;
    try { fn(valid.slice(0, -1) + ',"extra":true}'); } catch { threw = true; }
    if (!threw) fail(`${name}: extra field must fail closed (strict schema)`);
    threw = false;
    try { fn(42); } catch { threw = true; }
    if (!threw) fail(`${name}: non-string input must fail closed`);
  }

  // severity fail-closed 保持：hard detector 拒 soft，soft detector 拒 hard。
  let threw = false;
  try { parseRuleCanonDetectorOutput('{"violations":[{"kind":"canon-conflict","severity":"soft","message":"x","references":["c1"]}]}'); } catch { threw = true; }
  if (!threw) fail('rule/canon detector must reject soft severity (fail closed)');
  threw = false;
  try { parseKnowledgeLeakDetectorOutput('{"violations":[{"kind":"knowledge-leak","severity":"soft","message":"x","references":["k1"]}]}'); } catch { threw = true; }
  if (!threw) fail('knowledge-leak detector must reject soft severity (fail closed)');
  threw = false;
  try { parseRelationshipStyleDetectorOutput('{"violations":[{"kind":"style-deviation","severity":"hard","message":"x","references":["s1"]}]}'); } catch { threw = true; }
  if (!threw) fail('relationship/style detector must reject hard severity (fail closed)');

  // confidenceSchema 共享身份：shared 再导出与 base 定义为同一对象，取值域不变。
  if (sharedConfidence !== baseConfidence) fail('llm/parse/shared.ts must re-export the exact core/schema/base.ts confidenceSchema');
  for (const value of ['low', 'medium', 'high']) {
    if (!sharedConfidence.safeParse(value).success) fail(`confidenceSchema must accept ${value}`);
  }
  if (sharedConfidence.safeParse('max').success) fail('confidenceSchema must reject unknown confidence values');
}

console.log('I76 smoke: llm 解析/检测公共基座（confidenceSchema 唯一 / parse 样板单份 / violation builder 唯一 / 行为等价夹具）通过');
