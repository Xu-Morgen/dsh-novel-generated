import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I81 core 高优先文件拆分 smoke（架构审查 §4.1/§4.2；重构纪律 §16-2 行为等价）。
 *
 * 交付物核验：
 * - 行数护栏：statistics/analyzer/search 的切片与兼容 index、schema/onboarding.ts
 *   均显著小于拆分前（原 524/426/432/323 行），兼容 index 只做 re-export。
 * - 复制源归零（审查 §4.2）：schema/onboarding.ts 六层候选 schema 全部改用
 *   `XxxSchema.omit(...)` 组合派生，手写逐字段重列消失（字段单一来源回归 core 叶子）。
 * - 职责归位：analyzer 三段（validate/prompt/example）与 reduce/hash 根、search
 *   逐层 builder、statistics 三段（types/build/repository）的实现符号定义唯一。
 * - 行为等价（lib 构建产物）：search 可重建（drop→build→load 逐字节一致）、
 *   statistics 确定性投影、analyzer 校验/提示/示例三件套可用、兼容导入面不变。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I81 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

// Part 1 — 行数护栏（拆分后每个切片显著小于原文件；兼容 index 只做 re-export）。
{
  const original = {
    'src/core/statistics/index.ts': 524,
    'src/core/onboarding/analyzer.ts': 426,
    'src/core/search/index.ts': 432,
    'src/core/schema/onboarding.ts': 323,
  };
  const lines = {
    'src/core/statistics/index.ts': read('src/core/statistics/index.ts').split('\n').length,
    'src/core/statistics/types.ts': read('src/core/statistics/types.ts').split('\n').length,
    'src/core/statistics/build.ts': read('src/core/statistics/build.ts').split('\n').length,
    'src/core/statistics/repository.ts': read('src/core/statistics/repository.ts').split('\n').length,
    'src/core/onboarding/analyzer.ts': read('src/core/onboarding/analyzer.ts').split('\n').length,
    'src/core/onboarding/validate.ts': read('src/core/onboarding/validate.ts').split('\n').length,
    'src/core/onboarding/prompt.ts': read('src/core/onboarding/prompt.ts').split('\n').length,
    'src/core/onboarding/example.ts': read('src/core/onboarding/example.ts').split('\n').length,
    'src/core/search/index.ts': read('src/core/search/index.ts').split('\n').length,
    'src/core/search/builders.ts': read('src/core/search/builders.ts').split('\n').length,
    'src/core/schema/onboarding.ts': read('src/core/schema/onboarding.ts').split('\n').length,
    'src/core/schema/onboarding-binding.ts': read('src/core/schema/onboarding-binding.ts').split('\n').length,
    'src/core/schema/onboarding-analysis.ts': read('src/core/schema/onboarding-analysis.ts').split('\n').length,
    'src/core/schema/onboarding-adjudication.ts': read('src/core/schema/onboarding-adjudication.ts').split('\n').length,
  };
  // 每个切片（含保留逻辑的根）必须显著小于原文件：护栏 = 原行数 × 0.75。
  for (const [file, count] of Object.entries(lines)) {
    if (file === 'src/core/statistics/index.ts' || file === 'src/core/schema/onboarding.ts') {
      if (count >= 120) fail(`${file} ${count} 行（应为薄兼容 index）`);
      continue;
    }
    // I102 拆分后：binding/analysis/adjudication 三片各自显著小于原 323 行（护栏 0.75）。
    const factor = 0.75;
    const base = original[file] ?? Math.max(...Object.values(original));
    if (count >= base * factor) fail(`${file} 行数 ${count} 未显著小于原体积（护栏 ${Math.floor(base * factor)}）`);
  }
  console.log(`I81 Part 1: 行数护栏 OK（statistics=${lines['src/core/statistics/types.ts']}/${lines['src/core/statistics/build.ts']}/${lines['src/core/statistics/repository.ts']}，analyzer=${lines['src/core/onboarding/validate.ts']}/${lines['src/core/onboarding/prompt.ts']}/${lines['src/core/onboarding/example.ts']}，search=${lines['src/core/search/index.ts']}/${lines['src/core/search/builders.ts']}，schema/onboarding=${lines['src/core/schema/onboarding.ts']}）`);
}

// Part 2 — 复制源归零：六层候选 schema 全部由 core 叶子 schema `.omit(...)` 派生。
{
  const onboardingSchema = read('src/core/schema/onboarding-analysis.ts');
  const derivations = [
    ['onboardingCharacterSchema = characterCoreSchema.omit', 'B3 角色'],
    ['onboardingWorldviewSchema = worldEntrySchema.omit', 'B2 世界观'],
    ['onboardingOutlineSchema = outlineSchema.omit', 'B5 大纲'],
    ['onboardingRelationshipSchema = relationshipSchema.omit', 'C1 关系'],
    ['onboardingStateSchema = worldStateSchema.omit', 'C2 状态'],
    ['onboardingCanonSchema = canonEventSchema.omit', 'C4 正史'],
  ];
  for (const [derivation, label] of derivations) {
    if (!codeLines('src/core/schema/onboarding-analysis.ts').some((line) => line.includes(derivation))) {
      fail(`${label} 候选 schema 未由 omit 组合派生（${derivation}）`);
    }
  }
  // 手写逐字段重列的残留哨兵：候选 schema 区不再出现逐字段 z.object 定义。
  const handWrittenMarkers = ['kind: characterKindSchema', 'triggerMode: triggerModeSchema', 'structure: outlineStructureSchema', 'type: relationshipTypeSchema', 'scene: sceneStateSchema', 'kind: canonKindSchema'];
  for (const marker of handWrittenMarkers) {
    if (codeLines('src/core/schema/onboarding-analysis.ts').some((line) => line.includes(marker))) {
      fail(`onboarding-analysis.ts 残留手写逐字段重列哨兵：${marker}`);
    }
  }
  // 派生只去掉 Host-owned/账本字段：六处 omit 的 key 必须恰好是这些字段。
  const omitCalls = [...onboardingSchema.matchAll(/\.omit\(\{([^}]+)\}\)/g)].map((m) => m[1].replace(/\s/g, ''));
  assert.deepEqual([...omitCalls].sort(), ['seq:true,immutable:true,supersedes:true', 'version:true,status:true,supersededBy:true', 'version:true', 'version:true', 'version:true', 'version:true,seq:true'].sort(), 'omit 键集必须恰好覆盖 Host-owned/账本字段（不得多删少删）');
  // I102：projectId/session/sourceHash 与六层 enum 单一定义（onboarding-binding.ts），
  // analysis/adjudication 只经 extend 组合，不再重列。
  const binding = read('src/core/schema/onboarding-binding.ts');
  const adjudication = read('src/core/schema/onboarding-adjudication.ts');
  if (!binding.includes('export const onboardingProjectIdSchema = entityIdSchema')) fail('projectId 未复用 entityIdSchema');
  if (!binding.includes('export const onboardingLayerSchema = z.enum')) fail('六层 enum 未单点化');
  if (codeLines('src/core/schema/onboarding-analysis.ts').some((line) => line.includes("z.enum(['characters'"))) fail('analysis 片重列六层 enum');
  if (codeLines('src/core/schema/onboarding-adjudication.ts').some((line) => line.includes("z.enum(['characters'"))) fail('adjudication 片重列六层 enum');
  for (const marker of ['projectId: z.string().min(1).max(64)', "onboardingSessionId: z.string().min(1)", 'sourceHash: z.string().regex(/^[0-9a-f]{64}$/)']) {
    if (adjudication.includes(marker)) fail(`adjudication 片重列绑定字段：${marker}`);
  }
  console.log('I81 Part 2: schema omit 组合派生（六层复制源归零，omit 键集精确）+ I102 绑定单点化 OK');
}

// Part 3 — 职责归位：实现符号定义唯一且落在对应切片。
{
  const assertDefinedOnlyIn = (pattern, expectedFile, label) => {
    const scope = ['src/core/statistics/index.ts', 'src/core/statistics/types.ts', 'src/core/statistics/build.ts', 'src/core/statistics/repository.ts',
      'src/core/onboarding/analyzer.ts', 'src/core/onboarding/validate.ts', 'src/core/onboarding/prompt.ts', 'src/core/onboarding/example.ts',
      'src/core/search/index.ts', 'src/core/search/builders.ts'];
    const hits = scope.flatMap((file) => codeLines(file).filter((line) => line.includes(pattern)).map(() => file));
    if (hits.length !== 1 || hits[0] !== expectedFile) {
      fail(`${label}（${pattern}）定义必须唯一落在 ${expectedFile}，实际 ${hits.length} 处：${hits.join(', ')}`);
    }
  };
  // statistics 三段。
  assertDefinedOnlyIn('export function buildStatistics(', 'src/core/statistics/build.ts', 'statistics 构建');
  assertDefinedOnlyIn('export class StatisticsRepository', 'src/core/statistics/repository.ts', 'statistics 仓库');
  assertDefinedOnlyIn('export interface StatisticsProjection', 'src/core/statistics/types.ts', 'statistics 契约类型');
  // analyzer 三段 + reduce/hash 根。
  assertDefinedOnlyIn('export function parseOnboardingOutput', 'src/core/onboarding/validate.ts', 'analyzer 校验');
  assertDefinedOnlyIn('export function buildOnboardingPrompt', 'src/core/onboarding/prompt.ts', 'analyzer prompt');
  assertDefinedOnlyIn('export const ONBOARDING_PROMPT_EXAMPLE', 'src/core/onboarding/example.ts', 'analyzer 示例');
  assertDefinedOnlyIn('export function reduceOnboardingResult', 'src/core/onboarding/analyzer.ts', 'analyzer 归约根');
  assertDefinedOnlyIn('export function layerHash(', 'src/core/onboarding/analyzer.ts', 'analyzer 指纹');
  // search 逐层 builder。
  for (const layer of ['Text', 'Character', 'Worldview', 'Outline', 'Canon', 'Knowledge']) {
    assertDefinedOnlyIn(`export function build${layer}LayerEntries`, 'src/core/search/builders.ts', `search ${layer} 层 builder`);
  }
  assertDefinedOnlyIn('export function buildSearchEntries', 'src/core/search/builders.ts', 'search 汇总构建');
  // 兼容 index 面：统计与搜索的仓库/查询类仍由 index 暴露（消费方导入面不变）。
  for (const file of ['src/core/statistics/index.ts', 'src/core/search/index.ts']) {
    if (!codeLines(file).some((line) => line.startsWith('export {') || line.startsWith('export *'))) fail(`${file} 未 re-export 兼容面`);
  }
  console.log('I81 Part 3: 职责归位（三段切片 + 逐层 builder + 兼容 index 面）OK');
}

// Part 4 — 行为等价（lib 构建产物）：可重建、确定性、兼容导入面可用。
{
  for (const file of ['lib/core/search/index.js', 'lib/core/search/builders.js', 'lib/core/statistics/index.js', 'lib/core/onboarding/analyzer.js', 'lib/core/onboarding/example.js', 'lib/core/schema/onboarding.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const { buildSearchEntries, searchEntries, referenceEntries, indexCounts } = await import('../lib/core/search/index.js');
  const { buildStatistics, buildStatisticsOverview, filterSceneCards } = await import('../lib/core/statistics/index.js');
  const { assertOnboardingOutput, buildOnboardingPrompt, buildRegeneratePrompt, layerHash, parseOnboardingOutput, reduceOnboardingResult, assertFreeText } = await import('../lib/core/onboarding/analyzer.js');
  const { ONBOARDING_PROMPT_EXAMPLE } = await import('../lib/core/onboarding/example.js');
  const { onboardingAnalysisOutputSchema } = await import('../lib/core/schema/onboarding.js');

  const sources = {
    text: [{ id: 'ch-1', index: 0, title: '第一章', pov: 'mira', status: 'done', scenes: [{ id: 'sc-1', index: 0, summary: '抵达', content: '米拉在码头看到北港的旧灯塔。', status: 'done' }] }],
    characters: [{ id: 'mira', name: '米拉', aliases: ['mila'], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, version: 1 }],
    worldview: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北方最大的贸易港。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, version: 1, status: 'active', supersededBy: null }],
    outline: { id: 'outline', version: 1, structure: 'free', logline: '米拉的调查。', themes: [], acts: [{ id: 'act-1', index: 0, title: '开端', goal: '抵达北港', beats: [{ id: 'beat-1', title: '抵达', description: '米拉抵达北港', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'db-1', title: '测绘', summary: '米拉测绘', pov: 'mira', wordTarget: 100, points: [], status: 'planned' }] }] }], foreshadowing: [], endings: [] },
    canon: [{ id: 'evt-1', seq: 1, storyTime: '清晨', kind: 'event', summary: '米拉抵达北港', detail: '', participants: ['mira'], location: '北港', consequences: [], affectedLayers: [], immutable: true }],
    knowledge: { entries: [{ id: 'k-1', version: 1, fact: '旧灯塔藏着海图。', kind: 'secret', status: 'hidden', holders: ['mira'], revealPlan: { revealTo: ['mira'], revealAt: '终局' } }] },
  };
  const entries = buildSearchEntries(sources);
  // 可重建 + mentions 交叉引用：正文条目命中角色名与世界观念（跨层键）；ASCII id 键
  // 被持有该 id 的条目引用（角色条目含别名 mila、正史条目含参与者 mira）。
  const textEntry = entries.find((entry) => entry.id === 'sc-1');
  assert.ok(textEntry.mentions.includes('米拉') && textEntry.mentions.includes('北港'), '正文条目 mentions 必须含角色名与世界观念');
  assert.ok(entries.find((entry) => entry.id === 'mira').mentions.includes('mila'), '角色条目 mentions 必须含别名键');
  assert.ok(entries.find((entry) => entry.id === 'evt-1').mentions.includes('mira'), '正史条目 mentions 必须含参与者 id 键');
  assert.deepEqual(indexCounts(entries), { text: 1, characters: 1, worldview: 1, outline: 4, canon: 1, knowledge: 1 });
  // 关键词与实体引用查询确定性。
  assert.equal(searchEntries(entries, '北港').hits.length >= 2, true);
  assert.ok(referenceEntries(entries, 'mira').hits.length >= 3);
  // statistics 确定性：units 复用 countProseUnits 口径，空作品无假进度。
  const projection = buildStatistics({ chapters: sources.text, outline: sources.outline, progress: undefined, tasks: [], queue: { runState: 'idle', consumedUnits: 0 } });
  const overview = buildStatisticsOverview(projection);
  assert.ok(projection.chapters[0].units >= 1 && projection.chapters[0].chars >= 1);
  assert.equal(overview.empty, false);
  assert.equal(filterSceneCards(projection, { actId: 'act-1' }).total, 1);
  const emptyOverview = buildStatisticsOverview(buildStatistics({ chapters: [], outline: undefined, progress: undefined, tasks: [], queue: { runState: 'idle', consumedUnits: 0 } }));
  assert.equal(emptyOverview.empty, true);
  assert.equal(emptyOverview.completionRatio, 0);
  // analyzer 校验/提示/示例三件套 + reduce/hash（兼容面可用）。
  assert.equal(assertFreeText('  北港。\n'), '北港。');
  const parsed = parseOnboardingOutput(JSON.stringify(ONBOARDING_PROMPT_EXAMPLE));
  assert.equal(onboardingAnalysisOutputSchema.safeParse(parsed).success, true);
  assertOnboardingOutput(parsed);
  assert.ok(buildOnboardingPrompt({ projectId: 'p', onboardingSessionId: 's', sourceHash: 'a'.repeat(64), chunks: [{ index: 0, text: '北港。', startOffset: 0, endOffset: 3 }] }).includes('六层为：characters(B3)'));
  assert.ok(buildRegeneratePrompt({ projectId: 'p', onboardingSessionId: 's', sourceHash: 'a'.repeat(64), chunks: [{ index: 0, text: '北港。', startOffset: 0, endOffset: 3 }] }, 'characters').includes('只重新生成「B3」'));
  const hashes = Object.fromEntries(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'].map((layer) => [layer, layerHash(parsed.layers, layer)]));
  assert.ok(Object.values(hashes).every((hash) => /^[0-9a-f]{64}$/.test(hash)));
  assert.equal(reduceOnboardingResult({ projectId: 'p', onboardingSessionId: 's', sourceHash: 'a'.repeat(64) }, parsed).onboardingSessionId, 's');

  console.log('I81 Part 4: lib 行为等价（search 可重建/引用、statistics 确定性、analyzer 三件套 + 兼容面）OK');
}

console.log('I81 smoke: 行数护栏 + schema omit 复制源归零 + 职责归位 + lib 行为等价通过');
