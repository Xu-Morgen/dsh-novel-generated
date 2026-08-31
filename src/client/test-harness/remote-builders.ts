/**
 * I95 test-harness 拆分（计划 §18 I95）：remote builders 片——MountOptions/
 * WorkspaceOverrides 类型、makeWorkspace 全量 stub 与 READY_MODEL。供 mount() 与
 * 各测试文件使用；由 test-harness.ts 兼容重导出。
 */

export interface MountOptions { deferStoreInjection?: boolean; openProjectId?: string | null; llmConfig?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown> }; workbenchSettings?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown>; openProjectFolder?: (projectId: string) => Promise<unknown> }; importExport?: { exportArchive?: (projectId: string, mode: string) => Promise<unknown>; exportText?: (projectId: string, format: string) => Promise<unknown>; restore?: (projectId: string, raw: string) => Promise<unknown>; importPreview?: (projectId: string, input: { fileName: string; format: string; text: string }) => Promise<unknown> }; search?: { build?: (projectId: string) => Promise<unknown>; drop?: (projectId: string) => Promise<unknown>; stats?: (projectId: string) => Promise<unknown>; search?: (projectId: string, query: string, pov?: string) => Promise<unknown>; references?: (projectId: string, key: string, pov?: string) => Promise<unknown> }; statistics?: { rebuild?: (projectId: string) => Promise<unknown>; drop?: (projectId: string) => Promise<unknown>; stats?: (projectId: string) => Promise<unknown>; overview?: (projectId: string) => Promise<unknown>; chapterDetail?: (projectId: string, chapterId: string) => Promise<unknown>; sceneCards?: (projectId: string, actId?: string, beatId?: string, status?: string, limit?: number) => Promise<unknown>; tasks?: (projectId: string, status?: string, limit?: number) => Promise<unknown> }; timeline?: { read?: (projectId: string) => Promise<unknown>; ensureFromOutline?: (projectId: string) => Promise<unknown>; setCurrentNode?: (projectId: string, nodeId: string | null) => Promise<unknown>; save?: (projectId: string, input: unknown) => Promise<unknown> }; onboardingAnalyzer?: { begin?: (input: unknown, settings: unknown) => Promise<unknown>; status?: (onboardingSessionId: string) => Promise<unknown>; cancel?: (onboardingSessionId: string) => Promise<unknown>; result?: (onboardingSessionId: string) => Promise<unknown>; start?: (input: unknown, settings: unknown) => Promise<unknown> }; onboarding?: { adjudicate?: (input: unknown, settings: unknown) => Promise<unknown>; acceptedLayers?: (onboardingSessionId: string) => Promise<unknown>; finalApply?: (input: unknown) => Promise<unknown> }; writing?: { propose?: (projectId: string, input: unknown) => Promise<unknown>; proposeAt?: (projectId: string, input: { intent: 'continue' | 'scene-card'; chapterId: string; sceneId: string }) => Promise<unknown>; preview?: (candidateId: string) => Promise<unknown>; adjudicate?: (candidateId: string, decision: string) => Promise<unknown> }; review?: { scan?: (projectId: string) => Promise<unknown>; adjudicate?: (projectId: string, input: { decision: string; issueIds: string[] }) => Promise<unknown>; records?: (projectId: string) => Promise<unknown> }; queue?: { status?: (projectId: string) => Promise<unknown>; start?: (projectId: string, input?: unknown) => Promise<unknown>; startAt?: (projectId: string, input: unknown) => Promise<unknown>; pause?: (projectId: string) => Promise<unknown>; resume?: (projectId: string) => Promise<unknown>; cancel?: (projectId: string) => Promise<unknown>; retry?: (projectId: string, taskId: string) => Promise<unknown>; cancelTask?: (projectId: string, taskId: string) => Promise<unknown>; recover?: (projectId: string) => Promise<unknown> }; ruleStyle?: { list?: (projectId: string) => Promise<unknown>; readRule?: (projectId: string, ruleId: string) => Promise<unknown>; createRule?: (projectId: string, input: unknown) => Promise<unknown>; updateRule?: (projectId: string, ruleId: string, patch: unknown) => Promise<unknown>; readStyle?: (projectId: string) => Promise<unknown>; saveStyle?: (projectId: string, input: unknown) => Promise<unknown> }; knowledge?: { list?: (projectId: string) => Promise<unknown>; read?: (projectId: string, entryId: string) => Promise<unknown>; propose?: (projectId: string, input: unknown) => Promise<unknown>; accept?: (projectId: string, proposalId: string) => Promise<unknown>; reject?: (projectId: string, proposalId: string) => Promise<unknown>; pending?: (projectId: string) => Promise<unknown> }; progress?: { projection?: (projectId: string) => Promise<unknown>; recordDeviation?: (projectId: string, input: unknown) => Promise<unknown>; reconcileDeviation?: (projectId: string, deviationId: string) => Promise<unknown>; inspire?: (projectId: string, prompt?: string) => Promise<unknown>; select?: (projectId: string, input: unknown) => Promise<unknown>; apply?: (projectId: string, proposalId: string) => Promise<unknown>; reject?: (projectId: string, proposalId: string) => Promise<unknown>; pending?: (projectId: string) => Promise<unknown>; audit?: (projectId: string) => Promise<unknown> }; }

// I106 management remotes are injectable so Client tests can exercise the real
// state transitions without weakening the derived Remote namespace types.
export interface MountOptionsI106 {
  textMutation?: { fingerprint?: (projectId: string) => Promise<unknown>; chapterCreate?: (projectId: string, input: unknown) => Promise<unknown>; chapterUpdate?: (projectId: string, input: unknown) => Promise<unknown>; sceneCreate?: (projectId: string, input: unknown) => Promise<unknown>; sceneUpdate?: (projectId: string, input: unknown) => Promise<unknown>; reorder?: (projectId: string, input: unknown) => Promise<unknown> };
  sceneOutlineBinding?: { read?: (projectId: string) => Promise<unknown>; save?: (projectId: string, input: unknown) => Promise<unknown>; rebind?: (projectId: string, input: unknown) => Promise<unknown>; unbind?: (projectId: string, input: unknown) => Promise<unknown>; impact?: (projectId: string, input: unknown) => Promise<unknown> };
  textDeletion?: { impact?: (projectId: string, target: unknown) => Promise<unknown>; propose?: (projectId: string, target: unknown, expectedImpactFingerprint: string) => Promise<unknown>; apply?: (projectId: string, proposalId: string) => Promise<unknown>; reject?: (projectId: string, proposalId: string) => Promise<unknown> };
}

// I107 章节模式夹具：版本 Remote 只在进入 versions 模式时才应被调用。
export interface MountOptionsI107 {
  branch?: { list?: (projectId: string, chapterId: string, sceneId: string) => Promise<unknown>; read?: (projectId: string, chapterId: string, sceneId: string, branchId: string) => Promise<unknown>; save?: (projectId: string, chapterId: string, sceneId: string, label: string) => Promise<unknown>; choose?: (projectId: string, chapterId: string, sceneId: string, branchId: string) => Promise<unknown>; diff?: (projectId: string, chapterId: string, sceneId: string, branchId: string, toBranchId?: string) => Promise<unknown> };
}

/** I114 reconciliation namespace injection for materials-mode Client E2E. */
export interface MountOptionsI114 {
  outlineReconciliation?: {
    prepare?: (projectId: string, input: unknown, settings?: unknown) => Promise<unknown>;
    regenerateOne?: (projectId: string, input: unknown, settings?: unknown) => Promise<unknown>;
    read?: (projectId: string, planId: string) => Promise<unknown>;
    cancel?: (projectId: string, planId: string) => Promise<unknown>;
    propose?: (projectId: string, input: unknown) => Promise<unknown>;
    accept?: (projectId: string, proposalId: string) => Promise<unknown>;
    reject?: (projectId: string, proposalId: string) => Promise<unknown>;
    finalize?: (projectId: string, input: unknown) => Promise<unknown>;
    continue?: (projectId: string, input: unknown) => Promise<unknown>;
  };
}

/** I117 read-only reference audit injection for the review-panel E2E fixture. */
export interface MountOptionsI117 {
  referenceAudit?: { list?: (projectId: string, input?: unknown) => Promise<unknown> };
}

/** Declaration merge keeps the historical one-line harness type compatible. */
export interface MountOptions {
  textMutation?: MountOptionsI106['textMutation'];
  sceneOutlineBinding?: MountOptionsI106['sceneOutlineBinding'];
  textDeletion?: MountOptionsI106['textDeletion'];
  branch?: MountOptionsI107['branch'];
  sceneReparsePreview?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
  outlineReconciliation?: MountOptionsI114['outlineReconciliation'];
  referenceAudit?: MountOptionsI117['referenceAudit'];
}

export interface WorkspaceOverrides {
  projectList?: () => Promise<unknown[]>;
  projectCreate?: (input: unknown) => Promise<unknown>;
  projectOpen?: (projectId: string) => Promise<unknown>;
  uploadStart?: (input: unknown) => Promise<unknown>;
  uploadChunk?: (uploadId: string, index: number, base64: string) => Promise<unknown>;
  uploadFinalize?: (uploadId: string) => Promise<unknown>;
  uploadCancel?: (uploadId: string) => Promise<unknown>;
  characterList?: (projectId: string) => Promise<unknown[]>;
  characterCreate?: (projectId: string, input: unknown) => Promise<unknown>;
  characterUpdate?: (projectId: string, id: string, patch: unknown) => Promise<unknown>;
  worldviewList?: () => Promise<unknown[]>;
  worldviewCreate?: (projectId: string, input: unknown) => Promise<unknown>;
  worldviewRewrite?: (projectId: string, id: string, input: unknown) => Promise<unknown>;
  outlineRead?: (projectId: string) => Promise<unknown>;
  outlineSave?: (projectId: string, input: unknown) => Promise<unknown>;
  relationshipRead?: (projectId: string) => Promise<unknown[]>;
  relationshipSave?: (projectId: string, input: unknown) => Promise<unknown>;
  stateSnapshots?: (projectId: string) => Promise<unknown[]>;
  stateRollback?: (projectId: string, seq: number) => Promise<unknown>;
  stateDiff?: (projectId: string, fromSeq: number, toSeq: number) => Promise<unknown>;
  canonQuery?: (projectId: string) => Promise<unknown[]>;
  canonCorrectionPropose?: (projectId: string, targetId: string, input: unknown) => Promise<unknown>;
  canonCorrectionAccept?: (projectId: string, proposalId: string) => Promise<unknown>;
  /** I60：C5 只读 Remote（chapterList/chapterRead/sceneRead）。 */
  chapterList?: (projectId: string) => Promise<unknown[]>;
  chapterRead?: (projectId: string, chapterId: string) => Promise<unknown>;
  sceneRead?: (projectId: string, chapterId: string, sceneId: string) => Promise<unknown>;
  /** I61：受控编辑 Remote（sceneEdit / reparse propose / accept / reject）。 */
  sceneEdit?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
  sceneReparsePropose?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
  sceneReparseAccept?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, proposalId: string, baseHash?: string) => Promise<unknown>;
  sceneReparseReject?: (projectId: string, proposalId: string) => Promise<unknown>;
  /** I65：B5 场景卡范围（生成队列勾选）。 */
  outlineBeatCards?: (projectId: string) => Promise<unknown[]>;
  sceneReparsePreview?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
}

/** Full `novelWorkspace` remote stub so render-time loads do not throw. */
export const makeWorkspace = (viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}) => ({
  viewModel,
  characterList: overrides.characterList ?? (async () => []),
  characterRead: async () => ({}),
  characterCreate: overrides.characterCreate ?? (async () => ({})),
  characterUpdate: overrides.characterUpdate ?? (async () => ({})),
  worldviewList: overrides.worldviewList ?? (async () => []),
  worldviewRead: async () => ({}),
  worldviewCreate: overrides.worldviewCreate ?? (async () => ({})),
  worldviewRewrite: overrides.worldviewRewrite ?? (async () => ({})),
  outlineRead: overrides.outlineRead ?? (async () => ({ id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] })),
  outlineSave: overrides.outlineSave ?? (async () => ({})),
  outlineBeatCards: overrides.outlineBeatCards ?? (async () => []),
  relationshipRead: overrides.relationshipRead ?? (async () => []),
  relationshipSave: overrides.relationshipSave ?? (async () => ({})),
  stateCurrent: async () => ({}),
  stateSnapshots: overrides.stateSnapshots ?? (async () => []),
  stateRollback: overrides.stateRollback ?? (async () => ({})),
  stateDiff: overrides.stateDiff ?? (async () => ({ fromSeq: 0, toSeq: 0, changes: [] })),
  canonQuery: overrides.canonQuery ?? (async () => []),
  canonCorrectionPropose: overrides.canonCorrectionPropose ?? (async () => ({})),
  canonCorrectionAccept: overrides.canonCorrectionAccept ?? (async () => ({})),
  chapterList: overrides.chapterList ?? (async () => []),
  chapterRead: overrides.chapterRead ?? (async () => ({ id: '', index: 1, title: '', pov: '', status: 'draft', scenes: [] })),
  sceneRead: overrides.sceneRead ?? (async () => ({ chapter: { id: '', index: 1, title: '', pov: '' }, scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' } })),
  sceneEdit: overrides.sceneEdit ?? (async () => ({ scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' }, evidence: { before: '', after: '', unchangedPrefix: '', unchangedSuffix: '' } })),
  sceneReparsePropose: overrides.sceneReparsePropose ?? (async () => ({ proposalId: 'scene-reparse-fixture', status: 'pending' })),
  sceneReparsePreview: overrides.sceneReparsePreview ?? (async (_projectId: string, _chapterId: string, _sceneId: string, range: unknown, replacement: string, baseHash?: string) => ({
    proposalId: 'scene-reparse-fixture', range, replacement, sourceHash: baseHash ?? 'a'.repeat(64), targetHash: 'b'.repeat(64),
    generationBaseline: { kind: 'no-outline-baseline' }, changes: [], postScan: { status: 'pending', sourceMatched: false, mismatchedLayers: [] },
  })),
  sceneReparseAccept: overrides.sceneReparseAccept ?? (async () => ({ status: 'written', scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] })),
  sceneReparseReject: overrides.sceneReparseReject ?? (async () => ({ proposalId: 'scene-reparse-fixture', status: 'rejected' })),
  projectList: overrides.projectList ?? (async () => [{ id: 'fixture-project', name: '夹具作品' }]),
  projectCreate: overrides.projectCreate ?? (async () => ({})),
  projectOpen: overrides.projectOpen ?? (async () => ({})),
  uploadStart: overrides.uploadStart ?? (async () => ({ uploadId: 'fixture-upload', chunkSize: 65536, nextIndex: 0 })),
  uploadChunk: overrides.uploadChunk ?? (async () => ({ nextIndex: 1, received: 0 })),
  uploadFinalize: overrides.uploadFinalize ?? (async () => ({ sourceHash: 'a'.repeat(64), fileName: 'fixture.docx', text: '', chunks: [] })),
  uploadCancel: overrides.uploadCancel ?? (async () => ({ ok: true })),
});


export const READY_MODEL = {
  product: 'novel-creation-tool' as const,
  version: '2.0.0' as const,
  ready: true as const,
  capabilities: ['generate', 'rewrite', 'continue', 'inspire'] as const,
};
