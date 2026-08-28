import { readdir } from 'node:fs/promises';
import {
  chapterSchema,
  sceneSchema,
  type AppendSceneInput,
  type Chapter,
  type CreateChapterInput,
  type Scene,
  type SceneBranch,
} from '../schema/text.js';
import { branchIdFor, parseChapterDocument, PREVIOUS_BRANCH_LABEL, type TextRange } from './codec.js';
import { ChapterWriteQueue } from './write-queue.js';
import { validateProjectId } from '../io/path.js';

/**
 * C5 TextRepository（design §5.12 / §14.10，review v2.0 §8#7 / 计划 §18 I94
 * 拆分第二、三片）：仓储（创建/枚举/读取/追加）+ 编辑分支策略（范围替换、
 * 版本提交/分支切换）。文件写入统一委托 `ChapterWriteQueue`（JSON 真相 +
 * Markdown 镜像 outbox）。
 *
 * 不变式：
 * - 每个章节一个校验过的 JSON 文档（text/<id>.json）为机器真相；docs/<id>.md
 *   是派生镜像，删除可随时重建，引擎不读它。
 * - Scene indexes 连续追加序，重开不丢。
 * - 范围替换只用 JS 字符串偏移 [start, end)，不触碰结构化层。
 * - I70 版本/分支不变式：scene.branches 保存全部版本；scene.content 恒等于
 *   chosen 分支 content；commitSceneVersion 保留旧版为分支；chooseSceneBranch
 *   可逆切换；普通 replaceRange/appendScene 只同步 chosen 分支（不隐式造分支）。
 * - 镜像失败不谎报：主写成功即成功，失败进 outbox（pendingMirrors）显式暴露。
 */
export class TextRepository {
  private readonly queue: ChapterWriteQueue;

  constructor(projectDirectory: string) {
    this.queue = new ChapterWriteQueue(projectDirectory);
  }

  async open(): Promise<void> {
    await this.queue.open();
    // I70 兼容迁移：重开旧单版本文档时扫描并回写 canonical；两种形状都失败
    // 则 fail closed（抛错、零写）。迁移幂等。
    await this.queue.enqueue(() => this.queue.migrateLegacyDocuments());
  }

  /** 显式暴露尚未成功同步的 Markdown 镜像（I94 outbox 可观察面）。 */
  pendingMirrors() {
    return this.queue.pendingMirrors();
  }

  /** 按最新章节重渲染并重试全部待处理镜像；返回成功条数。 */
  flushPendingMirrors(): Promise<number> {
    return this.queue.flushPendingMirrors();
  }

  async createChapter(input: CreateChapterInput): Promise<Chapter> {
    return this.queue.enqueue(async () => {
      const chapter = chapterSchema.parse({ ...input, scenes: [] });
      const filePath = this.queue.chapterPath(chapter.id);
      let exists = true;
      try {
        await this.queue.readChapterFile(chapter.id);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
        exists = false;
      }
      if (exists) throw new Error(`Chapter already exists: ${chapter.id}`);
      await this.queue.commitChapter(chapter);
      return structuredClone(chapter);
    });
  }

  /** List every persisted chapter in the project (agent context assembly; I-agent). */
  async listChapters(): Promise<Chapter[]> {
    const files = await this.queue.listChapterFiles();
    const chapters: Chapter[] = [];
    for (const file of files.sort()) {
      const chapterId = file.slice(0, -'.json'.length);
      chapters.push(await this.readChapter(chapterId));
    }
    return chapters;
  }

  async readChapter(chapterId: string): Promise<Chapter> {
    let raw: string;
    try {
      raw = await this.queue.readChapterFile(chapterId);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
      throw error;
    }
    try {
      return parseChapterDocument(raw);
    } catch (error) {
      throw new Error(`Invalid chapter document: ${chapterId}`, { cause: error });
    }
  }

  async appendScene(chapterId: string, input: AppendSceneInput): Promise<Scene> {
    return this.queue.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      if (chapter.scenes.some((scene) => scene.id === input.id)) throw new Error(`Duplicate scene id: ${input.id}`);
      // I70：新场景从「无分支」（隐含单版本）开始；branch 版本只经
      // commitSceneVersion/chooseSceneBranch 产生。
      const scene = sceneSchema.parse({ ...input, index: chapter.scenes.length, branches: [] });
      const updated = chapterSchema.parse({ ...chapter, scenes: [...chapter.scenes, scene] });
      await this.queue.commitChapter(updated);
      return structuredClone(scene);
    });
  }

  async replaceRange(chapterId: string, sceneId: string, range: TextRange, replacement: string): Promise<Scene> {
    return this.queue.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      validateProjectId(sceneId);
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start) {
        throw new Error(`Invalid text range: ${range.start}-${range.end}`);
      }
      const position = chapter.scenes.findIndex((scene) => scene.id === sceneId);
      if (position < 0) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = chapter.scenes[position];
      if (range.end > scene.content.length) throw new Error(`Text range exceeds scene content: ${range.end}`);
      const nextContent = scene.content.slice(0, range.start) + replacement + scene.content.slice(range.end);
      // 普通编辑不隐式造分支：已有分支时只同步 chosen 分支 content（保持
      // 「chosen content === scene.content」不变式）；无分支保持单版本隐含态。
      const branches = scene.branches.length === 0
        ? []
        : scene.branches.map((branch) => (branch.chosen ? { ...branch, content: nextContent } : branch));
      const changed = sceneSchema.parse({ ...scene, content: nextContent, branches });
      const scenes = chapter.scenes.slice();
      scenes[position] = changed;
      await this.queue.commitChapter(chapterSchema.parse({ ...chapter, scenes }));
      return structuredClone(changed);
    });
  }

  /**
   * I70 候选保留为分支（design §14.10 / R14-5）：把 `content` 提交为场景的当前
   * （chosen）版本，并把提交前的当前版本保留为非 chosen 分支 —— 重写候选被接受时
   * 旧正文不会丢失，作者可在分支面板比较并回切。
   *
   * 幂等语义：若已有分支与 `content` 相同（含当前 chosen 分支），直接选中该分支并
   * 仅更新 label（不新增重复分支）；否则旧 chosen 分支降为非 chosen，新分支成为
   * 唯一 chosen。返回提交后的场景（`scene.content` 已更新）。
   */
  async commitSceneVersion(chapterId: string, sceneId: string, content: string, label: string): Promise<Scene> {
    return this.queue.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      const position = chapter.scenes.findIndex((scene) => scene.id === sceneId);
      if (position < 0) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = chapter.scenes[position];
      let branches: SceneBranch[];
      if (scene.branches.length === 0) {
        if (content === scene.content) {
          // 首次版本化且内容未变：给当前正文打上命名版本（无旧版本可保留）。
          branches = [{ id: branchIdFor(content), label, content, chosen: true }];
        } else {
          branches = [
            { id: branchIdFor(scene.content), label: PREVIOUS_BRANCH_LABEL, content: scene.content, chosen: false },
            { id: branchIdFor(content), label, content, chosen: true },
          ];
        }
      } else {
        const matched = scene.branches.find((branch) => branch.content === content);
        if (matched !== undefined) {
          // 幂等：同内容分支已存在 → 选中它并（可选）更新标签，不新增重复。
          branches = scene.branches.map((branch) => ({
            ...branch,
            chosen: branch.id === matched.id,
            ...(branch.id === matched.id && label ? { label } : {}),
          }));
        } else {
          branches = scene.branches.map((branch) => (branch.chosen ? { ...branch, chosen: false } : branch));
          branches.push({ id: branchIdFor(content), label, content, chosen: true });
        }
      }
      const changed = sceneSchema.parse({ ...scene, content, branches });
      const scenes = chapter.scenes.slice();
      scenes[position] = changed;
      await this.queue.commitChapter(chapterSchema.parse({ ...chapter, scenes }));
      return structuredClone(changed);
    });
  }

  /**
   * I70 分支切换（R14-5）：把 `branchId` 置为唯一 chosen，并把 `scene.content` 恢复
   * 为该分支的正文。切换是可逆的（再次 choose 旧分支即可还原），且只写 C5 —— 绝不
   * 隐式修改 B2/C1/C2/C3/C4（结构化同步仍必须显式 reparse/Gate）。已 chosen 分支
   * 重复切换幂等（零写）。
   */
  async chooseSceneBranch(chapterId: string, sceneId: string, branchId: string): Promise<Scene> {
    return this.queue.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      const position = chapter.scenes.findIndex((scene) => scene.id === sceneId);
      if (position < 0) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = chapter.scenes[position];
      const branch = scene.branches.find((item) => item.id === branchId);
      if (branch === undefined) throw new Error(`Unknown branch: ${branchId}`);
      if (branch.chosen) return structuredClone(scene);
      const branches = scene.branches.map((item) => ({ ...item, chosen: item.id === branchId }));
      const changed = sceneSchema.parse({ ...scene, content: branch.content, branches });
      const scenes = chapter.scenes.slice();
      scenes[position] = changed;
      await this.queue.commitChapter(chapterSchema.parse({ ...chapter, scenes }));
      return structuredClone(changed);
    });
  }

  /** 列出场景的全部版本分支（chosen 唯一；无分支时返回空数组 = 隐含单版本）。 */
  async listSceneBranches(chapterId: string, sceneId: string): Promise<SceneBranch[]> {
    const chapter = await this.readChapter(chapterId);
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
    return structuredClone(scene.branches);
  }

  /** 读取单个版本分支（含全文）；未知分支抛错。 */
  async readSceneBranch(chapterId: string, sceneId: string, branchId: string): Promise<SceneBranch> {
    const chapter = await this.readChapter(chapterId);
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
    const branch = scene.branches.find((item) => item.id === branchId);
    if (branch === undefined) throw new Error(`Unknown branch: ${branchId}`);
    return structuredClone(branch);
  }

  /** Consumer/export fixture: concatenate every scene in persisted order. */
  async readCompleteChapter(chapterId: string): Promise<string> {
    const chapter = await this.readChapter(chapterId);
    return chapter.scenes.map((scene) => scene.content).join('\n\n');
  }
}
