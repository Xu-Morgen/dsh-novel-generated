import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chapterSchema,
  legacyChapterSchema,
  sceneSchema,
  type AppendSceneInput,
  type Chapter,
  type CreateChapterInput,
  type LegacyChapter,
  type Scene,
  type SceneBranch,
} from '../schema/text.js';
import { validateProjectId } from '../io/path.js';

export interface TextRange {
  start: number;
  end: number;
}

/**
 * C5 generated text store (design §5.12 / §14.10): Host-owned chapter metadata,
 * scene text, and the I70 version/branch model (R14-5).
 *
 * Contract / invariants:
 * - Each chapter is one validated JSON document under the project's `text` directory
 *   (machine source of truth: scene indexes, canon refs, localized edit, export,
 *   branch/version history).
 * - A READABLE mirror `docs/<chapterId>.md` is re-rendered on every chapter write so
 *   the final prose is directly readable as paragraphs (docs 是派生镜像，引擎不读它，
 *   删除可随时重建).
 * - Scene indexes are contiguous append order and survive reopening.
 * - Range replacement uses JavaScript string offsets `[start, end)` and changes only
 *   the selected scene content; no parser or structured layer is invoked.
 * - **版本/分支不变式（I70 / R14-5）**：`scene.branches` 保存该场景的全部版本；
 *   `scene.content` 恒等于 chosen 分支 content（materialized 读路径）。`branches`
 *   为空 = 旧单版本文档（迁移输入，见 `parseChapterDocument`）。`commitSceneVersion`
 *   保留旧版为分支并把新正文设为唯一 chosen；`chooseSceneBranch` 可逆切换；普通
 *   `replaceRange`/`appendScene` 只同步 chosen 分支 content（不隐式造分支）。
 * - I70 迁移：`open()` 扫描旧单版本文档并以 canonical 形状回写；canonical 与 legacy
 *   形状都无法解析时 fail closed（抛错、零写）。迁移是**前向格式**：迁移后的文档
 *   只能由 I70 及之后的构建读取（回滚边界：回退到 I69 前构建需先从备份恢复旧格式
 *   文档，禁止为兼容保留两个可写 owner，见计划 §16「正文分支迁移风险」）。
 * - Project, chapter, and scene references are validated before filesystem access.
 */

/** 可读章节文档目录名（项目根下，与 text/ 平级）。 */
export const CHAPTER_DOCS_DIRECTORY = 'docs';

/** I70 迁移/回滚边界：legacy 场景经迁移后的默认版本标签（无旧版本可保留时的命名）。 */
export const INITIAL_BRANCH_LABEL = '初稿';
/** commitSceneVersion 保留旧版本时使用的默认标签。 */
export const PREVIOUS_BRANCH_LABEL = '原版本';

/**
 * 把一章渲染为带段落的 Markdown 文档：标题 + 每个场景一个「场景 N · 摘要」小节，
 * 场景正文按行拆成段落（空行分隔），便于直接阅读。分支版本不进可读镜像（镜像只
 * 反映当前 chosen 正文，派生数据不承载版本真相）。
 */
export function renderChapterMarkdown(chapter: Chapter): string {
  const blocks: string[] = [`# ${chapter.title || chapter.id}`];
  for (const scene of chapter.scenes) {
    const heading = scene.summary ? `场景 ${scene.index + 1} · ${scene.summary}` : `场景 ${scene.index + 1}`;
    blocks.push(`\n## ${heading}\n`);
    const paragraphs = scene.content
      .split(/\r?\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);
    blocks.push(paragraphs.length === 0 ? '（本场景暂无正文）' : paragraphs.join('\n\n'));
  }
  return blocks.join('\n') + '\n';
}

/** 确定性分支 id：`v-<sha256(content) 前 12 位>`（同内容同 id，幂等去重）。 */
export function branchIdFor(content: string): string {
  const digest = createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12);
  return `v-${digest}`;
}

/** 旧单版本文档 → canonical（branches: []，隐含单版本）；只做内存映射，不做校验。 */
export function migrateLegacyChapter(legacy: LegacyChapter): Chapter {
  return chapterSchema.parse({
    ...legacy,
    scenes: legacy.scenes.map((scene) => ({ ...scene, branches: [] })),
  });
}

/**
 * 解析一份章节文档：先按 canonical 形状解析；失败后按 legacy（I70 前无 branches）
 * 形状解析并内存迁移；两者都失败则抛错（fail closed，坏迁移零猜测）。错误信息与
 * I6 既有契约一致（`Invalid chapter document`），供 readChapter/open 复用。
 */
export function parseChapterDocument(raw: string): Chapter {
  let canonicalError: unknown;
  try {
    return chapterSchema.parse(JSON.parse(raw));
  } catch (error) {
    canonicalError = error;
  }
  try {
    return migrateLegacyChapter(legacyChapterSchema.parse(JSON.parse(raw)));
  } catch {
    throw new Error('Invalid chapter document', { cause: canonicalError });
  }
}

export class TextRepository {
  private readonly textDirectory: string;
  private readonly docsDirectory: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.textDirectory = join(projectDirectory, 'text');
    this.docsDirectory = join(projectDirectory, CHAPTER_DOCS_DIRECTORY);
  }

  async open(): Promise<void> {
    await mkdir(this.textDirectory, { recursive: true });
    // I70 兼容迁移（design §14.10 / R14-5）：重开旧单版本文档时扫描并把 legacy
    // 形状回写为 canonical（branches: []）；canonical 与 legacy 都不是 → fail closed
    // （抛错、零写）。迁移幂等：已迁移文档下次 open 直接按 canonical 解析跳过。
    await this.migrateLegacyDocuments();
  }

  async createChapter(input: CreateChapterInput): Promise<Chapter> {
    return this.enqueue(async () => {
      const chapter = chapterSchema.parse({ ...input, scenes: [] });
      const filePath = this.chapterPath(chapter.id);
      try {
        await access(filePath);
        throw new Error(`Chapter already exists: ${chapter.id}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await this.writeChapter(chapter);
      return structuredClone(chapter);
    });
  }

  /** List every persisted chapter in the project (agent context assembly; I-agent). */
  async listChapters(): Promise<Chapter[]> {
    const files = (await readdir(this.textDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name);
    const chapters: Chapter[] = [];
    for (const file of files.sort()) {
      const chapterId = file.slice(0, -'.json'.length);
      chapters.push(await this.readChapter(chapterId));
    }
    return chapters;
  }

  async readChapter(chapterId: string): Promise<Chapter> {
    const filePath = this.chapterPath(chapterId);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Unknown chapter: ${chapterId}`);
      throw error;
    }
    try {
      return parseChapterDocument(raw);
    } catch (error) {
      throw new Error(`Invalid chapter document: ${chapterId}`, { cause: error });
    }
  }

  async appendScene(chapterId: string, input: AppendSceneInput): Promise<Scene> {
    return this.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      if (chapter.scenes.some((scene) => scene.id === input.id)) throw new Error(`Duplicate scene id: ${input.id}`);
      // I70：新场景从「无分支」（隐含单版本）开始；branch 版本只经
      // commitSceneVersion/chooseSceneBranch 产生。
      const scene = sceneSchema.parse({ ...input, index: chapter.scenes.length, branches: [] });
      const updated = chapterSchema.parse({ ...chapter, scenes: [...chapter.scenes, scene] });
      await this.writeChapter(updated);
      return structuredClone(scene);
    });
  }

  async replaceRange(chapterId: string, sceneId: string, range: TextRange, replacement: string): Promise<Scene> {
    return this.enqueue(async () => {
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
      await this.writeChapter(chapterSchema.parse({ ...chapter, scenes }));
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
    return this.enqueue(async () => {
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
      await this.writeChapter(chapterSchema.parse({ ...chapter, scenes }));
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
    return this.enqueue(async () => {
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
      await this.writeChapter(chapterSchema.parse({ ...chapter, scenes }));
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

  private chapterPath(chapterId: string): string {
    validateProjectId(chapterId);
    return join(this.textDirectory, `${chapterId}.json`);
  }

  /** I70 迁移扫描：legacy 文档回写 canonical；canonical 与 legacy 都不是 → fail closed（抛错、零写）。 */
  private async migrateLegacyDocuments(): Promise<void> {
    await this.enqueue(async () => {
      const files = (await readdir(this.textDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name);
      for (const file of files.sort()) {
        const chapterId = file.slice(0, -'.json'.length);
        const raw = await readFile(this.chapterPath(chapterId), 'utf8');
        let migrated: Chapter | undefined;
        try {
          // canonical 已解析 = 已迁移（或新建）文档，跳过；legacy 解析成功 → 迁移。
          chapterSchema.parse(JSON.parse(raw));
        } catch {
          try {
            migrated = migrateLegacyChapter(legacyChapterSchema.parse(JSON.parse(raw)));
          } catch (error) {
            // 两种形状都解析失败（坏文档/半迁移冲突）：fail closed，零猜测零写。
            throw new Error(`Invalid chapter document: ${chapterId}`, { cause: error });
          }
        }
        if (migrated !== undefined) await this.writeChapter(migrated);
      }
    });
  }

  private async writeChapter(chapter: Chapter): Promise<void> {
    const filePath = this.chapterPath(chapter.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
    // 可读镜像：docs/<chapterId>.md（每次章节写入后同步，含新建空章与迁移回写）。
    await this.writeChapterMarkdown(chapter);
  }

  private async writeChapterMarkdown(chapter: Chapter): Promise<void> {
    await mkdir(this.docsDirectory, { recursive: true });
    const filePath = join(this.docsDirectory, `${chapter.id}.md`);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, renderChapterMarkdown(chapter), 'utf8');
    await rename(temporaryPath, filePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
