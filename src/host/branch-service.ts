import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import { diffTextLines, type DiffLine } from '../core/text/diff.js';
import type { Scene, SceneBranch } from '../core/schema/text.js';

/**
 * I70 C5 正文版本/分支 Host facade（design §14.10「正文版本与分支」/ R14-5）。
 *
 * 职责与不变式：
 * - 只经 `TextRepository`（C5 唯一存储 owner）读写分支：本服务是薄转发层，不复制
 *   分支语义，不持有文件路径（调用方永远只见最小 owned JSON）。
 * - `listBranches` 返回元数据投影（id/label/chosen/charCount/hash，不含全文）——
 *   正文只经 `readBranch`/`diffBranches` 按需读取（最小读取合同，与 I60 一致）。
 * - `saveBranch` = 给当前正文打命名版本（`commitSceneVersion(content, label)`，
 *   幂等：同内容不新增重复分支）；`chooseBranch` = 可逆切换 chosen 并同步
 *   scene.content（只写 C5，绝不隐式改 B2/C1/C2/C3/C4）。
 * - `diffBranches` 比较分支 A → 分支 B（B 缺省 = 当前 chosen 分支），输出双方全文
 *   与确定性行 diff；未知分支/缺省分支不存在时 fail closed。
 * - `open` 幂等：目录已存在时只登记 repository；legacy 文档迁移在
 *   TextRepository.open 内完成（坏迁移 fail closed）。
 */

/** 分支元数据投影（无正文；正文按需经 read/diff 读取）。 */
export interface SceneBranchSummary {
  readonly id: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly charCount: number;
  readonly hash: string;
}

/** 分支全文视图（单分支最小 owned JSON）。 */
export interface SceneBranchView {
  readonly id: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly content: string;
}

/** 分支比较结果：双方全文 + 确定性行 diff（from → to）。 */
export interface BranchDiffResult {
  readonly from: SceneBranchView;
  readonly to: SceneBranchView;
  readonly lines: readonly DiffLine[];
}

export interface NovelBranchService {
  open(projectId: string): Promise<void>;
  listBranches(projectId: string, chapterId: string, sceneId: string): Promise<SceneBranchSummary[]>;
  readBranch(projectId: string, chapterId: string, sceneId: string, branchId: string): Promise<SceneBranchView>;
  /** 给当前正文打命名版本（幂等；不改变正文）。 */
  saveBranch(projectId: string, chapterId: string, sceneId: string, label: string): Promise<{ branches: SceneBranchSummary[]; content: string }>;
  /** 可逆切换 chosen 分支（只写 C5；返回新分支列表与新正文）。 */
  chooseBranch(projectId: string, chapterId: string, sceneId: string, branchId: string): Promise<{ branches: SceneBranchSummary[]; content: string }>;
  /** 比较分支 A → 分支 B（B 缺省 = 当前 chosen 分支）。 */
  diffBranches(projectId: string, chapterId: string, sceneId: string, fromBranchId: string, toBranchId?: string): Promise<BranchDiffResult>;
}

const hashOf = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex');

function toSummary(branch: SceneBranch): SceneBranchSummary {
  return Object.freeze({ id: branch.id, label: branch.label, chosen: branch.chosen, charCount: branch.content.length, hash: hashOf(branch.content) });
}

function toView(branch: SceneBranch): SceneBranchView {
  return Object.freeze({ id: branch.id, label: branch.label, chosen: branch.chosen, content: branch.content });
}

export function createBranchService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelBranchService {
  const repositories = new Map<string, TextRepository>();
  const get = (projectId: string): TextRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Text project is not open: ${projectId}`);
    return repository;
  };
  const readScene = async (repository: TextRepository, chapterId: string, sceneId: string): Promise<Scene> => {
    const chapter = await repository.readChapter(chapterId);
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
    return structuredClone(scene);
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    async listBranches(projectId, chapterId, sceneId) {
      return (await get(projectId).listSceneBranches(chapterId, sceneId)).map(toSummary);
    },
    async readBranch(projectId, chapterId, sceneId, branchId) {
      return toView(await get(projectId).readSceneBranch(chapterId, sceneId, branchId));
    },
    async saveBranch(projectId, chapterId, sceneId, label) {
      const trimmed = label.trim();
      if (trimmed === '') throw new Error('Branch label must not be empty');
      const repository = get(projectId);
      const scene = await readScene(repository, chapterId, sceneId);
      const changed = await repository.commitSceneVersion(chapterId, sceneId, scene.content, trimmed);
      return Object.freeze({ branches: changed.branches.map(toSummary), content: changed.content });
    },
    async chooseBranch(projectId, chapterId, sceneId, branchId) {
      const changed = await get(projectId).chooseSceneBranch(chapterId, sceneId, branchId);
      return Object.freeze({ branches: changed.branches.map(toSummary), content: changed.content });
    },
    async diffBranches(projectId, chapterId, sceneId, fromBranchId, toBranchId) {
      const repository = get(projectId);
      const scene = await readScene(repository, chapterId, sceneId);
      const from = scene.branches.find((item) => item.id === fromBranchId);
      if (from === undefined) throw new Error(`Unknown branch: ${fromBranchId}`);
      const toId = toBranchId ?? scene.branches.find((item) => item.chosen)?.id;
      const to = toId === undefined ? undefined : scene.branches.find((item) => item.id === toId);
      if (to === undefined) throw new Error(`Unknown branch: ${toBranchId ?? '(chosen)'}`);
      return Object.freeze({
        from: toView(from),
        to: toView(to),
        lines: Object.freeze(diffTextLines(from.content, to.content)),
      });
    },
  };
}
