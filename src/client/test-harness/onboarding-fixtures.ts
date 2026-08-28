import { flush, type FakeNode } from '../test-harness.js';
import { collect } from './dom-helpers.js';
import type { MountOptions } from './remote-builders.js';

/**
 * I95 test-harness 拆分（计划 §18 I95）：onboarding fixtures 片——I56_LAYERS
 * 六层候选夹具、analyzerStub 与 openOnboardingReview 驱动辅助。由
 * test-harness.ts 兼容重导出。
 */

/** I56 夹具：仅 characters 有候选，其余五层为空候选。 */
export const I56_LAYERS = {
  characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
  worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
};

/** I57 session-first analyzer stub: begin→session, status→terminal, result→package. */
export const analyzerStub = (layers: unknown, overrides: NonNullable<MountOptions['onboardingAnalyzer']> = {}) => ({
  begin: overrides.begin ?? (async () => ({ onboardingSessionId: 'sess-1' })),
  status: overrides.status ?? (async () => 'succeeded'),
  result: overrides.result ?? (async () => ({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers })),
  cancel: overrides.cancel ?? (async () => undefined),
  start: overrides.start ?? (async () => { throw new Error('未注入 remote.novelOnboardingAnalyzer.start'); }),
});

/** I56：切到审阅页签、粘贴原文并启动分析，返回可随时重渲染的 render 函数。 */
export async function openOnboardingReview(registrations: Record<string, Array<{ component: () => unknown }>>, layers: unknown): Promise<() => FakeNode> {
  // 等待 mount 的自动开项目循环完成，再进入审阅页签（与既有 I52 测试一致）。
  await flush();
  const render = () => registrations['shell.overlay'][0].component() as FakeNode;
  (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
  await flush();
  const tree = render();
  const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
  const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
  (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
  (start?.props?.onClick as () => void)();
  // 等待分析结果落地再返回：自由文本经 crypto.subtle.digest（Node 线程池）后才
  // 启动分析，全量并行测试下宏任务延迟不确定，固定 flush 窗口会偶发先于审阅渲染
  // 返回（既有 I52/I56/I57 偶发竞态）；这里轮询直到候选值出现（最多 20 轮）。
  for (let round = 0; round < 20; round += 1) {
    await flush();
    if (collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] !== undefined)) break;
  }
  return render;
}
