import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I77 wire schema 单一来源与组合根契约补丁修复 smoke（架构审查 §9#3 / §8#1 / §6.3）。
 *
 * 交付物核验：
 * - 派生 wire schema 改造：`src/host/remote/*.ts` 中与 core schema 同形的 wire
 *   声明改为从 core 直接派生（沿用 timeline/editor 先例），远程文件不再手写
 *   core 形状的第四份副本；wire 级差异（rule priority 1–100 UI 约束）用
 *   `.extend()` 覆盖，字段集仍以 core 为单一来源。
 * - 组合根补丁移除：`novelReview.records` / `novelKnowledgeManager.pending` 的
 *   wire 契约即领域服务返回的裸数组，`src/index.ts` 不再包 envelope 整形。
 * - strict codec wire smoke：真实服务输出形状的请求/响应逐条经声明 result/param
 *   codec strict 解析完全一致（含负向：旧 envelope 形状必须被拒）。
 * - 横切面演示：给 `characterCoreSchema` 改名一个字段（一次性，跑完回退），
 *   wire 层/组合根/client 层零改动（派生），生产文件影响面 ≤ 3（§6.2 记录的原
 *   6~8 文件影响面中，wire 副本部分被本迭代消除）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I77 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

// Part 1 — 派生 wire schema 改造（复制源唯一）。
{
  const review = read('src/host/remote/review.ts');
  for (const alias of [
    'export const reviewIssueCategoryWireSchema = reviewIssueCategorySchema;',
    'export const reviewIssueSeverityWireSchema = violationSeveritySchema;',
    'export const reviewIssueStatusWireSchema = reviewIssueStatusSchema;',
    'export const reviewIssueWireSchema = reviewIssueSchema;',
    'export const reviewSummaryWireSchema = reviewSummarySchema;',
    'export const reviewProjectionWireSchema = reviewProjectionSchema;',
    'export const reviewAuditRecordWireSchema = reviewAuditRecordSchema;',
  ]) {
    if (!review.includes(alias)) fail(`remote/review.ts missing derivation: ${alias}`);
  }
  if (!review.includes("from '../../core/review/issue.js'") || !review.includes("from '../../core/validate/index.js'")) {
    fail('remote/review.ts must import the core single-source schemas');
  }
  if (codeLines('src/host/remote/review.ts').some((l) => l.includes('reviewIssueCategoryWireSchema = z.enum(') || l.includes('reviewIssueWireSchema = z.object('))) {
    fail('remote/review.ts still hand-writes core-duplicated issue schemas');
  }

  const knowledge = read('src/host/remote/knowledge.ts');
  for (const alias of [
    'export const knowledgeStatusWireSchema = knowledgeStatusSchema;',
    'export const knowledgeKindWireSchema = knowledgeKindSchema;',
    'export const knowledgeChangeKindWireSchema = knowledgeChangeKindSchema;',
    'export const knowledgeRevealPlanWireSchema = revealPlanSchema;',
    'export const knowledgeEntryWireSchema = knowledgeEntrySchema.omit({ version: true }).extend({',
    'const knowledgeChangeInputWireSchema = knowledgeChangeInputSchema;',
    'export const knowledgePendingResultWireSchema = z.array(knowledgeProposalViewWireSchema);',
  ]) {
    if (!knowledge.includes(alias)) fail(`remote/knowledge.ts missing derivation: ${alias}`);
  }
  if (!knowledge.includes("from '../../core/schema/knowledge.js'") || !knowledge.includes("from '../../core/knowledge/actions.js'")) {
    fail('remote/knowledge.ts must import the core single-source schemas');
  }
  if (codeLines('src/host/remote/knowledge.ts').some((l) => l.includes('knowledgeStatusWireSchema = z.enum('))) {
    fail('remote/knowledge.ts still hand-writes the knowledge status enum');
  }

  const queue = read('src/host/remote/queue.ts');
  for (const alias of [
    'export const queueRunStateWireSchema = queueRunStateSchema;',
    'export const queueTaskStatusWireSchema = queueTaskStatusSchema;',
    'export const queueConfigWireSchema = queueConfigSchema;',
  ]) {
    if (!queue.includes(alias)) fail(`remote/queue.ts missing derivation: ${alias}`);
  }
  if (!queue.includes("from '../../core/queue/schema.js'")) fail('remote/queue.ts must import core/queue/schema.js (pure wire contract)');
  if (codeLines('src/host/remote/queue.ts').some((l) => l.includes('queueRunStateWireSchema = z.enum(') || l.includes('queueTaskStatusWireSchema = z.enum('))) {
    fail('remote/queue.ts still hand-writes the queue state enums');
  }

  const ruleStyle = read('src/host/remote/rule-style.ts');
  if (!ruleStyle.includes('export const ruleWireSchema = ruleSchema.extend({')) fail('remote/rule-style.ts must derive ruleWireSchema from core ruleSchema');
  if (!ruleStyle.includes('export const styleWireSchema = styleProfileSchema;')) fail('remote/rule-style.ts must derive styleWireSchema from core styleProfileSchema');
  if (!ruleStyle.includes("from '../../core/schema/rules.js'") || !ruleStyle.includes("from '../../core/schema/style.js'")) {
    fail('remote/rule-style.ts must import the core single-source schemas');
  }
  if (codeLines('src/host/remote/rule-style.ts').some((l) => l.includes('ruleWireSchema = z.object(') || l.includes('styleWireSchema = z.object('))) {
    fail('remote/rule-style.ts still hand-writes core-duplicated rule/style schemas');
  }

  const progress = read('src/host/remote/progress.ts');
  for (const alias of [
    'export const progressDeviationWireSchema = outlineDeviationSchema;',
    'export const progressNavigationWireSchema = queueNavigationSchema;',
    'export const progressDirectionWireSchema = directionSchema;',
  ]) {
    if (!progress.includes(alias)) fail(`remote/progress.ts missing derivation: ${alias}`);
  }
  for (const src of ["'../../core/schema/outline-progress.js'", "'../../core/queue/schema.js'", "'../../core/schema/inspiration.js'"]) {
    if (!progress.includes(src)) fail(`remote/progress.ts must import ${src}`);
  }

  const importExport = read('src/host/remote/import-export.ts');
  if (!importExport.includes('export const importPreviewChunkWireSchema = docxTextChunkSchema;')) fail('remote/import-export.ts must derive importPreviewChunkWireSchema from core docxTextChunkSchema');
  if (!importExport.includes("from '../../core/schema/upload.js'")) fail('remote/import-export.ts must import core/schema/upload.js');

  const statistics = read('src/host/remote/statistics.ts');
  if (!statistics.includes('runState: queueRunStateSchema,') || !statistics.includes('status: queueTaskStatusSchema,')) {
    fail('remote/statistics.ts must derive queue state enums from core/queue/schema.js');
  }
  if (!statistics.includes("from '../../core/queue/schema.js'")) fail('remote/statistics.ts must import core/queue/schema.js');

  // core 单一来源存在性：wire 派生的源 schema 都在对应 core 模块中声明。
  const coreReview = read('src/core/review/issue.ts');
  for (const symbol of ['reviewIssueCategorySchema', 'reviewIssueStatusSchema', 'reviewIssueSchema', 'reviewSummarySchema', 'reviewProjectionSchema', 'reviewAuditRecordSchema', 'reviewDecisionSchema']) {
    if (!coreReview.includes(`export const ${symbol} =`)) fail(`core/review/issue.ts must declare ${symbol} (single source)`);
  }
  const coreQueueSchema = read('src/core/queue/schema.ts');
  for (const symbol of ['queueRunStateSchema', 'queueTaskStatusSchema', 'queueConfigSchema']) {
    if (!coreQueueSchema.includes(`export const ${symbol} =`)) fail(`core/queue/schema.ts must declare ${symbol} (single source)`);
  }
  const coreInspiration = read('src/core/schema/inspiration.ts');
  if (!coreInspiration.includes('export const directionSchema =')) fail('core/schema/inspiration.ts must declare directionSchema (single source)');
}

// Part 2 — 组合根补丁移除：index.ts 不再为 records/pending 整形 envelope。
{
  const index = codeLines('src/index.ts');
  if (index.some((l) => l.includes('({ records: ') || l.includes('({ projectId, proposals: '))) {
    fail('index.ts still reshapes records/pending into an envelope at the composition root');
  }
  if (!index.some((l) => l.includes("method: 'records', call: (projectId: string) => reviewService.records(projectId)"))) {
    fail('index.ts novelReview.records must forward the bare-array service result directly');
  }
  if (!index.some((l) => l.includes("method: 'pending', call: (projectId: string) => knowledgeManagerService.pending(projectId)"))) {
    fail('index.ts novelKnowledgeManager.pending must forward the bare-array service result directly');
  }
}

// Part 3 — strict codec wire smoke：真实服务输出形状经声明 codec 完全一致。
{
  const { reviewRecordsInvocation, reviewScanInvocation, reviewAdjudicateInvocation } = await import('../lib/host/remote/review.js');
  const { knowledgePendingInvocation, knowledgeListInvocation, knowledgeProposeInvocation } = await import('../lib/host/remote/knowledge.js');
  const { queueStatusInvocation } = await import('../lib/host/remote/queue.js');
  const { ruleStyleListInvocation, ruleStyleUpdateRuleInvocation } = await import('../lib/host/remote/rule-style.js');
  const { progressProjectionInvocation, progressSelectInvocation } = await import('../lib/host/remote/progress.js');
  const { importExportPreviewInvocation } = await import('../lib/host/remote/import-export.js');
  const { statisticsOverviewInvocation, statisticsTasksInvocation } = await import('../lib/host/remote/statistics.js');

  const strictParse = (label, codec, payload) => {
    if (codec.mode !== 'strict') fail(`${label} must declare a strict result codec`);
    const parsed = codec.schema.parse(payload);
    assert.deepEqual(parsed, payload, `${label}: parsed value must equal the wire payload (请求/响应与派生 schema 完全一致)`);
    return parsed;
  };

  // 3a) records/pending：wire 契约即裸数组（正向），旧 envelope 必须被拒（负向）。
  const auditRecord = { projectId: 'demo', issueId: 'iss-rel', decision: 'continue', decidedAt: '2026-01-01T00:00:00.000Z' };
  strictParse('novelReview/records', reviewRecordsInvocation.result, [auditRecord]);
  strictParse('novelReview/records empty', reviewRecordsInvocation.result, []);
  assert.throws(() => reviewRecordsInvocation.result.schema.parse({ records: [auditRecord] }), /expected|Invalid/, 'records must reject the old envelope');
  if (reviewRecordsInvocation.result.typeSymbol !== 'novel-creation-tool#novelReview:records') {
    fail('novelReview/records typeSymbol must stay stable across the I77 wire-shape alignment');
  }

  const proposal = { proposalId: 'kprop-1', kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed', revealAt: '第二幕' };
  strictParse('novelKnowledgeManager/pending', knowledgePendingInvocation.result, [proposal]);
  strictParse('novelKnowledgeManager/pending empty', knowledgePendingInvocation.result, []);
  assert.throws(() => knowledgePendingInvocation.result.schema.parse({ projectId: 'demo', proposals: [proposal] }), /expected|Invalid/, 'pending must reject the old envelope');
  if (knowledgePendingInvocation.result.typeSymbol !== 'novel-creation-tool#novelKnowledgeManager:pending') {
    fail('novelKnowledgeManager/pending typeSymbol must stay stable across the I77 wire-shape alignment');
  }

  // 3b) 派生 schema 的正向一致性：真实服务输出形状逐一 strict 解析。
  strictParse('novelReview/scan', reviewScanInvocation.result, {
    projectId: 'demo',
    scannedAt: '2026-01-01T00:00:00.000Z',
    issues: [{
      id: 'iss-aaaabbbbccccdddd', category: 'rule', severity: 'hard', kind: 'immutable-rule',
      message: '正文直接违反不可变规则。', references: ['rule-1'],
      location: { chapterId: 'chapter-1', sceneId: 'scene-abc' }, status: 'open',
    }],
    summary: { total: 1, hard: 1, soft: 0, byCategory: { rule: 1, canon: 0, knowledge: 0, relationship: 0, style: 0 } },
  });
  strictParse('novelReview/adjudicate input', reviewAdjudicateInvocation.parameters[1].codec, { decision: 'continue', issueIds: ['iss-rel'] });

  strictParse('novelKnowledgeManager/list', knowledgeListInvocation.result, {
    projectId: 'demo',
    entries: [{ id: 'k-1', fact: '灯塔秘密', kind: 'secret', status: 'hidden', holders: [], revealPlan: { revealTo: [], revealAt: '第二幕' }, povHint: 'POV 边界：当前 米拉 知晓；…' }],
    characters: [{ characterId: 'mira', name: '米拉', knows: ['k-1'] }],
    summary: { total: 1, hidden: 1, partiallyRevealed: 0, revealed: 0, withPlan: 1 },
  });
  strictParse('novelKnowledgeManager/propose input', knowledgeProposeInvocation.parameters[1].codec, { kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed' });

  strictParse('novelQueue/status', queueStatusInvocation.result, {
    projectId: 'demo', runState: 'idle',
    config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
    consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [],
  });

  strictParse('novelRuleStyleManager/list', ruleStyleListInvocation.result, {
    projectId: 'demo',
    rules: [{
      id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: '火不能熄灭。',
      priority: 100, immutable: true, examples: [], active: true,
    }],
    style: {
      id: 'global-style', version: 1, name: '默认', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '简洁', chapterFormat: '章节', dialogueConventions: '引号', forbidden: [],
    },
  });
  // updateRule patch = rule 去掉 id/version 的完整形状（服务端合并）。
  strictParse('novelRuleStyleManager/updateRule patch', ruleStyleUpdateRuleInvocation.parameters[2].codec, {
    scope: 'global', kind: 'physics', statement: '火不能熄灭。', priority: 50, immutable: true, examples: [], active: true,
  });

  strictParse('novelOutlineProgress/projection', progressProjectionInvocation.result, {
    outlineId: 'outline-1',
    acts: [{ id: 'act-one', index: 0, title: '第一幕', beats: [] }],
    currentAct: 'act-one', currentBeat: 'first', completedBeats: [],
    deviations: [{ id: 'drift-1', planned: '甲', actual: '乙', reason: '剧情需要', reconciled: false }],
    tensionLevel: 30,
    navigation: {
      actId: 'act-one', beatId: 'first', title: '进入旧港', description: '米拉找到入口。',
      prerequisites: [], prerequisitesMet: true, instruction: '完成进入旧港。', deviationIds: ['drift-1'],
    },
    consistency: { currentBeatCompleted: false, completedBeatsWithOpenScenes: [], navigationTargetAllScenesDone: false },
  });
  strictParse('novelOutlineProgress/select input', progressSelectInvocation.parameters[1].codec, {
    direction: {
      id: 'insp-dawn', title: '黎明方案', premise: '灯塔在黎明亮起。',
      changes: { logline: '新的主线', themes: ['希望'], outlineNote: '推进到第二幕', progressNote: '偏差已记录' },
      rationale: '符合节奏',
    },
  });

  strictParse('novelImportExport/importPreview', importExportPreviewInvocation.result, {
    projectId: 'demo', fileName: '第一章.txt', format: 'txt', text: '米拉走向码头。',
    chunks: [{ index: 0, text: '米拉走向码头。', startOffset: 0, endOffset: 7 }],
  });

  strictParse('novelStatistics/overview', statisticsOverviewInvocation.result, {
    empty: false, chapterCount: 1, sceneCount: 1, totalUnits: 100, totalChars: 120,
    cardCount: 1, totalWordTarget: 500, cardWrittenUnits: 100, completionRatio: 0.2,
    beatCount: 1, completedBeatCount: 0, beatCompletionRatio: 0, currentBeat: 'first',
    cardStatusCounts: { planned: 0, writing: 1, done: 0 },
    povStats: [{ pov: 'mira', chapters: 1, scenes: 1, units: 100, chars: 120 }],
    cardPovStats: [{ pov: 'mira', cards: 1, wordTarget: 500 }],
    queue: { runState: 'completed', consumedUnits: 100, taskCounts: { queued: 0, running: 0, 'candidate-ready': 0, failed: 0, cancelled: 0, completed: 1 }, totalTasks: 1 },
    chapters: [{ chapterId: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 1, units: 100, chars: 120 }],
    acts: [{ id: 'act-one', index: 0, title: '第一幕', beats: [{ id: 'first', title: '进入旧港' }] }],
  });
  strictParse('novelStatistics/tasks', statisticsTasksInvocation.result, {
    total: 1,
    tasks: [{ id: 'qt-scene-abc', sceneId: 'scene-abc', chapterId: 'chapter-1', cardTitle: '进入旧港', cardPov: 'mira', status: 'completed', attempts: 1, budgetUnits: 100, error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T01:00:00.000Z' }],
  });
}

// Part 4 — 横切面演示：给 characterCoreSchema 改名一个字段，影响面（生产文件）
// ≤ 3 且 wire 层/组合根/client 层零改动（一次性演示，finally 回退）。
{
  const schemaFile = resolve(repoRoot, 'src/core/schema/characters.ts');
  const original = readFileSync(schemaFile, 'utf8');
  const before = original.includes('  personality: z.string(),');
  const after = original.includes('  personalityZZZ: z.string(),');
  if (before === after) fail('characterCoreSchema rename fixture not applicable (unexpected current field state)');
  try {
    writeFileSync(schemaFile, original.replace('  personality: z.string(),', '  personalityZZZ: z.string(),'));
    const run = spawnSync('pnpm', ['exec', 'tsc', '--noEmit'], { cwd: repoRoot, encoding: 'utf8' });
    const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    const errorFiles = new Set();
    for (const line of output.split('\n')) {
      const match = /^(src\/[^()\s]+\.ts)\(\d+,\d+\): error TS/.exec(line.trim());
      if (match) errorFiles.add(match[1]);
    }
    const production = [...errorFiles].filter((p) => !p.endsWith('.test.ts') && !p.startsWith('scripts/'));
    const wireLayerHits = production.filter((p) => p.startsWith('src/host/remote/') || p === 'src/index.ts' || p === 'src/remote.ts');
    if (wireLayerHits.length !== 0) {
      fail(`characterCoreSchema 改名后 wire/组合根层必须零改动（派生），实际受影响：${wireLayerHits.join(', ')}`);
    }
    // I78 起 client 投影 shape 由 core 派生（src/client/shapes.ts），字段改名必须在
    // client 层报编译错（单一来源证据）；I77 时 client 仍是手写副本，故不要求零命中。
    if (!production.some((p) => p.startsWith('src/client/') || p === 'src/client.ts')) {
      fail('I78 后 client 投影派生自 characterCoreSchema：字段改名必须在 client 层报编译错');
    }
    if (production.length > 5) {
      fail(`characterCoreSchema 改名影响面（生产文件）应 ≤ 5（含 I78 派生命中的 client 层），实际 ${production.length}：${production.join(', ')}`);
    }
    const remoteDir = resolve(repoRoot, 'src/host/remote');
    const remoteFiles = readdirSync(remoteDir).filter((f) => f.endsWith('.ts'));
    for (const f of remoteFiles) {
      if (readFileSync(join(remoteDir, f), 'utf8').includes('personalityZZZ')) {
        fail(`src/host/remote/${f} references the renamed character field — wire layer must not hand-copy core shapes`);
      }
    }
    console.log(`I77 demo: characterCoreSchema 字段改名影响面 = ${production.length} 个生产文件（${production.join(', ') || '仅 schema 自身'}），wire/组合根零改动；client 层命中为 I78 派生命中的预期证据 OK`);
  } finally {
    writeFileSync(schemaFile, original);
  }
}

console.log('I77 smoke: wire schema 派生单一来源 + records/pending 组合根补丁移除 + strict codec wire 一致性 + 改名横切面演示通过');
