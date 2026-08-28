import { createHash } from 'node:crypto';
import {
  chapterSchema,
  legacyChapterSchema,
  type Chapter,
  type LegacyChapter,
} from '../schema/text.js';

/**
 * C5 文档 codec/迁移（review v2.0 §8#7 / 计划 §18 I94 拆分第一片）：
 * 纯函数，无文件系统、无状态。TextRepository 与 ChapterWriteQueue 复用。
 */

export interface TextRange {
  start: number;
  end: number;
}

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
