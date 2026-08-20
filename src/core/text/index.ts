import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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
 * - Each chapter is one validated JSON document under the project's `text` directory.
 * - Scene indexes are contiguous append order and survive reopening.
 * - Range replacement uses JavaScript string offsets `[start, end)` and changes only
 *   the selected scene content; no parser or structured layer is invoked in I6.
 * - Project, chapter, and scene references are validated before filesystem access.
 */
export class TextRepository {
  private readonly textDirectory: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.textDirectory = join(projectDirectory, 'text');
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
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
