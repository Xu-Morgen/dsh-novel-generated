import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chapterSchema,
  sceneSchema,
  type AppendSceneInput,
  type Chapter,
  type CreateChapterInput,
  type Scene,
} from '../schema/text.js';
import { validateProjectId } from '../io/path.js';

export interface TextRange {
  start: number;
  end: number;
}

/**
 * C5 generated text store (design §5.12): Host-owned chapter metadata and scene text.
 *
 * Contract / invariants:
 * - Each chapter is one validated JSON document under the project's `text` directory
 *   (machine source of truth: scene indexes, canon refs, localized edit, export).
 * - A READABLE mirror `docs/<chapterId>.md` is re-rendered on every chapter write so
 *   the final prose is directly readable as paragraphs (方便阅读；docs 是派生镜像，
 *   引擎不读它，删除可随时重建).
 * - Scene indexes are contiguous append order and survive reopening.
 * - Range replacement uses JavaScript string offsets `[start, end)` and changes only
 *   the selected scene content; no parser or structured layer is invoked in I6.
 * - Project, chapter, and scene references are validated before filesystem access.
 */

/** 可读章节文档目录名（项目根下，与 text/ 平级）。 */
export const CHAPTER_DOCS_DIRECTORY = 'docs';

/**
 * 把一章渲染为带段落的 Markdown 文档：标题 + 每个场景一个「场景 N · 摘要」小节，
 * 场景正文按行拆成段落（空行分隔），便于直接阅读。
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
      return chapterSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Invalid chapter document: ${chapterId}`, { cause: error });
    }
  }

  async appendScene(chapterId: string, input: AppendSceneInput): Promise<Scene> {
    return this.enqueue(async () => {
      const chapter = await this.readChapter(chapterId);
      if (chapter.scenes.some((scene) => scene.id === input.id)) throw new Error(`Duplicate scene id: ${input.id}`);
      const scene = sceneSchema.parse({ ...input, index: chapter.scenes.length });
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
      const changed = sceneSchema.parse({
        ...scene,
        content: scene.content.slice(0, range.start) + replacement + scene.content.slice(range.end),
      });
      const scenes = chapter.scenes.slice();
      scenes[position] = changed;
      await this.writeChapter(chapterSchema.parse({ ...chapter, scenes }));
      return structuredClone(changed);
    });
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

  private async writeChapter(chapter: Chapter): Promise<void> {
    const filePath = this.chapterPath(chapter.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
    // 可读镜像：docs/<chapterId>.md（每次章节写入后同步，含新建空章）。
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
