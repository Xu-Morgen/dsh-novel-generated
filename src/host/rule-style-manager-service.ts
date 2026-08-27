import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import type { Rule, RuleInput, RulePatch } from '../core/schema/rules.js';
import type { StyleProfile, StyleProfileInput } from '../core/schema/style.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelStyleService } from './style-service.js';

/**
 * I67 B1 规则与 B4 文风控制面 Host owner（design §14.10「B1/B4 控制面」/ R14-2）。
 *
 * 管理面是作者编辑 B1 规则与 B4 风格档案的唯一读写入口，复用 I7/I10 领域服务
 * （RuleRepository / StyleRepository 是 B1/B4 存储唯一 owner）：
 * - `list`：规则列表（优先级降序 + id 升序，与 I13 消费者 listActive 排序一致）
 *   与风格档案投影（未初始化时 style 为 null）；只读零写；
 * - `readRule` / `createRule` / `updateRule`：规则表单 round-trip；非法枚举、
 *   越界优先级、immutable 非法改写全部 fail-fast 零写拒绝；
 * - `readStyle` / `saveStyle`：风格档案 round-trip；人称/时态/POV 非法枚举零写拒绝。
 *
 * 契约与不变式：
 * - 优先级范围：UI 控制面业务约束为 1–100（`RULE_PRIORITY_MIN/MAX`），越界在
 *   wire 层与管理面服务双重拒绝；core `ruleSchema` 保持开放整数（§5.3），
 *   I67 不改变规则/风格 Schema（计划「明确不做」）。
 * - immutable 规则一旦存储不可改写（只可在 create 时设置；`active` 也随整体
 *   更新受同样保护），改写由 RuleRepository.update 拒绝并保持零写。
 * - 保存后生成与检测读取同一 Host 真相：本服务只经注入的 ruleService/styleService
 *   写入，下游消费者（writing-context 读 listActive/constantSegment，review-service
 *   额外读 forbiddenExpressions）消费的正是同一批存储 —— 见测试消费者夹具。
 * - readStyle 把 I3 createProject 的初始 `{}` 占位视为「未初始化」返回 null；
 *   真实损坏（非空但非法）保持 loud failure，不静默覆盖。
 * - 本服务是纯持久操作（无在飞任务），onDispose 只保留生命周期挂钩（H0-6）。
 */

/** UI 控制面规则优先级合法范围（core schema 保持开放整数；越界在此层拒绝）。 */
export const RULE_PRIORITY_MIN = 1;
export const RULE_PRIORITY_MAX = 100;

/**
 * B4 单一全局风格档案的稳定 id：由 Host 管理（Client 表单不提供 id；首次保存
 * 使用本值，之后沿用既有 id，不允许改写 —— id 是稳定标识）。
 */
export const DEFAULT_STYLE_ID = 'global-style';

export interface RuleStyleManagerDeps {
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
}

/** 单条规则的管理面投影（最小 owned JSON，与 Rule 同构，绝不序列化 live object）。 */
export type RuleView = Rule;

/** 风格档案管理面投影；null = 未初始化（I3 初始 `{}` 占位）。 */
export type StyleView = StyleProfile;

export interface RuleStyleProjection {
  readonly projectId: string;
  readonly rules: readonly RuleView[];
  readonly style: StyleView | null;
}

export interface NovelRuleStyleManagerService {
  list(projectId: string): Promise<RuleStyleProjection>;
  readRule(projectId: string, ruleId: string): Promise<RuleView>;
  createRule(projectId: string, input: RuleInput): Promise<RuleView>;
  updateRule(projectId: string, ruleId: string, patch: RulePatch): Promise<RuleView>;
  readStyle(projectId: string): Promise<StyleView | null>;
  /** 保存风格档案；id 由 Host 管理（沿用既有或首次使用 DEFAULT_STYLE_ID），输入不含 id。 */
  saveStyle(projectId: string, input: Omit<StyleProfileInput, 'id'>): Promise<StyleView>;
}

/** 管理面优先级校验（零写拒绝越界值；core schema 不设界，此处为 UI 控制面约束）。 */
export function assertRulePriorityInRange(priority: number): void {
  if (!Number.isInteger(priority) || priority < RULE_PRIORITY_MIN || priority > RULE_PRIORITY_MAX) {
    throw new Error(`规则优先级必须在 ${RULE_PRIORITY_MIN}–${RULE_PRIORITY_MAX} 之间（收到 ${priority}）`);
  }
}

export function createRuleStyleManagerService(deps: RuleStyleManagerDeps): NovelRuleStyleManagerService {
  // 与 ruleService/styleService 相同的默认项目根（index.ts 会显式传入插件 projectsRoot）。
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const opened = new Set<string>();
  const dispose = (): void => { opened.clear(); };
  deps.onDispose?.(dispose);

  const ensureOpen = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    if (opened.has(projectId)) return;
    await deps.rules.open(projectId);
    await deps.style.open(projectId);
    opened.add(projectId);
  };

  const styleView = async (projectId: string): Promise<StyleView | null> => {
    try {
      return await deps.style.read(projectId);
    } catch (cause) {
      // I3 初始占位 `{}`（createProject 写入的 style.yaml）不是损坏：管理面
      // 视为未初始化返回 null；非空但非法的档案保持 loud failure。
      const stylePath = join(projectDirectory(projectsRoot, projectId), 'style.yaml');
      if (existsSync(stylePath)) {
        const raw = await readFile(stylePath, 'utf8');
        if (raw.trim() === '{}') return null;
      }
      throw cause;
    }
  };

  const service: NovelRuleStyleManagerService = {
    async list(projectId: string) {
      await ensureOpen(projectId);
      const rules = await deps.rules.list(projectId);
      // 与 I13 消费者 listActive 相同的确定性顺序：priority desc，id 升序决胜。
      const sorted = [...rules].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
      return Object.freeze({ projectId, rules: Object.freeze(sorted.map((rule) => structuredClone(rule))), style: await styleView(projectId) });
    },
    async readRule(projectId: string, ruleId: string) {
      await ensureOpen(projectId);
      return structuredClone(await deps.rules.read(projectId, ruleId));
    },
    async createRule(projectId: string, input: RuleInput) {
      await ensureOpen(projectId);
      assertRulePriorityInRange(input.priority);
      return structuredClone(await deps.rules.create(projectId, input));
    },
    async updateRule(projectId: string, ruleId: string, patch: RulePatch) {
      await ensureOpen(projectId);
      assertRulePriorityInRange(patch.priority);
      // immutable 规则的整体改写（含 priority/active）由 RuleRepository.update 拒绝，
      // 保持零写（`Immutable rule cannot be updated`）。
      return structuredClone(await deps.rules.update(projectId, ruleId, patch));
    },
    async readStyle(projectId: string) {
      await ensureOpen(projectId);
      const view = await styleView(projectId);
      return view === null ? null : structuredClone(view);
    },
    async saveStyle(projectId: string, input: Omit<StyleProfileInput, 'id'>) {
      await ensureOpen(projectId);
      // id 由 Host 管理：沿用既有档案 id（不可改写），首次保存使用 DEFAULT_STYLE_ID。
      const existing = await styleView(projectId);
      return structuredClone(await deps.style.save(projectId, { ...input, id: existing?.id ?? DEFAULT_STYLE_ID }));
    },
  };
  return Object.freeze(service);
}
