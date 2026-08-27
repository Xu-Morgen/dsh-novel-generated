/**
 * I58 任务型创作台信息架构（design §14.8 / R12-5）。
 *
 * 把 I46–I57 交付的九项扁平导航（六层 + 六层初始化审阅 + 创作设置 + LLM 设置）
 * 重组为「写作 / 策划 / 连续性 / 作品设置」四个任务组，为 I60 之后的正文与审校
 * 面板建立稳定入口。导航语言以作者任务为准，技术层编号只作辅助徽标。
 *
 * I60（design §5.12 / R13-1）：写作组新增「正文」视图（C5 章节树/场景导航），
 * 与「大纲」同组；正文视图与层视图一样是稳定视图（重复点击保持原位），设置类
 * 视图才回退默认。
 *
 * I64（design §14.9 / R13-5）：写作组新增「审校中心」视图（一致性审校中心，
 * 与正文工作台同组），同样为稳定视图；技术层编号只作辅助徽标。
 *
 * I65（design §14.9 / R13-6）：写作组新增「生成队列」视图（可恢复自动生成队列，
 * 与正文/审校同组），同样为稳定视图；技术层编号只作辅助徽标。
 *
 * I66（design §14.10 / R14-1）：连续性组新增「知情」视图（C3 知情与揭示管理面，
 * 与关系/状态/正史同组），同样为稳定视图；技术层编号只作辅助徽标。
 *
 * I67（design §14.10 / R14-2）：策划组新增「规则与文风」视图（B1 规则 + B4 风格
 * 档案控制面，与角色/世界观同组），同样为稳定视图；技术层编号只作辅助徽标。
 *
 * I68（design §14.10 / R14-3）：写作组新增「进度与灵感」视图（C6 执行态进度/
 * 偏差 + 灵感方向落地，与大纲同组），同样为稳定视图；技术层编号只作辅助徽标。
 *
 * I69（design §14.10 / R14-4）：作品设置组新增「导入导出与备份」视图（I37–I38
 * 通用导入入口 + I39 项目包/纯文本导出与 round-trip 恢复），同样为稳定视图。
 *
 * I71（design §14.10 / R14-6）：写作组新增「搜索与追踪」视图（跨六层全局搜索 +
 * 实体交叉引用 + 结果跳转 + 生成注入解释），同样为稳定视图。
 *
 * 契约与不变式：
 * - WorkbenchViewId 是稳定 route/state/data 锚点：导航项携带 `data-novel-view`，
 *   内容区携带 `data-novel-view-panel`，创作台根节点携带 `data-novel-route`；
 *   store 只维护单一 activeView，不再并行维护四个互斥页签标记。
 * - 迁移映射（旧九项 → 新四组）：
 *   写作（writing）：大纲 B5、进度与灵感 C6（执行态与偏差，§14.4/§14.10）、
 *     正文 C5（I60 起 C5 正文工作台与审校中心同组）
 *   策划（planning）：角色 B3、世界观 B2（世界与角色设定策划）
 *   连续性（continuity）：关系 C1、状态 C2、正史 C4（故事一致性与事实追踪）
 *   作品设置（settings）：六层初始化审阅、创作设置、LLM 设置（项目级启动与配置）
 * - 技术层编号（B3/B2/B5/C1/C2/C4/C5/C6）只出现在 badge 辅助徽标位，不是首要导航语言。
 * - resolveWorkbenchView 把任意来源的 view 收敛到合法视图：未知/陈旧值回退默认
 *   视图（characters），保证刷新/折叠/重开作品后 active view 始终合法。
 * - isStableView：层视图与正文视图重复点击保持原位；设置类视图（onboarding/
 *   creationSettings/settings）重复点击回退默认层视图（I58 保留的 toggle 语义）。
 * - I71（design §14.10 / R14-6）：写作组新增「搜索与追踪」视图（跨六层全局搜索 +
 * 实体交叉引用 + 结果跳转 + 生成注入解释），同样为稳定视图。
 * - I72（design §14.10 / R14-7）：写作组新增「写作进度」视图（可重建派生统计：
 * 章节字数/目标完成度/场景卡状态/POV 分布/任务历史），同样为稳定视图。
 * - 方案 A（design §8「相关角色对」/ 剧情时间线）：策划组新增「时间线」视图
 * （从 B5 大纲自建的有序剧情时间轴；节点可安排揭示信息与关系建立时机，支撑
 * 关系注入与知情层按「当前时间」过滤，可手动选择当前节点并编辑保存）。
 *
 * 契约与不变式：
 * - WorkbenchViewId 是稳定 route/state/data 锚点：导航项携带 `data-novel-view`，
 *   内容区携带 `data-novel-view-panel`，创作台根节点携带 `data-novel-route`；
 * - 本模块只描述导航分组与视图身份，不持有任何领域数据。
 */

import type { LayerId } from './shared.js';

/** 稳定视图身份：六个层视图 + 正文/审校中心/生成队列/知情/规则与文风/进度与灵感/导入导出/搜索与追踪/写作进度/时间线视图 + 三个非层视图（I58/I60/I64/I65/I66/I67/I68/I69/I71/I72 route/state/data 锚点）。 */
export type WorkbenchViewId = LayerId | 'chapters' | 'review' | 'queue' | 'knowledge' | 'ruleStyle' | 'progress' | 'importExport' | 'search' | 'statistics' | 'timeline' | 'onboarding' | 'creationSettings' | 'settings';

export interface WorkbenchNavItem {
  readonly view: WorkbenchViewId;
  readonly label: string;
  /** 技术层编号辅助徽标（B3/B2/B5/C1/C2/C4）；非层视图无徽标。 */
  readonly badge?: string;
  /** 层视图对应的 LayerId；非层视图为 undefined。 */
  readonly layer?: LayerId;
}

export interface WorkbenchNavGroup {
  readonly id: 'writing' | 'planning' | 'continuity' | 'settings';
  readonly label: string;
  readonly items: readonly WorkbenchNavItem[];
}

export const NAV_GROUPS: readonly WorkbenchNavGroup[] = [
  {
    id: 'writing',
    label: '写作',
    items: [
      { view: 'outline', label: '大纲', badge: 'B5', layer: 'outline' },
      { view: 'progress', label: '进度与灵感', badge: 'C6' },
      { view: 'chapters', label: '正文', badge: 'C5' },
      { view: 'review', label: '审校中心' },
      { view: 'queue', label: '生成队列' },
      { view: 'search', label: '搜索与追踪' },
      { view: 'statistics', label: '写作进度' },
    ],
  },
  {
    id: 'planning',
    label: '策划',
    items: [
      { view: 'characters', label: '角色', badge: 'B3', layer: 'characters' },
      { view: 'worldview', label: '世界观', badge: 'B2', layer: 'worldview' },
      { view: 'timeline', label: '时间线' },
      { view: 'ruleStyle', label: '规则与文风', badge: 'B1/B4' },
    ],
  },
  {
    id: 'continuity',
    label: '连续性',
    items: [
      { view: 'relationship', label: '关系', badge: 'C1', layer: 'relationship' },
      { view: 'state', label: '状态', badge: 'C2', layer: 'state' },
      { view: 'canon', label: '正史', badge: 'C4', layer: 'canon' },
      { view: 'knowledge', label: '知情', badge: 'C3' },
    ],
  },
  {
    id: 'settings',
    label: '作品设置',
    items: [
      { view: 'onboarding', label: '六层初始化审阅' },
      { view: 'creationSettings', label: '创作设置' },
      { view: 'importExport', label: '导入导出与备份' },
      { view: 'settings', label: 'LLM 设置' },
    ],
  },
] as const;

/** 全部导航项（九个视图），顺序即导航渲染顺序。 */
export const NAV_ITEMS: readonly WorkbenchNavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** 默认视图：刷新/重开/非法值回退后保持合法的落点。 */
export const DEFAULT_VIEW: WorkbenchViewId = 'characters';

const ALL_VIEWS: ReadonlySet<string> = new Set(NAV_ITEMS.map((item) => item.view));

/** 值是否为已注册的合法视图 id。 */
export function isWorkbenchViewId(value: unknown): value is WorkbenchViewId {
  return typeof value === 'string' && ALL_VIEWS.has(value);
}

/** 任意来源的 view 都收敛为合法视图：未知/陈旧值回退默认视图（I58 验收「刷新/折叠保持合法 active view」）。 */
export function resolveWorkbenchView(value: unknown): WorkbenchViewId {
  return isWorkbenchViewId(value) ? value : DEFAULT_VIEW;
}

/** 视图对应的导航项；未注册视图返回 undefined（调用前先 resolve）。 */
export function navItemOf(view: WorkbenchViewId): WorkbenchNavItem | undefined {
  return NAV_ITEMS.find((item) => item.view === view);
}

/** 层视图判定：非层视图（onboarding/creationSettings/settings）重复点击时回退默认层视图。 */
export function isLayerView(view: WorkbenchViewId): boolean {
  return navItemOf(view)?.layer !== undefined;
}

/** 稳定视图判定（I60/I64/I65/I66/I67/I68/I69/I71/I72/方案 A）：层视图、正文视图、审校中心、生成队列、知情、规则/文风、进度/灵感、导入导出、搜索、写作进度与时间线视图重复点击保持原位；设置类视图才回退默认。 */
export function isStableView(view: WorkbenchViewId): boolean {
  return view === 'chapters' || view === 'review' || view === 'queue' || view === 'knowledge' || view === 'ruleStyle' || view === 'progress' || view === 'importExport' || view === 'search' || view === 'statistics' || view === 'timeline' || isLayerView(view);
}
