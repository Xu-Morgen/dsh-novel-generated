import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I82 client.ts 拆分（一）store 接口收敛与 ops 按层拆分 smoke（架构审查 §5.1 / §9 #5；
 * 重构纪律 §16-2 行为等价）。
 *
 * 交付物核验：
 * - 拆分结构：client.ts 由 2878 行收敛（护栏 < 1500）；makeOps 1300 行按层拆为
 *   src/client/ops/ 16 个工厂 + 组合根；store 单一来源在 src/client/store/。
 * - 三接口重复声明归零：WorkbenchActions / WorkbenchState 只定义于 store/types.ts；
 *   ProjectSessionActions 由 Pick<WorkbenchActions, …> 派生，project-session.ts 不再
 *   手写任何装载方法签名。
 * - 形参收敛：viewPanel（33 → 10）与 workbenchView（42 → 21）改经 ns/states 打包
 *   对象接收；调用点不再平铺 30+ 实参。
 * - 行为等价由 verify 链的 `pnpm test`（含 137 条 client.test.ts 锚点）保证。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I82 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

// Part 1 — 拆分结构（行数护栏 + makeOps 按层归位 + store 单一来源）。
{
  const clientLines = read('src/client.ts').split('\n').length;
  if (clientLines >= 1500) fail(`client.ts 仍有 ${clientLines} 行（原 2878，护栏 < 1500：store/ops 未有效拆出）`);
  // makeOps 内联实现体必须全部离开 client.ts（逐层 Remote 调用已归位 ops/）。
  for (const body of ['unwrap(workspace.characterCreate', 'unwrap(workspace.worldviewCreate', 'unwrap(workspace.outlineSave', 'unwrap(workspace.relationshipSave', 'unwrap(workspace.canonCorrectionPropose', 'unwrap(target.search(projectId']) {
    if (codeLines('src/client.ts').some((line) => line.includes(body))) fail(`client.ts 残留 makeOps 实现体：${body}`);
  }
  // store 单一来源：fresh 状态与 actions 表在 store/，client.ts 只调用工厂。
  const storeIndex = read('src/client/store/index.ts');
  if (!storeIndex.includes('export function freshWorkbenchState') || !storeIndex.includes('export function createWorkbenchStore')) {
    fail('store/index.ts 缺少 freshWorkbenchState / createWorkbenchStore');
  }
  if (codeLines('src/client.ts').some((line) => line.includes('defineStore({'))) fail('client.ts 残留 defineStore 内联调用（应经 createWorkbenchStore）');
  // ops 组合根：16 个按层工厂全部被 createWorkbenchOps 引用。
  const opsIndex = read('src/client/ops/index.ts');
  const factories = ['createCharactersOps', 'createWorldviewOps', 'createOutlineOps', 'createRelationshipOps', 'createStateOps', 'createCanonOps',
    'createChaptersOps', 'createReviewOps', 'createQueueOps', 'createKnowledgeOps', 'createRuleStyleOps', 'createProgressOps',
    'createImportExportOps', 'createSearchOps', 'createStatisticsOps', 'createTimelineOps'];
  for (const factory of factories) {
    if (!opsIndex.includes(factory)) fail(`ops/index.ts 组合根未引用 ${factory}`);
    const file = factory.replace('create', '').replace(/Ops$/, '').replace(/^Import/, 'import-').toLowerCase();
    // factory 定义必须落在对应文件（chapters/rule-style/import-export 特殊文件名映射）。
    const expectedFile = factory === 'createChaptersOps' ? 'chapters'
      : factory === 'createRuleStyleOps' ? 'rule-style'
        : factory === 'createImportExportOps' ? 'import-export'
          : factory === 'createWorldviewOps' ? 'worldview' : file;
    if (!codeLines(`src/client/ops/${expectedFile}.ts`).some((line) => line.includes(`export function ${factory}`))) {
      fail(`${factory} 定义未落在 src/client/ops/${expectedFile}.ts`);
    }
  }
  console.log('I82 Part 1: 拆分结构 OK（client.ts=' + clientLines + ' 行，16 个按层 ops 工厂 + store 单一来源）');
}

// Part 2 — 三接口重复声明归零（WorkbenchActions/WorkbenchState/ProjectSessionActions）。
{
  const types = read('src/client/store/types.ts');
  const projectSession = read('src/client/project-session.ts');
  const client = read('src/client.ts');
  // 单一来源：三接口只定义在 store/types.ts。
  for (const symbol of ['export type WorkbenchActions = {', 'export interface WorkbenchState {']) {
    const inTypes = codeLines('src/client/store/types.ts').some((line) => line.includes(symbol));
    if (!inTypes) fail(`store/types.ts 缺少 ${symbol}`);
    if (codeLines('src/client.ts').some((line) => line.includes(symbol))) fail(`client.ts 残留 ${symbol} 定义`);
    if (codeLines('src/client/project-session.ts').some((line) => line.includes(symbol))) fail(`project-session.ts 残留 ${symbol} 定义`);
  }
  // ProjectSessionActions 由 Pick 派生，不再手写方法签名。
  if (!types.includes('export type ProjectSessionActions = Pick<')) fail('ProjectSessionActions 未由 WorkbenchActions Pick 派生');
  if (!projectSession.includes("import type { ProjectSessionActions } from './store/types.js'")) fail('project-session.ts 未从 store/types 导入 ProjectSessionActions');
  for (const handWritten of ['setCharacters(status: \'loading\' | \'ready\' | \'error\'', 'setChapters(status: \'loading\' | \'ready\' | \'error\'', 'outlineDraft(patch: { draft?:']) {
    if (projectSession.includes(handWritten)) fail(`project-session.ts 残留手写接口签名：${handWritten}`);
  }
  console.log('I82 Part 2: 三接口重复声明归零 OK（WorkbenchActions/WorkbenchState 单源；ProjectSessionActions=Pick 派生）');
}

// Part 3 — viewPanel / workbenchView 形参收敛。
{
  const client = read('src/client.ts');
  const viewPanelSig = client.slice(client.indexOf('function viewPanel('), client.indexOf('): unknown {', client.indexOf('function viewPanel(')));
  const workbenchViewSig = client.slice(client.indexOf('function workbenchView('), client.indexOf('): unknown {', client.indexOf('function workbenchView(')));
  if (!viewPanelSig.includes('ns: WorkbenchNamespaces') || !viewPanelSig.includes('states: WorkbenchViewStates')) fail('viewPanel 未经 ns/states 打包形参');
  if (!workbenchViewSig.includes('ns: WorkbenchNamespaces') || !workbenchViewSig.includes('states: WorkbenchViewStates')) fail('workbenchView 未经 ns/states 打包形参');
  // 形参数量护栏：viewPanel 顶层形参 < 15（原 33）；workbenchView < 25（原 42）。
  const countTopParams = (sig) => {
    let depth = 0; let count = 1;
    for (const ch of sig) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ',' && depth === 1) count += 1;
    }
    return count;
  };
  const vp = countTopParams(viewPanelSig);
  const wv = countTopParams(workbenchViewSig);
  if (vp >= 15) fail(`viewPanel 仍 ${vp} 个形参（原 33，护栏 < 15）`);
  if (wv >= 25) fail(`workbenchView 仍 ${wv} 个形参（原 42，护栏 < 25）`);
  // 调用点不再平铺 30+ 实参：两处调用均以 `{` 打包 ns/states。
  const calls = client.match(/viewPanel\(h, ui\.activeView, selectedProjectId, \{/g) ?? [];
  if (calls.length !== 1) fail('viewPanel 调用点未收敛为打包形式（期望恰好 1 处）');
  if (!client.includes('return workbenchView(React, s.status, {')) fail('workbenchView 调用点未收敛为打包形式');
  console.log(`I82 Part 3: 形参收敛 OK（viewPanel 33→${vp}，workbenchView 42→${wv}）`);
}

// Part 4 — 兼容面与构建产物存在性。
{
  for (const file of ['lib/client.js', 'lib/client/store/index.js', 'lib/client/ops/index.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const libClient = read('lib/client.js');
  assert.ok(libClient.includes('createWorkbenchStore') && libClient.includes('createWorkbenchOps'), 'lib bundle 必须携带 store/ops 接线');
  console.log('I82 Part 4: 兼容面 OK（client.ts 常量 re-export 与 bundle 接线存在；行为等价由 137 条 client.test.ts 在 verify 链覆盖）');
}

console.log('I82 smoke: 拆分结构 + 三接口归零 + 形参收敛 + 兼容面通过');
