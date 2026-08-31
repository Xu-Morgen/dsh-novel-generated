import {
  chapterSchema,
  sceneSchema,
  type AppendSceneInput,
  type Chapter,
  type CreateChapterInput,
  type Scene,
  type SceneBranch,
} from '../schema/text.js';
import {
  branchIdFor,
  parseChapterDocument,
  PREVIOUS_BRANCH_LABEL,
  textContentHash,
  textObjectFingerprint,
  textProjectFingerprint,
  type TextRange,
} from './codec.js';
import {
  chapterMetadataPatchSchema,
  projectReorderMutationSchema,
  sceneMetadataPatchSchema,
  type ChapterMetadataPatch,
  type ProjectReorderMutation,
  type SceneMetadataPatch,
} from '../schema/text-mutation.js';
import { ChapterWriteQueue, type ChapterWriteQueueOptions } from './write-queue.js';
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
export interface TextDeleteImpact {
  readonly kind: 'chapter' | 'scene';
  readonly chapterId: string;
  readonly sceneId?: string;
  readonly sceneCount: number;
  readonly branchCount: number;
  readonly proseCharacters: number;
  readonly sources: ReadonlyArray<{
    readonly sceneId: string;
    readonly sourceHash: string;
    readonly branches: ReadonlyArray<{ readonly id: string; readonly label: string; readonly chosen: boolean; readonly sourceHash: string }>;
  }>;
  readonly projectFingerprint: string;
  readonly targetFingerprint: string;
}

export interface TextDeleteResult {
  readonly impact: TextDeleteImpact;
  /** Post-delete token for chaining the next optimistic mutation. */
  readonly fingerprint: string;
}

/** Successful C5 write notification for rebuildable derived consumers. */
export interface TextChangedEvent {
  readonly chapterIds: readonly string[];
  readonly sceneIds: readonly string[];
}

export interface TextRepositoryOptions extends ChapterWriteQueueOptions {
  /** Derived invalidation must never turn a committed C5 write into a failure. */
  readonly onTextChanged?: (change: TextChangedEvent) => void | Promise<void>;
}

export class TextRepository {
  private readonly queue: ChapterWriteQueue;

  constructor(projectDirectory: string, private readonly options: TextRepositoryOptions = {}) {
    this.queue = new ChapterWriteQueue(projectDirectory, options);
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
      await this.notifyTextChanged({ chapterIds: [chapter.id], sceneIds: [] });
      return structuredClone(chapter);
    });
  }

  /** List every persisted chapter in narrative order after pending writes settle. */
  listChapters(): Promise<Chapter[]> {
    return this.queue.read(() => this.listChaptersUnlocked());
  }

  /** Public reads wait for a project-level reorder/delete UoW. */
  readChapter(chapterId: string): Promise<Chapter> {
    return this.queue.read(() => this.readChapterUnlocked(chapterId));
  }

  private async listChaptersUnlocked(): Promise<Chapter[]> {
    const files = await this.queue.listChapterFiles();
    const chapters: Chapter[] = [];
    for (const file of files.sort()) {
      chapters.push(await this.readChapterUnlocked(file.slice(0, -'.json'.length)));
    }
    return chapters.sort((left, right) => left.index - right.index || left.id.localeCompare(right.id));
  }

  private async readChapterUnlocked(chapterId: string): Promise<Chapter> {
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
      const chapter = await this.readChapterUnlocked(chapterId);
      if (chapter.scenes.some((scene) => scene.id === input.id)) throw new Error(`Duplicate scene id: ${input.id}`);
      // I70：新场景从「无分支」（隐含单版本）开始；branch 版本只经
      // commitSceneVersion/chooseSceneBranch 产生。
      const scene = sceneSchema.parse({ ...input, index: chapter.scenes.length, branches: [] });
      const updated = chapterSchema.parse({ ...chapter, scenes: [...chapter.scenes, scene] });
      await this.queue.commitChapter(updated);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [scene.id] });
      return structuredClone(scene);
    });
  }

  /** Current project fingerprint used by every I104 optimistic mutation command. */
  projectFingerprint(): Promise<string> {
    return this.queue.read(async () => textProjectFingerprint(await this.listChaptersUnlocked()));
  }

  /** I104 insert-style chapter creation; legacy `createChapter` remains unchanged. */
  createChapterAt(input: CreateChapterInput, expectedFingerprint: string): Promise<{ chapter: Chapter; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      if (chapters.some((chapter) => chapter.id === input.id)) throw new Error(`Chapter already exists: ${input.id}`);
      if (input.index < 1 || input.index > chapters.length + 1) throw new Error(`Chapter index out of range: ${input.index}`);
      const created = chapterSchema.parse({ ...input, scenes: [] });
      const next = chapters.slice();
      next.splice(input.index - 1, 0, created);
      const normalized = next.map((chapter, position) => chapterSchema.parse({ ...chapter, index: position + 1 }));
      await this.queue.commitProject(normalized);
      await this.notifyTextChanged({ chapterIds: normalized.map((chapter) => chapter.id), sceneIds: normalized.flatMap((chapter) => chapter.scenes.map((scene) => scene.id)) });
      return { chapter: structuredClone(normalized[input.index - 1]), fingerprint: textProjectFingerprint(normalized) };
    });
  }

  updateChapterMetadata(chapterId: string, patch: ChapterMetadataPatch, expectedFingerprint: string): Promise<{ chapter: Chapter; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      const position = chapters.findIndex((chapter) => chapter.id === chapterId);
      if (position < 0) throw new Error(`Unknown chapter: ${chapterId}`);
      const parsedPatch = chapterMetadataPatchSchema.parse(patch);
      const changed = chapterSchema.parse({ ...chapters[position], ...parsedPatch });
      chapters[position] = changed;
      await this.queue.commitChapter(changed);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: changed.scenes.map((scene) => scene.id) });
      return { chapter: structuredClone(changed), fingerprint: textProjectFingerprint(chapters) };
    });
  }

  insertScene(chapterId: string, index: number, input: AppendSceneInput, expectedFingerprint: string): Promise<{ scene: Scene; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      if (chapters.some((chapter) => chapter.scenes.some((scene) => scene.id === input.id))) throw new Error(`Duplicate scene id: ${input.id}`);
      const chapterPosition = chapters.findIndex((chapter) => chapter.id === chapterId);
      if (chapterPosition < 0) throw new Error(`Unknown chapter: ${chapterId}`);
      const chapter = chapters[chapterPosition];
      if (index < 0 || index > chapter.scenes.length) throw new Error(`Scene index out of range: ${index}`);
      const created = sceneSchema.parse({ ...input, index, branches: [] });
      const scenes = chapter.scenes.slice();
      scenes.splice(index, 0, created);
      const normalizedScenes = scenes.map((scene, position) => sceneSchema.parse({ ...scene, index: position }));
      const changed = chapterSchema.parse({ ...chapter, scenes: normalizedScenes });
      chapters[chapterPosition] = changed;
      await this.queue.commitChapter(changed);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: changed.scenes.map((scene) => scene.id) });
      return { scene: structuredClone(normalizedScenes[index]), fingerprint: textProjectFingerprint(chapters) };
    });
  }

  updateSceneMetadata(chapterId: string, sceneId: string, patch: SceneMetadataPatch, expectedFingerprint: string): Promise<{ scene: Scene; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      const chapterPosition = chapters.findIndex((chapter) => chapter.id === chapterId);
      if (chapterPosition < 0) throw new Error(`Unknown chapter: ${chapterId}`);
      const chapter = chapters[chapterPosition];
      const scenePosition = chapter.scenes.findIndex((scene) => scene.id === sceneId);
      if (scenePosition < 0) throw new Error(`Unknown scene: ${sceneId}`);
      const parsedPatch = sceneMetadataPatchSchema.parse(patch);
      const changedScene = sceneSchema.parse({ ...chapter.scenes[scenePosition], ...parsedPatch });
      const scenes = chapter.scenes.slice();
      scenes[scenePosition] = changedScene;
      const changedChapter = chapterSchema.parse({ ...chapter, scenes });
      chapters[chapterPosition] = changedChapter;
      await this.queue.commitChapter(changedChapter);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
      return { scene: structuredClone(changedScene), fingerprint: textProjectFingerprint(chapters) };
    });
  }

  reorderProject(input: ProjectReorderMutation): Promise<{ chapters: Chapter[]; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const command = projectReorderMutationSchema.parse(input);
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, command.expectedFingerprint);
      if (command.chapters.length !== chapters.length) throw new Error('Project reorder must include every chapter exactly once');
      const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      const seenChapters = new Set<string>();
      const normalized: Chapter[] = [];
      command.chapters.forEach((entry, chapterPosition) => {
        if (seenChapters.has(entry.chapterId)) throw new Error(`Duplicate chapter id: ${entry.chapterId}`);
        seenChapters.add(entry.chapterId);
        const chapter = byId.get(entry.chapterId);
        if (chapter === undefined) throw new Error(`Unknown chapter: ${entry.chapterId}`);
        if (entry.sceneIds.length !== chapter.scenes.length) throw new Error(`Scene permutation incomplete: ${entry.chapterId}`);
        const sceneById = new Map(chapter.scenes.map((scene) => [scene.id, scene]));
        const seenScenes = new Set<string>();
        const scenes = entry.sceneIds.map((sceneId, scenePosition) => {
          if (seenScenes.has(sceneId)) throw new Error(`Duplicate scene id: ${sceneId}`);
          seenScenes.add(sceneId);
          const scene = sceneById.get(sceneId);
          if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
          return sceneSchema.parse({ ...scene, index: scenePosition });
        });
        normalized.push(chapterSchema.parse({ ...chapter, index: chapterPosition + 1, scenes }));
      });
      await this.queue.commitProject(normalized);
      await this.notifyTextChanged({ chapterIds: normalized.map((chapter) => chapter.id), sceneIds: normalized.flatMap((chapter) => chapter.scenes.map((scene) => scene.id)) });
      return { chapters: structuredClone(normalized), fingerprint: textProjectFingerprint(normalized) };
    });
  }

  inspectChapterDelete(chapterId: string): Promise<TextDeleteImpact> {
    return this.queue.read(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter === undefined) throw new Error(`Unknown chapter: ${chapterId}`);
      return this.deleteImpact(chapters, chapter);
    });
  }

  inspectSceneDelete(chapterId: string, sceneId: string): Promise<TextDeleteImpact> {
    return this.queue.read(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter === undefined) throw new Error(`Unknown chapter: ${chapterId}`);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      return this.deleteImpact(chapters, chapter, scene);
    });
  }

  /** Host-only primitive; I106 adds impact orchestration + I11 before exposing deletion. */
  deleteChapterPrimitive(chapterId: string, expectedFingerprint: string): Promise<TextDeleteResult> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter === undefined) throw new Error(`Unknown chapter: ${chapterId}`);
      const remainingSceneCount = chapters.reduce((total, item) => total + item.scenes.length, 0) - chapter.scenes.length;
      // Empty chapters do not remove a valid scene landing and remain useful
      // for the I106 empty-work guidance. Only deleting the final non-empty
      // chapter is blocked by the project landing invariant.
      if (chapter.scenes.length > 0 && remainingSceneCount === 0) throw new Error('Cannot delete the project last valid scene landing');
      const impact = this.deleteImpact(chapters, chapter);
      const remaining = chapters.filter((item) => item.id !== chapterId)
        .map((item, position) => chapterSchema.parse({ ...item, index: position + 1 }));
      await this.queue.commitProject(remaining, [chapterId]);
      await this.notifyTextChanged({ chapterIds: [chapterId, ...remaining.map((item) => item.id)], sceneIds: chapter.scenes.map((scene) => scene.id) });
      return { impact, fingerprint: textProjectFingerprint(remaining) };
    });
  }

  /** Host-only primitive; allows empty chapters but preserves one project-wide scene landing. */
  deleteScenePrimitive(chapterId: string, sceneId: string, expectedFingerprint: string): Promise<TextDeleteResult> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      const chapterPosition = chapters.findIndex((item) => item.id === chapterId);
      if (chapterPosition < 0) throw new Error(`Unknown chapter: ${chapterId}`);
      const chapter = chapters[chapterPosition];
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const totalScenes = chapters.reduce((total, item) => total + item.scenes.length, 0);
      if (totalScenes === 1) throw new Error('Cannot delete the project last valid scene landing');
      const impact = this.deleteImpact(chapters, chapter, scene);
      const scenes = chapter.scenes.filter((item) => item.id !== sceneId)
        .map((item, position) => sceneSchema.parse({ ...item, index: position }));
      const changedChapter = chapterSchema.parse({ ...chapter, scenes });
      chapters[chapterPosition] = changedChapter;
      await this.queue.commitChapter(changedChapter);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
      return { impact, fingerprint: textProjectFingerprint(chapters) };
    });
  }

  /** I104 project identity invariant; legacy duplicates fail closed until explicitly repaired. */
  private assertUniqueProjectSceneIds(chapters: readonly Chapter[]): void {
    const ids = new Set<string>();
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) {
        if (ids.has(scene.id)) throw new Error(`Duplicate scene id across project: ${scene.id}`);
        ids.add(scene.id);
      }
    }
  }

  private assertProjectFingerprint(chapters: readonly Chapter[], expected: string): void {
    const actual = textProjectFingerprint(chapters);
    if (actual !== expected) throw new Error(`Stale text project fingerprint: expected ${expected}, actual ${actual}`);
  }

  private deleteImpact(chapters: readonly Chapter[], chapter: Chapter, scene?: Scene): TextDeleteImpact {
    const scenes = scene === undefined ? chapter.scenes : [scene];
    return Object.freeze({
      kind: scene === undefined ? 'chapter' : 'scene',
      chapterId: chapter.id,
      ...(scene === undefined ? {} : { sceneId: scene.id }),
      sceneCount: scenes.length,
      branchCount: scenes.reduce((total, item) => total + item.branches.length, 0),
      proseCharacters: scenes.reduce((total, item) => total + item.content.length, 0),
      sources: scenes.map((item) => ({
        sceneId: item.id,
        sourceHash: textContentHash(item.content),
        branches: item.branches.map((branch) => ({
          id: branch.id,
          label: branch.label,
          chosen: branch.chosen,
          sourceHash: textContentHash(branch.content),
        })),
      })),
      projectFingerprint: textProjectFingerprint(chapters),
      targetFingerprint: textObjectFingerprint(scene ?? chapter),
    });
  }

  async replaceRange(chapterId: string, sceneId: string, range: TextRange, replacement: string): Promise<Scene> {
    return this.queue.enqueue(async () => {
      const chapter = await this.readChapterUnlocked(chapterId);
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
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
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
      const chapter = await this.readChapterUnlocked(chapterId);
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
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
      return structuredClone(changed);
    });
  }

  /**
   * I135 C5-only draft adoption with the same project CAS as other mutations.
   * It preserves the existing chosen-branch/version semantics and never
   * reaches a parser, structured writer, B5 owner, or C6 progress owner.
   */
  async replaceSceneContent(chapterId: string, sceneId: string, content: string, expectedFingerprint: string): Promise<{ scene: Scene; fingerprint: string }> {
    return this.queue.enqueue(async () => {
      const chapters = await this.listChaptersUnlocked();
      this.assertUniqueProjectSceneIds(chapters);
      this.assertProjectFingerprint(chapters, expectedFingerprint);
      const chapter = chapters.find((item) => item.id === chapterId);
      if (chapter === undefined) throw new Error(`Unknown chapter: ${chapterId}`);
      const position = chapter.scenes.findIndex((item) => item.id === sceneId);
      if (position < 0) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = chapter.scenes[position];
      const branches = scene.branches.length === 0
        ? []
        : scene.branches.map((branch) => (branch.chosen ? { ...branch, content } : branch));
      const changed = sceneSchema.parse({ ...scene, content, branches });
      const scenes = chapter.scenes.slice();
      scenes[position] = changed;
      const next = chapterSchema.parse({ ...chapter, scenes });
      const normalized = chapters.map((item) => item.id === chapterId ? next : item);
      await this.queue.commitProject(normalized);
      await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
      return { scene: structuredClone(changed), fingerprint: textProjectFingerprint(normalized) };
    });
  }

  /**
   * I70 分支切换（R14-5）：把 `branchId` 置为唯一 chosen，并把 `scene.content` 恢复
   * 为该分支的正文。切换是可逆的（再次 choose 旧分支即可还原），且只写 C5 —— 绝不
   * 隐式修改 B2/C1/C2/C3/C4（结构化同步仍必须显式 reparse/Gate）。已 chosen 分支
   * 重复切换幂等（零写）。
   */
  async chooseSceneBranch(chapterId: string, sceneId: string, branchId: string): Promise<Scene> {
    return this.queue.enqueue(() => this.chooseSceneBranchUnlocked(chapterId, sceneId, branchId));
  }

  /**
   * I131 freshness-safe branch switch（design §14.14.2 D25）：在同一写队列中核对
   * 当前 scene.content 的 sha256，再执行既有唯一 chosen 切换。sourceHash 过期时
   * 零写失败；因此并发编辑/切换不能把聚合树里的旧选择悄悄覆盖掉。
   */
  async chooseSceneBranchFresh(chapterId: string, sceneId: string, branchId: string, sourceHash: string): Promise<Scene> {
    return this.queue.enqueue(() => this.chooseSceneBranchUnlocked(chapterId, sceneId, branchId, sourceHash));
  }

  private async chooseSceneBranchUnlocked(chapterId: string, sceneId: string, branchId: string, expectedSourceHash?: string): Promise<Scene> {
    const chapter = await this.readChapterUnlocked(chapterId);
    const position = chapter.scenes.findIndex((scene) => scene.id === sceneId);
    if (position < 0) throw new Error(`Unknown scene: ${sceneId}`);
    const scene = chapter.scenes[position];
    if (expectedSourceHash !== undefined && textContentHash(scene.content) !== expectedSourceHash) {
      throw new Error(`Stale branch source: ${sceneId}`);
    }
    const branch = scene.branches.find((item) => item.id === branchId);
    if (branch === undefined) throw new Error(`Unknown branch: ${branchId}`);
    if (branch.chosen) return structuredClone(scene);
    const branches = scene.branches.map((item) => ({ ...item, chosen: item.id === branchId }));
    const changed = sceneSchema.parse({ ...scene, content: branch.content, branches });
    const scenes = chapter.scenes.slice();
    scenes[position] = changed;
    await this.queue.commitChapter(chapterSchema.parse({ ...chapter, scenes }));
    await this.notifyTextChanged({ chapterIds: [chapterId], sceneIds: [sceneId] });
    return structuredClone(changed);
  }

  /** 列出场景的全部版本分支（chosen 唯一；无分支时返回空数组 = 隐含单版本）。 */
  listSceneBranches(chapterId: string, sceneId: string): Promise<SceneBranch[]> {
    return this.queue.read(async () => {
      const chapter = await this.readChapterUnlocked(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      return structuredClone(scene.branches);
    });
  }

  /** 读取单个版本分支（含全文）；未知分支抛错。 */
  readSceneBranch(chapterId: string, sceneId: string, branchId: string): Promise<SceneBranch> {
    return this.queue.read(async () => {
      const chapter = await this.readChapterUnlocked(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const branch = scene.branches.find((item) => item.id === branchId);
      if (branch === undefined) throw new Error(`Unknown branch: ${branchId}`);
      return structuredClone(branch);
    });
  }

  /** Consumer/export fixture: concatenate every scene in persisted order. */
  readCompleteChapter(chapterId: string): Promise<string> {
    return this.queue.read(async () => {
      const chapter = await this.readChapterUnlocked(chapterId);
      return chapter.scenes.map((scene) => scene.content).join('\n\n');
    });
  }

  private async notifyTextChanged(change: TextChangedEvent): Promise<void> {
    try {
      await this.options.onTextChanged?.(change);
    } catch {
      // Derived index maintenance is retryable and must not roll back a
      // successful C5 commit or make the author believe正文 was not saved.
    }
  }
}
