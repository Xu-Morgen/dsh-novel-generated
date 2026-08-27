import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TimelineRepository, buildTimelineFromOutline, timelineSchema, type Timeline } from '../core/timeline/index.js';
import type { NovelOutlineService } from './outline-service.js';

/**
 * 剧情时间线 Host owner（方案 A 时间线层，design §8「相关角色对」注入）。
 *
 * 从 B5 大纲确定性生成有序骨架（timeline.yaml），支持作者手动编辑保存：
 * - `read`：读取当前时间线；文档缺失返回 null（不自动落盘）；
 * - `ensureFromOutline`：大纲已就绪但时间线缺失时按 B5 生成骨架并保存
 *   （onboarding finalApply 落 B5 后调用，满足「大纲首次导入分析时自建时间线
 *   文档」）；
 * - `save`：作者手动安排后的完整文档保存（reveals/relationships/storyTime/
 *   currentNodeId 都经 timelineSchema 校验）。
 *
 * 不变式：Host 拥有时间线文件；文档经 zod strict 校验，损坏 fail loudly；
 * 只读最小 owned JSON，不序列化完整 live object 或文件路径。
 */
export interface NovelTimelineService {
  read(projectId: string): Promise<Timeline | null>;
  /** 大纲已就绪且时间线缺失时自建骨架；已存在则原样返回（不覆盖手动编辑）。 */
  ensureFromOutline(projectId: string): Promise<Timeline>;
  /** 手动选择当前节点（null 恢复为按写作位置自动锚定）。 */
  setCurrentNode(projectId: string, nodeId: string | null): Promise<Timeline>;
  /** 保存完整时间线（作者安排的 reveals/relationships/storyTime/currentNodeId）。 */
  save(projectId: string, input: Timeline): Promise<Timeline>;
}

export function createTimelineService(
  outline: NovelOutlineService,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelTimelineService {
  const repositories = new Map<string, TimelineRepository>();
  const get = async (projectId: string): Promise<TimelineRepository> => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new TimelineRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    }
    return repository;
  };

  return Object.freeze({
    async read(projectId: string) {
      return (await get(projectId)).read();
    },
    async ensureFromOutline(projectId: string) {
      const repository = await get(projectId);
      const existing = await repository.read();
      if (existing !== null) return existing;
      const readiness = await outline.readiness(projectId);
      if (readiness !== 'ready') {
        throw new Error(`时间线自建需要已就绪的 B5 大纲（当前：${readiness}）`);
      }
      const outlineDocument = await outline.read(projectId);
      const skeleton = buildTimelineFromOutline(outlineDocument);
      return repository.save({ ...skeleton, version: 1 });
    },
    async setCurrentNode(projectId: string, nodeId: string | null) {
      const repository = await get(projectId);
      const existing = await repository.read();
      if (existing === null) throw new Error('时间线不存在：请先自建（大纲就绪后）');
      const parsed = timelineSchema.parse({
        ...existing,
        currentNodeId: nodeId === null ? null : nodeId,
      });
      if (nodeId !== null && !parsed.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`未知时间线节点：${nodeId}`);
      }
      return repository.save(parsed);
    },
    async save(projectId: string, input: Timeline) {
      const repository = await get(projectId);
      return repository.save(input);
    },
  });
}
