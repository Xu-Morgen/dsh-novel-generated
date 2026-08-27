import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I64 一致性审校中心 smoke（design §14.9「一致性审校中心」/ R13-5）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/review/issue + ledger（统一投影 + 审计账本）、
 *   host/review-service（scan/adjudicate/records）、host/remote/review
 *   （novelReview Remote）存在且导出关键符号。
 * - 源码：review-service 复用 I21/I22/I24 探测器与 I20 确定性检查（不复制
 *   prompt 文案、不新增第二裁决器）；index.ts 装配 novelReview；remote.ts
 *   注册 reviewInvocations；client/nav 新增 review 视图、client.ts 挂载
 *   reviewRemoteContribution。
 * - Host 行为（lib）：fake backend 消费者夹具走完整审校闭环：
 *   scan 投影五类问题（规则/正史/知情/关系/风格 × 严重度 × 引用 × 正文定位），
 *   零层写入；continue 记录软警告（审计账本持久化 + 幂等），硬冲突 continue
 *   fail-closed 拒绝（硬冲突阻止 accept），rewrite-requested 可记录；重扫状态
 *   join；records 可审计；投影为最小 owned JSON（无完整 live object 序列化）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I64 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/review/issue.js', 'lib/core/review/ledger.js', 'lib/host/review-service.js', 'lib/host/remote/review.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const issue = read('lib/core/review/issue.js');
  for (const symbol of ['categoryOf', 'issueIdOf', 'projectSceneIssues', 'withStatus', 'summarizeReviewIssues', 'filterReviewIssues']) {
    if (!issue.includes(symbol)) fail(`lib review issue missing ${symbol}`);
  }
  const ledger = read('lib/core/review/ledger.js');
  for (const symbol of ['ReviewAuditJournal', 'record', 'decisionOf', 'duplicate']) {
    if (!ledger.includes(symbol)) fail(`lib review ledger missing ${symbol}`);
  }
  const service = read('lib/host/review-service.js');
  for (const symbol of ['createReviewService', 'scan', 'adjudicate', 'records', 'detectForbiddenExpressions']) {
    if (!service.includes(symbol)) fail(`lib review service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/review.js');
  for (const symbol of ['reviewScanInvocation', 'reviewAdjudicateInvocation', 'reviewRecordsInvocation', 'reviewRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib review remote missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + 不新增第二裁决器 + 装配。
{
  const service = read('src/host/review-service.ts');
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  const client = read('src/client.ts');
  // 复用既有探测器（经服务依赖注入，不复制 detector 内部）。
  for (const reuse of ['detectRuleAndCanon', 'detectKnowledgeLeak', 'detectRelationshipAndStyle', 'detectForbiddenExpressions', 'projectSceneIssues', 'ReviewAuditJournal']) {
    if (!service.includes(reuse)) fail(`review service must reuse ${reuse}`);
  }
  // 不复制探测器 prompt 文案（一旦复制即出现字符串）。
  for (const copied of ['你是小说一致性硬约束检测器', '你是小说 POV 知情泄漏硬约束检测器', '你是小说一致性软约束检测器']) {
    if (service.includes(copied)) fail(`review service copies an existing detector prompt: ${copied}`);
  }
  // 不新增第二裁决器：服务里不出现 pass/warn/reject 状态字面量（严重度只来自
  // 探测器输出，I20 是唯一判定 owner）。
  for (const marker of ["'pass'", "'warn'", "'reject'"]) {
    if (service.includes(marker)) fail(`review service must not define its own adjudicator (found ${marker})`);
  }
  // 装配：index.ts 提供 novelReview；remote.ts 注册 reviewInvocations。
  if (!index.includes("ctx.provide('novelReview'") || !index.includes('createReviewService')) {
    fail('index.ts missing novelReview wiring');
  }
  if (!remoteTs.includes('...reviewInvocations') || !remoteTs.includes('reviewRemoteContribution')) {
    fail('remote.ts missing reviewInvocations registration');
  }
  // Client：nav 新增审校中心稳定视图；client.ts 挂载 reviewRemoteContribution。
  if (!nav.includes("view: 'review'") || !nav.includes("view === 'review'")) {
    fail('nav.ts missing the review view / stable-view handling');
  }
  if (!client.includes('reviewRemoteContribution') || !client.includes("'remote.novelReview'")) {
    fail('client.ts missing review Remote mount');
  }
}

// Part 3 — Host 行为（lib 构建产物）：fake backend 消费者夹具。
{
  const { createReviewService } = await import('../lib/host/review-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { createCharacterService } = await import('../lib/host/character-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createStyleService } = await import('../lib/host/style-service.js');
  const { createRuleService } = await import('../lib/host/rule-service.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createConsistencyDetectionService } = await import('../lib/host/consistency-detection-service.js');
  const { createKnowledgeLeakDetectionService } = await import('../lib/host/knowledge-leak-detection-service.js');
  const { createRelationshipStyleDetectionService } = await import('../lib/host/relationship-style-detection-service.js');
  const { INITIAL_STATE } = await import('../lib/core/schema/project-lifecycle.js');

  const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
  const PROSE = '米拉在码头低声说出禁词。';

  const fakeLlm = () => ({
    async *stream(request) {
      const prompt = request.messages[0].content[0].text;
      let output;
      if (prompt.includes('你是小说一致性硬约束检测器')) {
        output = {
          violations: [
            { kind: 'immutable-rule', severity: 'hard', message: '正文直接违反不可变规则。', references: ['rule-1'] },
            { kind: 'canon-conflict', severity: 'hard', message: '正文与已落库正史直接矛盾。', references: ['evt-1'] },
          ],
        };
      } else if (prompt.includes('你是小说 POV 知情泄漏硬约束检测器')) {
        output = { violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '正文泄漏了当前 POV 未知的受保护事实。', references: ['k-1'] }] };
      } else if (prompt.includes('你是小说一致性软约束检测器')) {
        output = {
          violations: [
            { kind: 'relationship-drift', severity: 'soft', message: '正文与关系状态存在显著漂移。', references: ['rel-1'] },
            { kind: 'style-deviation', severity: 'soft', message: '正文偏离叙事风格档案。', references: ['style-demo'] },
          ],
        };
      } else {
        output = PROSE;
      }
      yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });

  const snapshotDir = (dir) => {
    const entries = [];
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else entries.push(path);
      }
    };
    walk(dir);
    return entries.sort().map((p) => `${relative(dir, p)}\u0000${createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex')}`).join('\n');
  };

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i64-smoke-'));
  try {
    const characters = createCharacterService(projectsRoot);
    const worldview = createWorldviewService(projectsRoot);
    const outline = createOutlineService(projectsRoot);
    const relationship = createRelationshipService(projectsRoot);
    const state = createStateService(projectsRoot);
    const canon = createCanonService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    const style = createStyleService(projectsRoot);
    const rules = createRuleService(projectsRoot);
    const knowledge = createKnowledgeService(projectsRoot);
    const text = createTextService(projectsRoot);
    const llm = fakeLlm();

    let disposed = 0;
    const review = createReviewService({
      llm, projectsRoot,
      text, rules, canon, knowledge, relationship, style,
      consistency: createConsistencyDetectionService(llm),
      knowledgeLeak: createKnowledgeLeakDetectionService(llm),
      relationshipStyle: createRelationshipStyleDetectionService(llm),
      resolveSettings: async () => settings,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });

    const { createProjectService } = await import('../lib/host/project-service.js');
    const project = createProjectService(projectsRoot, { characters, worldview, outline, relationship, state, canon, confirmation });
    await project.createProject({ projectId: 'demo', name: '审校演示' });
    await project.openProject('demo');
    await characters.create('demo', {
      id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await characters.create('demo', {
      id: 'lin', name: '林', aliases: [], kind: 'extra', personality: '沉默', background: '守夜人', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
      arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
    await worldview.create('demo', {
      id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'],
      triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
    });
    await outline.save('demo', {
      id: 'outline-demo', structure: 'three-act', logline: '一名测绘师追查灯塔守夜人失踪之谜。', themes: ['追查'],
      acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [{ id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' }] }] }],
      foreshadowing: [], endings: [],
    });
    await outline.saveProgress('demo', { outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 0 });
    await state.open('demo', INITIAL_STATE);
    await canon.open('demo');
    await canon.append('demo', { id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: PROSE, participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] });
    await style.open('demo');
    await style.save('demo', {
      id: 'style-demo', name: '默认', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: ['禁词'],
    });
    await rules.open('demo');
    await rules.create('demo', { id: 'rule-1', scope: 'global', kind: 'physics', statement: '旧灯塔的海图只会在月圆之夜显字。', priority: 1, immutable: true, examples: [], active: true });
    await relationship.open('demo');
    await relationship.saveAll('demo', [{ id: 'rel-1', from: 'mira', to: 'lin', type: 'rivalry', affinity: 20, trust: 10, status: 'active', milestones: [], knownTo: ['mira'] }]);
    await knowledge.open('demo');
    await knowledge.saveAll('demo', [
      { id: 'k-1', fact: '灯塔守夜人失踪真相', kind: 'secret', holders: [], revealPlan: { revealTo: ['mira'], revealAt: '第三幕' }, status: 'hidden', version: 1 },
    ], [{ characterId: 'mira', knows: [] }]);
    await confirmation.open('demo');
    await text.open('demo');
    // C5：一章两个场景 —— scene-1 有正文（触发五类检测），scene-2 为空（跳过）。
    await text.createChapter('demo', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-1', { id: 'scene-1', content: PROSE, summary: '码头发现', beats: ['detail-1'], canonEvents: ['evt-1'], notes: '' });
    await text.appendScene('demo', 'chapter-1', { id: 'scene-2', content: '', summary: '空场景', beats: [], canonEvents: [], notes: '' });

    const projectDir = join(projectsRoot, 'demo');
    const before = snapshotDir(projectDir);

    // 1) scan → 五类问题投影（规则/正史/知情/关系/风格 × 严重度 × 引用 × 正文定位）。
    const projection = await review.scan('demo');
    assert.equal(projection.projectId, 'demo');
    const byCategory = new Map(projection.issues.map((issue) => [issue.category, issue]));
    for (const category of ['rule', 'canon', 'knowledge', 'relationship', 'style']) {
      assert.ok(byCategory.has(category), `projection must include ${category} issues`);
      assert.equal(byCategory.get(category).severity, category === 'relationship' || category === 'style' ? 'soft' : 'hard');
      assert.deepEqual(byCategory.get(category).location, { chapterId: 'chapter-1', sceneId: 'scene-1' }, `${category} issue must carry 正文定位`);
      assert.ok(byCategory.get(category).references.length > 0, `${category} issue must carry references`);
      assert.equal(byCategory.get(category).status, 'open');
    }
    // 五类逐一可追溯（kind/消息/引用）。
    assert.equal(byCategory.get('rule').kind, 'immutable-rule');
    assert.deepEqual(byCategory.get('rule').references, ['rule-1']);
    assert.equal(byCategory.get('canon').kind, 'canon-conflict');
    assert.deepEqual(byCategory.get('canon').references, ['evt-1']);
    assert.equal(byCategory.get('knowledge').kind, 'knowledge-leak');
    assert.deepEqual(byCategory.get('knowledge').references, ['k-1']);
    assert.equal(byCategory.get('relationship').kind, 'relationship-drift');
    assert.deepEqual(byCategory.get('relationship').references, ['rel-1']);
    assert.equal(byCategory.get('style').kind, 'style-deviation');
    assert.deepEqual(byCategory.get('style').references, ['style-demo']);
    // I20 确定性 forbidden-expression 也投影为风格软问题（正文含「禁词」）。
    const forbidden = projection.issues.find((issue) => issue.kind === 'forbidden-expression');
    assert.ok(forbidden !== undefined, 'deterministic forbidden-expression must be projected as style soft issue');
    assert.equal(forbidden.severity, 'soft');
    // 汇总与空场景跳过（scene-2 无问题）。
    assert.equal(projection.summary.total, projection.issues.length);
    assert.equal(projection.summary.hard, 3);
    assert.equal(projection.summary.soft, 3);

    // 2) 最小 owned JSON：投影可无损 JSON 序列化（无 live object / 无文件路径），
    //    scan 零层写入（含 review-audit.yaml 尚未创建）。
    assert.deepEqual(JSON.parse(JSON.stringify(projection)), projection, 'projection must be plain owned JSON');
    for (const issue of projection.issues) {
      const keys = Object.keys(issue).sort();
      assert.deepEqual(keys, ['category', 'id', 'kind', 'location', 'message', 'references', 'severity', 'status'], 'issue must carry only owned fields');
    }
    assert.equal(snapshotDir(projectDir), before, 'scan must be zero-write (no layer, no audit file)');

    // 3) 软警告显式继续并记录：continue 落审计账本；重复幂等。
    const relIssue = byCategory.get('relationship');
    const continued = await review.adjudicate('demo', 'continue', [relIssue.id]);
    assert.equal(continued.applied.length, 1);
    assert.equal(continued.duplicate.length, 0);
    assert.equal(continued.projection.issues.find((issue) => issue.id === relIssue.id).status, 'continued');
    assert.ok(existsSync(join(projectDir, 'review-audit.yaml')), 'soft-warning decision must be recorded to the audit file');
    const again = await review.adjudicate('demo', 'continue', [relIssue.id]);
    assert.equal(again.applied.length, 0);
    assert.equal(again.duplicate.length, 1, 'repeat continue must be idempotent (duplicate)');

    // 4) 重扫后状态 join：已继续的软问题保持 continued，其余 open。
    const rescan = await review.scan('demo');
    assert.equal(rescan.issues.find((issue) => issue.id === relIssue.id).status, 'continued');
    assert.equal(rescan.issues.find((issue) => issue.id === byCategory.get('rule').id).status, 'open');

    // 5) 硬冲突阻止继续/accept：continue 含任何硬问题 → fail-closed 零写。
    const hardId = byCategory.get('canon').id;
    await assert.rejects(review.adjudicate('demo', 'continue', [hardId]), /硬冲突阻止继续\/接受/, 'hard issue must block continue');
    // 硬问题可请求重写（记录）。
    const requested = await review.adjudicate('demo', 'rewrite-requested', [hardId]);
    assert.equal(requested.applied.length, 1);
    assert.equal(requested.projection.issues.find((issue) => issue.id === hardId).status, 'rewrite-requested');

    // 6) 裁决前无 scan 缓存 → fail-closed（未知/陈旧 issue 无裁决权）。
    const other = await import('../lib/core/review/issue.js');
    const unknownId = other.issueIdOf('style', 'style-deviation', { chapterId: 'x', sceneId: 'y' }, '陌生问题', ['nope']);
    await assert.rejects(review.adjudicate('demo', 'continue', [unknownId]), /未知审校问题/);

    // 7) records 可审计。
    const records = await review.records('demo');
    assert.deepEqual(records.map((record) => [record.issueId, record.decision]).sort(),
      [[relIssue.id, 'continue'], [hardId, 'rewrite-requested']].sort());

    // 8) Fiber 清理：onDispose 注册成功（dispose 幂等无副作用）。
    assert.equal(disposed, 1);

    console.log('I64 smoke: 一致性审校中心（五类问题投影可追溯/定位引用/硬冲突阻止继续/软警告显式裁决并记录/审计账本/零层写入/最小 owned JSON）通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
