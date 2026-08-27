import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I78 契约锁落地与 Client shape 收敛 smoke（架构审查 §6.3 / §8#5 / §9#3；D22）。
 *
 * 交付物核验：
 * - `contracts/` 形状本体契约锁：stage10 两个既有锁补上 shapes 本体、新增
 *   stage15/client-projection.json；以 built lib 实现 schema 重新生成本体并逐字节
 *   比较（一致性断言），漂移（含 in-memory 负向）即失败。
 * - Client 投影 shape 收敛：CharacterShape/OutlineShape 等由 core 派生（单一来源）；
 *   rename 演示证明 canonical 字段改名在 client 层报编译错、wire/组合根零改动；
 *   serializer 输出经 canonical 严格解析一致（正负向）。
 * - client bundle 白名单：esbuild metafile 实测导入图与白名单双向一致；白名单外
 *   core 引用（如含 node:fs 的 core/project）必须失败。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I78 smoke: ${msg}`); };

// Part 1 — contracts/ 形状本体契约锁与实现一致性（built lib 产物）。
{
  const { checkShapeLock } = await import('../lib/contract-lock.js');
  const { characterFormSchema, outlineFormSchema, relationshipFormSchema, worldFormSchema } = await import('../lib/client/shapes.js');
  const { actSchema, beatSchema, detailBeatSchema } = await import('../lib/core/schema/outline.js');
  const { uploadChunkResultSchema, uploadFinalizeResultSchema, uploadStartInputSchema, uploadStartResultSchema, docxTextChunkSchema } = await import('../lib/core/schema/upload.js');
  const { projectMetaSchema } = await import('../lib/core/schema/base.js');
  const { createProjectInputSchema, projectLayerReadinessSchema, projectOpenResultSchema } = await import('../lib/core/schema/project-lifecycle.js');
  const { characterCoreSchema } = await import('../lib/core/schema/characters.js');

  const readLock = (p) => JSON.parse(read(p));
  const docxLock = readLock('contracts/stage10/docx-upload.json');
  const lifecycleLock = readLock('contracts/stage10/project-lifecycle.json');
  const projectionLock = readLock('contracts/stage15/client-projection.json');

  const docxDiffs = checkShapeLock(docxLock, {
    UploadStartInput: uploadStartInputSchema,
    UploadStartResult: uploadStartResultSchema,
    UploadChunkResult: uploadChunkResultSchema,
    UploadFinalizeResult: uploadFinalizeResultSchema,
    DocxTextChunk: docxTextChunkSchema,
  });
  if (docxDiffs.length) fail(`docx-upload 契约锁漂移:\n${docxDiffs.join('\n')}`);

  const lifecycleDiffs = checkShapeLock(lifecycleLock, {
    ProjectMeta: projectMetaSchema,
    CreateProjectInput: createProjectInputSchema,
    ProjectOpenResult: projectOpenResultSchema,
    ProjectLayerReadiness: projectLayerReadinessSchema,
  });
  if (lifecycleDiffs.length) fail(`project-lifecycle 契约锁漂移:\n${lifecycleDiffs.join('\n')}`);

  const projectionDiffs = checkShapeLock(projectionLock, {
    CharacterShape: characterFormSchema,
    OutlineShape: outlineFormSchema,
    OutlineActShape: actSchema,
    OutlineBeatShape: beatSchema,
    OutlineDetailBeatShape: detailBeatSchema,
    RelationshipShape: relationshipFormSchema,
    WorldShape: worldFormSchema,
  });
  if (projectionDiffs.length) fail(`client-projection 契约锁漂移:\n${projectionDiffs.join('\n')}`);

  // 负向：实现漂移（用 canonical 全量 schema 冒充表单模型）必须失败。
  const driftedDiffs = checkShapeLock(projectionLock, { CharacterShape: characterCoreSchema });
  if (driftedDiffs.length === 0) fail('契约锁负向：形状漂移必须产生差异');
  if (!driftedDiffs.join('\n').includes('CharacterShape')) fail('契约锁负向：漂移报告必须点名 CharacterShape');

  console.log('I78 Part 1: contracts/ 形状本体契约锁与 built lib 实现一致（含漂移负向）OK');
}

// Part 2 — Client 投影由 core 派生：canonical 字段改名在 client 层报编译错、
// wire/组合根零改动（一次性演示，finally 回退）。
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
    const wireHits = production.filter((p) => p.startsWith('src/host/') || p === 'src/index.ts' || p === 'src/remote.ts');
    if (wireHits.length !== 0) {
      fail(`canonical 字段改名后 wire/组合根层必须零改动（派生），实际受影响：${wireHits.join(', ')}`);
    }
    if (!production.some((p) => p.startsWith('src/client/') || p === 'src/client.ts')) {
      fail('client 投影派生自 characterCoreSchema：canonical 字段改名必须在 client 层报编译错（形状漂移即失败）');
    }
    if (production.length > 5) {
      fail(`canonical 字段改名影响面（生产文件）应 ≤ 5，实际 ${production.length}：${production.join(', ')}`);
    }
    console.log(`I78 Part 2: canonical 字段改名影响面 = ${production.length} 个生产文件，wire/组合根零改动，client 层派生命中（${production.filter((p) => p.startsWith('src/client/') || p === 'src/client.ts').join(', ') || '?'}）OK`);
  } finally {
    writeFileSync(schemaFile, original);
  }
}

// Part 3 — serializer（Client 表单 → wire 输入）经 canonical 严格解析一致（正负向）。
{
  const { characterCreateInput } = await import('../lib/client/layers/characters.js');
  const { outlineInput } = await import('../lib/client/layers/outline.js');
  const { relationshipInput } = await import('../lib/client/layers/relationship.js');
  const { worldviewInput } = await import('../lib/client/layers/worldview.js');
  const { characterCoreSchema } = await import('../lib/core/schema/characters.js');
  const { outlineSchema } = await import('../lib/core/schema/outline.js');
  const { relationshipSchema } = await import('../lib/core/schema/relationship.js');
  const { worldEntrySchema } = await import('../lib/core/schema/worldview.js');

  const strictParse = (label, schema, payload) => {
    const parsed = schema.parse(payload);
    assert.deepEqual(parsed, payload, `${label}: canonical 解析结果必须与序列化输出完全一致`);
    return parsed;
  };

  const character = {
    id: 'c-1', name: '米拉', aliases: [], kind: 'protagonist', personality: '坚韧', background: '灯塔守夜人',
    motivation: '查明真相', goals: [], flaws: [], abilities: [], speechStyle: '简洁', staticTraits: [],
    arc: { startingPoint: '第一幕', desiredEnd: '第三幕', keyBeats: [] }, relationships: [], knowledgeIds: [],
  };
  strictParse('characterCreateInput', characterCoreSchema.omit({ version: true }), characterCreateInput(character));

  const outline = {
    id: 'outline', structure: 'free', logline: '灯塔的秘密', themes: ['希望'], version: undefined,
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '找到入口', beats: [{ id: 'beat-1', title: '进入旧港', description: '米拉找到入口。', charactersInvolved: ['c-1'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card-1', title: '旧港', summary: '米拉进入旧港。', pov: '米拉', wordTarget: 500, points: ['关键'], status: 'planned' }] }] }],
    foreshadowing: [], endings: [],
  };
  strictParse('outlineInput', outlineSchema.omit({ version: true }), outlineInput(outline));

  const relationship = { id: 'r-1', from: 'c-1', to: 'c-2', type: 'friendship', affinity: 30, trust: 50, status: 'active', milestones: [], knownTo: [] };
  strictParse('relationshipInput', relationshipSchema.omit({ version: true }), relationshipInput(relationship));

  const world = { id: 'w-1', kind: 'geography', title: '灯塔', content: '海崖上的灯塔。', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null };
  strictParse('worldviewInput', worldEntrySchema.omit({ version: true }), worldviewInput(world));

  // 负向：旧 envelope 形状（契约漂移产物）必须被 canonical 拒绝。
  assert.throws(
    () => characterCoreSchema.omit({ version: true }).parse({ character }),
    /expected|Invalid/,
    '旧 envelope 形状必须被 canonical schema 拒绝',
  );

  console.log('I78 Part 3: 四个 serializer 输出经 canonical 严格解析一致（含 envelope 负向）OK');
}

// Part 4 — client bundle core 白名单扫描（正向）+ 白名单外引用失败（负向）。
{
  const { runClientCoreWhitelistScan, collectClientCoreInputs } = await import('../scripts/scan-client-core-whitelist.mjs');
  const { assertCoreWhitelisted } = await import('../lib/client-bundle-whitelist.js');

  const coreInputs = await runClientCoreWhitelistScan();
  if (coreInputs.length < 20) fail(`client bundle core 输入过少：${coreInputs.length}`);

  const violations = assertCoreWhitelisted([...coreInputs, 'src/core/project/index.ts']);
  if (violations.length === 0 || !violations.join('\n').includes('src/core/project/index.ts')) {
    fail('白名单外 core 引用（src/core/project/index.ts，含 node:fs）必须失败');
  }
  const stale = assertCoreWhitelisted(coreInputs.filter((p) => p !== coreInputs[0]));
  if (stale.length === 0 || !stale.join('\n').includes(coreInputs[0])) {
    fail('白名单条目未被使用必须失败');
  }

  console.log(`I78 Part 4: client bundle 白名单扫描通过（${coreInputs.length} 个 core 纯模块），白名单外引用与过期条目负向 OK`);
}

console.log('I78 smoke: contracts/ 形状本体契约锁一致 + Client shape 收敛（core 派生/编译期暴露/序列化严格一致）+ client bundle 白名单扫描通过');
