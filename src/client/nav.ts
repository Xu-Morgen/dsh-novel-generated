/**
 * I58 任务型创作台信息架构（design §14.8 / R12-5）。
 *
 * 把 I46–I57 交付的九项扁平导航（六层 + 六层初始化审阅 + 创作设置 + LLM 设置）
 * 重组为「写作 / 策划 / 连续性 / 作品设置」四个任务组，为 I60 之后的正文与审校
 * 面板建立稳定入口。导航语言以作者任务为准，技术层编号只作辅助徽标。
 *
 * 契约与不变式：
 * - WorkbenchViewId 是稳定 route/state/data 锚点：导航项携带 `data-novel-view`，
 *   内容区携带 `data-novel-view-panel`，创作台根节点携带 `data-novel-route`；
 *   store 只维护单一 activeView，不再并行维护四个互斥页签标记。
 * - 迁移映射（旧九项 → 新四组）：
 *   写作（writing）：大纲 B5（细纲场景卡是写作导航目标，§14.4；I60 起 C5 正文
 *     工作台与审校中心同组）
 *   策划（planning）：角色 B3、世界观 B2（世界与角色设定策划）
 *   连续性（continuity）：关系 C1、状态 C2、正史 C4（故事一致性与事实追踪）
 *   作品设置（settings）：六层初始化审阅、创作设置、LLM 设置（项目级启动与配置）
 * - 技术层编号（B3/B2/B5/C1/C2/C4）只出现在 badge 辅助徽标位，不是首要导航语言。
 * - resolveWorkbenchView 把任意来源的 view 收敛到合法视图：未知/陈旧值回退默认
 *   视图（characters），保证刷新/折叠/重开作品后 active view 始终合法。
 * - 本模块只描述导航分组与视图身份，不持有任何领域数据。
 */

import type { LayerId } from './shared.js';

/** 稳定视图身份：六个层视图 + 三个非层视图（I58 route/state/data 锚点）。 */
export type WorkbenchViewId = LayerId | 'onboarding' | 'creationSettings' | 'settings';

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
    ],
  },
  {
    id: 'planning',
    label: '策划',
    items: [
      { view: 'characters', label: '角色', badge: 'B3', layer: 'characters' },
      { view: 'worldview', label: '世界观', badge: 'B2', layer: 'worldview' },
    ],
  },
  {
    id: 'continuity',
    label: '连续性',
    items: [
      { view: 'relationship', label: '关系', badge: 'C1', layer: 'relationship' },
      { view: 'state', label: '状态', badge: 'C2', layer: 'state' },
      { view: 'canon', label: '正史', badge: 'C4', layer: 'canon' },
    ],
  },
  {
    id: 'settings',
    label: '作品设置',
    items: [
      { view: 'onboarding', label: '六层初始化审阅' },
      { view: 'creationSettings', label: '创作设置' },
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
