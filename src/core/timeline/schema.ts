import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';
import type { OutlineInput } from '../schema/outline.js';

/**
 * 剧情时间线纯 schema 与派生（方案 A 时间线层，design §8「相关角色对」）。
 *
 * 本模块只依赖 zod 与纯 schema：Client bundle 会经 shared.ts 解析 remote 的
 * 完整导入图（host/remote/timeline → 本模块），因此**不得**依赖 node:fs/path
 * （含 repository 的 core/timeline/index.ts 不入图，与 core/review/ledger 同模式）。
 *
 * 语义与不变式见 core/timeline/index.ts 文档注释。
 */
export const timelineRevealSchema = z.object({
  entryId: entityIdSchema,
  revealTo: z.array(entityIdSchema),
}).strict();
export type TimelineReveal = z.infer<typeof timelineRevealSchema>;

export const timelineNodeSchema = z.object({
  id: entityIdSchema,
  order: z.number().int().nonnegative(),
  /** 可编辑的节点标题（生成时 = 幕 · 节 · 细纲卡）。 */
  label: z.string().trim().min(1),
  /** 故事内时间标注（自由文本，作者可填，如「第一夜」）。 */
  storyTime: z.string().trim().optional(),
  /** 绑定 B5 beat id（可选）。 */
  beatId: entityIdSchema.optional(),
  /** 绑定 B5 细纲卡 id（可选）。 */
  detailBeatId: entityIdSchema.optional(),
  /** 该节点揭示的信息（C3 entry → 揭示对象），作者安排。 */
  reveals: z.array(timelineRevealSchema).default([]),
  /** 该节点建立/公开的关系（C1 relationship id），作者安排。 */
  relationships: z.array(entityIdSchema).default([]),
}).strict();
export type TimelineNode = z.infer<typeof timelineNodeSchema>;

export const timelineSchema = z.object({
  id: entityIdSchema,
  version: z.number().int().positive(),
  nodes: z.array(timelineNodeSchema),
  /** 手动选择的当前时间线节点（面板）；null = 未手动选择（按写作位置自动锚定）。 */
  currentNodeId: entityIdSchema.nullable().default(null),
}).strict();
export type Timeline = z.infer<typeof timelineSchema>;

/** C1 关系注入过滤：当前节点之前已建立的关系集合；未过滤信号为 null。 */
export function effectiveRelationshipIds(timeline: Timeline, currentNodeId: string | null): Set<string> | null {
  if (currentNodeId === null) return null;
  const current = timeline.nodes.find((node) => node.id === currentNodeId);
  if (current === undefined) return null;
  const ids = new Set<string>();
  for (const node of timeline.nodes) {
    if (node.order > current.order) break;
    for (const relationshipId of node.relationships) ids.add(relationshipId);
  }
  return ids;
}

/**
 * 锚定当前时间线节点（design §8 / 方案 A「自动/手动双锚定」）：
 * - 手动优先：`timeline.currentNodeId` 有效时直接采用（作者在面板选择）；
 * - 否则按当前写作位置自动匹配：先 detailBeatId（当前细纲卡），再 beatId
 *   （当前 beat）取第一个命中节点；
 * - 都未命中返回 null（调用方按不过滤处理，保持时间线未配置时行为不变）。
 */
export function anchorNodeId(timeline: Timeline, anchor: { beatId?: string; detailBeatId?: string }): string | null {
  if (timeline.currentNodeId !== null && timeline.nodes.some((node) => node.id === timeline.currentNodeId)) {
    return timeline.currentNodeId;
  }
  if (anchor.detailBeatId !== undefined) {
    const byDetail = timeline.nodes.find((node) => node.detailBeatId === anchor.detailBeatId);
    if (byDetail !== undefined) return byDetail.id;
  }
  if (anchor.beatId !== undefined) {
    const byBeat = timeline.nodes.find((node) => node.beatId === anchor.beatId);
    if (byBeat !== undefined) return byBeat.id;
  }
  return null;
}

/**
 * 按时间线过滤 C1 关系注入（写作上下文消费）：
 * - 时间线缺失 / 无法锚定当前节点 → 原样返回（不过滤，兼容旧数据）；
 * - 已被时间线安排（出现在任意节点 relationships）的关系 → 只保留 ≤ 当前
 *   节点已建立的；未被安排的关系 → 始终保留（旧数据不因时间线出现而消失）。
 */
export function filterRelationshipsByTimeline<T extends { id: string }>(
  timeline: Timeline | null,
  relationships: readonly T[],
  currentNodeId: string | null,
): readonly T[] {
  if (timeline === null) return relationships;
  const effective = effectiveRelationshipIds(timeline, currentNodeId);
  if (effective === null) return relationships;
  const arranged = new Set(timeline.nodes.flatMap((node) => node.relationships));
  return relationships.filter((relationship) => !arranged.has(relationship.id) || effective.has(relationship.id));
}

/**
 * 从 B5 大纲确定性生成时间线骨架（design §8「相关角色对」/ 方案 A 时间线层）。
 * 大纲结构即时间轴：按 acts → beats → detailBeats 顺序展开节点；细纲卡逐卡成
 * 节点（label = 幕 · 节 · 卡），无卡的 beat 自成一节点。reveals/relationships
 * 初始为空数组，等待作者在面板安排。`currentNodeId` 保持 null（未手动选择），
 * 写作上下文按当前写作位置（细纲卡/节）自动锚定。
 */
export function buildTimelineFromOutline(outline: OutlineInput): Omit<Timeline, 'version'> {
  const nodes: TimelineNode[] = [];
  let order = 0;
  for (const act of outline.acts ?? []) {
    for (const beat of act.beats ?? []) {
      const detailBeats = beat.detailBeats ?? [];
      if (detailBeats.length === 0) {
        nodes.push({
          id: `node-${order}`,
          order,
          label: [act.title, beat.title].filter((part) => part.trim().length > 0).join(' · ') || `beat:${beat.id}`,
          beatId: beat.id,
          reveals: [],
          relationships: [],
        });
        order += 1;
        continue;
      }
      for (const detail of detailBeats) {
        nodes.push({
          id: `node-${order}`,
          order,
          label: [act.title, beat.title, detail.title].filter((part) => part.trim().length > 0).join(' · ') || `card:${detail.id}`,
          beatId: beat.id,
          detailBeatId: detail.id,
          reveals: [],
          relationships: [],
        });
        order += 1;
      }
    }
  }
  return { id: outline.id, nodes, currentNodeId: null };
}
