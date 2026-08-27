import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I71 全局搜索与上下文追踪 smoke（design §14.10「搜索与上下文追踪」/ R14-6）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/search（SearchIndexRepository/buildSearchEntries/
 *   searchEntries/referenceEntries/indexCounts）、core/trace（buildContextTrace/
 *   sectionBudget）、host/search-service（createSearchService）、
 *   host/remote/search（searchInvocations/searchRemoteContribution）、
 *   host/remote/writing（contextTraceWireSchema）存在且导出关键符号。
 * - 源码：index.ts 装配 novelSearch；remote.ts 注册 searchInvocations；client.ts
 *   挂载 searchRemoteContribution；shared.ts 声明 SearchNamespace；nav.ts 注册
 *   search 视图；client/layers/search.ts 无 core/zod（无领域 fallback）。
 * - Host 行为（lib 真实服务消费者夹具）：
 *   1) 六层真实项目：build 派生索引（.search/index.json）→ 跨层关键词检索/实体
 *      引用 → drop（stats 无索引）→ search fail closed → rebuild 结果一致；
 *      POV/secret 负测：pov 过滤后未授权 POV 看不到 C3 条目，作者全知面可见；
 *      派生索引不进可移植档案（LAYER_PATHS 白名单外）。
 *   2) 大规模项目响应：120 场景重建 + 检索在阈值内完成且结果确定。
 *   3) trace 一致性：真实 `createNextSceneContextBuilder`（写作上下文装配）的
 *      trace 与 `assembleStoryContext`（生成路径同注册器/组装器）逐层一致；
 *      trace 不泄露知识事实；scene-card/rewrite 如实报告零结构层注入。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I71 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/search/index.js', 'lib/core/trace/index.js', 'lib/host/search-service.js', 'lib/host/remote/search.js', 'lib/host/remote/writing.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const search = read('lib/core/search/index.js');
  for (const symbol of ['SearchIndexRepository', 'buildSearchEntries', 'searchEntries', 'referenceEntries', 'indexCounts', 'SEARCH_INDEX_DIRECTORY']) {
    if (!search.includes(symbol)) fail(`lib core/search missing ${symbol}`);
  }
  const trace = read('lib/core/trace/index.js');
  for (const symbol of ['buildContextTrace', 'sectionBudget', 'knowledgeVisibleCount']) {
    if (!trace.includes(symbol)) fail(`lib core/trace missing ${symbol}`);
  }
  const service = read('lib/host/search-service.js');
  for (const symbol of ['createSearchService', 'search', 'references', 'build', 'drop', 'stats']) {
    if (!service.includes(symbol)) fail(`lib search-service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/search.js');
  for (const symbol of ['searchBuildInvocation', 'searchDropInvocation', 'searchStatsInvocation', 'searchQueryInvocation', 'searchReferencesInvocation', 'searchInvocations', 'searchRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib search remote missing ${symbol}`);
  }
  const writing = read('lib/host/remote/writing.js');
  for (const symbol of ['contextTraceWireSchema', 'candidateReviewSchema', 'trace']) {
    if (!writing.includes(symbol)) fail(`lib writing remote missing trace wire ${symbol}`);
  }
}

// Part 2 — 源码：装配 + Client 无领域 fallback + 派生索引不进可移植档案。
{
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const client = read('src/client.ts');
  const shared = read('src/client/shared.ts');
  const nav = read('src/client/nav.ts');
  const searchLayer = read('src/client/layers/search.ts');
  const coreSearch = read('src/core/search/index.ts');
  const exportSource = read('src/core/export/index.ts');
  if (!index.includes("ctx.provide('novelSearch'") || !index.includes('createSearchService') || !index.includes("bindRemote({") ) {
    fail('index.ts missing novelSearch wiring');
  }
  if (!remoteTs.includes('...searchInvocations') || !remoteTs.includes('searchRemoteContribution')) {
    fail('remote.ts missing searchInvocations registration');
  }
  if (!client.includes('searchRemoteContribution') || !client.includes("'remote.novelSearch'")) {
    fail('client.ts missing search Remote mount');
  }
  if (!shared.includes('SearchNamespace')) fail('shared.ts missing SearchNamespace');
  if (!nav.includes("view: 'search'") || !nav.includes("'search'")) fail('nav.ts missing search view');
  // 搜索面板（Client）无领域 fallback：不导入 core / zod。
  if (searchLayer.includes('../core/') || searchLayer.includes("from 'zod'")) {
    fail('client search panel must not import core schema or zod (no domain fallback)');
  }
  if (!searchLayer.includes('data-novel-search-panel') || !searchLayer.includes('searchPanel')) {
    fail('search.ts missing search panel UI');
  }
  // 派生索引目录不在可移植档案 LAYER_PATHS 白名单内（不成为档案/真相的一部分）。
  assert.ok(coreSearch.includes("SEARCH_INDEX_DIRECTORY = '.search'"), 'core search must declare the .search derived directory');
  assert.ok(!exportSource.includes("'.search'"), 'portable export must not include the derived .search directory');
}

// Part 3 — Host 行为（lib 构建产物）：真实六层项目消费者夹具。
{
  const { ProjectRepository } = await import('../lib/core/project/index.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createCharacterService } = await import('../lib/host/character-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createSearchService } = await import('../lib/host/search-service.js');
  const { createNextSceneContextBuilder } = await import('../lib/host/writing-context.js');
  const { createStyleService } = await import('../lib/host/style-service.js');
  const { createRuleService } = await import('../lib/host/rule-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createWorkbenchSettingsService } = await import('../lib/host/workbench-settings-service.js');
  const { ContextAssembler } = await import('../lib/core/assemble/index.js');
  const { registerContextSerializers } = await import('../lib/core/assemble/serializers.js');
  const { assembleStoryContext } = await import('../lib/core/pipeline/index.js');
  const { buildContextTrace } = await import('../lib/core/trace/index.js');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i71-smoke-'));
  try {
    await new ProjectRepository(projectsRoot).createProject({ projectId: 'demo', name: '搜索演示' });

    const text = createTextService(projectsRoot);
    const characters = createCharacterService(projectsRoot);
    const worldview = createWorldviewService(projectsRoot);
    const outline = createOutlineService(projectsRoot);
    const canon = createCanonService(projectsRoot);
    const knowledge = createKnowledgeService(projectsRoot);
    const style = createStyleService(projectsRoot);
    const rules = createRuleService(projectsRoot);
    const relationship = createRelationshipService(projectsRoot);
    const state = createStateService(projectsRoot);
    const workbenchSettings = createWorkbenchSettingsService(projectsRoot, projectsRoot);
    for (const service of [text, characters, worldview, outline, canon, knowledge, style, rules, relationship]) {
      await service.open('demo');
    }
    await state.open('demo', {
      id: 'state-1', version: 1, storyTime: '',
      scene: { location: '旧灯塔', timeOfDay: '', weather: '', season: '', atmosphere: '' },
      characters: [],
    });

    await characters.create('demo', {
      id: 'mira', name: '米拉', aliases: ['灯塔少女'], kind: 'protagonist',
      personality: '坚韧', background: '北港渔家女。', motivation: '找回父亲',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await worldview.create('demo', {
      id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸，以灯塔与海图闻名。',
      keywords: ['北港', '内海'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    await outline.save('demo', {
      id: 'outline-demo', structure: 'three-act', logline: '米拉追寻失踪父亲的海图之谜。', themes: ['成长'],
      acts: [{
        id: 'act-1', index: 0, title: '开端', goal: '建立旧灯塔场景',
        beats: [{
          id: 'beat-1', title: '午夜灯塔', description: '米拉夜访旧灯塔。', charactersInvolved: ['mira'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira', wordTarget: 500, points: ['海图指向北港'], status: 'planned' }],
        }],
      }],
      foreshadowing: [], endings: [],
    });
    await outline.saveProgress('demo', {
      outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 30,
    });
    await canon.append('demo', {
      id: 'event-1', storyTime: '第一夜', kind: 'event', summary: '米拉进入旧灯塔', detail: '',
      participants: ['mira'], location: '旧灯塔', consequences: [], affectedLayers: ['c5'],
    });
    await knowledge.saveAll('demo', [
      { id: 'know-1', version: 1, fact: '北港海底沉睡着旧城。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第三幕' }, status: 'hidden' },
      { id: 'know-2', version: 1, fact: '守夜人其实是米拉的父亲。', kind: 'secret', holders: [], revealPlan: { revealTo: ['mira'], revealAt: '第二幕' }, status: 'hidden' },
    ], [
      { characterId: 'mira', knows: ['know-1'] },
    ]);
    await style.save('demo', {
      id: 'style-demo', name: '默认', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '冷静', proseStyle: '简洁', chapterFormat: '章节体', dialogueConventions: '少引号', forbidden: [],
    });
    // B1 恒定注入层需要至少一条 active 规则（rules 序列化器 required，空则组装 fail closed）。
    await rules.create('demo', {
      id: 'rule-1', scope: 'global', kind: 'taboo', statement: '不得提前揭示结局。',
      priority: 10, immutable: true, examples: [], active: true,
    });
    await text.createChapter('demo', { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-1', {
      id: 'scene-1', content: '米拉推开旧灯塔的门，看见半张烧焦的海图。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '',
    });

    // 1) 搜索服务：build → search → references → drop → fail closed → rebuild 一致 + POV 负测。
    const searchService = createSearchService({ projectsRoot, text, characters, worldview, outline, canon, knowledge });
    await searchService.open('demo');
    const built = await searchService.build('demo');
    assert.equal(built.indexExists, true, 'build 后索引存在');
    assert.equal(built.counts.knowledge, 2, '知情层两条');
    assert.ok(built.totalEntries >= 10, '六层条目合计');

    const hits = await searchService.search('demo', '海图');
    assert.ok(hits.hits.some((hit) => hit.layer === 'text' && hit.id === 'scene-1'), '正文命中');
    assert.ok(hits.hits.some((hit) => hit.layer === 'outline' && hit.id === 'detail:detail-1'), '大纲命中');
    assert.ok(hits.hits.every((hit) => hit.preview.length <= 161), 'preview 有界');

    const refs = await searchService.references('demo', '米拉');
    assert.ok(refs.hits.some((hit) => hit.layer === 'characters'), '角色自引用');
    assert.ok(refs.hits.some((hit) => hit.layer === 'text'), '正文引用角色');
    assert.ok(refs.hits.some((hit) => hit.layer === 'canon'), '正史引用角色');

    // POV/secret 负测：pov=米拉 只知道 know-1；作者全知面可检索 know-2。
    assert.equal((await searchService.search('demo', '守夜人其实是', 'mira')).hits.filter((hit) => hit.layer === 'knowledge').length, 0, 'POV 过滤隐藏未授权知情');
    assert.equal((await searchService.references('demo', 'know-2', 'mira')).hits.filter((hit) => hit.layer === 'knowledge').length, 0, 'POV 引用过滤隐藏未授权知情');
    assert.ok((await searchService.search('demo', '守夜人其实是')).hits.some((hit) => hit.id === 'know-2'), '作者全知面可见 secret 条目');

    // 派生索引文件落盘于 .search/index.json。
    assert.ok(existsSync(join(projectsRoot, 'demo', '.search', 'index.json')), '派生索引文件存在');
    // drop → stats 无索引 → search fail closed → rebuild 结果与首建一致。
    assert.equal((await searchService.drop('demo')).indexExists, false, 'drop 后无索引');
    assert.equal((await searchService.stats('demo')).indexExists, false, 'stats 反映无索引');
    await searchService.search('demo', '海图').then(() => fail('未构建时必须 fail closed'), () => undefined);
    const rebuilt = await searchService.build('demo');
    assert.equal(rebuilt.totalEntries, built.totalEntries, '重建条目数一致');
    assert.deepEqual((await searchService.search('demo', '海图')).hits, hits.hits, '重建后检索结果逐条一致');

    // 2) 大规模项目响应 smoke：120 场景重建 + 检索在阈值内完成且确定。
    for (let index = 0; index < 3; index += 1) {
      const chapterId = `chapter-bulk-${index + 1}`;
      await text.createChapter('demo', { id: chapterId, index: index + 2, title: `批量章 ${index + 1}`, pov: 'mira', status: 'draft' });
      for (let scene = 0; scene < 40; scene += 1) {
        await text.appendScene('demo', chapterId, {
          id: `bulk-${index + 1}-${scene}`, content: `场景 ${index + 1}-${scene}：米拉在北港码头整理海图。`, summary: `批量场景 ${scene}`, beats: [], canonEvents: [], notes: '',
        });
      }
    }
    const started = Date.now();
    const bulkIndex = await searchService.build('demo');
    const bulkSearch = await searchService.search('demo', '北港码头');
    const elapsed = Date.now() - started;
    assert.ok(bulkIndex.totalEntries > 120, `大规模索引条目（${bulkIndex.totalEntries}）`);
    assert.ok(bulkSearch.total >= 120, `大规模命中总数（${bulkSearch.total}）`);
    assert.equal(bulkSearch.hits.length, 50, '默认上限 50 条有界返回');
    assert.ok(elapsed < 2500, `大规模重建+检索在阈值内完成（${elapsed}ms）`);
    assert.deepEqual((await searchService.search('demo', '北港码头')).hits, bulkSearch.hits, '大规模检索结果确定');

    // 3) trace 一致性：真实写作上下文装配 → trace 与生成路径组装逐层一致 + secret 负测。
    const nextSceneContext = createNextSceneContextBuilder({
      outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text, workbenchSettings,
    });
    const context = await nextSceneContext.context('demo');
    assert.equal(context.trace.pov, 'mira', 'trace POV 与装配一致');
    const reference = assembleStoryContext(registerContextSerializers(new ContextAssembler()), context.sources);
    assert.deepEqual(
      context.trace.sections.map((section) => [section.id, section.characterCount, section.truncated]),
      reference.sections.map((section) => [section.id, section.characterCount, section.truncated]),
      'trace 逐层与 ContextAssembler 实际选择一致',
    );
    assert.equal(context.trace.totals.characterCount, reference.characterCount, 'trace 总字符数一致');
    const traceJson = JSON.stringify(context.trace);
    assert.ok(!traceJson.includes('北港海底沉睡着'), 'trace 不泄露知识事实（secret 负测）');
    assert.ok(!traceJson.includes('米拉推开'), 'trace 不泄露正文内容');
    // scene-card / rewrite 如实报告零结构层注入。
    const sceneCardTrace = buildContextTrace({ intent: 'scene-card', pov: 'mira', navigation: context.navigation, card: context.card });
    assert.deepEqual(sceneCardTrace.sections, [], 'scene-card 无结构层注入');
    const rewriteTrace = buildContextTrace({ intent: 'rewrite', rewritePrompt: '更有悬念' });
    assert.deepEqual(rewriteTrace.sections, [], 'rewrite 无结构层注入');
    assert.ok(!JSON.stringify(rewriteTrace).includes('更有悬念'), 'rewrite trace 不含指令内容');

    console.log('I71 smoke: 可重建派生索引（六层 + POV 过滤 + drop/rebuild 一致 + 大规模响应）、实体引用、结果跳转数据与 trace 一致性/secret 负测全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
