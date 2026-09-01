import type { WorkbenchViewId } from './nav.js';
import type { SourceAwareWorkflowProjection } from './source-aware-workflow.js';

/**
 * I139 作者主流程的八个产品阶段（design §14.14.2 / R18-15）。
 *
 * 这里保存的是 Client 的导航与恢复投影，不是叙事领域真相：正文、定稿和
 * 全书检查的实际结果仍由既有章节/审校 Remote 提供。阶段只记录作者下次打开
 * 作品时应回到哪里，避免另建一个与主流程竞争的“继续写作”领域模型。
 */
export type WorkflowStageId = 'import' | 'outline' | 'detail' | 'baseline' | 'prose' | 'finalization' | 'review' | 'export';

export interface WorkflowState {
  readonly projectId: string | undefined;
  readonly stage: WorkflowStageId;
  readonly chapterId?: string;
  readonly sceneId?: string;
  /** I149 render-only projection; it is never persisted as workflow domain state. */
  readonly sourceAware?: SourceAwareWorkflowProjection;
}
export interface WorkflowResume {
  readonly projectId: string;
  readonly stage: WorkflowStageId;
  readonly chapterId?: string;
  readonly sceneId?: string;
}

export interface WorkflowStage {
  readonly id: WorkflowStageId;
  readonly step: number;
  readonly label: string;
  readonly hint: string;
  readonly nextAction: string;
  /** 进入该阶段时复用的既有视图；不是新的领域 owner。 */
  readonly view: Exclude<WorkbenchViewId, 'workflow'>;
}

export const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  { id: 'import', step: 1, label: '导入', hint: '导入来源并确认角色、目标与叙事意图', nextAction: '确认来源语义与适用视角', view: 'onboarding' },
  { id: 'outline', step: 2, label: '大纲', hint: '按确认意图审阅大纲与揭示计划', nextAction: '查看并确认大纲候选', view: 'outline' },
  { id: 'detail', step: 3, label: '细纲', hint: '为选定的幕、章或全书生成细纲', nextAction: '选择范围并生成细纲候选', view: 'outline' },
  { id: 'baseline', step: 4, label: '生成基线', hint: '修改细纲并建立正文生成基线', nextAction: '确认细纲并建立生成基线', view: 'chapters' },
  { id: 'prose', step: 5, label: '正文', hint: '按细纲卡生成、接受或微调正文', nextAction: '打开当前场景并处理正文候选', view: 'chapters' },
  { id: 'finalization', step: 6, label: '定稿同步', hint: '分析最终正文并一次确认同步', nextAction: '分析最终正文并提交一次确认', view: 'chapters' },
  { id: 'review', step: 7, label: '全书检查', hint: '检查完成度并处理全书一致性问题', nextAction: '运行全书完成与一致性检查', view: 'review' },
  { id: 'export', step: 8, label: '导出', hint: '生成带目录的单一 TXT 或 Markdown 主稿', nextAction: '选择格式并导出单一全文', view: 'importExport' },
] as const;

const WORKFLOW_STAGE_IDS: ReadonlySet<string> = new Set(WORKFLOW_STAGES.map((stage) => stage.id));
const WORKFLOW_RESUME_KEY = 'novel-creation-tool.workflow.v1';

/** 新作品必须从导入阶段开始；projectId 用于防止切换作品时串用恢复态。 */
export function freshWorkflow(projectId?: string): WorkflowState {
  return { projectId, stage: 'import' };
}

export function isWorkflowStageId(value: unknown): value is WorkflowStageId {
  return typeof value === 'string' && WORKFLOW_STAGE_IDS.has(value);
}

export function workflowStageOf(id: WorkflowStageId): WorkflowStage {
  return WORKFLOW_STAGES.find((stage) => stage.id === id) ?? WORKFLOW_STAGES[0];
}

/** 旧视图进入主流程时的投影；故事资料/设置不会偷偷改写作者当前阶段。 */
export function workflowStageForView(view: WorkbenchViewId): WorkflowStageId | undefined {
  if (view === 'onboarding') return 'import';
  if (view === 'outline') return 'outline';
  if (view === 'chapters') return 'prose';
  if (view === 'review') return 'review';
  if (view === 'importExport') return 'export';
  return undefined;
}

function storage(): Storage | undefined {
  try {
    return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readRecord(): Record<string, WorkflowResume> {
  const target = storage();
  if (target === undefined) return {};
  try {
    const raw: unknown = JSON.parse(target.getItem(WORKFLOW_RESUME_KEY) ?? '{}');
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, WorkflowResume> = {};
    for (const [projectId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (entry.projectId !== projectId || !isWorkflowStageId(entry.stage)) continue;
      result[projectId] = {
        projectId,
        stage: entry.stage,
        ...(typeof entry.chapterId === 'string' && entry.chapterId.length > 0 ? { chapterId: entry.chapterId } : {}),
        ...(typeof entry.sceneId === 'string' && entry.sceneId.length > 0 ? { sceneId: entry.sceneId } : {}),
      };
    }
    return result;
  } catch {
    return {};
  }
}

/** 只接受同一作品、合法阶段的恢复记录；损坏或跨作品数据按新作品处理。 */
export function readWorkflowResume(projectId: string): WorkflowResume | undefined {
  const value = readRecord()[projectId];
  return value?.projectId === projectId ? value : undefined;
}

/** 恢复态是可丢弃的 UI 偏好；存储不可用时不影响主流程。 */
export function writeWorkflowResume(resume: WorkflowResume): void {
  if (!resume.projectId || !isWorkflowStageId(resume.stage)) return;
  const target = storage();
  if (target === undefined) return;
  try {
    const next = readRecord();
    next[resume.projectId] = {
      projectId: resume.projectId,
      stage: resume.stage,
      ...(resume.chapterId ? { chapterId: resume.chapterId } : {}),
      ...(resume.sceneId ? { sceneId: resume.sceneId } : {}),
    };
    target.setItem(WORKFLOW_RESUME_KEY, JSON.stringify(next));
  } catch {
    // Private mode/quota errors must not brick the DSH slot.
  }
}
